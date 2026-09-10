const mongoose = require('mongoose');
const SOROrder = require('../models/SOROrder');
const SORPayment = require('../models/SORPayment');

/**
 * Per-order settlement for SOR customers.
 *
 * Payments come in two shapes and both are reconciled here so they can never
 * settle the same units twice:
 *
 *   PRODUCT — the historical shape. A loose settlement of "8 units of A" that
 *             names no order. Allocated FIFO: oldest unsettled order holding
 *             that product first.
 *   ORDER   — a settlement recorded against one specific order. Allocated to
 *             that order only, in full or in part.
 *
 * Money is the authoritative ledger for an order's balance; units are tracked
 * alongside it so the outstanding-product view agrees with the order view.
 * Both allocate oldest-order-first, so the two stay in step.
 */

// Currency comparisons are float-based — treat sub-half-kobo gaps as zero.
const EPSILON = 0.005;

const idOf = (value) => {
    if (!value) return null;
    if (typeof value === 'object' && value._id) return String(value._id);
    return String(value);
};

/**
 * Money value of a payment's named items.
 */
const itemsValue = (items = []) =>
    items.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);

/**
 * Walk a set of outstanding lines and return the whole units `amount` buys,
 * cheapest-first is NOT used — lines are consumed in their order on the order,
 * so the result is deterministic and staff can predict it.
 *
 * Money left over that cannot cover a whole unit is simply not represented as
 * units; it still reduces the order's balance.
 *
 * @param {Array<{product: string, price: number, outstandingQty: number}>} lines
 * @param {number} amount
 * @returns {Array<{product: string, quantity: number, price: number}>}
 */
function unitsCoveredByAmount(lines, amount) {
    const items = [];
    let money = Number(amount) || 0;

    for (const line of lines) {
        if (money <= EPSILON) break;
        const price = Number(line.price) || 0;
        if (price <= 0 || line.outstandingQty <= 0) continue;

        const affordable = Math.floor((money + EPSILON) / price);
        const take = Math.min(affordable, line.outstandingQty);
        if (take <= 0) continue;

        items.push({ product: line.product, quantity: take, price });
        money -= take * price;
    }

    return items;
}

/**
 * Builds the full settlement picture for one SOR customer: every non-cancelled
 * order with what has been paid against it and what it still owes, plus the
 * product-level outstanding roll-up derived from the same allocation.
 *
 * @param {string|ObjectId} customerId
 * @returns {Promise<{orders: Array, products: Array, summary: object}>}
 */
async function computeSettlement(customerId) {
    const customerObjectId = new mongoose.Types.ObjectId(customerId);

    const sorOrders = await SOROrder.find({ customer: customerObjectId })
        .populate({
            path: 'order',
            select: 'orderNumber totalAmount deliveryFee createdAt status items',
            populate: { path: 'items.product', select: 'name sku' },
        })
        .lean();

    // FIFO: oldest order first. Cancelled orders carry no liability.
    const orders = sorOrders
        .filter((so) => so.order && so.order.status !== 'CANCELLED')
        .sort((a, b) => new Date(a.order.createdAt) - new Date(b.order.createdAt))
        .map((so) => {
            const lines = (so.order.items || []).map((item) => ({
                product: idOf(item.product),
                name: item.product?.name || '',
                sku: item.product?.sku || '',
                price: Number(item.price) || 0,
                quantity: Number(item.quantity) || 0,
                settledQty: 0,
            }));

            return {
                sorOrderId: String(so._id),
                orderId: idOf(so.order),
                orderNumber: so.order.orderNumber,
                date: so.order.createdAt,
                status: so.order.status,
                totalAmount: Number(so.order.totalAmount) || 0,
                paidAmount: 0,
                lines,
            };
        });

    const byOrderId = new Map(orders.map((o) => [o.orderId, o]));

    // Payments oldest first so allocation is stable and replayable.
    const payments = await SORPayment.find({ customer: customerObjectId })
        .sort({ paymentDate: 1, createdAt: 1 })
        .lean();

    let unallocatedAmount = 0;
    let paymentsTotal = 0;

    for (const payment of payments) {
        paymentsTotal += Number(payment.amount) || 0;

        // A payment naming an order is confined to that order; a loose one
        // walks every order oldest-first.
        const target = payment.order ? byOrderId.get(idOf(payment.order)) : null;
        const scope = payment.order ? (target ? [target] : []) : orders;

        // 1. Units named on the payment settle matching lines, oldest first.
        for (const item of payment.items || []) {
            const productId = idOf(item.product);
            if (!productId) continue;

            let remainingQty = Number(item.quantity) || 0;
            for (const order of scope) {
                if (remainingQty <= 0) break;
                for (const line of order.lines) {
                    if (remainingQty <= 0) break;
                    if (line.product !== productId) continue;

                    const room = line.quantity - line.settledQty;
                    if (room <= 0) continue;

                    const take = Math.min(room, remainingQty);
                    line.settledQty += take;
                    remainingQty -= take;
                }
            }
        }

        // 2. The money settles balances, oldest first, capped per order.
        let money = Number(payment.amount) || 0;
        for (const order of scope) {
            if (money <= EPSILON) break;
            const room = order.totalAmount - order.paidAmount;
            if (room <= EPSILON) continue;

            const take = Math.min(room, money);
            order.paidAmount += take;
            money -= take;
        }

        // Paid beyond every order's balance — a credit sitting on the account.
        unallocatedAmount += money;
    }

    const decorated = orders.map((order) => {
        const remainingAmount = order.totalAmount - order.paidAmount;
        const settled = remainingAmount <= EPSILON;

        return {
            ...order,
            lines: order.lines.map((line) => ({
                ...line,
                outstandingQty: line.quantity - line.settledQty,
            })),
            paidAmount: order.paidAmount,
            remainingAmount: settled ? 0 : remainingAmount,
            settlementStatus: settled
                ? 'SETTLED'
                : order.paidAmount > EPSILON
                    ? 'PART_PAID'
                    : 'UNPAID',
        };
    });

    // Product roll-up, derived from the same allocation so the two views agree.
    const productMap = new Map();
    for (const order of decorated) {
        for (const line of order.lines) {
            const existing = productMap.get(line.product);
            if (existing) {
                existing.orderedQty += line.quantity;
                existing.settledQty += line.settledQty;
                // Later orders win on price — matches how quotes are re-priced.
                if (line.price) existing.price = line.price;
            } else {
                productMap.set(line.product, {
                    _id: line.product,
                    name: line.name,
                    sku: line.sku,
                    price: line.price,
                    orderedQty: line.quantity,
                    settledQty: line.settledQty,
                });
            }
        }
    }

    const products = [...productMap.values()].map((p) => ({
        ...p,
        outstandingQty: p.orderedQty - p.settledQty,
    }));

    const totalOrdered = decorated.reduce((acc, o) => acc + o.totalAmount, 0);

    return {
        orders: decorated,
        products,
        summary: {
            totalOrdered,
            totalPaid: paymentsTotal,
            outstandingLiability: totalOrdered - paymentsTotal,
            unallocatedAmount,
        },
    };
}

/**
 * Resolves one order's settlement state for the customer that owns it.
 * Returns null when the order is not an SOR order for that customer.
 */
async function getOrderSettlement(customerId, orderId) {
    const { orders } = await computeSettlement(customerId);
    return orders.find((o) => o.orderId === String(orderId)) || null;
}

module.exports = {
    computeSettlement,
    getOrderSettlement,
    unitsCoveredByAmount,
    EPSILON,
};
