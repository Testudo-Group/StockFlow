const express = require('express');
const {
    createCustomer,
    getCustomers,
    getCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerLedger,
    exportCustomerLedger,
    getCustomerSettlement,
} = require('../controllers/sor.customer.controller');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const validateCountryAccess = require('../middleware/validateCountryAccess');

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(validateCountryAccess);

// Staff roles allowed for SOR operations
const STAFF_ROLES = ['SALES', 'INVENTORY_MANAGER', 'ADMIN'];

router
    .route('/')
    .get(authorize(...STAFF_ROLES), getCustomers)
    .post(authorize(...STAFF_ROLES), createCustomer);

router
    .route('/:id/ledger/export')
    .get(authorize(...STAFF_ROLES), exportCustomerLedger);

router
    .route('/:id/settlement')
    .get(authorize(...STAFF_ROLES), getCustomerSettlement);

router
    .route('/:id/ledger')
    .get(authorize(...STAFF_ROLES), getCustomerLedger);

router
    .route('/:id')
    .get(authorize(...STAFF_ROLES), getCustomer)
    .put(authorize(...STAFF_ROLES), updateCustomer)
    .delete(authorize('ADMIN'), deleteCustomer);

module.exports = router;
