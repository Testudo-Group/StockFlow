const Order = require('../models/Order');
const InventoryBalance = require('../models/InventoryBalance');
const Product = require('../models/Product');
const Brand = require('../models/Brand');
const Category = require('../models/Category');
const Region = require('../models/Region');
const Warehouse = require('../models/Warehouse');
const mongoose = require('mongoose');
const { countryPricingStage } = require('../utils/pricing');

// @desc    Get comprehensive financial analytics
// @route   GET /api/financials
// @access  Private (Admin only)
exports.getFinancials = async (req, res, next) => {
    try {
        const { startDate, endDate, trendPeriod = 'past365' } = req.query;
        
        // Date range for orders (default to all time)
        const orderDateFilter = {};
        if (startDate) orderDateFilter.$gte = new Date(startDate);
        if (endDate) orderDateFilter.$lte = new Date(endDate);
        const orderMatch = Object.keys(orderDateFilter).length > 0 
            ? { createdAt: orderDateFilter, status: { $ne: 'CANCELLED' }, countryId: req.countryId }
            : { status: { $ne: 'CANCELLED' }, countryId: req.countryId };

        // 1. INVENTORY VALUATION - Current stock value by warehouse
        const inventoryByWarehouse = await InventoryBalance.aggregate([
            { $match: { countryId: req.countryId } },
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
                $addFields: {
                    // Calculate volume from dimensions if needed
                    calculatedVolume: {
                        $multiply: [
                            { $ifNull: ['$productInfo.dimensions.length', 0] },
                            { $ifNull: ['$productInfo.dimensions.breadth', 0] },
                            { $ifNull: ['$productInfo.dimensions.height', 0] }
                        ]
                    },
                    safeCartonSize: {
                        $cond: {
                            if: { $gt: [{ $ifNull: ['$productInfo.cartonSize', 0] }, 0] },
                            then: '$productInfo.cartonSize',
                            else: 1
                        }
                    }
                }
            },
            {
                $addFields: {
                    finalUnitVolume: {
                        $cond: {
                            if: { $gt: [{ $ifNull: ['$productInfo.volume', 0] }, 0] },
                            then: '$productInfo.volume',
                            else: '$calculatedVolume'
                        }
                    },
                    numCartons: { $divide: ['$quantity', '$safeCartonSize'] }
                }
            },
            {
                $group: {
                    _id: '$warehouse',
                    warehouseName: { $first: '$warehouseInfo.name' },
                    totalUnits: { $sum: '$quantity' },
                    totalCBM: { $sum: { $multiply: ['$numCartons', '$finalUnitVolume'] } },
                    totalCost: { 
                        $sum: { 
                            $multiply: [
                                '$quantity', 
                                '$countryCost'
                            ] 
                        } 
                    },
                    totalRetailValue: { 
                        $sum: { $multiply: ['$quantity', '$countryPrice'] } 
                    }
                }
            },
            {
                $project: {
                    warehouseName: 1,
                    totalUnits: 1,
                    totalCBM: { $round: ['$totalCBM', 3] },
                    totalCost: { $round: ['$totalCost', 2] },
                    totalRetailValue: { $round: ['$totalRetailValue', 2] },
                    potentialProfit: { 
                        $round: [{ $subtract: ['$totalRetailValue', '$totalCost'] }, 2] 
                    },
                    profitMargin: {
                        $cond: {
                            if: { $gt: ['$totalRetailValue', 0] },
                            then: { 
                                $round: [
                                    { 
                                        $multiply: [
                                            { 
                                                $divide: [
                                                    { $subtract: ['$totalRetailValue', '$totalCost'] },
                                                    '$totalRetailValue'
                                                ]
                                            },
                                            100
                                        ]
                                    },
                                    2
                                ]
                            },
                            else: 0
                        }
                    }
                }
            },
            { $sort: { totalCost: -1 } }
        ]);

        // 2. INVENTORY VALUATION - By Brand
        const inventoryByBrand = await InventoryBalance.aggregate([
            { $match: { countryId: req.countryId } },
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
            {
                $lookup: {
                    from: 'brands',
                    localField: 'productInfo.brand',
                    foreignField: '_id',
                    as: 'brandInfo'
                }
            },
            { $unwind: '$brandInfo' },
            {
                $addFields: {
                    calculatedVolume: {
                        $multiply: [
                            { $ifNull: ['$productInfo.dimensions.length', 0] },
                            { $ifNull: ['$productInfo.dimensions.breadth', 0] },
                            { $ifNull: ['$productInfo.dimensions.height', 0] }
                        ]
                    },
                    safeCartonSize: {
                        $cond: {
                            if: { $gt: [{ $ifNull: ['$productInfo.cartonSize', 0] }, 0] },
                            then: '$productInfo.cartonSize',
                            else: 1
                        }
                    }
                }
            },
            {
                $addFields: {
                    finalUnitVolume: {
                        $cond: {
                            if: { $gt: [{ $ifNull: ['$productInfo.volume', 0] }, 0] },
                            then: '$productInfo.volume',
                            else: '$calculatedVolume'
                        }
                    },
                    numCartons: { $divide: ['$quantity', '$safeCartonSize'] }
                }
            },
            {
                $group: {
                    _id: '$productInfo.brand',
                    brandName: { $first: '$brandInfo.name' },
                    totalUnits: { $sum: '$quantity' },
                    totalCBM: { $sum: { $multiply: ['$numCartons', '$finalUnitVolume'] } },
                    totalCost: { 
                        $sum: { 
                            $multiply: [
                                '$quantity', 
                                '$countryCost'
                            ] 
                        } 
                    },
                    totalRetailValue: { 
                        $sum: { $multiply: ['$quantity', '$countryPrice'] } 
                    },
                    productCount: { $addToSet: '$product' }
                }
            },
            {
                $project: {
                    brandName: 1,
                    totalUnits: 1,
                    totalCBM: { $round: ['$totalCBM', 3] },
                    productCount: { $size: '$productCount' },
                    totalCost: { $round: ['$totalCost', 2] },
                    totalRetailValue: { $round: ['$totalRetailValue', 2] },
                    potentialProfit: { 
                        $round: [{ $subtract: ['$totalRetailValue', '$totalCost'] }, 2] 
                    }
                }
            },
            { $sort: { totalCost: -1 } }
        ]);

        // 3. INVENTORY VALUATION - By Category
        const inventoryByCategory = await InventoryBalance.aggregate([
            { $match: { countryId: req.countryId } },
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
            {
                $lookup: {
                    from: 'categories',
                    localField: 'productInfo.category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            {
                $addFields: {
                    calculatedVolume: {
                        $multiply: [
                            { $ifNull: ['$productInfo.dimensions.length', 0] },
                            { $ifNull: ['$productInfo.dimensions.breadth', 0] },
                            { $ifNull: ['$productInfo.dimensions.height', 0] }
                        ]
                    },
                    safeCartonSize: {
                        $cond: {
                            if: { $gt: [{ $ifNull: ['$productInfo.cartonSize', 0] }, 0] },
                            then: '$productInfo.cartonSize',
                            else: 1
                        }
                    }
                }
            },
            {
                $addFields: {
                    finalUnitVolume: {
                        $cond: {
                            if: { $gt: [{ $ifNull: ['$productInfo.volume', 0] }, 0] },
                            then: '$productInfo.volume',
                            else: '$calculatedVolume'
                        }
                    },
                    numCartons: { $divide: ['$quantity', '$safeCartonSize'] }
                }
            },
            {
                $group: {
                    _id: '$productInfo.category',
                    categoryName: { 
                        $first: { 
                            $ifNull: [
                                { $arrayElemAt: ['$categoryInfo.name', 0] },
                                'Uncategorized'
                            ]
                        } 
                    },
                    totalUnits: { $sum: '$quantity' },
                    totalCBM: { $sum: { $multiply: ['$numCartons', '$finalUnitVolume'] } },
                    totalCost: { 
                        $sum: { 
                            $multiply: [
                                '$quantity', 
                                '$countryCost'
                            ] 
                        } 
                    },
                    totalRetailValue: { 
                        $sum: { $multiply: ['$quantity', '$countryPrice'] } 
                    }
                }
            },
            {
                $project: {
                    categoryName: 1,
                    totalUnits: 1,
                    totalCBM: { $round: ['$totalCBM', 3] },
                    totalCost: { $round: ['$totalCost', 2] },
                    totalRetailValue: { $round: ['$totalRetailValue', 2] },
                    potentialProfit: { 
                        $round: [{ $subtract: ['$totalRetailValue', '$totalCost'] }, 2] 
                    }
                }
            },
            { $sort: { totalCost: -1 } }
        ]);

        // 4. TOP PRODUCTS BY VALUE (Current Inventory)
        const topProductsByValue = await InventoryBalance.aggregate([
            { $match: { countryId: req.countryId } },
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
            {
                $addFields: {
                    calculatedVolume: {
                        $multiply: [
                            { $ifNull: ['$productInfo.dimensions.length', 0] },
                            { $ifNull: ['$productInfo.dimensions.breadth', 0] },
                            { $ifNull: ['$productInfo.dimensions.height', 0] }
                        ]
                    },
                    safeCartonSize: {
                        $cond: {
                            if: { $gt: [{ $ifNull: ['$productInfo.cartonSize', 0] }, 0] },
                            then: '$productInfo.cartonSize',
                            else: 1
                        }
                    }
                }
            },
            {
                $addFields: {
                    finalUnitVolume: {
                        $cond: {
                            if: { $gt: [{ $ifNull: ['$productInfo.volume', 0] }, 0] },
                            then: '$productInfo.volume',
                            else: '$calculatedVolume'
                        }
                    },
                    numCartons: { $divide: ['$quantity', '$safeCartonSize'] }
                }
            },
            {
                $project: {
                    productName: '$productInfo.name',
                    sku: '$productInfo.sku',
                    quantity: 1,
                    totalCBM: { $multiply: ['$numCartons', '$finalUnitVolume'] },
                    unitCost: '$countryCost',
                    unitPrice: '$countryPrice',
                    totalCost: { 
                        $multiply: [
                            '$quantity', 
                            '$countryCost'
                        ] 
                    },
                    totalRetailValue: { $multiply: ['$quantity', '$countryPrice'] }
                }
            },
            { $sort: { totalCost: -1 } },
            { $limit: 20 },
            {
                $project: {
                    productName: 1,
                    sku: 1,
                    quantity: 1,
                    totalCBM: { $round: ['$totalCBM', 3] },
                    unitCost: { $round: ['$unitCost', 2] },
                    unitPrice: { $round: ['$unitPrice', 2] },
                    totalCost: { $round: ['$totalCost', 2] },
                    totalRetailValue: { $round: ['$totalRetailValue', 2] }
                }
            }
        ]);

        // 5. SALES REVENUE - By Warehouse
        const salesByWarehouse = await Order.aggregate([
            { $match: orderMatch },
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
                $group: {
                    _id: '$warehouse',
                    warehouseName: { $first: '$warehouseInfo.name' },
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' }
                }
            },
            {
                $project: {
                    warehouseName: 1,
                    totalOrders: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    avgOrderValue: { 
                        $round: [{ $divide: ['$totalRevenue', '$totalOrders'] }, 2] 
                    }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // 6. SALES REVENUE - By Region
        const salesByRegion = await Order.aggregate([
            { $match: orderMatch },
            {
                $lookup: {
                    from: 'regions',
                    localField: 'region',
                    foreignField: '_id',
                    as: 'regionInfo'
                }
            },
            { $unwind: '$regionInfo' },
            {
                $group: {
                    _id: '$region',
                    regionName: { $first: '$regionInfo.name' },
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' }
                }
            },
            {
                $project: {
                    regionName: 1,
                    totalOrders: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // 7. SALES REVENUE - By Brand (from orders)
        const salesByBrand = await Order.aggregate([
            { $match: orderMatch },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $lookup: {
                    from: 'brands',
                    localField: 'productInfo.brand',
                    foreignField: '_id',
                    as: 'brandInfo'
                }
            },
            { $unwind: '$brandInfo' },
            {
                $group: {
                    _id: '$productInfo.brand',
                    brandName: { $first: '$brandInfo.name' },
                    totalUnitsSold: { $sum: '$items.quantity' },
                    totalRevenue: { 
                        $sum: { $multiply: ['$items.quantity', '$items.price'] } 
                    }
                }
            },
            {
                $project: {
                    brandName: 1,
                    totalUnitsSold: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // 8. SALES REVENUE - By Category
        const salesByCategory = await Order.aggregate([
            { $match: orderMatch },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'productInfo.category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            {
                $group: {
                    _id: '$productInfo.category',
                    categoryName: { 
                        $first: { 
                            $ifNull: [
                                { $arrayElemAt: ['$categoryInfo.name', 0] },
                                'Uncategorized'
                            ]
                        } 
                    },
                    totalUnitsSold: { $sum: '$items.quantity' },
                    totalRevenue: { 
                        $sum: { $multiply: ['$items.quantity', '$items.price'] } 
                    }
                }
            },
            {
                $project: {
                    categoryName: 1,
                    totalUnitsSold: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // 9. TOP SELLING PRODUCTS (Revenue)
        const topSellingProducts = await Order.aggregate([
            { $match: orderMatch },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $group: {
                    _id: '$items.product',
                    productName: { $first: '$productInfo.name' },
                    sku: { $first: '$productInfo.sku' },
                    totalUnitsSold: { $sum: '$items.quantity' },
                    totalRevenue: { 
                        $sum: { $multiply: ['$items.quantity', '$items.price'] } 
                    },
                    avgPrice: { $avg: '$items.price' }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 20 },
            {
                $project: {
                    productName: 1,
                    sku: 1,
                    totalUnitsSold: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    avgPrice: { $round: ['$avgPrice', 2] }
                }
            }
        ]);

        // 10. PROFIT ANALYSIS (Estimated - requires cost data)
        const profitAnalysis = await Order.aggregate([
            { $match: orderMatch },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            countryPricingStage('$productInfo', req.countryId),
            {
                $project: {
                    revenue: { $multiply: ['$items.quantity', '$items.price'] },
                    cost: { 
                        $multiply: [
                            '$items.quantity', 
                            '$countryWholesaleCost'
                        ] 
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$revenue' },
                    totalCost: { $sum: '$cost' },
                    totalProfit: { $sum: { $subtract: ['$revenue', '$cost'] } }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    totalCost: { $round: ['$totalCost', 2] },
                    totalProfit: { $round: ['$totalProfit', 2] },
                    profitMargin: {
                        $cond: {
                            if: { $gt: ['$totalRevenue', 0] },
                            then: { 
                                $round: [
                                    { 
                                        $multiply: [
                                            { $divide: ['$totalProfit', '$totalRevenue'] },
                                            100
                                        ]
                                    },
                                    2
                                ]
                            },
                            else: 0
                        }
                    }
                }
            }
        ]);

        // 11. MONTHLY REVENUE TREND - Dynamic based on period
        const now = new Date();
        let trendStartDate;
        let groupByFormat;
        
        switch (trendPeriod) {
            case 'today':
                trendStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                groupByFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' }, hour: { $hour: '$createdAt' } };
                break;
                
            case 'past7':
                trendStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                trendStartDate.setHours(0, 0, 0, 0);
                groupByFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
                break;
                
            case 'thisWeek':
                // Start of current week (Sunday)
                const dayOfWeek = now.getDay();
                trendStartDate = new Date(now);
                trendStartDate.setDate(now.getDate() - dayOfWeek);
                trendStartDate.setHours(0, 0, 0, 0);
                groupByFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
                break;
                
            case 'past30':
                trendStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                trendStartDate.setHours(0, 0, 0, 0);
                groupByFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
                break;
                
            case 'thisMonth':
                // Start of current month
                trendStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                groupByFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
                break;
                
            case 'thisYear':
                // Start of current year
                trendStartDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
                groupByFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
                break;
                
            case 'past365':
            default:
                trendStartDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                trendStartDate.setHours(0, 0, 0, 0);
                groupByFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
        }
        
        const monthlyRevenue = await Order.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: trendStartDate },
                    status: { $ne: 'CANCELLED' },
                    countryId: req.countryId,
                } 
            },
            {
                $group: {
                    _id: groupByFormat,
                    totalRevenue: { $sum: '$totalAmount' },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } },
            {
                $project: {
                    _id: 0,
                    period: {
                        $cond: {
                            if: { $ifNull: ['$_id.hour', false] },
                            then: {
                                // Hour format for 'today'
                                $concat: [
                                    { $toString: '$_id.year' },
                                    '-',
                                    { 
                                        $cond: {
                                            if: { $lt: ['$_id.month', 10] },
                                            then: { $concat: ['0', { $toString: '$_id.month' }] },
                                            else: { $toString: '$_id.month' }
                                        }
                                    },
                                    '-',
                                    { 
                                        $cond: {
                                            if: { $lt: ['$_id.day', 10] },
                                            then: { $concat: ['0', { $toString: '$_id.day' }] },
                                            else: { $toString: '$_id.day' }
                                        }
                                    },
                                    ' ',
                                    { 
                                        $cond: {
                                            if: { $lt: ['$_id.hour', 10] },
                                            then: { $concat: ['0', { $toString: '$_id.hour' }] },
                                            else: { $toString: '$_id.hour' }
                                        }
                                    },
                                    ':00'
                                ]
                            },
                            else: {
                                $cond: {
                                    if: { $ifNull: ['$_id.day', false] },
                                    then: {
                                        // Day format
                                        $concat: [
                                            { $toString: '$_id.year' },
                                            '-',
                                            { 
                                                $cond: {
                                                    if: { $lt: ['$_id.month', 10] },
                                                    then: { $concat: ['0', { $toString: '$_id.month' }] },
                                                    else: { $toString: '$_id.month' }
                                                }
                                            },
                                            '-',
                                            { 
                                                $cond: {
                                                    if: { $lt: ['$_id.day', 10] },
                                                    then: { $concat: ['0', { $toString: '$_id.day' }] },
                                                    else: { $toString: '$_id.day' }
                                                }
                                            }
                                        ]
                                    },
                                    else: {
                                        // Month format
                                        $concat: [
                                            { $toString: '$_id.year' },
                                            '-',
                                            { 
                                                $cond: {
                                                    if: { $lt: ['$_id.month', 10] },
                                                    then: { $concat: ['0', { $toString: '$_id.month' }] },
                                                    else: { $toString: '$_id.month' }
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    },
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    orderCount: 1
                }
            }
        ]);

        // 12. SUMMARY METRICS
        const totalInventoryValue = inventoryByWarehouse.reduce((sum, w) => sum + w.totalCost, 0);
        const totalInventoryRetailValue = inventoryByWarehouse.reduce((sum, w) => sum + w.totalRetailValue, 0);
        const totalSalesRevenue = salesByWarehouse.reduce((sum, w) => sum + w.totalRevenue, 0);
        const totalOrders = salesByWarehouse.reduce((sum, w) => sum + w.totalOrders, 0);

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
                    totalInventoryRetailValue: Math.round(totalInventoryRetailValue * 100) / 100,
                    totalPotentialProfit: Math.round((totalInventoryRetailValue - totalInventoryValue) * 100) / 100,
                    totalSalesRevenue: Math.round(totalSalesRevenue * 100) / 100,
                    totalOrders,
                    avgOrderValue: totalOrders > 0 ? Math.round((totalSalesRevenue / totalOrders) * 100) / 100 : 0
                },
                inventory: {
                    byWarehouse: inventoryByWarehouse,
                    byBrand: inventoryByBrand,
                    byCategory: inventoryByCategory,
                    topProducts: topProductsByValue
                },
                sales: {
                    byWarehouse: salesByWarehouse,
                    byRegion: salesByRegion,
                    byBrand: salesByBrand,
                    byCategory: salesByCategory,
                    topProducts: topSellingProducts
                },
                profitAnalysis: profitAnalysis[0] || {
                    totalRevenue: 0,
                    totalCost: 0,
                    totalProfit: 0,
                    profitMargin: 0
                },
                trends: {
                    monthlyRevenue
                }
            }
        });
    } catch (error) {
        next(error);
    }
};
