/**
 * Migration: Assign all existing scoped records to Nigeria
 *
 * Run once against the database before deploying the multi-country feature:
 *   node backend/migrate-country.js
 *
 * The script is idempotent — running it multiple times is safe.
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

    // Upsert Nigeria country document
    const countriesCol = db.collection('countries');
    await countriesCol.findOneAndUpdate(
        { isoCode: 'NG' },
        {
            $set: {
                name: 'Nigeria',
                isoCode: 'NG',
                isActive: true,
                isDefault: true,
                ...getDefaultCurrency('NG'),
            },
            $setOnInsert: { createdAt: new Date(), updatedAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' }
    );

    // Always fetch by isoCode to get the definitive _id
    const nigeria = await countriesCol.findOne({ isoCode: 'NG' });
    if (!nigeria) {
        throw new Error('Failed to find or create Nigeria country document');
    }
    const nigeriaId = nigeria._id;
    console.log(`Nigeria _id: ${nigeriaId}`);

    // Collections to migrate
    const scopedCollections = [
        'orders',
        'warehouses',
        'regions',
        'inventorybalances',
        'stockledgers',
        'inventorytransfers',
        'sorcustomers',
    ];

    for (const colName of scopedCollections) {
        const col = db.collection(colName);
        try {
            // Only update documents that don't already have countryId set
            const updateResult = await col.updateMany(
                { countryId: { $exists: false } },
                { $set: { countryId: nigeriaId } }
            );
            console.log(
                `${colName}: updated ${updateResult.modifiedCount} documents (${updateResult.matchedCount} matched)`
            );
        } catch (err) {
            // Log and continue — don't abort the whole migration
            console.error(`ERROR updating ${colName}: ${err.message}`);
        }
    }

    // Verify — count any remaining documents without countryId
    for (const colName of scopedCollections) {
        const col = db.collection(colName);
        const missing = await col.countDocuments({ countryId: { $exists: false } });
        if (missing > 0) {
            console.warn(`WARNING: ${colName} still has ${missing} documents without countryId`);
        }
    }

    console.log('Migration complete.');
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error('Migration failed:', err);
    mongoose.disconnect();
    process.exit(1);
});
