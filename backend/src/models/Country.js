const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Country name is required'],
            unique: true,
            trim: true,
        },
        isoCode: {
            type: String,
            required: [true, 'ISO code is required'],
            unique: true,
            uppercase: true,
            trim: true,
            maxlength: [3, 'ISO code cannot be more than 3 characters'],
        },
        currencyCode: {
            type: String,
            required: [true, 'Currency code is required'],
            uppercase: true,
            trim: true,
            minlength: [3, 'Currency code must be 3 characters'],
            maxlength: [3, 'Currency code must be 3 characters'],
        },
        currencySymbol: {
            type: String,
            required: [true, 'Currency symbol is required'],
            trim: true,
            maxlength: [6, 'Currency symbol cannot be more than 6 characters'],
        },
        currencyName: {
            type: String,
            trim: true,
            maxlength: [60, 'Currency name cannot be more than 60 characters'],
        },
        // BCP 47 tag used for thousands/decimal separators when formatting.
        locale: {
            type: String,
            trim: true,
            default: 'en-US',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

countrySchema.index({ name: 1 });
countrySchema.index({ isoCode: 1 });

module.exports = mongoose.model('Country', countrySchema);
