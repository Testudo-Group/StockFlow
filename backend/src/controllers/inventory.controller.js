const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const StockLedger = require('../models/StockLedger');
const InventoryBalance = require('../models/InventoryBalance');
const InventoryTransfer = require('../models/InventoryTransfer');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const {
    countryPricingStage,
    resolveProductPrice,
    withResolvedPrice,
} = require('../utils/pricing');
const { validateRows } = require('../services/inventory.bulk.service');

// @desc    Adjust stock (IN, OUT, ADJUSTMENT, TRANSFER)
// @route   POST /api/inventory/adjust
// @access  Private (Manage Inventory)
exports.adjustStock = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            await session.endSession();
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { product, warehouse, change, type, reason, reference, setQuantity } = req.body;

        // Start Transaction
        session.startTransaction();

        // 1. Verify Product and Warehouse exist
        const productExists = await Product.findById(product).session(session);
        const warehouseExists = await Warehouse.findById(warehouse).session(session);

        if (!productExists || !warehouseExists) {
            await session.abortTransaction();
            await session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Product or Warehouse not found',
            });
        }

        // 2. Update Inventory Balance (Upsert)
        let updatedBalance;
        if (type === 'ADJUSTMENT' && setQuantity !== undefined) {
            // Correction mode: set quantity to exact value
            updatedBalance = await InventoryBalance.findOneAndUpdate(
                { product, warehouse, countryId: req.countryId },
                {
                    $set: { quantity: setQuantity, lastUpdated: new Date() },
                },
                {
                    new: true,
                    upsert: true,
                    session,
                    setDefaultsOnInsert: true,
                }
            );
        } else {
            // Normal mode: increment/decrement
            updatedBalance = await InventoryBalance.findOneAndUpdate(
                { product, warehouse, countryId: req.countryId },
                {
                    $inc: { quantity: change },
                    $set: { lastUpdated: new Date() },
                },
                {
                    new: true,
                    upsert: true,
                    session,
                    setDefaultsOnInsert: true,
                }
            );
        }

        // 3. Create Ledger Entry
        const ledgerEntry = await StockLedger.create(
            [
                {
                    product,
                    warehouse,
                    change,
                    type,
                    reason,
                    reference,
                    balanceAfter: updatedBalance.quantity,
                    performedBy: req.user.id,
                    countryId: req.countryId,
                },
            ],
            { session }
        );

        // Commit Transaction
        await session.commitTransaction();
        await session.endSession();

        res.status(200).json({
            success: true,
            data: {
                balance: updatedBalance,
                ledger: ledgerEntry[0],
            },
        });

    } catch (error) {
        // Abort on error
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        await session.endSession();

        // Check for specific transaction errors (like standalone mongo)
        if (error.message && error.message.includes('Transactions are not supported')) {
            // Fallback for standalone: manual sequential updates (risky but needed sometimes)
            // For this specific 'Advanced Agentic Coding' scenario, we might want to just let it fail 
            // or notify the user. But let's try to be helpful. 
            // Actually, I'll let it fail so I know if I need to fix the environment or code.
            // User can restart mongo as replica set if needed.
        }
        next(error);
    }
};

// @desc    Get current inventory balance
// @route   GET /api/inventory/balance
// @access  Private (View Inventory)
exports.getBalance = async (req, res, next) => {
    try {
        const { warehouseId, productId, categoryId, brandId } = req.query;

        if (!warehouseId || warehouseId === '') {
            // Aggregated View - Group by product
            const match = {};
            if (productId && productId !== '') match.product = new mongoose.Types.ObjectId(productId);
            match.countryId = req.countryId;

            const pipeline = [
                { $match: match },
                {
                    $group: {
                        _id: '$product',
                        quantity: { $sum: '$quantity' },
                        allocated: { $sum: '$allocated' },
                    }
                },
                {
                    $lookup: {
                        from: 'products',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                countryPricingStage('$product', req.countryId),
            ];

            // Add category filter if provided
            if (categoryId && categoryId !== '') {
                pipeline.push({
                    $match: {
                        'product.category': new mongoose.Types.ObjectId(categoryId)
                    }
                });
            }

            // Add brand filter if provided
            if (brandId && brandId !== '') {
                pipeline.push({
                    $match: {
                        'product.brand': new mongoose.Types.ObjectId(brandId)
                    }
                });
            }

            pipeline.push(
                {
                    $project: {
                        _id: 1,
                        quantity: 1,
                        allocated: 1,
                        product: {
                            _id: '$product._id',
                            name: '$product.name',
                            sku: '$product.sku',
                            cartonSize: '$product.cartonSize',
                            wholesaleCost: '$countryWholesaleCost',
                            price: '$countryPrice',
                            volume: '$product.volume',
                            dimensions: '$product.dimensions',
                            category: '$product.category',
                            brand: '$product.brand'
                        },
                        warehouse: { name: 'All Warehouses' }
                    }
                },
                { $sort: { 'product.name': 1 } }
            );

            const balances = await InventoryBalance.aggregate(pipeline);

            return res.status(200).json({
                success: true,
                count: balances.length,
                data: balances,
            });
        }

        // Specific Warehouse View
        const query = { warehouse: warehouseId, countryId: req.countryId };
        if (productId) query.product = productId;

        let balances;
        if ((categoryId && categoryId !== '') || (brandId && brandId !== '')) {
            // Need to filter by category or brand - use aggregation
            const matchStage = { warehouse: new mongoose.Types.ObjectId(warehouseId), countryId: req.countryId };
            if (productId) matchStage.product = new mongoose.Types.ObjectId(productId);

            const pipeline = [
                { $match: matchStage },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'product',
                        foreignField: '_id',
                        as: 'productInfo'
                    }
                },
                { $unwind: '$productInfo' },
                countryPricingStage('$productInfo', req.countryId),
            ];

            // Add category match if provided
            if (categoryId && categoryId !== '') {
                pipeline.push({
                    $match: {
                        'productInfo.category': new mongoose.Types.ObjectId(categoryId)
                    }
                });
            }

            // Add brand match if provided
            if (brandId && brandId !== '') {
                pipeline.push({
                    $match: {
                        'productInfo.brand': new mongoose.Types.ObjectId(brandId)
                    }
                });
            }

            pipeline.push(
                {
                    $lookup: {
                        from: 'warehouses',
                        localField: 'warehouse',
                        foreignField: '_id',
                        as: 'warehouseInfo'
                    }
                },
                { $unwind: '$warehouseInfo' },
                {
                    $project: {
                        _id: 1,
                        quantity: 1,
                        allocated: 1,
                        product: {
                            _id: '$productInfo._id',
                            name: '$productInfo.name',
                            sku: '$productInfo.sku',
                            cartonSize: '$productInfo.cartonSize',
                            wholesaleCost: '$countryWholesaleCost',
                            price: '$countryPrice',
                            volume: '$productInfo.volume',
                            dimensions: '$productInfo.dimensions',
                            category: '$productInfo.category',
                            brand: '$productInfo.brand'
                        },
                        warehouse: {
                            _id: '$warehouseInfo._id',
                            name: '$warehouseInfo.name'
                        }
                    }
                }
            );

            balances = await InventoryBalance.aggregate(pipeline);
        } else {
            const rawBalances = await InventoryBalance.find(query)
                .populate('product', 'name sku cartonSize wholesaleCost price countryPrices volume dimensions category brand')
                .populate('warehouse', 'name');

            // Surface the active country's price on each product
            balances = rawBalances.map((balance) => {
                const obj = balance.toObject();
                if (obj.product) {
                    obj.product = withResolvedPrice(obj.product, req.countryId);
                }
                return obj;
            });
        }

        res.status(200).json({
            success: true,
            count: balances.length,
            data: balances,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get stock ledger history
// @route   GET /api/inventory/ledger
// @access  Private (View Inventory)
exports.getLedger = async (req, res, next) => {
    try {
        const { warehouseId, productId, type, startDate, endDate, search, page = 1, limit = 50 } = req.query;
        const query = {};

        // Always scope to active country
        query.countryId = req.countryId;

        if (warehouseId) query.warehouse = warehouseId;
        if (productId) query.product = productId;
        if (type) query.type = type;
        if (search) query.reference = { $regex: search, $options: 'i' };

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await StockLedger.countDocuments(query);

        const ledger = await StockLedger.find(query)
            .populate('product', 'name sku wholesaleCost price countryPrices')
            .populate('warehouse', 'name')
            .populate('performedBy', 'email name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Compute total inventory value after the change using product cost
        const enriched = ledger.map(entry => {
            const obj = entry.toObject({ virtuals: false });
            // Value the movement using this country's own price — never
            // another country's, since amounts are not convertible.
            const countryPrice = resolveProductPrice(obj.product, req.countryId);
            const wc = countryPrice?.wholesaleCost;
            const rp = countryPrice?.price;
            const costPerUnit = (wc != null && wc > 0) ? wc : (rp != null && rp > 0 ? rp : 0);
            const balAfter = obj.balanceAfter ?? 0;
            obj.valueAfter = balAfter * costPerUnit;
            obj._costUsed = costPerUnit;
            obj._balanceAfter = balAfter;
            obj._productName = obj.product?.name; // extra debug
            return obj;
        });

        // Debug: log first entry to server console
        if (enriched.length > 0) {
            const first = enriched[0];
            console.log('[Ledger Debug] first entry:', {
                productName: first._productName,
                balanceAfter: first.balanceAfter,
                _balanceAfter: first._balanceAfter,
                _costUsed: first._costUsed,
                valueAfter: first.valueAfter,
                productRaw: first.product,
            });
        }

        res.status(200).json({
            success: true,
            count: enriched.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: enriched,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Transfer stock between warehouses
// @route   POST /api/inventory/transfer
// @access  Private (Manage Inventory)
exports.transferStock = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { product, sourceWarehouse, destinationWarehouse, quantity, reason } = req.body;

        // Validation
        if (sourceWarehouse === destinationWarehouse) {
            return res.status(400).json({
                success: false,
                message: 'Source and destination warehouses cannot be the same',
            });
        }

        // 1. Verify Product and Warehouses exist
        const [productExists, sourceExists, destExists] = await Promise.all([
            Product.findById(product),
            Warehouse.findById(sourceWarehouse),
            Warehouse.findById(destinationWarehouse),
        ]);

        if (!productExists || !sourceExists || !destExists) {
            return res.status(404).json({
                success: false,
                message: 'Product or Warehouse not found',
            });
        }

        // 2. Check if source warehouse has enough stock
        const sourceBalance = await InventoryBalance.findOne({
            product,
            warehouse: sourceWarehouse,
        });

        if (!sourceBalance || sourceBalance.quantity < quantity) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient stock in source warehouse',
            });
        }

        // 3. Create transfer record
        const transfer = await InventoryTransfer.create({
            product,
            sourceWarehouse,
            destinationWarehouse,
            quantity,
            reason,
            status: 'COMPLETED',
            initiatedBy: req.user.id,
            countryId: req.countryId,
        });

        // 4. Update source warehouse (TRANSFER_OUT)
        const updatedSourceBalance = await InventoryBalance.findOneAndUpdate(
            { product, warehouse: sourceWarehouse, countryId: req.countryId },
            {
                $inc: { quantity: -quantity },
                $set: { lastUpdated: new Date() },
            },
            { new: true }
        );

        // 5. Update destination warehouse (TRANSFER_IN)
        const updatedDestBalance = await InventoryBalance.findOneAndUpdate(
            { product, warehouse: destinationWarehouse, countryId: req.countryId },
            {
                $inc: { quantity: quantity },
                $set: { lastUpdated: new Date() },
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
            }
        );

        // 6. Create ledger entries for both warehouses
        await StockLedger.create([
            {
                product,
                warehouse: sourceWarehouse,
                change: -quantity,
                type: 'TRANSFER_OUT',
                reason: `Transfer to ${destExists.name}: ${reason}`,
                reference: transfer._id.toString(),
                balanceAfter: updatedSourceBalance.quantity,
                performedBy: req.user.id,
                countryId: req.countryId,
            },
            {
                product,
                warehouse: destinationWarehouse,
                change: quantity,
                type: 'TRANSFER_IN',
                reason: `Transfer from ${sourceExists.name}: ${reason}`,
                reference: transfer._id.toString(),
                balanceAfter: updatedDestBalance.quantity,
                performedBy: req.user.id,
                countryId: req.countryId,
            },
        ]);

        res.status(200).json({
            success: true,
            data: {
                transfer,
                sourceBalance: updatedSourceBalance,
                destinationBalance: updatedDestBalance,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Validate a spreadsheet upload without writing anything
// @route   POST /api/inventory/bulk-adjust/preview
// @access  Private (Manage Inventory)
exports.previewBulkAdjust = async (req, res, next) => {
    try {
        const validation = validationResult(req);
        if (!validation.isEmpty()) {
            return res.status(400).json({ success: false, errors: validation.array() });
        }

        const { mode, rows } = req.body;

        const { valid, errors, resolved } = await validateRows({
            rows,
            mode,
            countryId: req.countryId,
        });

        res.status(200).json({
            success: true,
            data: { valid, errors, rows: resolved, counts: { total: Array.isArray(rows) ? rows.length : 0, invalid: errors.length } },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Apply a spreadsheet of stock levels in one batch
// @route   POST /api/inventory/bulk-adjust
// @access  Private (Manage Inventory)
exports.bulkAdjustStock = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        const validation = validationResult(req);
        if (!validation.isEmpty()) {
            await session.endSession();
            return res.status(400).json({ success: false, errors: validation.array() });
        }

        const { mode, reason, rows, reference } = req.body;

        // The browser previewed this file, but the sheet may have changed and
        // stock moves between preview and import — re-check everything.
        const { valid, errors, resolved } = await validateRows({
            rows,
            mode,
            countryId: req.countryId,
        });

        if (!valid) {
            await session.endSession();
            return res.status(400).json({
                success: false,
                message: `${errors.length} row${errors.length === 1 ? '' : 's'} could not be imported — nothing was changed`,
                errors,
            });
        }

        // All-or-nothing: the whole sheet lands, or none of it does.
        session.startTransaction();

        const ledgerEntries = [];
        for (const row of resolved) {
            const update = row.setQuantity !== undefined
                ? { $set: { quantity: row.setQuantity, lastUpdated: new Date() } }
                : { $inc: { quantity: row.change }, $set: { lastUpdated: new Date() } };

            const balance = await InventoryBalance.findOneAndUpdate(
                { product: row.product, warehouse: row.warehouse, countryId: req.countryId },
                update,
                { new: true, upsert: true, session, setDefaultsOnInsert: true }
            );

            ledgerEntries.push({
                product: row.product,
                warehouse: row.warehouse,
                change: row.change,
                type: mode === 'SET' ? 'ADJUSTMENT' : mode,
                reason: String(reason).trim(),
                reference: reference || `Bulk upload (${mode})`,
                balanceAfter: balance.quantity,
                performedBy: req.user.id,
                countryId: req.countryId,
            });
        }

        // A SET row that changes nothing still resolves cleanly; skip the noise.
        const meaningful = ledgerEntries.filter((e) => e.change !== 0);
        if (meaningful.length > 0) {
            await StockLedger.create(meaningful, { session, ordered: true });
        }

        await session.commitTransaction();
        await session.endSession();

        res.status(200).json({
            success: true,
            data: {
                applied: resolved.length,
                ledgerEntries: meaningful.length,
                unchanged: resolved.length - meaningful.length,
            },
        });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        await session.endSession();
        next(error);
    }
};
