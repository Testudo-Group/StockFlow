/**
 * Currency formatting driven by the active country.
 *
 * Every country holds its own currency and its own prices — amounts are never
 * converted between countries, so a figure is only ever rendered in the
 * currency of the country it belongs to.
 *
 * Prefer the `useCurrency()` hook in components; these plain functions exist
 * for the places that already have a country object in hand (exports, tooltips,
 * chart formatters).
 */

// Used only before the active country has loaded, so amounts never render with
// a misleading symbol from another market.
const FALLBACK = { symbol: '', code: '', locale: 'en-US' };

/**
 * Pull { symbol, code, locale } out of a Country object from the API.
 */
export const currencyOf = (country) => {
    if (!country) return FALLBACK;
    return {
        symbol: country.currencySymbol || FALLBACK.symbol,
        code: country.currencyCode || FALLBACK.code,
        locale: country.locale || FALLBACK.locale,
    };
};

/**
 * Format an amount in a country's currency, e.g. "₦12,500.00" / "₵340.00".
 *
 * @param {number} amount
 * @param {object} country            Country object from CountryContext
 * @param {object} [options]
 * @param {number} [options.decimals=2]
 * @param {string} [options.emptyValue='—']  shown for null/undefined amounts
 * @param {boolean} [options.compact=false]  1.2M / 45.0K for chart axes
 */
export const formatCurrency = (amount, country, options = {}) => {
    const { decimals = 2, emptyValue = '—', compact = false } = options;

    if (amount === null || amount === undefined || amount === '') return emptyValue;

    const value = Number(amount);
    if (!Number.isFinite(value)) return emptyValue;

    const { symbol, locale } = currencyOf(country);

    if (compact) {
        const abs = Math.abs(value);
        const sign = value < 0 ? '-' : '';
        if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(1)}B`;
        if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
        if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
        return `${sign}${symbol}${abs.toFixed(0)}`;
    }

    return `${symbol}${value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })}`;
};

/**
 * Whole-currency format with no decimals — for dashboard tiles and chart axes
 * where the kobo/pesewa detail is noise.
 */
export const formatCurrencyShort = (amount, country, options = {}) =>
    formatCurrency(amount, country, { decimals: 0, ...options });

/**
 * Format with the ISO code rather than the symbol, e.g. "NGN 12,500.00".
 * Used where a symbol alone would be ambiguous, such as CSV exports.
 */
export const formatCurrencyCode = (amount, country, options = {}) => {
    const { decimals = 2, emptyValue = '' } = options;

    if (amount === null || amount === undefined || amount === '') return emptyValue;

    const value = Number(amount);
    if (!Number.isFinite(value)) return emptyValue;

    const { code, locale } = currencyOf(country);

    return `${code} ${value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })}`;
};
