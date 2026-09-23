const mongoose = require('mongoose');

const reorderTemplateSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Template name is required'],
            trim: true,
        },
        customer: {
            name: { type: String, required: true },
            address: { type: String, required: true },
            phone: { type: String },
            email: { type: String },
        },
        region: {
            type: mongoose.Schema.ObjectId,
            ref: 'Region',
            required: true
        },
        warehouse: {
            type: mongoose.Schema.ObjectId,
            ref: 'Warehouse',
            required: true
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
                    min: 1,
                },
            },
        ],
        createdBy: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true,
        },
        // A template names a region and warehouse, both of which belong to one
        // country — so the template does too, and is only offered there.
        countryId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Country',
            required: true,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

// Template names are unique per user within a country, so the same name can
// be reused for the equivalent template in another market.
reorderTemplateSchema.index({ createdBy: 1, countryId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ReorderTemplate', reorderTemplateSchema);
