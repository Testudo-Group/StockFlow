const mongoose = require('mongoose');
const Country = require('../models/Country');
const User = require('../models/User');
const { getDefaultCurrency } = require('../config/currencies');

// @desc    Get accessible countries for the current user
// @route   GET /api/countries
// @access  Private (all authenticated users)
exports.getCountries = async (req, res, next) => {
    try {
        const user = req.user;

        // INVENTORY_MANAGER with assignments → return only their assigned active countries
        if (
            user.role === 'INVENTORY_MANAGER' &&
            user.countryAssignments &&
            user.countryAssignments.length > 0
        ) {
            const countries = await Country.find({
                _id: { $in: user.countryAssignments },
                isActive: true,
            }).sort({ name: 1 });

            return res.status(200).json({
                success: true,
                count: countries.length,
                data: countries,
            });
        }

        // All other users → all active countries
        const countries = await Country.find({ isActive: true }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: countries.length,
            data: countries,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create a new country
// @route   POST /api/countries
// @access  Private (Admin only)
exports.createCountry = async (req, res, next) => {
    try {
        const { name, isoCode, currencyCode, currencySymbol, currencyName, locale } = req.body;

        if (!name || !isoCode) {
            return res.status(400).json({
                success: false,
                message: 'name and isoCode are required',
            });
        }

        // Currency defaults come from the ISO table; any field the caller
        // supplies overrides the default.
        const defaults = getDefaultCurrency(isoCode);
        const currency = {
            currencyCode: (currencyCode || defaults.currencyCode).trim().toUpperCase(),
            currencySymbol: (currencySymbol || defaults.currencySymbol).trim(),
            currencyName: (currencyName || defaults.currencyName || '').trim(),
            locale: (locale || defaults.locale).trim(),
        };

        if (currency.currencyCode.length !== 3) {
            return res.status(400).json({
                success: false,
                message: 'currencyCode must be a 3-letter ISO 4217 code',
            });
        }

        if (!currency.currencySymbol) {
            return res.status(400).json({
                success: false,
                message: 'currencySymbol cannot be empty',
            });
        }

        // Check for duplicate name or isoCode
        const existing = await Country.findOne({
            $or: [
                { name: { $regex: `^${name.trim()}$`, $options: 'i' } },
                { isoCode: isoCode.trim().toUpperCase() },
            ],
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'Country with this name or isoCode already exists',
            });
        }

        const country = await Country.create({
            name: name.trim(),
            isoCode: isoCode.trim().toUpperCase(),
            ...currency,
            isActive: true,
            isDefault: false,
        });

        res.status(201).json({
            success: true,
            data: country,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a country (toggle isActive; update name/isoCode)
// @route   PATCH /api/countries/:id
// @access  Private (Admin only)
exports.updateCountry = async (req, res, next) => {
    try {
        const country = await Country.findById(req.params.id);

        if (!country) {
            return res.status(404).json({
                success: false,
                message: 'Country not found',
            });
        }

        // Block deactivation of the default country
        if (country.isDefault && req.body.isActive === false) {
            return res.status(400).json({
                success: false,
                message: 'The default country cannot be deactivated',
            });
        }

        // Block deletion/modification of isDefault flag
        if (req.body.isDefault !== undefined) {
            delete req.body.isDefault;
        }

        // Currency fields may be edited, but never blanked out — every country
        // must always carry a usable code and symbol.
        if (req.body.currencyCode !== undefined) {
            const code = String(req.body.currencyCode).trim().toUpperCase();
            if (code.length !== 3) {
                return res.status(400).json({
                    success: false,
                    message: 'currencyCode must be a 3-letter ISO 4217 code',
                });
            }
            req.body.currencyCode = code;
        }

        if (req.body.currencySymbol !== undefined) {
            const symbol = String(req.body.currencySymbol).trim();
            if (!symbol) {
                return res.status(400).json({
                    success: false,
                    message: 'currencySymbol cannot be empty',
                });
            }
            req.body.currencySymbol = symbol;
        }

        const updated = await Country.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            data: updated,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get country assignments for a user
// @route   GET /api/countries/:userId/assignments
// @access  Private (Admin only)
exports.getUserAssignments = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.userId).populate(
            'countryAssignments',
            'name isoCode isActive currencyCode currencySymbol locale'
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.status(200).json({
            success: true,
            data: user.countryAssignments || [],
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Replace country assignments for a user
// @route   PUT /api/countries/:userId/assignments
// @access  Private (Admin only)
exports.setUserAssignments = async (req, res, next) => {
    try {
        const { countryIds } = req.body;

        if (!Array.isArray(countryIds)) {
            return res.status(400).json({
                success: false,
                message: 'countryIds must be an array',
            });
        }

        // Validate all provided IDs are valid ObjectIds and refer to existing countries
        for (const id of countryIds) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid country id: ${id}`,
                });
            }
        }

        if (countryIds.length > 0) {
            const count = await Country.countDocuments({ _id: { $in: countryIds } });
            if (count !== countryIds.length) {
                return res.status(400).json({
                    success: false,
                    message: 'One or more country ids are invalid',
                });
            }
        }

        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { countryAssignments: countryIds },
            { new: true }
        ).populate('countryAssignments', 'name isoCode isActive currencyCode currencySymbol locale');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.status(200).json({
            success: true,
            data: user.countryAssignments || [],
        });
    } catch (error) {
        next(error);
    }
};
