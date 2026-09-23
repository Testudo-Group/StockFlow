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
 * Legacy global-discount orders spread the discount proportionally into each
 * line's `price`; when the order's pre-discount `subtotal` is known we can undo
 * that spread. Legacy individual discounts cannot be recovered per line, so
 * they fall back to the net price.
 */
const lineOriginalPrice = (order, item) => {
    if (item.originalPrice != null) return Number(item.originalPrice) || 0;

    const net = Number(item.price) || 0;

    if (order.discountType === 'global' && Number(order.subtotal) > 0) {
        const netSum = netLineSum(order);
        if (netSum > 0) return net * (Number(order.subtotal) / netSum);
    }

    return net;
};

/**
 * Discount per unit on a line. Only individual discounts live on lines —
 * a global discount is a single figure on the order and shows in the summary.
 */
const lineUnitDiscount = (order, item) => {
    if (item.discount != null) return Math.max(0, Number(item.discount) || 0);

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

module.exports = {
    describeLine,
    lineOriginalPrice,
    lineUnitDiscount,
    orderGrossSubtotal,
};
