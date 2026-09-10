// Currency defaults keyed by ISO 3166-1 alpha-2 country code.
//
// Used to pre-fill currency details when a country is created. The stored
// values on the Country document are authoritative — admins can override any
// of these from Country Settings. Amounts are never converted between
// currencies; each country's prices are entered and displayed in its own.

const CURRENCY_BY_ISO = {
    NG: { currencyCode: 'NGN', currencySymbol: '₦', currencyName: 'Nigerian Naira', locale: 'en-NG' },
    GH: { currencyCode: 'GHS', currencySymbol: '₵', currencyName: 'Ghanaian Cedi', locale: 'en-GH' },
    KE: { currencyCode: 'KES', currencySymbol: 'KSh', currencyName: 'Kenyan Shilling', locale: 'en-KE' },
    ZA: { currencyCode: 'ZAR', currencySymbol: 'R', currencyName: 'South African Rand', locale: 'en-ZA' },
    GB: { currencyCode: 'GBP', currencySymbol: '£', currencyName: 'Pound Sterling', locale: 'en-GB' },
    US: { currencyCode: 'USD', currencySymbol: '$', currencyName: 'US Dollar', locale: 'en-US' },
    CA: { currencyCode: 'CAD', currencySymbol: 'CA$', currencyName: 'Canadian Dollar', locale: 'en-CA' },
    EG: { currencyCode: 'EGP', currencySymbol: 'E£', currencyName: 'Egyptian Pound', locale: 'en-EG' },
    CI: { currencyCode: 'XOF', currencySymbol: 'CFA', currencyName: 'West African CFA Franc', locale: 'fr-CI' },
    SN: { currencyCode: 'XOF', currencySymbol: 'CFA', currencyName: 'West African CFA Franc', locale: 'fr-SN' },
    CM: { currencyCode: 'XAF', currencySymbol: 'FCFA', currencyName: 'Central African CFA Franc', locale: 'fr-CM' },
    TZ: { currencyCode: 'TZS', currencySymbol: 'TSh', currencyName: 'Tanzanian Shilling', locale: 'en-TZ' },
    UG: { currencyCode: 'UGX', currencySymbol: 'USh', currencyName: 'Ugandan Shilling', locale: 'en-UG' },
    RW: { currencyCode: 'RWF', currencySymbol: 'FRw', currencyName: 'Rwandan Franc', locale: 'en-RW' },
    ZM: { currencyCode: 'ZMW', currencySymbol: 'ZK', currencyName: 'Zambian Kwacha', locale: 'en-ZM' },
    MA: { currencyCode: 'MAD', currencySymbol: 'DH', currencyName: 'Moroccan Dirham', locale: 'fr-MA' },
    AE: { currencyCode: 'AED', currencySymbol: 'AED', currencyName: 'UAE Dirham', locale: 'en-AE' },
    IN: { currencyCode: 'INR', currencySymbol: '₹', currencyName: 'Indian Rupee', locale: 'en-IN' },
    FR: { currencyCode: 'EUR', currencySymbol: '€', currencyName: 'Euro', locale: 'fr-FR' },
    DE: { currencyCode: 'EUR', currencySymbol: '€', currencyName: 'Euro', locale: 'de-DE' },
};

// Applied when a country's ISO code is not in the table above. Admins are
// expected to correct these from Country Settings.
const FALLBACK_CURRENCY = {
    currencyCode: 'USD',
    currencySymbol: '$',
    currencyName: 'US Dollar',
    locale: 'en-US',
};

/**
 * Look up the default currency details for an ISO country code.
 * Always returns a complete currency object — never null.
 */
const getDefaultCurrency = (isoCode) => {
    if (!isoCode) return { ...FALLBACK_CURRENCY };
    return { ...(CURRENCY_BY_ISO[isoCode.trim().toUpperCase()] || FALLBACK_CURRENCY) };
};

module.exports = {
    CURRENCY_BY_ISO,
    FALLBACK_CURRENCY,
    getDefaultCurrency,
};
