// Utility functions for exporting table data to CSV and Excel

import { formatCurrency as currencyFormat } from './currency';

/**
 * Convert array of objects to CSV string
 * @param {Array} data - Array of objects to convert
 * @param {Array} columns - Array of column definitions {key, label}
 * @returns {string} CSV string
 */
export const convertToCSV = (data, columns) => {
    if (!data || data.length === 0) return '';

    // Create header row
    const headers = columns.map(col => col.label).join(',');
    
    // Create data rows
    const rows = data.map(row => {
        return columns.map(col => {
            let value = row[col.key];
            
            // Handle nested objects
            if (col.key.includes('.')) {
                const keys = col.key.split('.');
                value = keys.reduce((obj, key) => obj?.[key], row);
            }
            
            // Format value
            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'object') {
                value = JSON.stringify(value);
            } else {
                value = String(value);
            }
            
            // Escape quotes and wrap in quotes if contains comma, newline, or quote
            if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                value = `"${value.replace(/"/g, '""')}"`;
            }
            
            return value;
        }).join(',');
    });
    
    return [headers, ...rows].join('\n');
};

/**
 * Download data as CSV file
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Array of column definitions {key, label}
 * @param {string} filename - Name of the file (without extension)
 */
export const downloadCSV = (data, columns, filename = 'export') => {
    const csv = convertToCSV(data, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Download data as Excel file (using HTML table method)
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Array of column definitions {key, label}
 * @param {string} filename - Name of the file (without extension)
 */
export const downloadExcel = (data, columns, filename = 'export') => {
    if (!data || data.length === 0) return;

    // Create HTML table
    let html = '<table><thead><tr>';
    
    // Add headers
    columns.forEach(col => {
        html += `<th>${col.label}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    // Add data rows
    data.forEach(row => {
        html += '<tr>';
        columns.forEach(col => {
            let value = row[col.key];
            
            // Handle nested objects
            if (col.key.includes('.')) {
                const keys = col.key.split('.');
                value = keys.reduce((obj, key) => obj?.[key], row);
            }
            
            // Format value
            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'object') {
                value = JSON.stringify(value);
            }
            
            html += `<td>${value}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    
    // Create blob and download
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Format number with commas
 */
export const formatNumber = (num) => {
    if (num === null || num === undefined) return '';
    return num.toLocaleString();
};

/**
 * Format currency for an export.
 *
 * The country is required — exported figures are in whatever currency the
 * active country uses, and there is no conversion between them, so a default
 * symbol here would silently mislabel another market's amounts.
 *
 * @param {number} num
 * @param {object} country  Country object from CountryContext
 */
export const formatCurrency = (num, country) => {
    if (num === null || num === undefined) return '';
    return currencyFormat(num, country, { emptyValue: '' });
};
