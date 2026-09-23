/**
 * Company details printed on receipts and invoices.
 *
 * The trading address is per country: only countries listed below have one,
 * and an order from any other country prints no address at all. Everything
 * else (name, phone, email) is shared across markets.
 */

const COMPANY = {
    name: 'GidiGames',
    phone: '+2349091111666',
    email: 'gidiwords@gmail.com',
    website: 'gidigames.com.ng',
};

// Keyed by ISO 3166-1 alpha-2 country code. Add a country here when it gets a
// registered trading address of its own.
const ADDRESS_BY_ISO = {
    NG: ['109 AWOLOWO ROAD', 'IKOYI, LAGOS'],
};

/**
 * The company's address lines for an order's country.
 *
 * Requires the order's `countryId` to have been populated with `isoCode`.
 * Returns an empty array when the country has no address on file, which the
 * document renderers treat as "print nothing".
 *
 * @param {object} order  Order with a populated countryId
 * @returns {string[]}
 */
const companyAddressLines = (order) => {
    const isoCode = order && order.countryId && order.countryId.isoCode;
    if (!isoCode) return [];
    return ADDRESS_BY_ISO[String(isoCode).toUpperCase()] || [];
};

module.exports = {
    COMPANY,
    ADDRESS_BY_ISO,
    companyAddressLines,
};
