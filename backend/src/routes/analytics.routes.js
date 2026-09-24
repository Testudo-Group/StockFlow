const express = require('express');
const { getStats, getCustomerAnalytics, getWarehouseMonthly } = require('../controllers/analytics.controller');
const { protect } = require('../middleware/auth');
const validateCountryAccess = require('../middleware/validateCountryAccess');
const router = express.Router();

router.use(protect);
router.use(validateCountryAccess);

router.get('/', getStats);
router.get('/customers', getCustomerAnalytics);
router.get('/warehouse-monthly', getWarehouseMonthly);

module.exports = router;
