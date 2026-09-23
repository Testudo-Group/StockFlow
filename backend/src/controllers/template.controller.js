const ReorderTemplate = require('../models/ReorderTemplate');
const { validationResult } = require('express-validator');

// @desc    Create new template
// @route   POST /api/templates
// @access  Private
exports.createTemplate = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { name, customer, region, warehouse, items } = req.body;

        const template = await ReorderTemplate.create({
            name,
            customer,
            region,
            warehouse,
            items,
            createdBy: req.user.id,
            countryId: req.countryId,
        });

        res.status(201).json({
            success: true,
            data: template,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Template name already exists' });
        }
        next(error);
    }
};

// @desc    Get all templates for the active country (available to all users)
// @route   GET /api/templates
// @access  Private
exports.getTemplates = async (req, res, next) => {
    try {
        const templates = await ReorderTemplate.find({ countryId: req.countryId })
            .populate('items.product', 'name sku cartonSize') // Populate for display
            .populate('warehouse', 'name')
            .populate('region', 'name')
            .populate('createdBy', 'name email') // Show who created it
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: templates.length,
            data: templates,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete template
// @route   DELETE /api/templates/:id
// @access  Private
exports.deleteTemplate = async (req, res, next) => {
    try {
        const template = await ReorderTemplate.findOne({
            _id: req.params.id,
            createdBy: req.user.id,
            countryId: req.countryId,
        });

        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        await template.deleteOne();

        res.status(200).json({
            success: true,
            data: {},
        });
    } catch (error) {
        next(error);
    }
};
