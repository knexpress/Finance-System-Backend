/**
 * Script to check how an invoice was calculated in the database
 * Usage: node scripts/check-invoice-calculation.js <invoice_id>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Invoice } = require('../models/unified-schema');

// Get invoice ID from command line argument
const invoiceId = process.argv[2] || 'INV-00040';

async function checkInvoiceCalculation() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance';
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Try to find invoice by invoice_id (exact match)
    let invoice = await Invoice.findOne({ invoice_id: invoiceId })
      .populate('request_id', 'service_code verification shipment_classification')
      .populate('client_id', 'company_name contact_name')
      .lean();

    // If not found, try case-insensitive search
    if (!invoice) {
      invoice = await Invoice.findOne({ 
        invoice_id: { $regex: new RegExp(`^${invoiceId}$`, 'i') }
      })
        .populate('request_id', 'service_code verification shipment_classification')
        .populate('client_id', 'company_name contact_name')
        .lean();
    }

    // If still not found, try searching by _id if it looks like an ObjectId
    if (!invoice && mongoose.Types.ObjectId.isValid(invoiceId)) {
      invoice = await Invoice.findById(invoiceId)
        .populate('request_id', 'service_code verification shipment_classification')
        .populate('client_id', 'company_name contact_name')
        .lean();
    }

    if (!invoice) {
      console.error(`❌ Invoice ${invoiceId} not found in database`);
      console.log('\n📋 Searching for similar invoices...');
      
      // Find invoices with similar invoice_id
      const similarInvoices = await Invoice.find({
        invoice_id: { $regex: invoiceId, $options: 'i' }
      })
        .select('invoice_id _id base_amount tax_amount total_amount')
        .limit(10)
        .lean();
      
      if (similarInvoices.length > 0) {
        console.log(`\nFound ${similarInvoices.length} similar invoices:`);
        similarInvoices.forEach(inv => {
          console.log(`   - ${inv.invoice_id} (ID: ${inv._id})`);
        });
      } else {
        // List recent invoices
        const recentInvoices = await Invoice.find()
          .select('invoice_id _id base_amount tax_amount total_amount createdAt')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();
        
        console.log(`\nRecent invoices in database:`);
        recentInvoices.forEach(inv => {
          console.log(`   - ${inv.invoice_id} (ID: ${inv._id})`);
        });
      }
      
      process.exit(1);
    }

    console.log('='.repeat(80));
    console.log(`📄 INVOICE: ${invoice.invoice_id}`);
    console.log('='.repeat(80));
    console.log('');

    // Extract values (handle Decimal128)
    const parseDecimal = (val) => {
      if (!val) return 0;
      if (typeof val === 'object' && val.toString) {
        return parseFloat(val.toString());
      }
      return parseFloat(val) || 0;
    };

    const amount = parseDecimal(invoice.amount); // Shipping charge
    const pickupCharge = parseDecimal(invoice.pickup_charge);
    const deliveryCharge = parseDecimal(invoice.delivery_charge);
    const insuranceCharge = parseDecimal(invoice.insurance_charge);
    const baseAmount = parseDecimal(invoice.base_amount); // Subtotal
    const taxRate = invoice.tax_rate || 0;
    const taxAmount = parseDecimal(invoice.tax_amount);
    const totalAmount = parseDecimal(invoice.total_amount);
    const serviceCode = invoice.service_code || '';
    const shipmentClassification = invoice.request_id?.verification?.shipment_classification || 
                                    invoice.request_id?.shipment_classification || 'N/A';

    console.log('📊 CHARGE BREAKDOWN:');
    console.log('─'.repeat(80));
    console.log(`   Shipping Charge (amount):        ${amount.toFixed(2)} AED`);
    console.log(`   Pickup Charge:                   ${pickupCharge.toFixed(2)} AED`);
    console.log(`   Delivery Charge:                 ${deliveryCharge.toFixed(2)} AED`);
    console.log(`   Insurance Charge:                ${insuranceCharge.toFixed(2)} AED`);
    console.log('─'.repeat(80));
    console.log(`   Subtotal (base_amount):          ${baseAmount.toFixed(2)} AED`);
    console.log('');

    console.log('💰 TAX CALCULATION:');
    console.log('─'.repeat(80));
    console.log(`   Tax Rate:                        ${taxRate}%`);
    console.log(`   Tax Amount:                      ${taxAmount.toFixed(2)} AED`);
    console.log(`   Total Amount:                    ${totalAmount.toFixed(2)} AED`);
    console.log('');

    console.log('🔍 SERVICE DETAILS:');
    console.log('─'.repeat(80));
    console.log(`   Service Code:                     ${serviceCode}`);
    console.log(`   Shipment Classification:          ${shipmentClassification}`);
    console.log('');

    // Determine which tax rule was applied
    const isPhToUae = serviceCode.toUpperCase().includes('PH_TO_UAE');
    const isUaeToPh = serviceCode.toUpperCase().includes('UAE_TO_PH');
    const isFlowmicOrPersonal = shipmentClassification === 'FLOWMIC' || shipmentClassification === 'PERSONAL';

    console.log('📐 TAX RULE ANALYSIS:');
    console.log('─'.repeat(80));
    
    if (isUaeToPh && isFlowmicOrPersonal && taxRate === 5) {
      console.log('   Rule Applied: Rule 1 (UAE_TO_PH Flowmic/Personal)');
      console.log('   Calculation Method: Base amount includes tax, extract it');
      console.log('');
      console.log('   Expected Calculation:');
      const expectedSubtotal = totalAmount / 1.05;
      const expectedTax = expectedSubtotal * 0.05;
      console.log(`   a (subtotal) = totalAmount / 1.05 = ${totalAmount.toFixed(2)} / 1.05 = ${expectedSubtotal.toFixed(2)} AED`);
      console.log(`   b (tax) = a × 0.05 = ${expectedSubtotal.toFixed(2)} × 0.05 = ${expectedTax.toFixed(2)} AED`);
      console.log(`   Total = a + b = ${expectedSubtotal.toFixed(2)} + ${expectedTax.toFixed(2)} = ${totalAmount.toFixed(2)} AED`);
      console.log('');
      console.log('   Actual Values in Database:');
      console.log(`   base_amount (subtotal):         ${baseAmount.toFixed(2)} AED`);
      console.log(`   tax_amount:                     ${taxAmount.toFixed(2)} AED`);
      console.log(`   total_amount:                   ${totalAmount.toFixed(2)} AED`);
      console.log('');
      console.log('   Verification:');
      const diffSubtotal = Math.abs(baseAmount - expectedSubtotal);
      const diffTax = Math.abs(taxAmount - expectedTax);
      console.log(`   Subtotal difference:            ${diffSubtotal.toFixed(2)} AED ${diffSubtotal < 0.01 ? '✅' : '❌'}`);
      console.log(`   Tax difference:                 ${diffTax.toFixed(2)} AED ${diffTax < 0.01 ? '✅' : '❌'}`);
    } else if (isPhToUae && deliveryCharge > 0 && taxRate === 5) {
      console.log('   Rule Applied: Rule 2 (PH_TO_UAE with delivery)');
      console.log('   Calculation Method: 5% VAT on delivery charge only');
      console.log('');
      console.log('   Expected Calculation:');
      const expectedTax = deliveryCharge * 0.05;
      const expectedTotal = baseAmount + expectedTax;
      console.log(`   Tax = deliveryCharge × 0.05 = ${deliveryCharge.toFixed(2)} × 0.05 = ${expectedTax.toFixed(2)} AED`);
      console.log(`   Total = baseAmount + tax = ${baseAmount.toFixed(2)} + ${expectedTax.toFixed(2)} = ${expectedTotal.toFixed(2)} AED`);
      console.log('');
      console.log('   Actual Values in Database:');
      console.log(`   tax_amount:                     ${taxAmount.toFixed(2)} AED`);
      console.log(`   total_amount:                   ${totalAmount.toFixed(2)} AED`);
      console.log('');
      console.log('   Verification:');
      const diffTax = Math.abs(taxAmount - expectedTax);
      const diffTotal = Math.abs(totalAmount - expectedTotal);
      console.log(`   Tax difference:                 ${diffTax.toFixed(2)} AED ${diffTax < 0.01 ? '✅' : '❌'}`);
      console.log(`   Total difference:               ${diffTotal.toFixed(2)} AED ${diffTotal < 0.01 ? '✅' : '❌'}`);
    } else if (taxRate === 0) {
      console.log('   Rule Applied: Rule 3 (No tax)');
      console.log('   Calculation Method: No tax applied');
      console.log('');
      console.log('   Expected Calculation:');
      console.log(`   Tax = 0 AED`);
      console.log(`   Total = baseAmount = ${baseAmount.toFixed(2)} AED`);
      console.log('');
      console.log('   Actual Values in Database:');
      console.log(`   tax_amount:                     ${taxAmount.toFixed(2)} AED`);
      console.log(`   total_amount:                   ${totalAmount.toFixed(2)} AED`);
    } else {
      console.log('   Rule Applied: Unknown or custom rule');
      console.log(`   Tax Rate: ${taxRate}%`);
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Analysis complete');
    console.log('='.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
checkInvoiceCalculation();

