const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const InventoryBalance = require('../models/InventoryBalance');

/**
 * Validation for spreadsheet-driven stock uploads.
 *
 * The browser previews a file before anything is sent, but that preview is a
 * convenience — this is the authority. Every row is re-resolved and re-checked
 * here, and the caller applies nothing unless the whole batch is clean.
 */

const MODES = ['SET', 'IN', 'OUT'];
const MAX_ROWS = 2000;

const norm = (v) => String(v ?? '').trim();
const normKey = (v) => norm(v).toLowerCase();

/**
 * Parses a cartons/pieces pair into a piece count.
 * Returns null when either field is present but not a non-negative whole number.
 */
function toPieces(cartons, pieces, cartonSize) {
    const parse = (v) => {
        if (v === undefined || v === null || norm(v) === '') return 0;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN;
        return n;
    };

    const c = parse(cartons);
    const p = parse(pieces);
    if (Number.isNaN(c) || Number.isNaN(p)) return null;

    return c * (cartonSize || 1) + p;
}

/**
 * Resolves and validates every row of an upload against the active country.
 *
 * @param {object} params
 * @param {Array} params.rows      [{ sku, warehouse, cartons, pieces }]
 * @param {'SET'|'IN'|'OUT'} params.mode
 * @param {string|ObjectId} params.countryId
 * @returns {Promise<{valid: boolean, errors: Array, resolved: Array}>}
 *   `errors` is [{ row, sku, warehouse, message }] with 1-based row numbers
 *   matching the spreadsheet body (row 1 = first data row under the header).
 *   `resolved` is only meaningful when `valid` is true.
 */
async function validateRows({ rows, mode, countryId }) {
    const errors = [];

    if (!MODES.includes(mode)) {
        return { valid: false, errors: [{ row: 0, message: `Mode must be one of ${MODES.join(', ')}` }], resolved: [] };
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        return { valid: false, errors: [{ row: 0, message: 'The sheet has no data rows' }], resolved: [] };
    }
    if (rows.length > MAX_ROWS) {
        return {
            valid: false,
            errors: [{ row: 0, message: `The sheet has ${rows.length} rows; the limit is ${MAX_ROWS}` }],
            resolved: [],
        };
    }

    // Resolve every SKU and warehouse named in the file in two queries.
    const skus = [...new Set(rows.map((r) => normKey(r.sku)).filter(Boolean))];
    const warehouseNames = [...new Set(rows.map((r) => normKey(r.warehouse)).filter(Boolean))];

    const [products, warehouses] = await Promise.all([
        Product.find({ sku: { $in: skus.map((s) => new RegExp(`^${escapeRegex(s)}$`, 'i')) } })
            .select('_id sku name cartonSize')
            .lean(),
        Warehouse.find({ countryId, name: { $in: warehouseNames.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i')) } })
            .select('_id name active')
            .lean(),
    ]);

    const productBySku = new Map(products.map((p) => [normKey(p.sku), p]));
    const warehouseByName = new Map(warehouses.map((w) => [normKey(w.name), w]));

    // Current levels for every pair in the file, so SET can compute a delta and
    // OUT can be stopped before it drives a balance negative.
    const balances = await InventoryBalance.find({
        countryId,
        product: { $in: products.map((p) => p._id) },
        warehouse: { $in: warehouses.map((w) => w._id) },
    })
        .select('product warehouse quantity')
        .lean();

    const balanceKey = (productId, warehouseId) => `${productId}|${warehouseId}`;
    const balanceMap = new Map(
        balances.map((b) => [balanceKey(String(b.product), String(b.warehouse)), b.quantity])
    );

    const seen = new Map(); // pair → first row number, to catch duplicates
    const resolved = [];

    rows.forEach((raw, index) => {
        const rowNo = index + 1;
        const sku = norm(raw.sku);
        const warehouseName = norm(raw.warehouse);
        const add = (message) => errors.push({ row: rowNo, sku, warehouse: warehouseName, message });

        if (!sku) return add('SKU is missing');
        if (!warehouseName) return add('Warehouse is missing');

        const product = productBySku.get(normKey(sku));
        if (!product) return add(`No product with SKU "${sku}"`);

        const warehouse = warehouseByName.get(normKey(warehouseName));
        if (!warehouse) return add(`No warehouse named "${warehouseName}" in this country`);
        if (warehouse.active === false) return add(`Warehouse "${warehouse.name}" is inactive`);

        const pairKey = balanceKey(String(product._id), String(warehouse._id));
        if (seen.has(pairKey)) {
            return add(`Duplicate of row ${seen.get(pairKey)} — same product and warehouse`);
        }
        seen.set(pairKey, rowNo);

        const totalPieces = toPieces(raw.cartons, raw.pieces, product.cartonSize);
        if (totalPieces === null) {
            return add('Cartons and Pieces must be whole numbers of zero or more');
        }

        const current = balanceMap.get(pairKey) || 0;
        let change;
        let setQuantity;

        if (mode === 'SET') {
            change = totalPieces - current;
            setQuantity = totalPieces;
        } else if (mode === 'IN') {
            if (totalPieces === 0) return add('Quantity must be more than zero for an IN upload');
            change = totalPieces;
        } else {
            if (totalPieces === 0) return add('Quantity must be more than zero for an OUT upload');
            if (totalPieces > current) {
                return add(`Cannot remove ${totalPieces} — only ${current} in stock at ${warehouse.name}`);
            }
            change = -totalPieces;
        }

        resolved.push({
            row: rowNo,
            product: product._id,
            sku: product.sku,
            productName: product.name,
            warehouse: warehouse._id,
            warehouseName: warehouse.name,
            cartonSize: product.cartonSize || 1,
            totalPieces,
            currentQuantity: current,
            newQuantity: mode === 'SET' ? totalPieces : current + change,
            change,
            ...(setQuantity !== undefined && { setQuantity }),
        });
    });

    return { valid: errors.length === 0, errors, resolved };
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { validateRows, toPieces, MODES, MAX_ROWS };
