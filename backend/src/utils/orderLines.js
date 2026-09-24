/**
 * Per-line pricing for receipts and invoices.
 *
 * A line stores `price` (the net unit price charged) and, on orders created
 * after per-line discount tracking was added, `originalPrice` (the product's
 * actual unit price) and `discount` (per unit). Documents show the actual price
 * with the discount called out beneath it, so the reader can see what was
 * discounted rather than only a reduced figure.
 *
 * Older orders lack the extra fields; these helpers reconstruct what they can
 * so their documents stay internally consistent.
 */

const netLineSum = (order) =>
    (order.items || []).reduce(
        (acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.price) || 0),
        0
    );

/**
 * The actual (pre-discount) unit price for a line.
 *
 * Orders placed before per-line prices were recorded only kept the net price,
 * but they do keep the pre-discount `subtotal`. Scaling each line back up by
 * subtotal/net gives the actual prices, and the scaled-away amounts add back
 * up to the order's discount.
 *
 * For an individual discount this spreads the discount across the lines in
 * proportion to their value, because which line it originally came off was
 * never stored. The figures reconcile; the attribution is a best estimate.
 */
const lineOriginalPrice = (order, item) => {
    if (item.originalPrice != null) return Number(item.originalPrice) || 0;

    const net = Number(item.price) || 0;
    const hasDiscount = order.discountType && order.discountType !== 'none';

    if (hasDiscount && Number(order.subtotal) > 0) {
        const netSum = netLineSum(order);
        // Only scale up — a subtotal already equal to the net sum (an order
        // saved before the totals were made consistent) leaves prices as they are.
        if (netSum > 0 && Number(order.subtotal) > netSum) {
            return net * (Number(order.subtotal) / netSum);
        }
    }

    return net;
};

/**
 * Discount per unit on a line. Only individual discounts live on lines —
 * a global discount is a single figure on the order and shows in the summary.
 *
 * A stored `discount` is trusted only when the line also carries the price it
 * was discounted from: the schema defaults `discount` to 0, so a legacy line
 * would otherwise look like a deliberate zero and hide its discount.
 */
const lineUnitDiscount = (order, item) => {
    if (item.originalPrice != null) return Math.max(0, Number(item.discount) || 0);

    if (order.discountType === 'individual') {
        return Math.max(0, lineOriginalPrice(order, item) - (Number(item.price) || 0));
    }

    return 0;
};

/**
 * Everything a document needs to print one line.
 */
const describeLine = (order, item) => {
    const quantity = Number(item.quantity) || 0;
    const originalPrice = lineOriginalPrice(order, item);
    const unitDiscount = lineUnitDiscount(order, item);

    return {
        quantity,
        originalPrice,
        unitDiscount,
        lineDiscount: unitDiscount * quantity,
        // Line total at the actual price; discounts are then shown separately
        lineTotal: originalPrice * quantity,
        netUnitPrice: Number(item.price) || 0,
    };
};

/**
 * Pre-discount subtotal for the summary block. Prefers the figure stored on
 * the order; otherwise sums the lines at their actual prices.
 */
const orderGrossSubtotal = (order) => {
    if (Number(order.subtotal) > 0) return Number(order.subtotal);
    return (order.items || []).reduce(
        (acc, item) => acc + describeLine(order, item).lineTotal,
        0
    );
};

/**
 * Attach the resolved pre-discount figures to an order so the screens show the
 * same prices the receipt does.
 *
 * Each line gains the actual unit price it was discounted from and the discount
 * taken off it; the order gains its pre-discount subtotal. The stored `price`
 * is left untouched, so anything still reading it keeps working.
 *
 * @param {object} order  Order document or plain object
 * @returns {object} plain object with display fields added
 */
const withDisplayLines = (order) => {
    if (!order) return order;

    const obj = typeof order.toObject === 'function' ? order.toObject() : { ...order };
    const items = obj.items || [];

    // describeLine reads the order's lines, so resolve every line against the
    // original list before replacing it.
    obj.items = items.map((item) => {
        const line = describeLine(obj, item);
        return {
            ...item,
            displayUnitPrice: line.originalPrice,
            displayUnitDiscount: line.unitDiscount,
            displayLineTotal: line.lineTotal,
            displayLineDiscount: line.lineDiscount,
        };
    });

    obj.displaySubtotal = orderGrossSubtotal({ ...obj, items });

    return obj;
};

module.exports = {
    describeLine,
    lineOriginalPrice,
    lineUnitDiscount,
    orderGrossSubtotal,
    withDisplayLines,
};
