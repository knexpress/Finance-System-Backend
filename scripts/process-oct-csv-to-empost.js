require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { Report, Client } = require('../models');
const empostAPI = require('../services/empost-api');

// Helper function to normalize column names (case-insensitive, handles spaces and parentheses)
function normalizeColumnName(name) {
  if (!name) return '';
  // Remove BOM (Byte Order Mark) characters and normalize
  return name.trim()
    .replace(/^\uFEFF/, '') // Remove BOM
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[()]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

// Safely parse dates; fall back to current date if invalid
function safeParseDate(value) {
  if (!value) return new Date();
  // Handle common dd/MM/yyyy format
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (m) {
    const [_, dd, mm, yyyy] = m;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00.000Z`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// Helper function to get a value from row using flexible column matching
function getColumnValue(row, possibleNames) {
  // First, check normalized names (most common case)
  for (const name of possibleNames) {
    const normalizedName = normalizeColumnName(name);
    if (row[normalizedName]) return row[normalizedName];
    // Also check original name in case it wasn't normalized
    if (row[name]) return row[name];
  }
  // Try checking all keys in row (handle case variations)
  for (const name of possibleNames) {
    const normalizedName = normalizeColumnName(name);
    for (const key in row) {
      if (normalizeColumnName(key) === normalizedName) {
        return row[key];
      }
    }
  }
  return null;
}

// Helper function to parse CSV file and normalize column names
function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const readable = Readable.from(buffer);
    
    readable
      .pipe(csv())
      .on('data', (data) => {
        // Normalize column names to make them case-insensitive
        const normalizedData = {};
        for (const [key, value] of Object.entries(data)) {
          const normalizedKey = normalizeColumnName(key);
          normalizedData[normalizedKey] = value;
          // Also keep original key for backwards compatibility
          if (normalizedKey !== key) {
            normalizedData[key] = value;
          }
        }
        results.push(normalizedData);
      })
      .on('end', () => {
        if (results.length > 0) {
          console.log('📋 Available columns in CSV:', Object.keys(results[0]));
        }
        resolve(results);
      })
      .on('error', (error) => reject(error));
  });
}

// Helper function to convert country name to ISO country code
function convertCountryToISO(countryName, defaultCode = 'PH') {
  if (!countryName || countryName === 'N/A' || countryName.trim() === '') return defaultCode;
  
  const countryMap = {
    'uae': 'AE',
    'united arab emirates': 'AE',
    'philippines': 'PH',
    'ph': 'PH',
    'usa': 'US',
    'united states': 'US',
    'united states of america': 'US',
    'uk': 'GB',
    'united kingdom': 'GB',
    'india': 'IN',
    'pakistan': 'PK',
    'bangladesh': 'BD',
    'sri lanka': 'LK',
    'nepal': 'NP',
    'china': 'CN',
    'japan': 'JP',
    'south korea': 'KR',
    'singapore': 'SG',
    'malaysia': 'MY',
    'thailand': 'TH',
    'indonesia': 'ID',
    'vietnam': 'VN',
    'saudi arabia': 'SA',
    'kuwait': 'KW',
    'qatar': 'QA',
    'bahrain': 'BH',
    'oman': 'OM',
    'egypt': 'EG',
    'jordan': 'JO',
    'lebanon': 'LB',
    'turkey': 'TR',
    'australia': 'AU',
    'new zealand': 'NZ',
    'canada': 'CA',
    'mexico': 'MX',
    'brazil': 'BR',
    'argentina': 'AR',
    'south africa': 'ZA',
    'nigeria': 'NG',
    'kenya': 'KE',
    'france': 'FR',
    'germany': 'DE',
    'italy': 'IT',
    'spain': 'ES',
    'netherlands': 'NL',
    'belgium': 'BE',
    'switzerland': 'CH',
    'austria': 'AT',
    'sweden': 'SE',
    'norway': 'NO',
    'denmark': 'DK',
    'finland': 'FI',
    'poland': 'PL',
    'russia': 'RU',
  };
  
  const normalized = countryName.trim().toLowerCase();
  return countryMap[normalized] || defaultCode;
}

// Helper function to calculate dimensions from weight
function calculateDimensions(weightKg) {
  if (!weightKg || weightKg <= 0) {
    return { length: 1, width: 1, height: 1 };
  }
  
  const volumeCm3 = weightKg * 1000;
  const dimension = Math.cbrt(volumeCm3);
  const finalDimension = Math.max(dimension, 1);
  
  return {
    length: Math.round(finalDimension * 100) / 100,
    width: Math.round(finalDimension * 100) / 100,
    height: Math.round(finalDimension * 100) / 100
  };
}

// Helper function to map CSV row to EMPOST shipment format
async function mapCSVToEMPOSTShipment(row, client = null) {
  const awbNo = getColumnValue(row, ['awb number', 'awbno', 'awb_no', 'awb', 'awbnumber']);
  const customerName = getColumnValue(row, ['sender name', 'customername', 'customer_name', 'customer name']);
  const transactionDate = getColumnValue(row, ['invoice date', 'transactiondate', 'transaction_date', 'transaction date', 'delivery date', 'delivery_date']);
  const originCity = getColumnValue(row, ['origin', 'origincity', 'origin_city', 'origin city']);
  const destinationCity = getColumnValue(row, ['destination', 'destinationcity', 'destination_city', 'destination city']);
  const destinationCountry = getColumnValue(row, ['country of destination', 'destinationcountry', 'destination_country', 'destination country']);
  const shipmentType = getColumnValue(row, ['shipment type', 'shipmenttype', 'shipment_type', 'shipment type']);
  const weight = getColumnValue(row, ['weight', ' weight ']);
  const deliveryCharge = getColumnValue(row, ['delivery charge rate before discount', 'delivery charge', 'delivery_charge', 'deliverycharge', ' delivery charge rate before discount ']);
  
  // Determine origin country based on origin city
  let originCountry = 'PHILIPPINES'; // Default
  if (originCity) {
    const originUpper = originCity.toUpperCase().trim();
    if (originUpper.includes('DUBAI') || originUpper.includes('ABU DHABI') || 
        originUpper.includes('SHARJAH') || originUpper.includes('AJMAN') ||
        originUpper.includes('RAK') || originUpper.includes('FUJAIRAH') ||
        originUpper.includes('UMM') || originUpper.includes('AL-AIN') ||
        originUpper.includes('AL AIN')) {
      originCountry = 'UNITED ARAB EMIRATES';
    }
  }
  
  // Get sender information
  let senderEmail = 'N/A';
  let senderPhone = 'N/A';
  let senderAddress = originCity || 'N/A';
  
  if (client) {
    senderEmail = client.email || 'N/A';
    senderPhone = client.phone || 'N/A';
    senderAddress = client.address || senderAddress;
  }
  
  // Get receiver information
  let receiverName = getColumnValue(row, ['receiver name', 'receivername', 'receiver_name']) || 'N/A';
  let receiverPhone = 'N/A';
  
  // Determine shipping type (DOM or INT)
  const shippingType = (originCountry && destinationCountry && 
    originCountry !== 'N/A' && destinationCountry !== 'N/A' &&
    originCountry.toLowerCase().trim() === destinationCountry.toLowerCase().trim()) 
    ? 'DOM' 
    : (originCountry && destinationCountry && originCountry !== 'N/A' && destinationCountry !== 'N/A') ? 'INT' : 'N/A';
  
  // Map product category from shipment type
  const productCategory = shipmentType || 'N/A';
  
  // Calculate dimensions
  const weightValue = parseFloat(weight || 0);
  const dimensions = calculateDimensions(weightValue);
  
  // Parse transaction date to ISO (handles dd/MM/yyyy); fallback to now
  const parsedDate = safeParseDate(transactionDate);
  
  // Build EMPOST shipment payload
  const shipmentData = {
    trackingNumber: awbNo || 'N/A',
    uhawb: 'N/A',
    sender: {
      name: customerName || 'N/A',
      email: senderEmail || 'N/A',
      phone: senderPhone || 'N/A',
      countryCode: convertCountryToISO(originCountry, 'PH') || 'PH',
      city: originCity || 'N/A',
      line1: senderAddress || 'N/A'
    },
    receiver: {
      name: receiverName || 'N/A',
      phone: receiverPhone || 'N/A',
      email: 'N/A',
      countryCode: convertCountryToISO(destinationCountry, 'AE') || 'AE',
      city: destinationCity || 'N/A',
      line1: destinationCity || 'N/A'
    },
    details: {
      weight: {
        unit: 'KG',
        value: Math.max(weightValue, 0.1)
      },
      declaredWeight: {
        unit: 'KG',
        value: Math.max(weightValue, 0.1)
      },
      deliveryCharges: {
        currencyCode: 'AED',
        amount: parseFloat(deliveryCharge || 0)
      },
      pickupDate: parsedDate.toISOString(),
      shippingType: shippingType || 'N/A',
      productCategory: productCategory || 'N/A',
      productType: 'N/A',
      descriptionOfGoods: shipmentType || 'N/A',
      dimensions: {
        length: dimensions.length,
        width: dimensions.width,
        height: dimensions.height,
        unit: 'CM'
      },
      numberOfPieces: 'N/A'
    },
    items: [{
      description: shipmentType || 'N/A',
      countryOfOrigin: convertCountryToISO(originCountry, 'PH'),
      quantity: 'N/A',
      hsCode: 'N/A'
    }]
  };
  
  return shipmentData;
}

// Main processing function
async function processCSVToEmpost() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/finance-system', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Read CSV file
    // Hard-coded to process TRANSACTIONS NOV 2025.csv
    const csvFilePath = path.join(__dirname, '..', 'TRANSACTIONS NOV 2025.csv');
    console.log(`\n📄 Reading CSV file: ${csvFilePath}`);
    
    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found: ${csvFilePath}`);
    }

    const csvBuffer = fs.readFileSync(csvFilePath);
    const csvData = await parseCSV(csvBuffer);
    
    if (!csvData || csvData.length === 0) {
      throw new Error('CSV file is empty');
    }

    console.log(`✅ Parsed ${csvData.length} rows from CSV\n`);

    const summary = {
      total_rows: csvData.length,
      rows_processed: 0,
      shipments_created: 0,
      invoices_created: 0,
      audit_entries_created: 0,
      errors: 0
    };
    
    const errors = [];
    const processedRows = [];

    // Process each row
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const rowNumber = i + 2; // +2 because first row is header, and arrays are 0-indexed

      try {
        // Debug: Log first few rows to understand structure
        if (i < 3) {
          console.log(`\n🔍 Debug Row ${rowNumber}:`);
          console.log(`   Keys: ${Object.keys(row).slice(0, 10).join(', ')}...`);
          const awbKeys = Object.keys(row).filter(k => normalizeColumnName(k).includes('awb'));
          if (awbKeys.length > 0) {
            console.log(`   AWB-related keys: ${awbKeys.join(', ')}`);
            awbKeys.forEach(k => console.log(`   ${k}: "${row[k]}"`));
          }
        }
        
        // Skip empty rows - aggressively resolve AWB even with BOM/garbage prefixes
        // First try getColumnValue with normalized names
        let awbNo = getColumnValue(row, [
          'awb number', 
          'awbno', 
          'awb_no', 
          'awb', 
          'awbnumber',
          'awb_number'
        ]);
        
        // If not found, scan every column whose normalized name contains "awb"
        if (!awbNo || awbNo.toString().trim() === '') {
          for (const key of Object.keys(row)) {
            const normalizedKey = normalizeColumnName(key);
            if (normalizedKey.includes('awb')) {
              const value = row[key];
              if (value && value.toString().trim() !== '') {
                awbNo = value;
                break;
              }
            }
          }
        }
        
        const finalAwbNo = awbNo ? awbNo.toString().trim() : null;
        
        // Check if row has any data at all
        const hasData = Object.values(row).some(val => val && val.toString().trim() !== '');
        
        if (!finalAwbNo || finalAwbNo === '' || finalAwbNo === 'N/A') {
          if (hasData) {
            // Row has data but no AWB - log for debugging (only first few)
            if (i < 5) {
              const sampleValues = Object.entries(row).slice(0, 3).map(([k, v]) => `${k}="${v}"`).join(', ');
              console.log(`⚠️  Row ${rowNumber}: Has data but no AWB number. Sample: ${sampleValues}`);
            } else {
              console.log(`⚠️  Row ${rowNumber}: Skipping empty row`);
            }
          } else {
            console.log(`⚠️  Row ${rowNumber}: Skipping empty row`);
          }
          continue;
        }

        console.log(`\n📝 Processing row ${rowNumber} - AWB: ${finalAwbNo}`);

        // Try to find client by customer name
        const customerName = getColumnValue(row, ['sender name', 'customername', 'customer_name', 'customer name']);
        let client = null;
        if (customerName) {
          client = await Client.findOne({ company_name: customerName });
        }

        // Map CSV data to EMPOST shipment format (use finalAwbNo)
        const shipmentData = await mapCSVToEMPOSTShipment(row, client);
        // Override trackingNumber with the found AWB
        if (finalAwbNo) {
          shipmentData.trackingNumber = finalAwbNo.toString().trim();
        }

        // Ensure integer fields expected by EMPOST are valid numbers (API rejects "N/A")
        if (shipmentData.details) {
          const pieces = parseInt(shipmentData.details.numberOfPieces, 10);
          shipmentData.details.numberOfPieces = Number.isFinite(pieces) && pieces > 0 ? pieces : 1;
        }
        if (shipmentData.items && shipmentData.items[0]) {
          const qty = parseInt(shipmentData.items[0].quantity, 10);
          shipmentData.items[0].quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
        }

        // Call EMPOST API to create shipment
        let uhawb = null;
        let shipmentSuccess = false;
        try {
          console.log(`📦 Creating shipment in EMPOST for AWB: ${shipmentData.trackingNumber || 'N/A'}`);
          
          const shipmentResult = await empostAPI.createShipmentFromData(shipmentData);
          
          if (shipmentResult && shipmentResult.data && shipmentResult.data.uhawb) {
            uhawb = shipmentResult.data.uhawb;
            summary.shipments_created++;
            shipmentSuccess = true;
            console.log(`✅ Shipment created in EMPOST with UHAWB: ${uhawb}`);
          } else {
            console.warn(`⚠️ EMPOST shipment API did not return UHAWB for row ${rowNumber}`);
          }
        } catch (empostError) {
          console.error(`❌ EMPOST shipment API error for row ${rowNumber}:`, empostError.message);
          errors.push({
            row: rowNumber,
            error: `EMPOST shipment API error: ${empostError.response?.data?.message || empostError.message}`,
            awb: finalAwbNo || 'N/A'
          });
        }

        // Extract invoice data from CSV and call invoice API
        let invoiceSuccess = false;
        try {
          const transactionDate = getColumnValue(row, ['invoice date', 'transactiondate', 'transaction_date', 'transaction date', 'delivery date', 'delivery_date']);
          const invoiceAmount = parseFloat(getColumnValue(row, ['invoice_amount', 'invoiceamount', 'amount', 'total_amount', 'totalamount']) || 0);
          const deliveryChargeValue = parseFloat(getColumnValue(row, ['delivery charge rate before discount', 'delivery charge', 'delivery_charge', 'deliverycharge', ' delivery charge rate before discount ']) || 0);
          const taxAmount = parseFloat(getColumnValue(row, ['epg levy amount', 'tax_amount', 'taxamount', 'tax', 'vat']) || 0);
          const weight = parseFloat(getColumnValue(row, ['weight', ' weight ']) || 0.1);
          const invoiceNumber = getColumnValue(row, ['invoice number', 'invoice_number', 'invoicenumber', 'invoice_id', 'invoiceid']) || finalAwbNo || 'N/A';
          
          // Calculate amounts (use only CSV data - no business rules for historical uploads)
          const baseAmount = 0; // Historical PH_TO_UAE does not charge shipping/base
          const totalAmount = deliveryChargeValue + taxAmount;
          
          // Create invoice-like object for EMPOST invoice API
          const invoiceData = {
            awb_number: finalAwbNo || 'N/A',
            invoice_id: invoiceNumber,
            // Use parsed date in ISO format (handles dd/MM/yyyy)
            issue_date: safeParseDate(transactionDate).toISOString(),
            amount: baseAmount,
            delivery_charge: deliveryChargeValue,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            weight_kg: weight > 0 ? weight : 0.1,
            // Map SERVICE TYPE to service_code
            service_code: (() => {
              const serviceType = getColumnValue(row, ['service type', 'service_code', 'servicecode', 'service_type']);
              if (serviceType && serviceType.toUpperCase().includes('OUTBOUND')) {
                return 'PH_TO_UAE';
              } else if (serviceType && serviceType.toUpperCase().includes('DOMESTIC')) {
                return 'DOMESTIC';
              }
              return 'N/A';
            })(),
            client_id: client ? {
              company_name: client.company_name || 'N/A',
              contact_name: client.contact_name || 'N/A'
            } : {
              company_name: customerName || 'N/A',
              contact_name: customerName || 'N/A'
            }
          };

          console.log(`📄 Issuing invoice in EMPOST for AWB: ${invoiceData.awb_number}`);
          
          // Call EMPOST invoice API
          const invoiceResult = await empostAPI.issueInvoice(invoiceData);
          
          if (invoiceResult) {
            summary.invoices_created++;
            invoiceSuccess = true;
            console.log(`✅ Invoice issued in EMPOST for AWB: ${invoiceData.awb_number}`);
          }
        } catch (invoiceError) {
          console.error(`❌ EMPOST invoice API error for row ${rowNumber}:`, invoiceError.message);
          errors.push({
            row: rowNumber,
            error: `EMPOST invoice API error: ${invoiceError.response?.data?.message || invoiceError.message}`,
            awb: finalAwbNo || 'N/A'
          });
        }

        // Create audit report entry
        try {
          const transactionDate = getColumnValue(row, ['invoice date', 'transactiondate', 'transaction_date', 'transaction date', 'delivery date', 'delivery_date']);
          const invoiceAmount = parseFloat(getColumnValue(row, ['invoice_amount', 'invoiceamount', 'amount', 'total_amount', 'totalamount']) || 0);
          const deliveryChargeValue = parseFloat(getColumnValue(row, ['delivery charge rate before discount', 'delivery charge', 'delivery_charge', 'deliverycharge', ' delivery charge rate before discount ']) || 0);
          const taxAmount = parseFloat(getColumnValue(row, ['epg levy amount', 'tax_amount', 'taxamount', 'tax', 'vat']) || 0);
          const invoiceNumber = getColumnValue(row, ['invoice number', 'invoice_number', 'invoicenumber', 'invoice_id', 'invoiceid']) || finalAwbNo || 'N/A';
          const baseAmount = invoiceAmount > 0 ? invoiceAmount : (deliveryChargeValue > 0 ? deliveryChargeValue : 0);
          const totalAmount = baseAmount + deliveryChargeValue + taxAmount;
          
          // Determine origin country
          const originCity = getColumnValue(row, ['origin', 'origincity', 'origin_city', 'origin city']);
          let originCountry = 'PHILIPPINES';
          if (originCity) {
            const originUpper = originCity.toUpperCase().trim();
            if (originUpper.includes('DUBAI') || originUpper.includes('ABU DHABI') || 
                originUpper.includes('SHARJAH') || originUpper.includes('AJMAN') ||
                originUpper.includes('RAK') || originUpper.includes('FUJAIRAH') ||
                originUpper.includes('UMM') || originUpper.includes('AL-AIN') ||
                originUpper.includes('AL AIN')) {
              originCountry = 'UNITED ARAB EMIRATES';
            }
          }
          
          const reportData = {
            awb_number: finalAwbNo || 'N/A',
            transaction_date: transactionDate || 'N/A',
            customer_name: customerName || 'N/A',
            origin_country: originCountry || 'N/A',
            origin_city: originCity || 'N/A',
            destination_country: getColumnValue(row, ['country of destination', 'destinationcountry', 'destination_country', 'destination country']) || 'N/A',
            destination_city: getColumnValue(row, ['destination', 'destinationcity', 'destination_city', 'destination city']) || 'N/A',
            shipment_type: getColumnValue(row, ['shipment type', 'shipmenttype', 'shipment_type', 'shipment type']) || 'N/A',
            shipment_status: getColumnValue(row, ['delivery status', 'shipmentstatus', 'shipment_status', 'shipment status']) || 'N/A',
            weight: getColumnValue(row, ['weight', ' weight ']) || 'N/A',
            delivery_charge: deliveryChargeValue || 'N/A',
            empost_uhawb: uhawb || 'N/A',
            upload_type: 'automated_script',
            uploaded_at: new Date(),
            invoice_data: {
              invoice_number: invoiceNumber,
              invoice_amount: baseAmount,
              invoice_delivery_charge: deliveryChargeValue,
              invoice_tax_amount: taxAmount,
              invoice_total_amount: totalAmount
            },
            empost_api_results: {
              shipment_created: shipmentSuccess,
              invoice_created: invoiceSuccess
            }
          };

          const auditReport = new Report({
            title: `Automated CSV Processing - Row ${rowNumber}`,
            generated_by_employee_name: 'Automated Script',
            report_data: reportData,
            generatedAt: new Date()
          });

          await auditReport.save();
          summary.audit_entries_created++;
          console.log(`✅ Audit report created for row ${rowNumber}`);
          
          processedRows.push({
            row: rowNumber,
            awb: finalAwbNo,
            uhawb: uhawb
          });
          
          summary.rows_processed++;
        } catch (auditError) {
          console.error(`❌ Error creating audit report for row ${rowNumber}:`, auditError.message);
          errors.push({
            row: rowNumber,
            error: `Audit report creation failed: ${auditError.message}`,
            awb: finalAwbNo || 'N/A'
          });
          summary.errors++;
        }

      } catch (rowError) {
        console.error(`❌ Error processing row ${rowNumber}:`, rowError.message);
        errors.push({
          row: rowNumber,
          error: rowError.message,
          awb: (() => {
            const awb = getColumnValue(row, ['awb number', 'awbno', 'awb_no', 'awb', 'awbnumber', 'awb_number']);
            return awb || row['awb_number'] || row['AWB NUMBER'] || row['AWB NUMBER'] || 'N/A';
          })()
        });
        summary.errors++;
      }
    }

    // Log summary
    console.log('\n===============================');
    console.log('📊 CSV Processing Summary:');
    console.log(`  Total rows: ${summary.total_rows}`);
    console.log(`  Rows processed: ${summary.rows_processed}`);
    console.log(`  Shipments created: ${summary.shipments_created}`);
    console.log(`  Invoices created: ${summary.invoices_created}`);
    console.log(`  Audit entries created: ${summary.audit_entries_created}`);
    console.log(`  Errors: ${summary.errors}`);
    console.log('===============================\n');

    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');

    return {
      success: true,
      summary: summary,
      errors: errors
    };

  } catch (error) {
    console.error('❌ Fatal error processing CSV:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    throw error;
  }
}

// Run the script
if (require.main === module) {
  processCSVToEmpost()
    .then((result) => {
      console.log('\n✅ Script completed successfully!');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { processCSVToEmpost };

