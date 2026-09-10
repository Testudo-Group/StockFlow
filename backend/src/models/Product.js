const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
    {
        sku: {
            type: String,
            unique: true,
            sparse: true, // Allows multiple null/undefined values
            trim: true,
            uppercase: true,
            maxlength: [20, 'SKU cannot be more than 20 characters'],
        },
        name: {
            type: String,
            required: [true, 'Product name is required'],
            trim: true,
            maxlength: [100, 'Name cannot be more than 100 characters'],
        },
        brand: {
            type: mongoose.Schema.ObjectId,
            ref: 'Brand',
            required: [true, 'Brand is required'],
        },
        category: {
            type: mongoose.Schema.ObjectId,
            ref: 'Category',
        },
        cartonSize: {
            type: Number,
            required: [true, 'Carton size is required'],
            min: [1, 'Carton size must be at least 1'],
        },
        dimensions: {
            length: { type: Number, default: 0 },
            breadth: { type: Number, default: 0 },
            height: { type: Number, default: 0 },
            unit: { type: String, default: 'm' }
        },
        volume: {
            type: Number, // Calculated (L * B * H)
            default: 0
        },
        // Legacy single-currency price. Superseded by countryPrices — retained
        // so historical documents keep their original value, but never read
        // for display or order pricing.
        price: {
            type: Number,
            min: [0, 'Price cannot be negative'],
            default: 0
        },
        weight: {
            type: Number,
            min: [0, 'Weight cannot be negative'],
            default: 0,
            // Weight per piece in kg
        },
        // Legacy single-currency cost. Superseded by countryPrices.
        wholesaleCost: {
            type: Number,
            min: [0, 'Wholesale cost cannot be negative'],
            default: 0,
            // Cost per piece
        },
        // Per-country pricing. Each country holds its own retail price and
        // wholesale cost in that country's own currency — values are never
        // converted between countries. A country with no entry here is
        // unpriced: the product cannot be ordered there.
        countryPrices: [
            {
                countryId: {
                    type: mongoose.Schema.ObjectId,
                    ref: 'Country',
                    required: true,
                },
                price: {
                    type: Number,
                    required: [true, 'Price is required'],
                    min: [0, 'Price cannot be negative'],
                },
                wholesaleCost: {
                    type: Number,
                    min: [0, 'Wholesale cost cannot be negative'],
                    default: 0,
                },
            },
        ],
        status: {
            type: String,
            enum: ['ACTIVE', 'INACTIVE', 'DISCONTINUED'],
            default: 'ACTIVE',
        },
    },
    {
        timestamps: true,
    }
);

// Compound index if we frequently search by brand and status
productSchema.index({ brand: 1, status: 1 });
productSchema.index({ category: 1 });
productSchema.index({ 'countryPrices.countryId': 1 });

module.exports = mongoose.model('Product', productSchema);
