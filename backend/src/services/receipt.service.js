const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { formatMoneyCode, orderCurrency } = require('../utils/currency');

/**
 * Receipt Generation Service
 * Generates professional PDF receipts for orders
 */
class ReceiptService {
    constructor() {
        // Ensure receipts directory exists
        this.receiptsDir = path.join(__dirname, '../../receipts');
        if (!fs.existsSync(this.receiptsDir)) {
            fs.mkdirSync(this.receiptsDir, { recursive: true });
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
     * Generate a PDF receipt for an order
     * @param {Object} order - Populated order object
     * @returns {Promise<string>} - Path to generated PDF
     */
    async generateReceipt(order) {
        return new Promise((resolve, reject) => {
            try {
                const fileName = `receipt-${order._id}.pdf`;
                const filePath = path.join(this.receiptsDir, fileName);

                // Create PDF document
                const doc = new PDFDocument({ 
                    size: 'A4', 
                    margin: 50,
                    info: {
                        Title: `Receipt - Order #${order.orderNumber || order._id.toString().slice(-6).toUpperCase()}`,
                        Author: 'GidiGames',
                        Subject: 'Order Receipt'
                    }
                });

                // Pipe to file
                const stream = fs.createWriteStream(filePath);
                doc.pipe(stream);

                // Company Header
                this.addCompanyHeader(doc);

                // Header
                this.addHeader(doc, order);
                
                // Customer Info
                this.addCustomerInfo(doc, order);
                
                // Order Details
                this.addOrderDetails(doc, order);
                
                // Items Table
                this.addItemsTable(doc, order);
                
                // Payment Summary
                this.addPaymentSummary(doc, order);
                
                // Footer
                this.addFooter(doc);

                // Finalize PDF
                doc.end();

                stream.on('finish', () => {
                    console.log(`[Receipt] Generated: ${fileName}`);
                    resolve(filePath);
                });

                stream.on('error', (err) => {
                    console.error('[Receipt] Generation error:', err);
                    reject(err);
                });

            } catch (error) {
                console.error('[Receipt] Error:', error);
                reject(error);
            }
        });
    }

    addCompanyHeader(doc) {
        const logoX = 50;
        const logoY = 50;
        const logoSize = 60;
        const companyDetailsX = logoX + logoSize + 15; // Logo + spacing
        const rightColumnX = 380;
        const startY = 50;
        
        // Logo on the left
        const logoPath = path.join(__dirname, '../assets/GidiGames.jpeg');
        if (fs.existsSync(logoPath)) {
            try {
                doc.image(logoPath, logoX, logoY, { 
                    width: logoSize,
                    height: logoSize,
                    fit: [logoSize, logoSize]
                });
            } catch (err) {
                console.log('[Receipt] Logo not found or invalid, skipping');
            }
        }
        
        // Company Details (next to logo) - with max width to prevent overlap
        const companyColumnWidth = 250; // Limit width to prevent overlap
        
        // Company Name (Large and Bold)
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .fillColor('#1E293B')
           .text(this.companyInfo.name, companyDetailsX, startY, { width: companyColumnWidth });
        
        // Company Address and Contact
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#64748B')
           .text(this.companyInfo.address, companyDetailsX, startY + 30, { width: companyColumnWidth })
           .text(`Phone: ${this.companyInfo.phone}`, companyDetailsX, startY + 43, { width: companyColumnWidth })
           .text(`Email: ${this.companyInfo.email}`, companyDetailsX, startY + 56, { width: companyColumnWidth });
        
        doc.moveDown(1);
    }

    addHeader(doc, order) {
        // Right side - Order details (aligned with company info)
        const rightColumnX = 380;
        const rightColumnWidth = 165;
        const startY = 50;
        
        // ORDER RECEIPT Header
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#1E293B')
           .text('ORDER RECEIPT', rightColumnX, startY, { align: 'right', width: rightColumnWidth });
        
        // Order Number
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#1E293B')
           .text(`Order #${order.orderNumber || order._id.toString().slice(-6).toUpperCase()}`, 
                 rightColumnX, startY + 25, { align: 'right', width: rightColumnWidth });
        
        // Date (current date when receipt is generated)
        doc.fontSize(9)
           .fillColor('#64748B')
           .text(new Date().toLocaleDateString('en-US', {
               year: 'numeric',
               month: 'short',
               day: 'numeric'
           }), rightColumnX, startY + 40, { align: 'right', width: rightColumnWidth });
        
        // Status Badge
        const statusColor = order.status === 'CONFIRMED' ? '#10B981' : 
                           order.status === 'CANCELLED' ? '#EF4444' : '#F59E0B';
        // doc.fontSize(10)
        //    .font('Helvetica-Bold')
        //    .fillColor(statusColor)
        //    .text(`${order.status}`, rightColumnX, startY + 55, { align: 'right', width: rightColumnWidth })
        //    .fillColor('#000000');
        
        // Move down past both columns
        doc.y = 125;
        
        // Horizontal line
        doc.moveTo(50, doc.y)
           .lineTo(545, doc.y)
           .strokeColor('#E2E8F0')
           .lineWidth(2)
           .stroke()
           .lineWidth(1);
        
        doc.moveDown(1);
    }

    addCustomerInfo(doc, order) {
        const startY = doc.y;
        const leftColumnX = 50;
        const rightColumnX = 320;
        const columnWidth = 240;
        
        // Left column - Customer Info
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#000000')
           .text('CUSTOMER INFORMATION', leftColumnX, startY);
        
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#000000');
        
        let leftY = startY + 20;
        
        // Name
        doc.text(`Name: ${order.customer?.name || 'N/A'}`, leftColumnX, leftY, { width: columnWidth });
        leftY = doc.y + 5;
        
        // Address (with word wrap)
        const address = order.customer?.address || 'N/A';
        doc.text(`Address: ${address}`, leftColumnX, leftY, { width: columnWidth });
        leftY = doc.y + 5;
        
        // Phone
        doc.text(`Phone: ${order.customer?.phone || 'N/A'}`, leftColumnX, leftY, { width: columnWidth });
        leftY = doc.y + 5;
        
        // Email
        doc.text(`Email: ${order.customer?.email || 'N/A'}`, leftColumnX, leftY, { width: columnWidth });
        leftY = doc.y + 5;

        // Country
        doc.text(`Country: ${order.customer?.country || 'Nigeria'}`, leftColumnX, leftY, { width: columnWidth });
        leftY = doc.y;
        
        // Right column - Order Info
        // doc.fontSize(11)
        //    .font('Helvetica-Bold')
        //    .text('ORDER INFORMATION', rightColumnX, startY);
        
        // doc.fontSize(10)
        //    .font('Helvetica');
        
        // let rightY = startY + 20;
        
        // doc.text(`Warehouse: ${order.warehouse?.name || 'N/A'}`, rightColumnX, rightY, { width: columnWidth });
        // rightY = doc.y + 5;
        
        // doc.text(`Region: ${order.region?.name || 'N/A'}`, rightColumnX, rightY, { width: columnWidth });
        // rightY = doc.y + 5;
        
        // doc.text(`Channel: ${order.channel || 'N/A'}`, rightColumnX, rightY, { width: columnWidth });
        // rightY = doc.y;
        
        // // Move to the lower of the two columns
        // const maxY = Math.max(leftY, rightY);
        // doc.y = maxY + 15;
        
        // Horizontal line
        doc.moveTo(50, doc.y)
           .lineTo(545, doc.y)
           .stroke();
        
        doc.moveDown(1);
    }

    addOrderDetails(doc, order) {
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor('#000000')
           .text('ORDER ITEMS', 50);
        
        doc.moveDown(0.5);
    }

    addItemsTable(doc, order) {
        const tableTop = doc.y;
        const itemHeight = 25;
        
        // Table headers
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#64748B');
        
        doc.text('#', 50, tableTop, { width: 20 });
        doc.text('PRODUCT', 75, tableTop);
        doc.text('QTY', 300, tableTop, { width: 80, align: 'right' });
        doc.text('UNIT PRICE', 390, tableTop, { width: 80, align: 'right' });
        doc.text('SUBTOTAL', 480, tableTop, { width: 65, align: 'right' });
        
        // Line under headers
        doc.moveTo(50, tableTop + 15)
           .lineTo(545, tableTop + 15)
           .strokeColor('#E2E8F0')
           .stroke();
        
        // Items
        let currentY = tableTop + 25;
        doc.fillColor('#000000')
           .font('Helvetica');
        
        order.items.forEach((item, index) => {
            const cartonSize = item.product?.cartonSize || 1;
            const cartons = Math.floor(item.quantity / cartonSize);
            const pieces = item.quantity % cartonSize;
            const subtotal = item.quantity * (item.price || 0);
            
            // Check if we need a new page
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
            }
            
            // Item number
            doc.fontSize(9)
               .text(`${index + 1}`, 50, currentY, { width: 20 });
            
            // Product name (truncate if too long)
            const productName = (item.product?.name || 'Unknown').substring(0, 40);
            doc.text(productName, 75, currentY, { width: 215 });
            
            // Quantity
            let qtyText;
            if (cartonSize > 1) {
                if (cartons > 0 && pieces > 0) {
                    // Both cartons and pieces
                    qtyText = `${cartons} ctn, ${pieces} pcs`;
                } else if (cartons > 0) {
                    // Only cartons
                    qtyText = `${cartons} ctn`;
                } else {
                    // Only pieces
                    qtyText = `${pieces} pcs`;
                }
            } else {
                // No carton size, just show pieces
                qtyText = `${item.quantity} pcs`;
            }
            doc.text(qtyText, 300, currentY, { width: 80, align: 'right' });
            
            // Unit Price
            doc.text(formatMoneyCode((item.price || 0), orderCurrency(order)), 
                     390, currentY, { width: 80, align: 'right' });
            
            // Subtotal
            doc.text(formatMoneyCode(subtotal, orderCurrency(order)), 
                     480, currentY, { width: 65, align: 'right' });
            
            currentY += itemHeight + (cartonSize > 1 && cartons > 0 && pieces > 0 ? 5 : 0);
            
            // Light separator line
            if (index < order.items.length - 1) {
                doc.moveTo(50, currentY - 5)
                   .lineTo(545, currentY - 5)
                   .strokeColor('#F1F5F9')
                   .stroke();
            }
        });
        
        doc.y = currentY + 10;
    }

    addPaymentSummary(doc, order) {
        // Line before summary
        doc.moveTo(50, doc.y)
           .lineTo(545, doc.y)
           .strokeColor('#E2E8F0')
           .stroke();
        
        doc.moveDown(0.5);
        
        const summaryX = 350;
        const valueX = 450;
        
        doc.fontSize(10)
           .font('Helvetica');
        
        // Calculate items subtotal
        const itemsSubtotal = order.items.reduce((acc, item) => acc + (item.quantity * (item.price || 0)), 0);
        
        // Subtotal (if discount or delivery fee exists)
        if (order.discountAmount > 0 || order.deliveryFee > 0) {
            const rowY = doc.y;
            doc.text('Subtotal:', summaryX, rowY);
            doc.text(formatMoneyCode(itemsSubtotal, orderCurrency(order)), 
                     valueX, rowY, { width: 95, align: 'right' });
            
            doc.moveDown(0.5);
        }
        
        // Discount
        if (order.discountAmount > 0) {
            const rowY = doc.y;
            doc.fillColor('#EF4444')
               .text('Discount:', summaryX, rowY);
            doc.text(formatMoneyCode(order.discountAmount, orderCurrency(order), { negative: true }), 
                     valueX, rowY, { width: 95, align: 'right' })
               .fillColor('#000000');
            
            doc.moveDown(0.5);
        }
        
        // Delivery Fee
        if (order.deliveryFee > 0) {
            const rowY = doc.y;
            doc.text('Delivery Fee:', summaryX, rowY);
            doc.text(formatMoneyCode(order.deliveryFee, orderCurrency(order)), 
                     valueX, rowY, { width: 95, align: 'right' });
            
            doc.moveDown(0.5);
        }
        
        // Total line
        doc.moveTo(350, doc.y)
           .lineTo(545, doc.y)
           .strokeColor('#1E293B')
           .lineWidth(2)
           .stroke()
           .lineWidth(1);
        
        doc.moveDown(0.3);
        
        // Total Amount
        const totalY = doc.y;
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .text('TOTAL AMOUNT:', summaryX, totalY);
        doc.fillColor('#4880FF')
           .text(formatMoneyCode(order.totalAmount, orderCurrency(order)), 
                 valueX, totalY, { width: 95, align: 'right' })
           .fillColor('#000000');
        
        doc.moveDown(1);
    }

    addFooter(doc) {
        // Move to bottom of page
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#64748B');
        
        const footerY = 750;
        
        doc.moveTo(50, footerY - 10)
           .lineTo(545, footerY - 10)
           .strokeColor('#E2E8F0')
           .stroke();
        
        doc.text('Thank you for your business!', 50, footerY, { align: 'center' });
        doc.text(`Generated on ${new Date().toLocaleString()}`, 50, footerY + 12, { align: 'center' });
        doc.text('GidiGames', 50, footerY + 24, { align: 'center' });
    }

    /**
     * Get receipt file path for an order
     * @param {string} orderId - Order ID
     * @returns {string} - File path
     */
    getReceiptPath(orderId) {
        return path.join(this.receiptsDir, `receipt-${orderId}.pdf`);
    }

    /**
     * Check if receipt exists for an order
     * @param {string} orderId - Order ID
     * @returns {boolean}
     */
    receiptExists(orderId) {
        return fs.existsSync(this.getReceiptPath(orderId));
    }

    /**
     * Delete receipt for an order
     * @param {string} orderId - Order ID
     */
    deleteReceipt(orderId) {
        const filePath = this.getReceiptPath(orderId);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[Receipt] Deleted: receipt-${orderId}.pdf`);
        }
    }
}

// Export singleton instance
module.exports = new ReceiptService();
