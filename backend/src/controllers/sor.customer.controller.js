const SORCustomer = require('../models/SORCustomer');
const SOROrder = require('../models/SOROrder');
const SORPayment = require('../models/SORPayment');
const { computeLiability, getLedger, getSummary } = require('../services/sor.paymentTracker.service');
const { computeSettlement } = require('../services/sor.settlement.service');
const { exportCSV } = require('../services/sor.ledgerExport.service');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../config/constants');

// @desc    Create SOR customer
// @route   POST /api/sor/customers
// @access  Staff
exports.createCustomer = async (req, res, next) => {
    try {
        const { name, phone, address, email, notes } = req.body;

        // Validate required fields with descriptive errors
        if (!name) {
            return res.status(400).json({ success: false, message: 'Customer name is required', field: 'name' });
        }
        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required', field: 'phone' });
        }
        if (!address) {
            return res.status(400).json({ success: false, message: 'Address is required', field: 'address' });
        }

        const customer = await SORCustomer.create({
            name,
            phone,
            address,
            email,
            notes,
            createdBy: req.user.id,
            countryId: req.countryId,
        });

        res.status(201).json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all SOR customers (paginated + searchable)
// @route   GET /api/sor/customers
// @access  Staff
exports.getCustomers = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit) || DEFAULT_PAGE_SIZE));
        const skip = (page - 1) * limit;
        const search = req.query.search ? req.query.search.trim() : '';

        // Build query — case-insensitive contains on name or phone
        let query = { countryId: req.countryId };
        if (search) {
            query = {
                countryId: req.countryId,
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } },
                ],
            };
        }

        const [customers, total] = await Promise.all([
            SORCustomer.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            SORCustomer.countDocuments(query),
        ]);

        // Attach outstanding liability to each customer
        const data = await Promise.all(
            customers.map(async (customer) => {
                const { outstandingLiability } = await computeLiability(customer._id);
                return { ...customer.toObject(), outstandingLiability };
            })
        );

        res.status(200).json({
            success: true,
            count: data.length,
            total,
            page,
            pages: Math.ceil(total / limit),
            data,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single SOR customer with summary
// @route   GET /api/sor/customers/:id
// @access  Staff
exports.getCustomer = async (req, res, next) => {
    try {
        const customer = await SORCustomer.findOne({ _id: req.params.id, countryId: req.countryId }).populate('createdBy', 'name email');

        if (!customer) {
            return res.status(404).json({ success: false, message: 'SOR customer not found' });
        }

        const summary = await getSummary(customer._id);

        res.status(200).json({
            success: true,
            data: { ...customer.toObject(), ...summary },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update SOR customer
// @route   PUT /api/sor/customers/:id
// @access  Staff
exports.updateCustomer = async (req, res, next) => {
    try {
        const customer = await SORCustomer.findOne({ _id: req.params.id, countryId: req.countryId });

        if (!customer) {
            return res.status(404).json({ success: false, message: 'SOR customer not found' });
        }

        const { name, phone, address, email, notes } = req.body;

        // Reject explicit empty strings for required fields
        if (name !== undefined && !name) {
            return res.status(400).json({ success: false, message: 'Customer name is required', field: 'name' });
        }
        if (phone !== undefined && !phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required', field: 'phone' });
        }
        if (address !== undefined && !address) {
            return res.status(400).json({ success: false, message: 'Address is required', field: 'address' });
        }

        const updated = await SORCustomer.findByIdAndUpdate(
            req.params.id,
            { name, phone, address, email, notes },
            { new: true, runValidators: true, omitUndefined: true }
        );

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete SOR customer (blocked if history exists)
// @route   DELETE /api/sor/customers/:id
// @access  Admin
exports.deleteCustomer = async (req, res, next) => {
    try {
        const customer = await SORCustomer.findOne({ _id: req.params.id, countryId: req.countryId });

        if (!customer) {
            return res.status(404).json({ success: false, message: 'SOR customer not found' });
        }

        // Guard: reject if customer has any SOR orders or payments
        const [orderCount, paymentCount] = await Promise.all([
            SOROrder.countDocuments({ customer: req.params.id }),
            SORPayment.countDocuments({ customer: req.params.id }),
        ]);

        if (orderCount > 0 || paymentCount > 0) {
            return res.status(409).json({
                success: false,
                message: 'Cannot delete customer with existing transaction history',
            });
        }

        await customer.deleteOne();

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};

// @desc    Get SOR ledger for a customer
// @route   GET /api/sor/customers/:id/ledger
// @access  Staff
exports.getCustomerLedger = async (req, res, next) => {
    try {
        const customer = await SORCustomer.findOne({ _id: req.params.id, countryId: req.countryId });

        if (!customer) {
            return res.status(404).json({ success: false, message: 'SOR customer not found' });
        }

        const ledger = await getLedger(customer._id);

        res.status(200).json({ success: true, count: ledger.length, data: ledger });
    } catch (error) {
        next(error);
    }
};

// @desc    Get per-order and per-product settlement state for a customer
// @route   GET /api/sor/customers/:id/settlement
// @access  Staff
exports.getCustomerSettlement = async (req, res, next) => {
    try {
        const customer = await SORCustomer.findOne({ _id: req.params.id, countryId: req.countryId });

        if (!customer) {
            return res.status(404).json({ success: false, message: 'SOR customer not found' });
        }

        const settlement = await computeSettlement(customer._id);

        res.status(200).json({ success: true, data: settlement });
    } catch (error) {
        next(error);
    }
};

// @desc    Export SOR ledger for a customer as CSV
// @route   GET /api/sor/customers/:id/ledger/export
// @access  Staff
exports.exportCustomerLedger = async (req, res, next) => {
    try {
        const customer = await SORCustomer.findOne({ _id: req.params.id, countryId: req.countryId });

        if (!customer) {
            return res.status(404).json({ success: false, message: 'SOR customer not found' });
        }

        // Default to csv; only csv is supported currently
        const format = (req.query.format || 'csv').toLowerCase();

        if (format !== 'csv') {
            return res.status(400).json({ success: false, message: 'Unsupported format. Use ?format=csv' });
        }

        const csv = await exportCSV(customer._id);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="ledger-${req.params.id}.csv"`);
        res.status(200).send(csv);
    } catch (error) {
        next(error);
    }
};
