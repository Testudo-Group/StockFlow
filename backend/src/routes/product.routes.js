const express = require('express');
const { body } = require('express-validator');
const {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    setProductCountryPrice,
} = require('../controllers/product.controller');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');
const { PERMISSIONS } = require('../config/constants');

const router = express.Router();

router.use(protect);

router
    .route('/')
    .get(checkPermission(PERMISSIONS.VIEW_INVENTORY), getProducts)
    .post(
        checkPermission(PERMISSIONS.MANAGE_INVENTORY),
        [
            body('sku').optional().trim().notEmpty().withMessage('SKU cannot be empty if provided'),
            body('name').notEmpty().withMessage('Name is required'),
            body('brand').notEmpty().withMessage('Brand ID is required'),
            body('cartonSize')
                .isInt({ min: 1 })
                .withMessage('Carton size must be a positive integer'),
        ],
        createProduct
    );

// Per-country price upsert — narrower than a full product update so price
// edits for one country never overwrite another country's price.
router
    .route('/:id/price')
    .patch(checkPermission(PERMISSIONS.MANAGE_INVENTORY), setProductCountryPrice);

router
    .route('/:id')
    .get(checkPermission(PERMISSIONS.VIEW_INVENTORY), getProduct)
    .put(
        checkPermission(PERMISSIONS.MANAGE_INVENTORY),
        updateProduct
    )
    .delete(
        checkPermission(PERMISSIONS.MANAGE_INVENTORY),
        deleteProduct
    );

module.exports = router;
