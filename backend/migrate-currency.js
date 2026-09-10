/**
 * Migration: per-country currency + per-country pricing
 *
 * Run once against the database before deploying the currency feature:
 *   node backend/migrate-currency.js
 *
 * It does four things:
 *   1. Fills in currency details on every existing country (from the ISO map).
 *   2. Copies each product's legacy price/wholesaleCost into a countryPrices
 *      entry for the default country, so nothing becomes unpriced overnight.
 *   3. Does the same for bundle retail prices and their price history.
 *   4. Stamps existing orders with the currency snapshot used by receipts.
 *
 * The script is idempotent — running it multiple times is safe. It never
 * converts amounts between currencies; it only re-homes existing values onto
 * the country they were already entered in.
 */

require('dotenv').config({ path: `${__dirname}/.env` });
const mongoose = require('mongoose');
const dns = require('dns');
const { getDefaultCurrency } = require('./src/config/currencies');

dns.setServers(['8.8.8.8', '8.8.4.4']);

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI environment variable is not set.');
    process.exit(1);
}

async function run() {
    await mongoose.connect(MONGODB_URI, { family: 4 });
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // ---------------------------------------------------------------------
    // 1. Currency details on every country
    // ---------------------------------------------------------------------
    const countriesCol = db.collection('countries');
    const countries = await countriesCol.find({}).toArray();

    if (countries.length === 0) {
        throw new Error(
            'No countries found. Run migrate-country.js first to create the default country.'
        );
    }

    let currencyUpdates = 0;
    for (const country of countries) {
        const defaults = getDefaultCurrency(country.isoCode);

        // Fill each field independently — a country part-way through an earlier
        // run must still get the fields it is missing.
        const missing = {};
        for (const field of ['currencyCode', 'currencySymbol', 'currencyName', 'locale']) {
            if (!country[field]) missing[field] = defaults[field];
        }

        if (Object.keys(missing).length === 0) continue;

        await countriesCol.updateOne(
            { _id: country._id },
            { $set: { ...missing, updatedAt: new Date() } }
        );
        currencyUpdates += 1;
        console.log(
            `  ${country.name} (${country.isoCode}) ← ${Object.entries(missing)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')}`
        );
    }
    console.log(`Countries given currency details: ${currencyUpdates}`);

    // The default country owns all pre-existing prices — they were entered
    // before multi-country pricing existed.
    const defaultCountry =
        countries.find((c) => c.isDefault) ||
        countries.find((c) => c.isoCode === 'NG') ||
        countries[0];
    console.log(`Default country for existing prices: ${defaultCountry.name}`);

    // ---------------------------------------------------------------------
    // 2. Product prices → countryPrices[defaultCountry]
    // ---------------------------------------------------------------------
    const productsCol = db.collection('products');
    const products = await productsCol
        .find({
            $or: [
                { countryPrices: { $exists: false } },
                { countryPrices: { $size: 0 } },
                { 'countryPrices.countryId': { $ne: defaultCountry._id } },
            ],
        })
        .toArray();

    let productUpdates = 0;
    for (const product of products) {
        const existing = product.countryPrices || [];
        const alreadyPriced = existing.some(
            (cp) => cp.countryId && cp.countryId.toString() === defaultCountry._id.toString()
        );
        if (alreadyPriced) continue;

        // A product with no legacy price has nothing to carry over — leave it
        // unpriced so an admin sets a real price rather than inheriting a 0.
        if (product.price == null) continue;

        await productsCol.updateOne(
            { _id: product._id },
            {
                $push: {
                    countryPrices: {
                        countryId: defaultCountry._id,
                        price: product.price,
                        wholesaleCost: product.wholesaleCost || 0,
                    },
                },
                $set: { updatedAt: new Date() },
            }
        );
        productUpdates += 1;
    }
    console.log(`Products given a ${defaultCountry.name} price: ${productUpdates}`);

    // ---------------------------------------------------------------------
    // 3. Bundle retail prices → countryPrices[defaultCountry]
    // ---------------------------------------------------------------------
    const bundlesCol = db.collection('bundles');
    const bundles = await bundlesCol.find({}).toArray();

    let bundleUpdates = 0;
    let historyUpdates = 0;
    for (const bundle of bundles) {
        const existing = bundle.countryPrices || [];
        const alreadyPriced = existing.some(
            (cp) => cp.countryId && cp.countryId.toString() === defaultCountry._id.toString()
        );

        const update = {};

        if (!alreadyPriced && bundle.retailPrice != null) {
            update.$push = {
                countryPrices: {
                    countryId: defaultCountry._id,
                    retailPrice: bundle.retailPrice,
                },
            };
            bundleUpdates += 1;
        }

        // Historic price edits belong to the default country too, otherwise
        // they would show up under every market's history.
        const history = bundle.priceHistory || [];
        const needsHistoryStamp = history.some((entry) => !entry.countryId);
        if (needsHistoryStamp) {
            update.$set = {
                priceHistory: history.map((entry) =>
                    entry.countryId ? entry : { ...entry, countryId: defaultCountry._id }
                ),
                updatedAt: new Date(),
            };
            historyUpdates += 1;
        }

        if (Object.keys(update).length > 0) {
            await bundlesCol.updateOne({ _id: bundle._id }, update);
        }
    }
    console.log(`Bundles given a ${defaultCountry.name} price: ${bundleUpdates}`);
    console.log(`Bundles with price history stamped: ${historyUpdates}`);

    // ---------------------------------------------------------------------
    // 4. Currency snapshot on existing orders
    // ---------------------------------------------------------------------
    const ordersCol = db.collection('orders');
    let orderUpdates = 0;

    for (const country of await countriesCol.find({}).toArray()) {
        const result = await ordersCol.updateMany(
            { countryId: country._id, 'currency.code': { $exists: false } },
            {
                $set: {
                    currency: {
                        code: country.currencyCode || getDefaultCurrency(country.isoCode).currencyCode,
                        symbol:
                            country.currencySymbol ||
                            getDefaultCurrency(country.isoCode).currencySymbol,
                        locale: country.locale || getDefaultCurrency(country.isoCode).locale,
                    },
                },
            }
        );
        orderUpdates += result.modifiedCount;
    }
    console.log(`Orders stamped with a currency snapshot: ${orderUpdates}`);

    console.log('\nMigration complete.');
    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error('Migration failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
