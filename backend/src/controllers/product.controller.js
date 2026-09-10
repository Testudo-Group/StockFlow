const Product = require('../models/Product');
const { validationResult } = require('express-validator');
const {
    withResolvedPrice,
    normaliseCountryPrices,
} = require('../utils/pricing');

// @desc    Get all products
// @route   GET /api/products
// @access  Private (Auth users)
exports.getProducts = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const startIndex = (page - 1) * limit;

        let queryParams = {};
        if (req.query.brandId) {
            queryParams.brand = req.query.brandId;
        }
        if (req.query.categoryId) {
            queryParams.category = req.query.categoryId;
        }

        // Only list products priced in the active country when the caller asks
        // for it — the Products admin screen passes includeUnpriced=true so
        // prices can be set for the first time.
        const countryId = req.query.countryId;
        if (countryId && req.query.includeUnpriced !== 'true') {
            queryParams['countryPrices.countryId'] = countryId;
        }

        const total = await Product.countDocuments(queryParams);
        const products = await Product.find(queryParams)
            .populate({
                path: 'brand',
                select: 'name active',
            })
            .populate({
                path: 'category',
                select: 'name active',
            })
            .skip(startIndex)
            .limit(limit);

        // Surface the active country's price at the top level so clients keep
        // reading `product.price`, with isPriced flagging unpriced products.
        const data = countryId
            ? products.map((product) => withResolvedPrice(product, countryId))
            : products;

        res.status(200).json({
            success: true,
            count: products.length,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            data,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
exports.getProduct = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('brand')
            .populate('category');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: `Product not found with id of ${req.params.id}`,
            });
        }

        res.status(200).json({
            success: true,
            data: req.query.countryId
                ? withResolvedPrice(product, req.query.countryId)
                : product,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private (Admin/Manager)
exports.createProduct = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        if (req.body.dimensions) {
            const { length, breadth, height } = req.body.dimensions;
            if (length && breadth && height) {
                // Dimensions are stored in meters, so volume = length * breadth * height (m³)
                req.body.volume = parseFloat(length) * parseFloat(breadth) * parseFloat(height);
            }
        }

        try {
            const countryPrices = normaliseCountryPrices(req.body.countryPrices);
            if (countryPrices !== undefined) {
                req.body.countryPrices = countryPrices;
            }
        } catch (err) {
            return res.status(400).json({ success: false, message: err.message });
        }

        const product = await Product.create(req.body);

        res.status(201).json({
            success: true,
            data: product,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (Admin/Manager)
exports.updateProduct = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: `Product not found with id of ${req.params.id}`,
            });
        }

        // Check if carton size is being changed
        if (req.body.cartonSize && req.body.cartonSize !== product.cartonSize) {
            // TODO: Check if orders exist for this product
            // If orders exist, return 400 error
            // const ordersExist = await Order.countDocuments({ 'items.product': req.params.id });
            // if (ordersExist > 0) { ... }

            // For now, allow change as no orders system yet
        }

        // Recalculate volume if dimensions provided
        if (req.body.dimensions) {
            const { length, breadth, height } = req.body.dimensions;
            // Merge with existing if partial update? For simplicity assume full dimensions object or fetch existing
            // Mongoose update is atomic, but calculation needs values. 
            // Ideally frontend sends full dimensions.
            if (length !== undefined && breadth !== undefined && height !== undefined) {
                // Dimensions are stored in meters, so volume = length * breadth * height (m³)
                req.body.volume = parseFloat(length) * parseFloat(breadth) * parseFloat(height);
            }
        }

        try {
            const countryPrices = normaliseCountryPrices(req.body.countryPrices);
            if (countryPrices !== undefined) {
                req.body.countryPrices = countryPrices;
            }
        } catch (err) {
            return res.status(400).json({ success: false, message: err.message });
        }

        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });

        res.status(200).json({
            success: true,
            data: updatedProduct,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Set (upsert) the price for one country on a product
// @route   PATCH /api/products/:id/price
// @access  Private (Admin/Manager)
//
// Touches only the given country's entry, so two admins editing prices for
// different countries can never clobber each other. Send price: null to clear
// the entry and make the product unpriced (and unorderable) in that country.
exports.setProductCountryPrice = async (req, res, next) => {
    try {
        const { countryId, price, wholesaleCost } = req.body;

        if (!countryId) {
            return res.status(400).json({
                success: false,
                message: 'countryId is required',
            });
        }

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: `Product not found with id of ${req.params.id}`,
            });
        }

        const target = countryId.toString();
        const existingIndex = product.countryPrices.findIndex(
            (cp) => cp.countryId && cp.countryId.toString() === target
        );

        // price: null clears the country's price entirely
        if (price === null || price === '') {
            if (existingIndex !== -1) {
                product.countryPrices.splice(existingIndex, 1);
            }
        } else {
            let entry;
            try {
                [entry] = normaliseCountryPrices([{ countryId, price, wholesaleCost }]);
            } catch (err) {
                return res.status(400).json({ success: false, message: err.message });
            }

            if (existingIndex === -1) {
                product.countryPrices.push(entry);
            } else {
                product.countryPrices[existingIndex].price = entry.price;
                product.countryPrices[existingIndex].wholesaleCost = entry.wholesaleCost;
            }
        }

        await product.save();

        res.status(200).json({
            success: true,
            data: withResolvedPrice(product, countryId),
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private (Admin only)
exports.deleteProduct = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: `Product not found with id of ${req.params.id}`,
            });
        }

        // TODO: Check for dependencies (stock, orders) before deleting

        await product.deleteOne();

        res.status(200).json({
            success: true,
            data: {},
        });
    } catch (error) {
        next(error);
    }
};
