const mongoose = require('mongoose');
const Counter = require('./Counter');

const orderSchema = new mongoose.Schema(
    {
        orderNumber: {
            type: Number,
            unique: true
        },
        customer: {
            name: { type: String, required: true },
            address: { type: String, required: true },
            phone: { type: String },
            email: { type: String },
            country: { type: String, default: 'Nigeria' },
        },
        region: {
            type: mongoose.Schema.ObjectId,
            ref: 'Region',
            required: true,
        },
        warehouse: {
            type: mongoose.Schema.ObjectId,
            ref: 'Warehouse',
            required: true,
        },
        items: [
            {
                product: {
                    type: mongoose.Schema.ObjectId,
                    ref: 'Product',
                    required: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1, // Stored in pieces
                },
                // Net unit price actually charged — what totals are built from.
                price: {
                    type: Number,
                },
                // The product's actual (pre-discount) unit price at the time of
                // sale, so receipts can show what was discounted rather than
                // only the net figure.
                originalPrice: {
                    type: Number,
                    min: 0,
                },
                // Per-unit discount applied to this line (0 for global discounts,
                // which are recorded once on the order instead).
                discount: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
            }
        ],
        status: {
            type: String,
            enum: ['PENDING', 'CONFIRMED', 'CANCELLED'],
            default: 'PENDING',
        },
        totalAmount: {
            type: Number,
        },
        subtotal: {
            type: Number,
        },
        discountAmount: {
            type: Number,
            default: 0,
        },
        discountType: {
            type: String,
            enum: ['none', 'individual', 'global'],
            default: 'none',
        },
        deliveryFee: {
            type: Number,
            default: 0,
            min: [0, 'Delivery fee cannot be negative'],
        },
        orderType: {
            type: String,
            enum: ['RETAIL', 'WHOLESALE'],
            default: 'RETAIL',
        },
        channel: {
            type: String,
            enum: ['Instagram', 'Google', 'Facebook', 'Referral', 'Walk-in', 'Other'],
            default: 'Other',
        },
        paymentStatus: {
            type: String,
            enum: ['PAID', 'NOT_PAID'],
            default: 'PAID',
        },
        createdBy: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true,
        },
        logs: [
            {
                status: String,
                changedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
                date: { type: Date, default: Date.now }
            }
        ],
        countryId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Country',
            required: true,
            index: true,
        },
        // Currency snapshot taken at creation. Receipts and invoices reprint in
        // the currency the order was actually priced in, even if the country's
        // currency details are edited later.
        currency: {
            code: { type: String, trim: true, uppercase: true },
            symbol: { type: String, trim: true },
            locale: { type: String, trim: true },
        },
    },
    {
        timestamps: true,
    }
);

// Pre-save hook to generate sequential order number
orderSchema.pre('save', async function () {
    if (this.isNew && !this.orderNumber) {
        // Count existing orders and add 1 for the new order
        const count = await mongoose.model('Order').countDocuments();
        this.orderNumber = count + 1;

        // If there's a duplicate (race condition), try again with counter
        try {
            // This will throw an error if orderNumber is duplicate
            await this.constructor.findOne({ orderNumber: this.orderNumber });
            if (await this.constructor.findOne({ orderNumber: this.orderNumber })) {
                // Use counter as fallback for race conditions
                const counter = await Counter.findOneAndUpdate(
                    { _id: 'orderId' },
                    { $inc: { seq: 1 } },
                    {
                        new: true,
                        upsert: true,
                        setDefaultsOnInsert: true
                    }
                );
                this.orderNumber = counter.seq;
            }
        } catch (error) {
            // Ignore and proceed
        }
    }
});

// Index for efficient querying by status and warehouse
orderSchema.index({ warehouse: 1, status: 1 });
// orderNumber index is already created by unique: true in schema definition

// Indexes for frequent queries (dashboard, list views)
orderSchema.index({ createdAt: -1 }); // Recent orders
orderSchema.index({ status: 1 });     // Filter by status
orderSchema.index({ 'customer.name': 'text' }); // Search by customer

module.exports = mongoose.model('Order', orderSchema);
