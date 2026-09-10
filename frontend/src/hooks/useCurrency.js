import { useMemo } from 'react';
import { useCountry } from '../context/CountryContext';
import {
    currencyOf,
    formatCurrency,
    formatCurrencyShort,
    formatCurrencyCode,
} from '../utils/currency';

/**
 * Currency of the active country, plus formatters bound to it.
 *
 * Every page that shows money should read its formatter from here rather than
 * hardcoding a symbol, so switching country switches the currency everywhere.
 * Amounts are never converted — prices are entered separately per country.
 *
 *   const { format, symbol } = useCurrency();
 *   <td>{format(product.price)}</td>
 */
const useCurrency = () => {
    const { activeCountry } = useCountry();

    return useMemo(() => {
        const { symbol, code, locale } = currencyOf(activeCountry);

        return {
            country: activeCountry,
            symbol,
            code,
            locale,
            /** "₦12,500.00" — the default for tables and detail rows */
            format: (amount, options) => formatCurrency(amount, activeCountry, options),
            /** "₦12,500" — dashboard tiles and chart axes */
            formatShort: (amount, options) => formatCurrencyShort(amount, activeCountry, options),
            /** "₦1.2M" — compact chart axes */
            formatCompact: (amount, options) =>
                formatCurrency(amount, activeCountry, { compact: true, ...options }),
            /** "NGN 12,500.00" — exports, where a bare symbol is ambiguous */
            formatCode: (amount, options) => formatCurrencyCode(amount, activeCountry, options),
        };
    }, [activeCountry]);
};

export default useCurrency;
