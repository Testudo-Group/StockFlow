const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { formatMoneyCode } = require('../utils/currency');

/**
 * Invoice Generation Service
 * Generates professional PDF invoices for wholesale orders
 */
class InvoiceService {
    constructor() {
        // Ensure invoices directory exists
        this.invoicesDir = path.join(__dirname, '../../invoices');
        if (!fs.existsSync(this.invoicesDir)) {
            fs.mkdirSync(this.invoicesDir, { recursive: true });
        }
        
        // Company information
        this.companyInfo = {
            name: 'GidiGames',
            address: 'HANA PLAZA, 109 Awolowo Road, Ikoyi, Lagos',
            phone: '+2349091111666',
            email: 'gidiwords@gmail.com',
            website: 'gidigames.com.ng'
        };
    }

    /**
     * Generate a PDF invoice for a wholesale order
     * @param {Object} order - Populated order object
     * @returns {Promise<string>} - Path to generated PDF
     */
    async generateInvoice(order) {
        return new Promise((resolve, reject) => {
            try {
                const fileName = `invoice-${order._id}.pdf`;
                const filePath = path.join(this.invoicesDir, fileName);

                // Create PDF document
                const doc = new PDFDocument({ 
                    size: 'A4', 
                    margin: 50,
                    info: {
                        Title: `Invoice - Order #${order.orderNumber || order._id.toString().slice(-6).toUpperCase()}`,
                        Author: 'GidiGames',
                        Subject: 'Wholesale Order Invoice'
                    }
                });

                // Pipe to file
                const stream = fs.createWriteStream(filePath);
                doc.pipe(stream);

                // Company Header with Logo
                this.addCompanyHeader(doc);
                
                // Customer Info and Date
                this.addCustomerInfo(doc, order);
                
                // Items Table
                this.addItemsTable(doc, order);
                
                // Payment Summary
                this.addPaymentSummary(doc, order);
                
                // Footer
                this.addFooter(doc);

                // Finalize PDF
                doc.end();

                stream.on('finish', () => {
                    console.log(`[Invoice] Generated: ${fileName}`);
                    resolve(filePath);
                });

                stream.on('error', (err) => {
                    console.error('[Invoice] Generation error:', err);
                    reject(err);
                });

            } catch (error) {
                console.error('[Invoice] Error:', error);
                reject(error);
            }
        });
    }

    addCompanyHeader(doc) {
        const startY = 50;
        const rightX = 400;
        
        // INVOICE title on the left
        doc.fontSize(18)
           .font('Helvetica-Bold')
           .fillColor('#1E293B')
           .text('INVOICE', 50, startY);
        
        // Logo on the right (if exists)
        const logoPath = path.join(__dirname, '../assets/GidiGames.jpeg');
        if (fs.existsSync(logoPath)) {
            try {
                doc.image(logoPath, rightX, startY - 10, { 
                    width: 140,
                    height: 60,
                    fit: [140, 60],
                    align: 'right'
                });
            } catch (err) {
                console.log('[Invoice] Logo not found or invalid, using text');
                // Fallback to text
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .fillColor('#10B981')
                   .text('Gidi Games', rightX, startY, { align: 'right', width: 145 });
            }
        } else {
            // No logo, use text
            doc.fontSize(16)
               .font('Helvetica-Bold')
               .fillColor('#10B981')
               .text('Gidi Games', rightX, startY, { align: 'right', width: 145 });
        }
        
        doc.moveDown(1.5);
        
        // Horizontal line
        doc.moveTo(50, 110)
           .lineTo(545, 110)
           .strokeColor('#1E293B')
           .lineWidth(1)
           .stroke();
        
        // Company details below the line
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#64748B')
           .text('HAKA PLAZA, 109 AWOLOWO ROAD', rightX, 115, { align: 'right', width: 145 })
           .text('IKOYI, LAGOS', rightX, 127, { align: 'right', width: 145 });
        
        doc.y = 145;
    }

    addInvoiceHeader(doc, order) {
        // Remove this method as we're simplifying the layout
        // Date and customer info will be in addCustomerInfo
    }

    addCustomerInfo(doc, order) {
        const startY = doc.y;
        
        // Date on the left
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#1E293B')
           .text(new Date().toLocaleDateString('en-US', {
               month: 'numeric',
               day: 'numeric',
               year: 'numeric'
           }), 50, startY);
        
        doc.moveDown(1);
        
        // Customer Name only (no address)
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#1E293B')
           .text(order.customer?.name || 'N/A', 50, doc.y);
        
        // Bank details on the right (aligned with date)
        const rightX = 400;
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#1E293B')
           .text('WEMA BANK: 0125399850', rightX, startY, { align: 'right', width: 145 });
        
        doc.moveDown(2);
        
        // Horizontal line
        doc.moveTo(50, doc.y)
           .lineTo(545, doc.y)
           .strokeColor('#1E293B')
           .lineWidth(1)
           .stroke();
        
        doc.moveDown(0.5);
    }

    addItemsTable(doc, order) {
        const tableTop = doc.y;
        const itemHeight = 20;

        // Column X positions
        const colNo      = 55;
        const colDetails = 100;
        const colQty     = 320;
        const colPrice   = 390;
        const colTotal   = 475;

        // Table headers
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#1E293B');
        
        doc.text('S/No.',      colNo,      tableTop);
        doc.text('DETAILS',    colDetails, tableTop);
        doc.text('QUANTITY',   colQty,     tableTop, { width: 65, align: 'center' });
        doc.text('UNIT PRICE', colPrice,   tableTop, { width: 75, align: 'right' });
        doc.text('LINE TOTAL', colTotal,   tableTop, { width: 70, align: 'right' });
        
        // Line under headers
        doc.moveTo(50, tableTop + 15)
           .lineTo(545, tableTop + 15)
           .strokeColor('#1E293B')
           .lineWidth(1)
           .stroke();
        
        // Items
        let currentY = tableTop + 25;
        doc.fillColor('#1E293B')
           .font('Helvetica')
           .fontSize(9);
        
        order.items.forEach((item, index) => {
            const subtotal = item.quantity * (item.price || 0);
            
            if (currentY > 680) {
                doc.addPage();
                currentY = 50;
            }
            
            doc.text(`${index + 1}`, colNo, currentY);
            doc.text(item.product?.name || 'Unknown', colDetails, currentY, { width: 210 });
            
            // Always show total pieces (no carton conversion)
            doc.text(`${item.quantity} pcs`, colQty, currentY, { width: 65, align: 'center' });
            doc.text(formatMoneyCode((item.price || 0), order.currency),
                     colPrice, currentY, { width: 75, align: 'right' });
            doc.text(formatMoneyCode(subtotal, order.currency),
                     colTotal, currentY, { width: 70, align: 'right' });
            
            currentY += itemHeight;
        });
        
        doc.y = currentY + 10;
    }

    addPaymentSummary(doc, order) {
        const labelX = 370;
        const valueX  = 460;
        const valueW  = 85;

        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#1E293B');

        const itemsSubtotal = order.items.reduce((acc, item) => acc + (item.quantity * (item.price || 0)), 0);

        // Net Total — pin both label and value to the same Y
        const netY = doc.y;
        doc.text('Net Total', labelX, netY);
        doc.text(formatMoneyCode(itemsSubtotal, order.currency),
                 valueX, netY, { width: valueW, align: 'right' });

        doc.y = netY + 20;

        // Delivery fee (if any)
        if (order.deliveryFee > 0) {
            const deliveryY = doc.y;
            doc.fontSize(10).font('Helvetica').fillColor('#1E293B');
            doc.text('Delivery Fee', labelX, deliveryY);
            doc.text(formatMoneyCode(order.deliveryFee, order.currency),
                     valueX, deliveryY, { width: valueW, align: 'right' });
            doc.y = deliveryY + 20;
            doc.font('Helvetica-Bold');
        }

        // Separator line
        doc.moveTo(370, doc.y)
           .lineTo(545, doc.y)
           .strokeColor('#1E293B')
           .lineWidth(1)
           .stroke();

        doc.y = doc.y + 8;

        // NAIRA TOTAL
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#1E293B');

        const totalY = doc.y;
        doc.text('NAIRA TOTAL', labelX, totalY);
        doc.text(formatMoneyCode(order.totalAmount, order.currency),
                 valueX, totalY, { width: valueW, align: 'right' });

        doc.y = totalY + 24;
    }

    addFooter(doc) {
        // Simple footer - removed as per image
    }

    /**
     * Get invoice file path for an order
     * @param {string} orderId - Order ID
     * @returns {string} - File path
     */
    getInvoicePath(orderId) {
        return path.join(this.invoicesDir, `invoice-${orderId}.pdf`);
    }

    /**
     * Check if invoice exists for an order
     * @param {string} orderId - Order ID
     * @returns {boolean}
     */
    invoiceExists(orderId) {
        return fs.existsSync(this.getInvoicePath(orderId));
    }

    /**
     * Delete invoice for an order
     * @param {string} orderId - Order ID
     */
    deleteInvoice(orderId) {
        const filePath = this.getInvoicePath(orderId);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[Invoice] Deleted: invoice-${orderId}.pdf`);
        }
    }
}

// Export singleton instance
module.exports = new InvoiceService();
