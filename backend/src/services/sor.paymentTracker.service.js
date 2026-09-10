const mongoose = require('mongoose');
const SOROrder = require('../models/SOROrder');
const SORPayment = require('../models/SORPayment');

/**
 * Computes the outstanding liability for an SOR customer.
 *
 * outstandingLiability =
 *   SUM(Order.totalAmount WHERE SOROrder.customer = C AND Order.status != 'CANCELLED')
 *   - SUM(SORPayment.amount WHERE SORPayment.customer = C)
 *
 * Liability is added as soon as an order is created (any non-cancelled status).
 *
 * @param {string|ObjectId} customerId
 * @returns {Promise<{ confirmedOrdersTotal: number, paymentsTotal: number, outstandingLiability: number }>}
 */
async function computeLiability(customerId) {
    const customerObjectId = new mongoose.Types.ObjectId(customerId);

    // Aggregate all non-cancelled order totals via SOROrder → Order join
    const confirmedOrdersAgg = await SOROrder.aggregate([
        { $match: { customer: customerObjectId } },
        {
            $lookup: {
                from: 'orders',
                localField: 'order',
                foreignField: '_id',
                as: 'orderDoc',
            },
        },
        { $unwind: '$orderDoc' },
        { $match: { 'orderDoc.status': { $ne: 'CANCELLED' } } },
        {
            $group: {
                _id: null,
                total: { $sum: '$orderDoc.totalAmount' },
            },
        },
    ]);

    // Aggregate total payments for the customer
    const paymentsAgg = await SORPayment.aggregate([
        { $match: { customer: customerObjectId } },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' },
            },
        },
    ]);

    const confirmedOrdersTotal = confirmedOrdersAgg[0]?.total ?? 0;
    const paymentsTotal = paymentsAgg[0]?.total ?? 0;
    const outstandingLiability = confirmedOrdersTotal - paymentsTotal;

    return { confirmedOrdersTotal, paymentsTotal, outstandingLiability };
}

/**
 * Builds a chronological ledger for an SOR customer by merging SOR orders
 * and payments, then computing a running balance.
 *
 * @param {string|ObjectId} customerId
 * @returns {Promise<Array<{ date: Date, type: 'ORDER'|'PAYMENT', reference: string, amount: number, runningBalance: number }>>}
 */
async function getLedger(customerId) {
    const customerObjectId = new mongoose.Types.ObjectId(customerId);

    // Fetch all SOR orders for the customer, populating the linked Order
    const sorOrders = await SOROrder.find({ customer: customerObjectId })
        .populate('order', 'orderNumber totalAmount createdAt status');

    // Fetch all SOR payments for the customer
    const sorPayments = await SORPayment.find({ customer: customerObjectId })
        .populate('order', 'orderNumber')
        .populate('items.product', 'name sku');

    // Map orders to ledger entries (positive amounts)
    const orderEntries = sorOrders
        .filter(so => so.order) // guard against broken references
        .map(so => ({
            date: so.order.createdAt,
            type: 'ORDER',
            reference: so.order.orderNumber,
            amount: so.order.totalAmount,
        }));

    // Map payments to ledger entries (negative amounts), include settled items.
    // A payment against one order names it, so the ledger shows what it cleared.
    const paymentEntries = sorPayments.map(p => {
        const orderRef = p.order?.orderNumber ? `Order #${p.order.orderNumber}` : '';
        const note = p.referenceNote || '';
        return {
            date: p.paymentDate,
            type: 'PAYMENT',
            reference: [orderRef, note].filter(Boolean).join(' — '),
            amount: -p.amount,
            items: p.items || [],
        };
    });

    // Merge and sort chronologically ascending
    const merged = [...orderEntries, ...paymentEntries].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
    );

    // Compute running balance
    let runningBalance = 0;
    return merged.map(entry => {
        runningBalance += entry.amount;
        return { ...entry, runningBalance };
    });
}

/**
 * Returns a summary of totals for an SOR customer.
 *
 * @param {string|ObjectId} customerId
 * @returns {Promise<{ totalOrdered: number, totalPaid: number, outstandingLiability: number }>}
 */
async function getSummary(customerId) {
    const { confirmedOrdersTotal, paymentsTotal, outstandingLiability } =
        await computeLiability(customerId);
    return {
        totalOrdered: confirmedOrdersTotal,
        totalPaid: paymentsTotal,
        outstandingLiability,
    };
}

module.exports = { computeLiability, getLedger, getSummary };
