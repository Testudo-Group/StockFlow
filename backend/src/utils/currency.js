const { FALLBACK_CURRENCY } = require('../config/currencies');

/**
 * Server-side money formatting for receipts, invoices and notifications.
 *
 * Amounts are never converted — each order is printed in the currency it was
 * created in, taken from the currency snapshot stored on the order document.
 */

/**
 * Normalise whatever currency shape a caller has into { code, symbol, locale }.
 *
 * Accepts an order's `currency` snapshot ({ code, symbol, locale }) or a
 * Country document ({ currencyCode, currencySymbol, locale }).
 */
const resolveCurrency = (currency) => {
    if (!currency) {
        return {
            code: FALLBACK_CURRENCY.currencyCode,
            symbol: FALLBACK_CURRENCY.currencySymbol,
            locale: FALLBACK_CURRENCY.locale,
        };
    }

    return {
        code: currency.code || currency.currencyCode || FALLBACK_CURRENCY.currencyCode,
        symbol: currency.symbol || currency.currencySymbol || FALLBACK_CURRENCY.currencySymbol,
        locale: currency.locale || FALLBACK_CURRENCY.locale,
    };
};

/**
 * Format an amount with its currency symbol, e.g. "₦12,500.00" / "₵340.00".
 *
 * @param {number} amount
 * @param {object} currency  Order currency snapshot or Country document
 * @param {object} [options]
 * @param {number} [options.decimals=2]
 * @param {boolean} [options.negative=false]  Render as "-₦1,000.00"
 */
const formatMoney = (amount, currency, options = {}) => {
    const { decimals = 2, negative = false } = options;
    const { symbol, locale } = resolveCurrency(currency);
    const value = Number(amount) || 0;

    const formatted = value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

    return `${negative ? '-' : ''}${symbol}${formatted}`;
};

/**
 * Format an amount with the ISO code instead of the symbol, e.g. "NGN 12,500.00".
 *
 * PDF fonts do not always carry glyphs for every currency symbol, so documents
 * that must render reliably use the code form.
 */
const formatMoneyCode = (amount, currency, options = {}) => {
    const { decimals = 2, negative = false } = options;
    const { code, locale } = resolveCurrency(currency);
    const value = Number(amount) || 0;

    const formatted = value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

    return `${negative ? '-' : ''}${code} ${formatted}`;
};

module.exports = {
    resolveCurrency,
    formatMoney,
    formatMoneyCode,
};
