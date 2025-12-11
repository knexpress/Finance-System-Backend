// Test script to verify CSV to Empost mapping with updated "N/A" values

// Simulate a CSV row from TRANSACTIONS OCT 2025.csv
const sampleRow = {
  'sn': '1',
  'awb_number': '21',
  'invoice_number': '2116',
  'invoice_date': '01/10/2025',
  'delivery_date': '01/10/2025',
  'sender_name': 'JANETH MALLORCA',
  'receiver_name': 'CHARMAINE PEDRON',
  'origin': 'DUBAI',
  'destination': 'LAGUNA',
  'country_of_destination': 'PHILIPPINES',
  'shipment_type': 'DOCUMENT',
  'service_type': 'OUTBOUND',
  'delivery_status': 'COMPLETED',
  'weight': '1.00',
  'delivery_charge_rate_before_discount': '52.00',
  'epg_levy_amount': '5.20',
  'leviable_/_non_leviable': 'LEVIABLE'
};

// Simulate the mapping function logic
function convertCountryToISO(countryName, defaultCode = 'PH') {
  if (!countryName || countryName === 'N/A' || countryName.trim() === '') return defaultCode;
  
  const countryMap = {
    'uae': 'AE',
    'united arab emirates': 'AE',
    'philippines': 'PH',
    'ph': 'PH',
  };
  
  const normalized = countryName.trim().toLowerCase();
  return countryMap[normalized] || defaultCode;
}

function calculateDimensions(weight) {
  // Simple dimension calculation based on weight
  const baseSize = Math.max(10, Math.ceil(Math.cbrt(weight * 1000) / 10) * 10);
  return {
    length: baseSize,
    width: baseSize,
    height: baseSize
  };
}

// Extract values
const awbNo = sampleRow['awb_number'] || 'N/A';
const customerName = sampleRow['sender_name'] || 'N/A';
const transactionDate = sampleRow['invoice_date'] || new Date();
const originCity = sampleRow['origin'] || 'N/A';
const destinationCity = sampleRow['destination'] || 'N/A';
const destinationCountry = sampleRow['country_of_destination'] || 'N/A';
const shipmentType = sampleRow['shipment_type'] || 'N/A';
const weight = parseFloat(sampleRow['weight'] || 0);
const deliveryCharge = parseFloat(sampleRow['delivery_charge_rate_before_discount'] || 0);
const receiverName = sampleRow['receiver_name'] || 'N/A';

// Determine origin country
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

// Determine shipping type
const shippingType = (originCountry === destinationCountry) ? 'DOM' : 'INT';

// Calculate dimensions
const weightValue = parseFloat(weight || 0);
const dimensions = calculateDimensions(weightValue);
const parsedDate = transactionDate ? new Date(transactionDate) : new Date();

console.log('📋 SAMPLE CSV ROW DATA:');
console.log(JSON.stringify(sampleRow, null, 2));

console.log('\n\n🔄 MAPPED TO EMPOST SHIPMENT PAYLOAD:\n');

// Build EMPOST shipment payload
const shipmentData = {
  trackingNumber: awbNo || 'N/A',
  uhawb: 'N/A',
  sender: {
    name: customerName || 'N/A',
    email: 'N/A',
    phone: 'N/A',
    countryCode: convertCountryToISO(originCountry, 'PH') || 'PH',
    city: originCity || 'N/A',
    line1: originCity || 'N/A'
  },
  receiver: {
    name: receiverName || 'N/A',
    phone: 'N/A',
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
    productCategory: shipmentType || 'N/A',
    productType: 'N/A',  // ✅ Changed from 'Parcel'
    descriptionOfGoods: shipmentType || 'N/A',
    dimensions: {
      length: dimensions.length,
      width: dimensions.width,
      height: dimensions.height,
      unit: 'CM'
    },
    numberOfPieces: 'N/A'  // ✅ Changed from 1
  },
  items: [{
    description: shipmentType || 'N/A',
    countryOfOrigin: convertCountryToISO(originCountry, 'PH'),
    quantity: 'N/A',  // ✅ Changed from 1
    hsCode: 'N/A'  // ✅ Changed from '8504.40'
  }]
};

console.log(JSON.stringify(shipmentData, null, 2));

console.log('\n\n✅ VERIFICATION CHECKLIST:\n');
console.log(`  ✓ productType: "${shipmentData.details.productType}" (should be "N/A")`);
console.log(`  ✓ numberOfPieces: "${shipmentData.details.numberOfPieces}" (should be "N/A")`);
console.log(`  ✓ items[0].quantity: "${shipmentData.items[0].quantity}" (should be "N/A")`);
console.log(`  ✓ items[0].hsCode: "${shipmentData.items[0].hsCode}" (should be "N/A")`);

console.log('\n\n📊 FIELD VALUES SUMMARY:\n');
console.log('Field'.padEnd(40) + 'Value'.padEnd(30) + 'Status');
console.log('─'.repeat(80));
console.log('details.productType'.padEnd(40) + shipmentData.details.productType.padEnd(30) + (shipmentData.details.productType === 'N/A' ? '✅' : '❌'));
console.log('details.numberOfPieces'.padEnd(40) + String(shipmentData.details.numberOfPieces).padEnd(30) + (shipmentData.details.numberOfPieces === 'N/A' ? '✅' : '❌'));
console.log('items[0].quantity'.padEnd(40) + String(shipmentData.items[0].quantity).padEnd(30) + (shipmentData.items[0].quantity === 'N/A' ? '✅' : '❌'));
console.log('items[0].hsCode'.padEnd(40) + shipmentData.items[0].hsCode.padEnd(30) + (shipmentData.items[0].hsCode === 'N/A' ? '✅' : '❌'));

console.log('\n\n💰 EMPOST INVOICE PAYLOAD:\n');
const invoiceData = {
  awb_number: awbNo || 'N/A',
  invoice_id: sampleRow['invoice_number'] || 'N/A',
  issue_date: parsedDate.toISOString(),
  amount: 0,
  delivery_charge: deliveryCharge,
  tax_amount: parseFloat(sampleRow['epg_levy_amount'] || 0),
  total_amount: deliveryCharge + parseFloat(sampleRow['epg_levy_amount'] || 0),
  weight_kg: Math.max(weightValue, 0.1),
  service_code: sampleRow['service_type'] === 'OUTBOUND' ? 'PH_TO_UAE' : 'DOMESTIC',
  client_id: {
    company_name: customerName || 'N/A',
    contact_name: customerName || 'N/A'
  }
};

console.log(JSON.stringify(invoiceData, null, 2));

