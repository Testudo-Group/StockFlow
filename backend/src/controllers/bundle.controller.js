const Bundle = require('../models/Bundle');
const { validationResult } = require('express-validator');
const { withResolvedBundlePrice } = require('../utils/pricing');

// @desc    Create new bundle
// @route   POST /api/bundles
// @access  Private (Manage Inventory)
exports.createBundle = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { name, description, products, status } = req.body;

        // Validate that products array is not empty
        if (!products || products.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Bundle must contain at least one product'
            });
        }

        const bundle = await Bundle.create({
            name,
            description,
            products,
            status,
            createdBy: req.user.id
        });

        const populatedBundle = await Bundle.findById(bundle._id)
            .populate('products.product', 'name sku cartonSize price wholesaleCost countryPrices');

        res.status(201).json({
            success: true,
            data: req.query.countryId
                ? withResolvedBundlePrice(populatedBundle, req.query.countryId)
                : populatedBundle
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Bundle name already exists'
            });
        }
        next(error);
    }
};

// @desc    Get all bundles
// @route   GET /api/bundles
// @access  Private
exports.getBundles = async (req, res, next) => {
    try {
        const { status } = req.query;
        const query = {};

        if (status) query.status = status;

        const bundles = await Bundle.find(query)
            .populate('products.product', 'name sku cartonSize price wholesaleCost countryPrices')
            .populate('createdBy', 'name email')
            .populate('priceHistory.editedBy', 'username email')
            .sort({ createdAt: -1 });

        // Resolve the active country's retail price (and the nested products'
        // prices) so clients keep reading `bundle.retailPrice`.
        const countryId = req.query.countryId;
        const data = countryId
            ? bundles.map((bundle) => withResolvedBundlePrice(bundle, countryId))
            : bundles;

        res.status(200).json({
            success: true,
            count: bundles.length,
            data
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single bundle
// @route   GET /api/bundles/:id
// @access  Private
exports.getBundle = async (req, res, next) => {
    try {
        const bundle = await Bundle.findById(req.params.id)
            .populate('products.product', 'name sku cartonSize price wholesaleCost countryPrices')
            .populate('createdBy', 'name email')
            .populate('priceHistory.editedBy', 'username email');

        if (!bundle) {
            return res.status(404).json({
                success: false,
                message: 'Bundle not found'
            });
        }

        res.status(200).json({
            success: true,
            data: req.query.countryId
                ? withResolvedBundlePrice(bundle, req.query.countryId)
                : bundle
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update bundle
// @route   PUT /api/bundles/:id
// @access  Private (Manage Inventory)
exports.updateBundle = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        let bundle = await Bundle.findById(req.params.id);

        if (!bundle) {
            return res.status(404).json({
                success: false,
                message: 'Bundle not found'
            });
        }

        const { name, description, products, status } = req.body;

        // Validate that products array is not empty if provided
        if (products && products.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Bundle must contain at least one product'
            });
        }

        bundle = await Bundle.findByIdAndUpdate(
            req.params.id,
            { name, description, products, status },
            { new: true, runValidators: true }
        ).populate('products.product', 'name sku cartonSize price wholesaleCost countryPrices');

        res.status(200).json({
            success: true,
            data: req.query.countryId
                ? withResolvedBundlePrice(bundle, req.query.countryId)
                : bundle
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Bundle name already exists'
            });
        }
        next(error);
    }
};

// @desc    Delete bundle
// @route   DELETE /api/bundles/:id
// @access  Private (Manage Inventory)
exports.deleteBundle = async (req, res, next) => {
    try {
        const bundle = await Bundle.findById(req.params.id);

        if (!bundle) {
            return res.status(404).json({
                success: false,
                message: 'Bundle not found'
            });
        }

        await bundle.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update bundle retail price (discount override)
// @route   PUT /api/bundles/:id/price
// @access  Private (Manage Inventory)
exports.updateBundlePrice = async (req, res, next) => {
    try {
        const bundle = await Bundle.findById(req.params.id);

        if (!bundle) {
            return res.status(404).json({
                success: false,
                message: 'Bundle not found'
            });
        }

        const { retailPrice, reason, countryId } = req.body;

        if (!countryId) {
            return res.status(400).json({
                success: false,
                message: 'countryId is required'
            });
        }

        const target = countryId.toString();
        const existingIndex = bundle.countryPrices.findIndex(
            (cp) => cp.countryId && cp.countryId.toString() === target
        );
        const previousPrice =
            existingIndex === -1 ? null : bundle.countryPrices[existingIndex].retailPrice;

        // Blank/undefined clears the country's override — the bundle falls back
        // to the sum of its products' prices in that country.
        const cleared = retailPrice === undefined || retailPrice === '' || retailPrice === null;
        const newPrice = cleared ? null : Number(retailPrice);

        if (!cleared && (!Number.isFinite(newPrice) || newPrice < 0)) {
            return res.status(400).json({
                success: false,
                message: 'retailPrice must be a non-negative number'
            });
        }

        // Price history is per country, so each market keeps its own audit trail
        bundle.priceHistory.push({
            countryId,
            previousPrice,
            newPrice,
            reason: reason || '',
            editedBy: req.user.id,
            editedAt: new Date()
        });

        if (cleared) {
            if (existingIndex !== -1) {
                bundle.countryPrices.splice(existingIndex, 1);
            }
        } else if (existingIndex === -1) {
            bundle.countryPrices.push({ countryId, retailPrice: newPrice });
        } else {
            bundle.countryPrices[existingIndex].retailPrice = newPrice;
        }

        await bundle.save();

        const populatedBundle = await Bundle.findById(bundle._id)
            .populate('products.product', 'name sku cartonSize price wholesaleCost countryPrices')
            .populate('priceHistory.editedBy', 'username email')
            .populate('createdBy', 'name email');

        res.status(200).json({
            success: true,
            data: withResolvedBundlePrice(populatedBundle, countryId)
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get bundle price edit history
// @route   GET /api/bundles/:id/price-history
// @access  Private (View Inventory)
exports.getBundlePriceHistory = async (req, res, next) => {
    try {
        const bundle = await Bundle.findById(req.params.id)
            .select('name retailPrice countryPrices priceHistory')
            .populate('priceHistory.editedBy', 'username email');

        if (!bundle) {
            return res.status(404).json({
                success: false,
                message: 'Bundle not found'
            });
        }

        const countryId = req.query.countryId;

        // Show only the active country's history — prices in different
        // currencies must never be listed side by side.
        let history = [...bundle.priceHistory].reverse();
        if (countryId) {
            const target = countryId.toString();
            history = history.filter(
                (entry) => entry.countryId && entry.countryId.toString() === target
            );
        }

        const resolved = countryId
            ? (bundle.countryPrices || []).find(
                  (cp) => cp.countryId && cp.countryId.toString() === countryId.toString()
              )
            : null;

        res.status(200).json({
            success: true,
            data: {
                bundleName: bundle.name,
                currentRetailPrice: resolved ? resolved.retailPrice : null,
                history
            }
        });
    } catch (error) {
        next(error);
    }
};
