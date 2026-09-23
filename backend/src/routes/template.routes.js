const express = require('express');
const { body } = require('express-validator');
const {
    createTemplate,
    getTemplates,
    deleteTemplate,
} = require('../controllers/template.controller');
const { protect } = require('../middleware/auth');
const validateCountryAccess = require('../middleware/validateCountryAccess');
const router = express.Router();

router.use(protect);
router.use(validateCountryAccess);

router
    .route('/')
    .post(
        [
            body('name').notEmpty().withMessage('Template name is required'),
            body('customer.name').notEmpty().withMessage('Customer name is required'),
            body('region').notEmpty().withMessage('Region is required'),
            body('warehouse').notEmpty().withMessage('Warehouse is required'),
            body('items').isArray().withMessage('Items must be an array'),
            body('items.*.product').notEmpty().withMessage('Product ID is required'),
            body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be positive integer'),
        ],
        createTemplate
    )
    .get(getTemplates);

router.route('/:id').delete(deleteTemplate);

module.exports = router;
