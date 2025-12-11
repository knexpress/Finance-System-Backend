const fs = require('fs');
const path = require('path');

// Read the CSV file
const csvPath = path.join(__dirname, '..', 'TRANSACTIONS OCT 2025.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split('\n');

// Parse header
const header = lines[0].split(',').map(h => h.trim());
console.log('📋 CSV HEADER COLUMNS:');
header.forEach((col, idx) => {
  console.log(`  ${idx + 1}. ${col}`);
});

// Parse first data row (row 2)
const row2 = lines[1].split(',').map(c => c.trim());
console.log('\n📦 SAMPLE ROW 2 DATA:');
const rowData = {};
header.forEach((col, idx) => {
  rowData[col] = row2[idx];
  console.log(`  ${col}: ${row2[idx]}`);
});

// Show how it maps to Empost
console.log('\n🔄 MAPPING TO EMPOST FORMAT:\n');

// Extract values
const awbNumber = rowData['AWB NUMBER'] || 'N/A';
const senderName = rowData['SENDER NAME'] || 'N/A';
const receiverName = rowData['RECEIVER NAME'] || 'N/A';
const origin = rowData['ORIGIN'] || 'N/A'; // DUBAI
const destination = rowData['DESTINATION'] || 'N/A'; // LAGUNA
const countryOfDestination = rowData['COUNTRY OF DESTINATION'] || 'N/A'; // PHILIPPINES
const shipmentType = rowData['SHIPMENT TYPE'] || 'N/A'; // DOCUMENT
const serviceType = rowData['SERVICE TYPE'] || 'N/A'; // OUTBOUND
const weight = parseFloat(rowData[' WEIGHT ']?.trim() || 0);
const deliveryCharge = parseFloat(rowData[' DELIVERY CHARGE RATE BEFORE DISCOUNT ']?.trim() || 0);
const epgLevy = parseFloat(rowData['EPG LEVY AMOUNT']?.trim() || 0);
const invoiceNumber = rowData['INVOICE NUMBER'] || 'N/A';
const invoiceDate = rowData['INVOICE DATE'] || 'N/A';

// Determine origin country (if ORIGIN is DUBAI, origin country is UAE)
const originCountry = origin === 'DUBAI' || origin.includes('DUBAI') ? 'UNITED ARAB EMIRATES' : 'PHILIPPINES';

// Determine shipping type
const shippingType = (originCountry === countryOfDestination) ? 'DOM' : 'INT';

console.log('📤 EMPOST SHIPMENT PAYLOAD:');
const empostShipment = {
  trackingNumber: awbNumber,
  uhawb: 'N/A',
  sender: {
    name: senderName,
    email: 'N/A',
    phone: 'N/A',
    countryCode: originCountry === 'UNITED ARAB EMIRATES' ? 'AE' : 'PH',
    city: origin,
    line1: origin
  },
  receiver: {
    name: receiverName,
    phone: 'N/A',
    email: 'N/A',
    countryCode: countryOfDestination === 'PHILIPPINES' ? 'PH' : 'AE',
    city: destination,
    line1: destination
  },
  details: {
    weight: {
      unit: 'KG',
      value: Math.max(weight, 0.1)
    },
    declaredWeight: {
      unit: 'KG',
      value: Math.max(weight, 0.1)
    },
    deliveryCharges: {
      currencyCode: 'AED',
      amount: deliveryCharge
    },
    pickupDate: new Date(invoiceDate).toISOString(),
    shippingType: shippingType,
    productCategory: shipmentType,
    productType: 'Parcel',
    descriptionOfGoods: shipmentType,
    dimensions: {
      length: 10,
      width: 10,
      height: 10,
      unit: 'CM'
    },
    numberOfPieces: 1
  },
  items: [{
    description: shipmentType,
    countryOfOrigin: originCountry === 'UNITED ARAB EMIRATES' ? 'AE' : 'PH',
    quantity: 1,
    hsCode: '8504.40'
  }]
};

console.log(JSON.stringify(empostShipment, null, 2));

console.log('\n💰 EMPOST INVOICE PAYLOAD:');
const empostInvoice = {
  awb_number: awbNumber,
  invoice_id: invoiceNumber,
  issue_date: new Date(invoiceDate).toISOString(),
  amount: 0, // Base amount (for PH_TO_UAE historical: 0)
  delivery_charge: deliveryCharge,
  tax_amount: epgLevy,
  total_amount: deliveryCharge + epgLevy,
  weight_kg: Math.max(weight, 0.1),
  service_code: serviceType === 'OUTBOUND' ? 'PH_TO_UAE' : 'DOMESTIC',
  client_id: {
    company_name: senderName,
    contact_name: senderName
  }
};

console.log(JSON.stringify(empostInvoice, null, 2));

console.log('\n📊 MAPPING SUMMARY:');
console.log('  CSV Column → Empost Field');
console.log('  ──────────────────────────────────────────');
console.log(`  AWB NUMBER → trackingNumber: ${awbNumber}`);
console.log(`  SENDER NAME → sender.name: ${senderName}`);
console.log(`  RECEIVER NAME → receiver.name: ${receiverName}`);
console.log(`  ORIGIN → sender.city: ${origin}`);
console.log(`  DESTINATION → receiver.city: ${destination}`);
console.log(`  COUNTRY OF DESTINATION → receiver.countryCode: ${countryOfDestination} → ${countryOfDestination === 'PHILIPPINES' ? 'PH' : 'AE'}`);
console.log(`  ORIGIN (DUBAI) → sender.countryCode: ${originCountry} → ${originCountry === 'UNITED ARAB EMIRATES' ? 'AE' : 'PH'}`);
console.log(`  SHIPMENT TYPE → descriptionOfGoods: ${shipmentType}`);
console.log(`  WEIGHT → weight.value: ${weight} KG`);
console.log(`  DELIVERY CHARGE RATE BEFORE DISCOUNT → deliveryCharges.amount: ${deliveryCharge} AED`);
console.log(`  EPG LEVY AMOUNT → tax_amount: ${epgLevy} AED`);
console.log(`  INVOICE NUMBER → invoice_id: ${invoiceNumber}`);
console.log(`  INVOICE DATE → issue_date: ${invoiceDate}`);
console.log(`  SERVICE TYPE → service_code: ${serviceType} → ${serviceType === 'OUTBOUND' ? 'PH_TO_UAE' : 'DOMESTIC'}`);

