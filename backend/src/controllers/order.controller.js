const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Order = require('../models/Order');
const SOROrder = require('../models/SOROrder');
const Product = require('../models/Product');
const Country = require('../models/Country');
const { findUnpricedItems } = require('../utils/pricing');
const { withDisplayLines } = require('../utils/orderLines');
const StockLedger = require('../models/StockLedger');
const InventoryBalance = require('../models/InventoryBalance');
const WhatsAppService = require('../services/whatsapp.service');
const ReceiptService = require('../services/receipt.service');
const InvoiceService = require('../services/invoice.service');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private (Sales/Admin)
exports.createOrder = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { customer, region, warehouse, items, subtotal, discountAmount, discountType, deliveryFee, orderType, channel } = req.body;

        // Prices are set per country — a product with no price in this country
        // cannot be sold here, so reject rather than guess a price.
        const unpriced = await findUnpricedItems(items, req.countryId, Product);
        if (unpriced.length > 0) {
            return res.status(400).json({
                success: false,
                message: `These products have no price set for this country: ${unpriced
                    .map((p) => p.name)
                    .join(', ')}`,
                unpricedProducts: unpriced,
            });
        }

        // Snapshot the currency so receipts reprint correctly later
        const country = await Country.findById(req.countryId).select(
            'currencyCode currencySymbol locale'
        );

        // Calculate total if prices provided (simple mock for now)
        const totalAmount = items.reduce((acc, item) => acc + (item.price || 0) * item.quantity, 0) + (deliveryFee || 0);

        const order = await Order.create({
            customer,
            region,
            warehouse,
            items,
            subtotal,
            discountAmount,
            discountType,
            deliveryFee: deliveryFee || 0,
            orderType: orderType || 'RETAIL',
            channel: channel || 'Other',
            totalAmount,
            countryId: req.countryId,
            currency: country
                ? {
                      code: country.currencyCode,
                      symbol: country.currencySymbol,
                      locale: country.locale,
                  }
                : undefined,
            createdBy: req.user.id,
            status: 'PENDING',
            logs: [{ status: 'PENDING', changedBy: req.user.id }],
        });

        // Populate order for WhatsApp and receipt generation
        const populatedOrder = await Order.findById(order._id)
            .populate('items.product', 'name sku cartonSize')
            .populate('customer')
            .populate('countryId', 'isoCode name currencyCode currencySymbol locale')
            .populate('warehouse', 'name')
            .populate('region', 'name');

        // Generate receipt
        try {
            await ReceiptService.generateReceipt(populatedOrder);
            console.log(`[Order] Receipt generated for order ${order._id}`);
        } catch (receiptError) {
            console.error('[Order] Receipt generation failed:', receiptError);
            // Don't fail the request if receipt generation fails
        }

        // Trigger WhatsApp Message on Order Creation
        try {
            await WhatsAppService.sendOrderConfirmation(populatedOrder);
        } catch (wsError) {
            console.error('WhatsApp notification failed:', wsError);
            // Don't fail the request if WhatsApp fails
        }

        res.status(201).json({
            success: true,
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res, next) => {
    try {
        const { status, warehouseId, startDate, endDate, isSOR, paymentStatus } = req.query;
        
        const query = {};

        if (status) query.status = status;
        if (warehouseId) query.warehouse = warehouseId;
        query.countryId = req.countryId;
        if (paymentStatus === 'PAID') {
            // Match docs explicitly set to PAID, or where the field doesn't exist yet (legacy orders)
            query.$or = [{ paymentStatus: 'PAID' }, { paymentStatus: { $exists: false } }];
        } else if (paymentStatus === 'NOT_PAID') {
            query.paymentStatus = 'NOT_PAID';
        }
        
        // Date range filtering
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const endDateTime = new Date(endDate);
                endDateTime.setHours(23, 59, 59, 999);
                query.createdAt.$lte = endDateTime;
            }
        }

        // SOR filter — resolve which order IDs are linked to SOROrders
        if (isSOR === 'true' || isSOR === 'false') {
            const sorOrderIds = (await SOROrder.find({}, 'order').lean()).map((s) => s.order);
            if (isSOR === 'true') {
                query._id = { $in: sorOrderIds };
            } else {
                query._id = { $nin: sorOrderIds };
            }
        }

        const orders = await Order.find(query)
            .populate('warehouse', 'name')
            .populate('customer')
            .populate('countryId', 'isoCode name currencyCode currencySymbol locale')
            .populate('items.product', 'name sku')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: orders.length,
            // Lines carry their resolved pre-discount figures so the screens
            // show the same prices the receipt does.
            data: orders.map(withDisplayLines),
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res, next) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, countryId: req.countryId })
            .populate('warehouse', 'name')
            .populate('region', 'name')
            .populate('items.product', 'name sku cartonSize')
            .populate('logs.changedBy', 'email');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        res.status(200).json({
            success: true,
            data: withDisplayLines(order),
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update order status (The Core Logic)
// @route   PUT /api/orders/:id/status
// @access  Private (Sales/Inventory/Admin)
exports.updateOrderStatus = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        const { status } = req.body;

        // Start Transaction
        session.startTransaction();

        const order = await Order.findOne({ _id: req.params.id, countryId: req.countryId }).session(session);
        if (!order) {
            await session.abortTransaction();
            await session.endSession();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const oldStatus = order.status;

        // --- State Machine & Inventory Logic ---

        // 1. Confirming Order: Reserve and Deduct Stock (2-step simplification)
        if (status === 'CONFIRMED' && oldStatus === 'PENDING') {
            for (const item of order.items) {
                // Check availability
                const balance = await InventoryBalance.findOne({
                    product: item.product,
                    warehouse: order.warehouse,
                    countryId: order.countryId,
                }).session(session);

                const currentQuantity = balance ? balance.quantity : 0;
                const currentAllocated = balance ? balance.allocated : 0;
                const available = currentQuantity - currentAllocated;

                if (available < item.quantity) {
                    throw new Error(`Insufficient stock for product ${item.product}. Available: ${available}, Requested: ${item.quantity}`);
                }

                if (!balance) {
                    // This case should theoretically be caught by available < item.quantity if item.quantity > 0
                    // but we keep it safe. If it ever gets here, it means we are trying to deduct 0 or less?
                    throw new Error(`Stock record not found for product ${item.product}`);
                }

                // Deduct from Physical Stock (since we are bypassing DISPATCHED)
                balance.quantity -= item.quantity;
                await balance.save({ session });

                // Ledger Entry
                await StockLedger.create(
                    [
                        {
                            product: item.product,
                            warehouse: order.warehouse,
                            change: -item.quantity,
                            type: 'OUT',
                            reason: `Order Confirmed #${order._id}`,
                            reference: order._id.toString(),
                            balanceAfter: balance.quantity,
                            performedBy: req.user.id,
                            countryId: req.countryId,
                        },
                    ],
                    { session }
                );
            }
        }

        // 2. Cancelling Order: Logic stays similar if needed, but simplified
        else if (status === 'CANCELLED' && oldStatus === 'PENDING') {
            // No stock was reserved yet in the new flow, so just update status
        }

        // Prevent invalid jumps (Basic check)
        if (oldStatus === 'CONFIRMED' && status === 'PENDING') {
            throw new Error('Cannot revert confirmed order to pending');
        }

        // Update Order
        order.status = status;
        order.logs.push({
            status,
            changedBy: req.user.id,
            date: new Date(),
        });

        await order.save({ session });

        await session.commitTransaction();
        await session.endSession();

        res.status(200).json({
            success: true,
            data: order,
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        await session.endSession();

        // Handle specific business logic errors
        if (error.message.includes('Insufficient stock')) {
            return res.status(400).json({ success: false, message: error.message });
        }

        next(error);
    }
};

// @desc    Download order receipt
// @route   GET /api/orders/:id/receipt
// @access  Private
exports.downloadReceipt = async (req, res, next) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, countryId: req.countryId })
            .populate('warehouse', 'name')
            .populate('region', 'name')
            .populate('items.product', 'name sku cartonSize')
            .populate('customer')
            .populate('countryId', 'isoCode name currencyCode currencySymbol locale');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        const forceRegenerate = req.query.regenerate === 'true';
        console.log(`[Receipt] Download request - Order: ${order._id}, Regenerate: ${forceRegenerate}`);

        // Always regenerate if requested
        if (forceRegenerate) {
            console.log(`[Receipt] Force regenerating receipt for order ${order._id}`);
            
            // Delete old receipt if it exists
            if (ReceiptService.receiptExists(order._id)) {
                console.log(`[Receipt] Deleting old receipt for order ${order._id}`);
                ReceiptService.deleteReceipt(order._id);
            }
            
            try {
                console.log(`[Receipt] Generating new receipt with latest template`);
                await ReceiptService.generateReceipt(order);
            } catch (genError) {
                console.error('[Receipt] Generation failed:', genError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to generate receipt: ' + genError.message,
                });
            }
        } else if (!ReceiptService.receiptExists(order._id)) {
            // Only generate if doesn't exist and not forcing regenerate
            console.log(`[Receipt] Generating receipt for order ${order._id} (doesn't exist)`);
            try {
                await ReceiptService.generateReceipt(order);
            } catch (genError) {
                console.error('[Receipt] Generation failed:', genError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to generate receipt: ' + genError.message,
                });
            }
        } else {
            // Regenerate to pick up latest template changes (country, layout, etc.)
            console.log(`[Receipt] Regenerating receipt for order ${order._id} (latest template)`);
            try {
                await ReceiptService.generateReceipt(order);
            } catch (genError) {
                console.error('[Receipt] Generation failed:', genError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to generate receipt: ' + genError.message,
                });
            }
        }

        const receiptPath = ReceiptService.getReceiptPath(order._id);
        
        // Verify file exists before streaming
        if (!require('fs').existsSync(receiptPath)) {
            return res.status(500).json({
                success: false,
                message: 'Receipt file not found after generation',
            });
        }

        const fileName = `receipt-order-${order.orderNumber || order._id.toString().slice(-6).toUpperCase()}.pdf`;

        // Set headers for download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Stream the file
        const fileStream = require('fs').createReadStream(receiptPath);
        
        fileStream.on('error', (err) => {
            console.error('[Receipt] Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to stream receipt',
                });
            }
        });

        fileStream.pipe(res);

    } catch (error) {
        console.error('[Receipt] Error:', error);
        if (!res.headersSent) {
            next(error);
        }
    }
};

// @desc    Download order invoice (for wholesale orders)
// @route   GET /api/orders/:id/invoice
// @access  Private
exports.downloadInvoice = async (req, res, next) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, countryId: req.countryId })
            .populate('warehouse', 'name')
            .populate('region', 'name')
            .populate('items.product', 'name sku cartonSize')
            .populate('customer')
            .populate('countryId', 'isoCode name currencyCode currencySymbol locale');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        const forceRegenerate = req.query.regenerate === 'true';
        console.log(`[Invoice] Download request - Order: ${order._id}, Regenerate: ${forceRegenerate}`);

        // Always regenerate if requested
        if (forceRegenerate) {
            console.log(`[Invoice] Force regenerating invoice for order ${order._id}`);
            
            // Delete old invoice if it exists
            if (InvoiceService.invoiceExists(order._id)) {
                console.log(`[Invoice] Deleting old invoice for order ${order._id}`);
                InvoiceService.deleteInvoice(order._id);
            }
            
            try {
                console.log(`[Invoice] Generating new invoice with latest template`);
                await InvoiceService.generateInvoice(order);
            } catch (genError) {
                console.error('[Invoice] Generation failed:', genError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to generate invoice: ' + genError.message,
                });
            }
        } else if (!InvoiceService.invoiceExists(order._id)) {
            console.log(`[Invoice] Generating invoice for order ${order._id} (doesn't exist)`);
            try {
                await InvoiceService.generateInvoice(order);
            } catch (genError) {
                console.error('[Invoice] Generation failed:', genError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to generate invoice: ' + genError.message,
                });
            }
        } else {
            // Always regenerate to pick up latest template changes
            console.log(`[Invoice] Regenerating invoice for order ${order._id} (latest template)`);
            try {
                await InvoiceService.generateInvoice(order);
            } catch (genError) {
                console.error('[Invoice] Generation failed:', genError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to generate invoice: ' + genError.message,
                });
            }
        }

        const invoicePath = InvoiceService.getInvoicePath(order._id);
        
        // Verify file exists before streaming
        if (!require('fs').existsSync(invoicePath)) {
            return res.status(500).json({
                success: false,
                message: 'Invoice file not found after generation',
            });
        }

        const fileName = `invoice-order-${order.orderNumber || order._id.toString().slice(-6).toUpperCase()}.pdf`;

        // Set headers for download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Stream the file
        const fileStream = require('fs').createReadStream(invoicePath);
        
        fileStream.on('error', (err) => {
            console.error('[Invoice] Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to stream invoice',
                });
            }
        });

        fileStream.pipe(res);

    } catch (error) {
        console.error('[Invoice] Error:', error);
        if (!res.headersSent) {
            next(error);
        }
    }
};

// @desc    Edit an existing order (items, customer, pricing, etc.)
// @route   PUT /api/orders/:id
// @access  Private (MANAGE_ORDERS permission required)
exports.updateOrder = async (req, res, next) => {
    try {
        const { editOrder } = require('../services/order.edit.service');
        const result = await editOrder(req.params.id, req.body, req.user.id, req.countryId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        next(error);
    }
};

// @desc    Update order payment status
// @route   PATCH /api/orders/:id/payment-status
// @access  Private (MANAGE_ORDERS permission required)
exports.updatePaymentStatus = async (req, res, next) => {
    try {
        const { paymentStatus } = req.body;
        if (!['PAID', 'NOT_PAID'].includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'paymentStatus must be PAID or NOT_PAID' });
        }

        const order = await Order.findOneAndUpdate(
            { _id: req.params.id, countryId: req.countryId },
            { paymentStatus },
            { new: true, runValidators: true }
        );

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};
