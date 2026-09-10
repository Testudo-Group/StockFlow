const Order = require('../models/Order');
const SOROrder = require('../models/SOROrder');
const SORCustomer = require('../models/SORCustomer');
const Product = require('../models/Product');
const Country = require('../models/Country');
const { findUnpricedItems } = require('../utils/pricing');

// @desc    Create SOR order (creates a standard Order + SOROrder link)
// @route   POST /api/sor/orders
// @access  Staff
exports.createSOROrder = async (req, res, next) => {
    try {
        const {
            customer: customerId,
            region,
            warehouse,
            items,
            subtotal,
            discountAmount,
            discountType,
            deliveryFee,
            orderType,
            channel,
        } = req.body;

        // 5.3 / Req 3.6 — Validate items array is non-empty
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Items array must not be empty' });
        }

        // Validate required fields
        if (!customerId) {
            return res.status(400).json({ success: false, message: 'Customer is required', field: 'customer' });
        }
        if (!region) {
            return res.status(400).json({ success: false, message: 'Region is required', field: 'region' });
        }
        if (!warehouse) {
            return res.status(400).json({ success: false, message: 'Warehouse is required', field: 'warehouse' });
        }

        // Req 3.1 — Validate SOR customer exists AND belongs to active country
        const sorCustomer = await SORCustomer.findOne({ _id: customerId, countryId: req.countryId });
        if (!sorCustomer) {
            return res.status(404).json({ success: false, message: 'SOR customer not found' });
        }

        // Prices are set per country — reject products with no price here
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

        // Req 3.4 — Create the standard Order document (reusing existing order logic)
        const totalAmount =
            items.reduce((acc, item) => acc + (item.price || 0) * item.quantity, 0) +
            (deliveryFee || 0);

        const order = await Order.create({
            customer: {
                name: sorCustomer.name,
                address: sorCustomer.address,
                phone: sorCustomer.phone,
                email: sorCustomer.email,
            },
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
            createdBy: req.user.id,
            status: 'PENDING',
            logs: [{ status: 'PENDING', changedBy: req.user.id }],
            countryId: req.countryId,
            currency: country
                ? {
                      code: country.currencyCode,
                      symbol: country.currencySymbol,
                      locale: country.locale,
                  }
                : undefined,
        });

        // Req 3.4 / 3.5 — Create the SOROrder link document
        const sorOrder = await SOROrder.create({
            customer: customerId,
            order: order._id,
            createdBy: req.user.id,
        });

        res.status(201).json({
            success: true,
            data: { order, sorOrder },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get SOR orders (optionally filtered by customer)
// @route   GET /api/sor/orders
// @access  Staff
exports.getSOROrders = async (req, res, next) => {
    try {
        // Get customer IDs that belong to the active country
        const countryCustomers = await SORCustomer.find({ countryId: req.countryId }, '_id').lean();
        const countryCustomerIds = countryCustomers.map(c => c._id);

        const query = { customer: { $in: countryCustomerIds } };
        if (req.query.customer) {
            query.customer = req.query.customer;
        }

        const sorOrders = await SOROrder.find(query)
            .populate({
                path: 'order',
                populate: [
                    { path: 'items.product', select: 'name sku' },
                    { path: 'warehouse', select: 'name' },
                    { path: 'region', select: 'name' },
                ],
            })
            .populate('customer', 'name phone address')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: sorOrders.length,
            data: sorOrders,
        });
    } catch (error) {
        next(error);
    }
};
