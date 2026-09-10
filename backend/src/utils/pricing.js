const mongoose = require('mongoose');

/**
 * Per-country pricing helpers.
 *
 * Prices are set separately per country and are never converted between
 * currencies. A product or bundle with no entry for the active country is
 * "unpriced" — it is displayed without a price and cannot be ordered there.
 */

/**
 * Resolve a product's price for one country.
 * Returns null when the product carries no entry for that country.
 *
 * @param {object} product   Product document or plain object
 * @param {string|ObjectId} countryId
 * @returns {{price: number, wholesaleCost: number}|null}
 */
const resolveProductPrice = (product, countryId) => {
    if (!product || !countryId) return null;

    const target = countryId.toString();
    const entry = (product.countryPrices || []).find(
        (cp) => cp.countryId && cp.countryId.toString() === target
    );

    if (!entry) return null;

    return {
        price: entry.price,
        wholesaleCost: entry.wholesaleCost || 0,
    };
};

/**
 * Resolve a bundle's retail price for one country.
 * Returns null when the bundle carries no entry for that country.
 */
const resolveBundlePrice = (bundle, countryId) => {
    if (!bundle || !countryId) return null;

    const target = countryId.toString();
    const entry = (bundle.countryPrices || []).find(
        (cp) => cp.countryId && cp.countryId.toString() === target
    );

    return entry ? { retailPrice: entry.retailPrice } : null;
};

/**
 * Flatten a product for API responses: attach the resolved price/wholesaleCost
 * for the active country at the top level so existing clients keep reading
 * `product.price`, and expose `isPriced` so the UI can render "—" and block
 * ordering when the country has no price.
 */
const withResolvedPrice = (product, countryId) => {
    const obj = typeof product.toObject === 'function' ? product.toObject() : { ...product };
    const resolved = resolveProductPrice(obj, countryId);

    return {
        ...obj,
        price: resolved ? resolved.price : null,
        wholesaleCost: resolved ? resolved.wholesaleCost : null,
        isPriced: Boolean(resolved),
    };
};

/**
 * Same as withResolvedPrice, for bundles.
 */
const withResolvedBundlePrice = (bundle, countryId) => {
    const obj = typeof bundle.toObject === 'function' ? bundle.toObject() : { ...bundle };
    const resolved = resolveBundlePrice(obj, countryId);

    return {
        ...obj,
        retailPrice: resolved ? resolved.retailPrice : null,
        isPriced: Boolean(resolved),
        // Nested products carry their own per-country prices.
        products: (obj.products || []).map((line) =>
            line.product && typeof line.product === 'object'
                ? { ...line, product: withResolvedPrice(line.product, countryId) }
                : line
        ),
    };
};

/**
 * Aggregation expression selecting the active country's entries from the
 * countryPrices array of a product reachable at `productPath` (e.g.
 * '$productInfo'). Yields an empty array when the product is unpriced there.
 */
const countryPriceEntriesExpr = (productPath, countryId) => ({
    $filter: {
        input: { $ifNull: [`${productPath}.countryPrices`, []] },
        as: 'cp',
        cond: {
            $eq: ['$$cp.countryId', new mongoose.Types.ObjectId(countryId)],
        },
    },
});

/**
 * Aggregation expression for one field of the resolved price entry.
 *
 * Mapping the field out of the filtered array (rather than reading it off a
 * possibly-missing sub-document) keeps the expression safe when the product
 * carries no entry for the country.
 *
 * @param {string} productPath e.g. '$productInfo'
 * @param {string} field       'price' | 'wholesaleCost'
 * @param {*} [fallback=0]     value when the product is unpriced there
 */
const countryPriceFieldExpr = (productPath, countryId, field, fallback = 0) => ({
    $ifNull: [
        {
            $first: {
                $map: {
                    input: countryPriceEntriesExpr(productPath, countryId),
                    as: 'cp',
                    in: `$$cp.${field}`,
                },
            },
        },
        fallback,
    ],
});

/**
 * An $addFields stage that resolves the active country's price and cost onto
 * every document in a pipeline, so downstream stages can read `$countryPrice`
 * and `$countryCost` instead of the legacy top-level product fields.
 *
 * Insert it immediately after the $unwind of the joined product document.
 *
 *   countryPrice          retail price, 0 when unpriced
 *   countryWholesaleCost  wholesale cost, 0 when not entered
 *   countryCost           wholesale cost falling back to retail price
 *
 * The two cost fields mirror the two fallbacks the single-currency pipelines
 * used before, so valuation figures keep their previous meaning.
 *
 * @param {string} productPath e.g. '$productInfo'
 * @param {string|ObjectId} countryId
 */
const countryPricingStage = (productPath, countryId) => ({
    $addFields: {
        countryPrice: countryPriceFieldExpr(productPath, countryId, 'price'),
        countryWholesaleCost: countryPriceFieldExpr(productPath, countryId, 'wholesaleCost'),
        countryCost: {
            $ifNull: [
                countryPriceFieldExpr(productPath, countryId, 'wholesaleCost', null),
                countryPriceFieldExpr(productPath, countryId, 'price'),
            ],
        },
    },
});

/**
 * Validate and normalise a countryPrices payload coming from a client.
 * Throws an Error with a client-safe message on bad input.
 *
 * @param {Array} input  [{ countryId, price, wholesaleCost }]
 * @returns {Array} normalised entries
 */
const normaliseCountryPrices = (input) => {
    if (input === undefined) return undefined;

    if (!Array.isArray(input)) {
        throw new Error('countryPrices must be an array');
    }

    const seen = new Set();
    return input.map((entry) => {
        if (!entry || !entry.countryId) {
            throw new Error('Each country price requires a countryId');
        }
        if (!mongoose.Types.ObjectId.isValid(entry.countryId)) {
            throw new Error(`Invalid countryId: ${entry.countryId}`);
        }

        const key = entry.countryId.toString();
        if (seen.has(key)) {
            throw new Error('Duplicate countryId in countryPrices');
        }
        seen.add(key);

        const price = Number(entry.price);
        if (!Number.isFinite(price) || price < 0) {
            throw new Error('Each country price requires a non-negative price');
        }

        const wholesaleCost =
            entry.wholesaleCost === undefined || entry.wholesaleCost === null || entry.wholesaleCost === ''
                ? 0
                : Number(entry.wholesaleCost);
        if (!Number.isFinite(wholesaleCost) || wholesaleCost < 0) {
            throw new Error('wholesaleCost must be a non-negative number');
        }

        return { countryId: entry.countryId, price, wholesaleCost };
    });
};

/**
 * Validate and normalise a bundle countryPrices payload.
 */
const normaliseBundleCountryPrices = (input) => {
    if (input === undefined) return undefined;

    if (!Array.isArray(input)) {
        throw new Error('countryPrices must be an array');
    }

    const seen = new Set();
    return input.map((entry) => {
        if (!entry || !entry.countryId) {
            throw new Error('Each country price requires a countryId');
        }
        if (!mongoose.Types.ObjectId.isValid(entry.countryId)) {
            throw new Error(`Invalid countryId: ${entry.countryId}`);
        }

        const key = entry.countryId.toString();
        if (seen.has(key)) {
            throw new Error('Duplicate countryId in countryPrices');
        }
        seen.add(key);

        const retailPrice = Number(entry.retailPrice);
        if (!Number.isFinite(retailPrice) || retailPrice < 0) {
            throw new Error('Each country price requires a non-negative retailPrice');
        }

        return { countryId: entry.countryId, retailPrice };
    });
};

/**
 * Find order items whose product carries no price for the given country.
 *
 * Prices are set per country, so a product that has never been priced in a
 * market cannot be sold there — the caller should reject the order rather than
 * fall back to another country's price.
 *
 * @param {Array} items       [{ product, quantity, price }]
 * @param {string|ObjectId} countryId
 * @param {Model} ProductModel
 * @returns {Promise<Array<{id: string, name: string}>>} unpriced products
 */
const findUnpricedItems = async (items, countryId, ProductModel) => {
    if (!Array.isArray(items) || items.length === 0) return [];

    const productIds = items
        .map((item) => (item.product && item.product._id) || item.product)
        .filter(Boolean);

    if (productIds.length === 0) return [];

    const products = await ProductModel.find({ _id: { $in: productIds } }).select(
        'name sku countryPrices'
    );

    return products
        .filter((product) => !resolveProductPrice(product, countryId))
        .map((product) => ({ id: product._id.toString(), name: product.name }));
};

module.exports = {
    countryPricingStage,
    findUnpricedItems,
    resolveProductPrice,
    resolveBundlePrice,
    withResolvedPrice,
    withResolvedBundlePrice,
    countryPriceEntriesExpr,
    countryPriceFieldExpr,
    normaliseCountryPrices,
    normaliseBundleCountryPrices,
};
