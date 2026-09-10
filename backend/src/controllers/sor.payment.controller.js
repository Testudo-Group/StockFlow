const SORPayment = require('../models/SORPayment');
const SORCustomer = require('../models/SORCustomer');
const SOROrder = require('../models/SOROrder');
const { computeLiability } = require('../services/sor.paymentTracker.service');
const {
    computeSettlement,
    unitsCoveredByAmount,
    EPSILON,
} = require('../services/sor.settlement.service');

// @desc    Record a payment for an SOR customer
// @route   POST /api/sor/payments
// @access  Staff
exports.recordPayment = async (req, res, next) => {
    try {
        const {
            customer: customerId,
            order: orderId,
            amount,
            paymentDate,
            referenceNote,
            items,
            confirmed,
        } = req.body;

        // Settling a whole order may omit the amount — it defaults to whatever
        // that order still owes, so the zero check comes after resolution.
        if (!orderId && (!amount || amount <= 0)) {
            return res.status(400).json({
                success: false,
                message: 'Payment amount must be greater than zero',
            });
        }

        // Validate required fields
        if (!customerId) {
            return res.status(400).json({ success: false, message: 'Customer is required' });
        }
        if (!paymentDate) {
            return res.status(400).json({ success: false, message: 'Payment date is required' });
        }

        if (items !== undefined && !Array.isArray(items)) {
            return res.status(400).json({ success: false, message: 'items must be an array' });
        }

        // Validate customer exists and belongs to active country
        const customer = await SORCustomer.findOne({ _id: customerId, countryId: req.countryId });
        if (!customer) {
            return res.status(404).json({ success: false, message: 'SOR customer not found' });
        }

        // ── Settling one specific order ──────────────────────────────────────
        // The amount is bounded by that order alone, and the units it covers
        // are derived from the order's own outstanding lines so the product
        // view stays in step without the client having to work it out.
        let resolvedAmount = Number(amount);
        let resolvedItems = items || [];
        let settlementType = 'PRODUCT';

        if (orderId) {
            const link = await SOROrder.findOne({ customer: customerId, order: orderId });
            if (!link) {
                return res.status(404).json({
                    success: false,
                    message: 'That order does not belong to this SOR customer',
                });
            }

            const { orders } = await computeSettlement(customerId);
            const target = orders.find((o) => o.orderId === String(orderId));

            if (!target) {
                return res.status(400).json({
                    success: false,
                    message: 'That order is cancelled and carries no balance',
                });
            }
            if (target.remainingAmount <= EPSILON) {
                return res.status(400).json({
                    success: false,
                    message: `Order #${target.orderNumber} is already fully settled`,
                });
            }

            // No amount given, or one that covers the rest — settle in full.
            if (!amount || Number(amount) >= target.remainingAmount - EPSILON) {
                resolvedAmount = target.remainingAmount;
                resolvedItems = target.lines
                    .filter((l) => l.outstandingQty > 0)
                    .map((l) => ({ product: l.product, quantity: l.outstandingQty, price: l.price }));
            } else {
                resolvedAmount = Number(amount);
                if (resolvedAmount <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Payment amount must be greater than zero',
                    });
                }
                resolvedItems = unitsCoveredByAmount(
                    target.lines.filter((l) => l.outstandingQty > 0),
                    resolvedAmount
                );
            }

            settlementType = 'ORDER';
        }

        // Validate items — either supplied by the client or derived above
        for (const item of resolvedItems) {
            if (!item.product) {
                return res.status(400).json({ success: false, message: 'Each item must have a product' });
            }
            if (!item.quantity || item.quantity < 1) {
                return res.status(400).json({ success: false, message: 'Each item must have a quantity of at least 1' });
            }
            if (item.price == null || item.price < 0) {
                return res.status(400).json({ success: false, message: 'Each item must have a non-negative price' });
            }
        }

        // Req 4.4: overpayment two-step confirmation. An order settlement is
        // already capped at that order's balance, so it can never overpay.
        if (settlementType === 'PRODUCT') {
            const { outstandingLiability } = await computeLiability(customerId);
            if (resolvedAmount > outstandingLiability && confirmed !== true) {
                return res.status(200).json({
                    success: true,
                    warning: 'Payment exceeds outstanding liability',
                    requiresConfirmation: true,
                });
            }
        }

        // Req 4.1 + 4.6: create the payment, recording the staff member
        const payment = await SORPayment.create({
            customer: customerId,
            order: orderId || null,
            settlementType,
            amount: resolvedAmount,
            paymentDate,
            referenceNote,
            items: resolvedItems,
            recordedBy: req.user.id,
        });

        res.status(201).json({ success: true, data: payment });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all payments for a customer
// @route   GET /api/sor/payments?customer=:id
// @access  Staff
exports.getPayments = async (req, res, next) => {
    try {
        const { customer: customerId } = req.query;

        if (!customerId) {
            return res.status(400).json({ success: false, message: 'Customer query parameter is required' });
        }

        // Ensure the customer belongs to the active country
        const customer = await SORCustomer.findOne({ _id: customerId, countryId: req.countryId });
        if (!customer) {
            return res.status(404).json({ success: false, message: 'SOR customer not found' });
        }

        // Req 4.5: ordered by paymentDate descending
        const payments = await SORPayment.find({ customer: customerId })
            .sort({ paymentDate: -1 })
            .populate('recordedBy', 'name email')
            .populate('order', 'orderNumber totalAmount')
            .populate('items.product', 'name sku');

        res.status(200).json({ success: true, count: payments.length, data: payments });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete a payment
// @route   DELETE /api/sor/payments/:id
// @access  Admin
exports.deletePayment = async (req, res, next) => {
    try {
        const payment = await SORPayment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({ success: false, message: 'SOR payment not found' });
        }

        // Req 4.7: delete the payment; liability recalculates automatically (computed on-the-fly)
        await payment.deleteOne();

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
