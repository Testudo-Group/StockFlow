'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');
const InventoryBalance = require('../models/InventoryBalance');
const StockLedger = require('../models/StockLedger');
const Product = require('../models/Product');
const ReceiptService = require('./receipt.service');
const InvoiceService = require('./invoice.service');
const WhatsAppService = require('./whatsapp.service');
const { findUnpricedItems } = require('../utils/pricing');
const { formatMoney, orderCurrency } = require('../utils/currency');

/**
 * Immutable fields that must never be overwritten by an edit payload.
 */
const IMMUTABLE_FIELDS = ['orderNumber', 'createdBy', 'status', 'createdAt'];

/**
 * Edit an existing order.
 *
 * Handles both PENDING orders (plain save) and CONFIRMED orders (inventory
 * adjustment + StockLedger writes inside a MongoDB transaction).
 *
 * @param {string} orderId        - The order's MongoDB _id
 * @param {Object} updatePayload  - Validated fields from the request body
 * @param {string} userId         - Authenticated user's _id
 * @returns {Promise<Order>}      - Populated updated order
 * @throws {Error}                - With .statusCode set for the controller to forward
 */
async function editOrder(orderId, updatePayload, userId, countryId) {
    // -------------------------------------------------------------------------
    // 1. Load order; throw 404 if not found
    // -------------------------------------------------------------------------
    const query = countryId ? { _id: orderId, countryId } : { _id: orderId };
    const order = await Order.findOne(query);
    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    // -------------------------------------------------------------------------
    // 2. Reject edits on CANCELLED orders
    // -------------------------------------------------------------------------
    if (order.status === 'CANCELLED') {
        const err = new Error('Cancelled orders cannot be edited');
        err.statusCode = 400;
        throw err;
    }

    // -------------------------------------------------------------------------
    // 3. Validate items array
    // -------------------------------------------------------------------------
    const incomingItems = updatePayload.items;

    if (!incomingItems || incomingItems.length === 0) {
        const err = new Error('Order must contain at least one item');
        err.statusCode = 400;
        throw err;
    }

    for (const item of incomingItems) {
        if (!item.product || item.quantity == null || item.quantity < 1 || item.price == null || item.price < 0) {
            const err = new Error('Each item must have a valid product, quantity ≥ 1, and non-negative price');
            err.statusCode = 400;
            throw err;
        }
    }

    // Prices are set per country — a product with no price in this order's
    // country cannot be added to it.
    const orderCountryId = countryId || order.countryId;
    const unpriced = await findUnpricedItems(incomingItems, orderCountryId, Product);
    if (unpriced.length > 0) {
        const err = new Error(
            `These products have no price set for this country: ${unpriced
                .map((p) => p.name)
                .join(', ')}`
        );
        err.statusCode = 400;
        throw err;
    }

    // -------------------------------------------------------------------------
    // 4. Strip immutable fields from the payload
    // -------------------------------------------------------------------------
    const safePayload = { ...updatePayload };
    for (const field of IMMUTABLE_FIELDS) {
        delete safePayload[field];
    }

    // -------------------------------------------------------------------------
    // 5. Apply allowed field updates to the order document
    //    For CONFIRMED orders, snapshot the current items BEFORE overwriting.
    // -------------------------------------------------------------------------
    const snapshotItems = order.status === 'CONFIRMED'
        ? order.items.map(i => ({ product: i.product, quantity: i.quantity }))
        : null;

    const ALLOWED_FIELDS = [
        'customer',
        'region',
        'warehouse',
        'items',
        'discountAmount',
        'discountType',
        'deliveryFee',
        'orderType',
        'channel',
    ];

    for (const field of ALLOWED_FIELDS) {
        if (safePayload[field] !== undefined) {
            order[field] = safePayload[field];
        }
    }

    // -------------------------------------------------------------------------
    // 6. Recalculate totals
    // -------------------------------------------------------------------------
    const subtotal = order.items.reduce(
        (sum, item) => sum + item.quantity * (item.price || 0),
        0
    );

    const effectiveDiscount = order.discountType === 'none' ? 0 : (order.discountAmount || 0);
    const deliveryFee = order.deliveryFee || 0;
    const totalAmount = Math.max(0, subtotal - effectiveDiscount + deliveryFee);

    order.subtotal = subtotal;
    order.totalAmount = totalAmount;

    // -------------------------------------------------------------------------
    // 7. Append EDITED log entry
    // -------------------------------------------------------------------------
    order.logs.push({
        status: 'EDITED',
        changedBy: userId,
        date: new Date(),
    });

    // -------------------------------------------------------------------------
    // 8. Save order
    //    - CONFIRMED orders: open a MongoDB session, adjust inventory balances
    //      and write StockLedger entries inside a transaction, then save.
    //    - PENDING orders: plain save (no transaction needed).
    // -------------------------------------------------------------------------
    if (order.status === 'CONFIRMED') {
        // Snapshot the original items BEFORE applying the new items
        // (safePayload.items has already been assigned to order.items above,
        //  so we need the snapshot we captured before step 5)
        await _editConfirmedOrder(order, snapshotItems, userId);
    } else {
        await order.save();
    }

    // -------------------------------------------------------------------------
    // 9. Return populated order
    // -------------------------------------------------------------------------
    const populatedOrder = await Order.findById(order._id)
        .populate('warehouse', 'name')
        .populate('region', 'name')
        .populate('items.product', 'name sku cartonSize')
        .populate('countryId', 'isoCode name currencyCode currencySymbol locale')
        .populate('logs.changedBy', 'email');

    // -------------------------------------------------------------------------
    // 10. Fire-and-forget side effects (receipt, invoice, WhatsApp)
    //     These are non-blocking; failures are logged but never propagate.
    //     (Implemented fully in Task 3 — stubs here to keep the interface stable)
    // -------------------------------------------------------------------------
    _runSideEffects(populatedOrder).catch(() => {
        // Side-effect errors are swallowed here; individual handlers log them.
    });

    return populatedOrder;
}

/**
 * Handle inventory adjustment for a CONFIRMED order edit inside a MongoDB transaction.
 *
 * @param {Object} order         - The order document (already mutated with new items/fields)
 * @param {Array}  snapshotItems - Deep copy of items BEFORE the edit was applied
 * @param {string} userId        - Authenticated user's _id
 */
async function _editConfirmedOrder(order, snapshotItems, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const warehouseId = order.warehouse;
        const orderId = order._id.toString();

        // Build lookup maps: productId (string) → quantity
        const oldQtyMap = new Map();
        for (const item of snapshotItems) {
            const key = item.product.toString();
            oldQtyMap.set(key, (oldQtyMap.get(key) || 0) + item.quantity);
        }

        const newQtyMap = new Map();
        for (const item of order.items) {
            const key = item.product.toString();
            newQtyMap.set(key, (newQtyMap.get(key) || 0) + item.quantity);
        }

        // Union of all product IDs across old and new items
        const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);

        for (const productId of allProductIds) {
            const oldQty = oldQtyMap.get(productId) || 0;
            const newQty = newQtyMap.get(productId) || 0;
            const delta = newQty - oldQty;

            if (delta === 0) continue;

            // Load the inventory balance for this product in the order's warehouse
            const balance = await InventoryBalance.findOne(
                { product: productId, warehouse: warehouseId },
                null,
                { session }
            );

            if (delta > 0) {
                // More stock needed — check availability first
                const available = balance ? (balance.quantity - balance.allocated) : 0;
                if (!balance || available < delta) {
                    // Fetch product name for the error message
                    const Product = mongoose.model('Product');
                    const product = await Product.findById(productId).session(session);
                    const productName = product ? product.name : productId;
                    const availableQty = balance ? available : 0;

                    const err = new Error(
                        `Insufficient stock for product ${productName}. Available: ${availableQty}, Requested: ${delta}`
                    );
                    err.statusCode = 400;
                    throw err;
                }

                // Deduct from inventory
                balance.quantity -= delta;
                await balance.save({ session });

                // Write OUT ledger entry
                await StockLedger.create(
                    [{
                        product: productId,
                        warehouse: warehouseId,
                        type: 'OUT',
                        change: -delta,
                        reason: `Order Edited #${orderId}`,
                        reference: orderId,
                        balanceAfter: balance.quantity,
                        performedBy: userId,
                    }],
                    { session }
                );
            } else {
                // delta < 0 — stock returned
                const absDelta = Math.abs(delta);

                if (balance) {
                    balance.quantity += absDelta;
                    await balance.save({ session });
                }
                // If no balance record exists (edge case), skip the balance update
                // but still write the ledger entry if balance exists
                if (balance) {
                    await StockLedger.create(
                        [{
                            product: productId,
                            warehouse: warehouseId,
                            type: 'IN',
                            change: absDelta,
                            reason: `Order Edited #${orderId}`,
                            reference: orderId,
                            balanceAfter: balance.quantity,
                            performedBy: userId,
                        }],
                        { session }
                    );
                }
            }
        }

        // Save the order inside the same session
        await order.save({ session });

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Non-blocking side effects: receipt regeneration, invoice regeneration (WHOLESALE),
 * and WhatsApp notification.
 *
 * Each step is wrapped in its own try/catch so a failure in one does not
 * prevent the others from running.
 *
 * @param {Object} populatedOrder - Fully populated order document
 */
async function _runSideEffects(populatedOrder) {
    // Receipt regeneration
    try {
        if (ReceiptService.receiptExists(populatedOrder._id)) {
            ReceiptService.deleteReceipt(populatedOrder._id);
        }
        await ReceiptService.generateReceipt(populatedOrder);
    } catch (err) {
        console.error('[OrderEdit] Receipt regeneration failed:', err.message);
    }

    // Invoice regeneration (WHOLESALE only)
    if (populatedOrder.orderType === 'WHOLESALE') {
        try {
            if (InvoiceService.invoiceExists(populatedOrder._id)) {
                InvoiceService.deleteInvoice(populatedOrder._id);
            }
            await InvoiceService.generateInvoice(populatedOrder);
        } catch (err) {
            console.error('[OrderEdit] Invoice regeneration failed:', err.message);
        }
    }

    // WhatsApp notification
    try {
        const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;
        if (adminNumber) {
            const message =
                `✏️ *Order Edited*\n\n` +
                `Order #${populatedOrder.orderNumber || populatedOrder._id.toString().slice(-6).toUpperCase()}\n` +
                `Customer: ${populatedOrder.customer?.name || 'N/A'}\n` +
                `Updated Total: ${formatMoney(populatedOrder.totalAmount || 0, orderCurrency(populatedOrder), {
                    decimals: 0,
                })}`;
            await WhatsAppService.sendMessage(adminNumber, message);
        }
    } catch (err) {
        console.error('[OrderEdit] WhatsApp notification failed:', err.message);
    }
}

module.exports = { editOrder };
