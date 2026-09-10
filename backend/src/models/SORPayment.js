const mongoose = require('mongoose');

const paymentItemSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: [true, 'Product is required'],
        },
        quantity: {
            type: Number,
            required: [true, 'Quantity is required'],
            min: [1, 'Quantity must be at least 1'],
        },
        price: {
            type: Number,
            required: [true, 'Price is required'],
            min: [0, 'Price must be non-negative'],
        },
    },
    { _id: false }
);

const sorPaymentSchema = new mongoose.Schema(
    {
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SORCustomer',
            required: [true, 'Customer is required'],
        },
        // Set when the payment settles one specific order rather than loose
        // product quantities. Left unset for customer-level settlements, which
        // are allocated oldest-order-first when balances are computed.
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            default: null,
        },
        settlementType: {
            type: String,
            enum: ['PRODUCT', 'ORDER'],
            default: 'PRODUCT',
        },
        amount: {
            type: Number,
            required: [true, 'Amount is required'],
            min: [0.01, 'Amount must be at least 0.01'],
        },
        items: {
            type: [paymentItemSchema],
            default: [],
        },
        paymentDate: {
            type: Date,
            required: [true, 'Payment date is required'],
        },
        referenceNote: {
            type: String,
        },
        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'recordedBy is required'],
        },
    },
    {
        timestamps: true,
    }
);

// Index for efficient lookup by customer sorted by most recent payment
sorPaymentSchema.index({ customer: 1, paymentDate: -1 });
// Settlement allocation replays payments oldest-first per customer
sorPaymentSchema.index({ customer: 1, paymentDate: 1, createdAt: 1 });
// Lookup of everything paid against one order
sorPaymentSchema.index({ order: 1 });

module.exports = mongoose.model('SORPayment', sorPaymentSchema);
