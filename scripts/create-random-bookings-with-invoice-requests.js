const mongoose = require('mongoose');
require('dotenv').config();

// Load models
require('../models/index');

const Booking = mongoose.models.Booking;
const InvoiceRequest = mongoose.models.InvoiceRequest;
const { generateUniqueAWBNumber, generateUniqueInvoiceID } = require('../utils/id-generators');

// Helper function to convert to Decimal128
const toDecimal128 = (value) => {
  if (value === null || value === undefined || value === '' || isNaN(value)) {
    return undefined;
  }
  try {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return undefined;
    }
    return new mongoose.Types.Decimal128(numValue.toFixed(2));
  } catch (error) {
    return undefined;
  }
};

// Normalize truthy/falsey values
const normalizeBoolean = (value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(lowered)) return true;
    if (['false', '0', 'no', 'n'].includes(lowered)) return false;
  }
  return Boolean(value);
};

// Random data generators
const randomNames = {
  ph: {
    first: ['Maria', 'Juan', 'Jose', 'Ana', 'Carlos', 'Rosa', 'Pedro', 'Carmen', 'Miguel', 'Elena'],
    last: ['Santos', 'Dela Cruz', 'Garcia', 'Reyes', 'Ramos', 'Torres', 'Villanueva', 'Cruz', 'Mendoza', 'Bautista']
  },
  uae: {
    first: ['Ahmed', 'Fatima', 'Mohammed', 'Aisha', 'Omar', 'Layla', 'Hassan', 'Zainab', 'Ali', 'Mariam'],
    last: ['Al-Mansoori', 'Al-Zahra', 'Al-Rashid', 'Al-Hashimi', 'Al-Sabah', 'Al-Nuaimi', 'Al-Mazrouei', 'Al-Kaabi', 'Al-Dhaheri', 'Al-Suwaidi']
  }
};

const phCities = ['Quezon City', 'Manila', 'Makati', 'Pasig', 'Taguig', 'Mandaluyong', 'Cebu City', 'Davao City', 'Bacolod', 'Iloilo City'];
const uaeCities = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

const commodities = [
  'Personal items and electronics',
  'Clothing and accessories',
  'Food items and snacks',
  'Documents and papers',
  'Books and educational materials',
  'Cosmetics and personal care',
  'Home decor items',
  'Gifts and souvenirs',
  'Medical supplies',
  'Tools and equipment'
];

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomWeight() {
  // Random weight between 5kg and 50kg
  return Math.round((Math.random() * 45 + 5) * 10) / 10;
}

function getRandomBoxes() {
  return Math.floor(Math.random() * 3) + 1; // 1 to 3 boxes
}

function generatePhoneNumber(country) {
  if (country === 'PH') {
    return `+63${Math.floor(Math.random() * 900000000) + 100000000}`;
  } else {
    return `+971${Math.floor(Math.random() * 90000000) + 50000000}`;
  }
}

function generateEmail(firstName, lastName) {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/-/g, '')}@example.com`;
}

/**
 * Create a PH TO UAE booking and invoice request
 */
async function createPhToUaeBooking(index) {
  const phFirstName = getRandomElement(randomNames.ph.first);
  const phLastName = getRandomElement(randomNames.ph.last);
  const uaeFirstName = getRandomElement(randomNames.uae.first);
  const uaeLastName = getRandomElement(randomNames.uae.last);
  
  const weight = getRandomWeight();
  const boxes = getRandomBoxes();
  const commodity = getRandomElement(commodities);
  const phCity = getRandomElement(phCities);
  const uaeCity = getRandomElement(uaeCities);
  
  const sender = {
    fullName: `${phFirstName} ${phLastName}`,
    firstName: phFirstName,
    lastName: phLastName,
    emailAddress: generateEmail(phFirstName, phLastName),
    agentName: 'Jhenn',
    completeAddress: `${Math.floor(Math.random() * 999) + 1} Street, ${phCity}, Metro Manila, Philippines`,
    country: 'PHILIPPINES',
    region: 'NCR',
    province: 'Metro Manila',
    city: phCity,
    addressLine1: `${Math.floor(Math.random() * 999) + 1} Street`,
    dialCode: '+63',
    phoneNumber: generatePhoneNumber('PH').replace('+63', ''),
    contactNo: generatePhoneNumber('PH'),
    deliveryOption: 'pickup',
    insured: Math.random() > 0.5,
    declaredAmount: Math.floor(Math.random() * 10000) + 1000,
    declared_value: Math.floor(Math.random() * 10000) + 1000
  };

  const receiver = {
    fullName: `${uaeFirstName} ${uaeLastName}`,
    firstName: uaeFirstName,
    lastName: uaeLastName,
    emailAddress: generateEmail(uaeFirstName, uaeLastName),
    completeAddress: `${Math.floor(Math.random() * 999) + 1} Sheikh Zayed Road, ${uaeCity}, UAE`,
    country: 'UNITED ARAB EMIRATES',
    emirates: uaeCity,
    city: uaeCity,
    addressLine1: `${Math.floor(Math.random() * 999) + 1} Sheikh Zayed Road`,
    dialCode: '+971',
    phoneNumber: generatePhoneNumber('UAE').replace('+971', ''),
    contactNo: generatePhoneNumber('UAE'),
    deliveryOption: 'delivery'
  };

  const items = Array.from({ length: boxes }, (_, i) => ({
    description: commodity,
    commodity: commodity,
    quantity: 1,
    weight: weight / boxes,
    value: Math.floor(Math.random() * 5000) + 500,
    length: 30 + Math.floor(Math.random() * 20),
    width: 25 + Math.floor(Math.random() * 15),
    height: 20 + Math.floor(Math.random() * 15)
  }));

  const booking = {
    referenceNumber: `PHUAE${Date.now()}${index}`,
    awb: null,
    service: 'ph-to-uae',
    service_code: 'PH_TO_UAE',
    sender: sender,
    receiver: receiver,
    items: items,
    origin_place: `${phCity}, Metro Manila, Philippines`,
    destination_place: `${uaeCity}, UAE`,
    number_of_boxes: boxes,
    weight: weight,
    weight_kg: weight,
    has_delivery: true,
    sender_delivery_option: 'pickup',
    receiver_delivery_option: 'delivery',
    insured: sender.insured,
    declaredAmount: sender.declaredAmount,
    declared_amount: sender.declaredAmount,
    status: 'pending',
    review_status: 'reviewed',
    reviewed_at: new Date(),
    reviewed_by_employee_id: new mongoose.Types.ObjectId('68f38205941695ddb6a193b5'),
    additionalDetails: `Random PH TO UAE booking #${index}`,
    termsAccepted: true,
    submittedAt: new Date(),
    submissionTimestamp: new Date().toISOString(),
    source: 'web'
  };

  const bookingDoc = new Booking(booking);
  const savedBooking = await bookingDoc.save();
  console.log(`✅ Created PH TO UAE booking ${index}: ${savedBooking.referenceNumber}`);

  // Convert to invoice request
  const bookingData = savedBooking.toObject ? savedBooking.toObject() : savedBooking;
  const senderData = bookingData.sender || {};
  const receiverData = bookingData.receiver || {};
  const itemsData = Array.isArray(bookingData.items) ? bookingData.items : [];

  const customerName = `${senderData.firstName || ''} ${senderData.lastName || ''}`.trim() || senderData.fullName || '';
  const receiverName = `${receiverData.firstName || ''} ${receiverData.lastName || ''}`.trim() || receiverData.fullName || '';

  const documentKeywords = ['document', 'documents', 'paper', 'papers', 'letter', 'letters', 'file', 'files'];
  const isDocument = itemsData.some(item => {
    const commodity = (item.commodity || item.name || item.description || '').toLowerCase();
    return documentKeywords.some(keyword => commodity.includes(keyword));
  });
  const shipment_type = isDocument ? 'DOCUMENT' : 'NON_DOCUMENT';

  const originPlace = bookingData.origin_place || senderData.completeAddress || '';
  const destinationPlace = bookingData.destination_place || receiverData.completeAddress || '';

  let serviceCode = 'PH_TO_UAE';
  const invoiceNumber = await generateUniqueInvoiceID(InvoiceRequest);
  const awbPrefix = { prefix: 'PHL' };
  const awbNumber = await generateUniqueAWBNumber(InvoiceRequest, awbPrefix);

  const commoditiesList = itemsData
    .map(item => {
      const commodity = item.commodity || item.name || item.description || '';
      return commodity;
    })
    .filter(Boolean)
    .join(', ') || '';

  let verificationBoxes = [];
  if (itemsData.length > 0) {
    verificationBoxes = itemsData.map((item, idx) => ({
      items: item.commodity || item.name || item.description || `Item ${idx + 1}`,
      length: toDecimal128(item.length),
      width: toDecimal128(item.width),
      height: toDecimal128(item.height),
      vm: toDecimal128(item.vm || item.volume),
    }));
  }

  const numberOfBoxes = bookingData.number_of_boxes || verificationBoxes.length || itemsData.length || 1;

  const bookingSnapshot = { ...bookingData };
  if (bookingSnapshot.__v !== undefined) delete bookingSnapshot.__v;
  if (bookingSnapshot._id) bookingSnapshot._id = bookingSnapshot._id.toString();

  const bookingDataClean = { ...bookingSnapshot };
  if (bookingDataClean.identityDocuments !== undefined) delete bookingDataClean.identityDocuments;
  if (bookingDataClean.images !== undefined) delete bookingDataClean.images;
  if (bookingDataClean.selfie !== undefined) delete bookingDataClean.selfie;
  if (bookingDataClean._id) bookingDataClean._id = bookingDataClean._id.toString();
  bookingDataClean.sender = senderData;
  bookingDataClean.receiver = receiverData;
  bookingDataClean.items = itemsData;

  const insuredRaw = bookingData.insured ?? senderData.insured ?? false;
  const declaredAmountRaw = bookingData.declaredAmount ?? bookingData.declared_amount ?? senderData.declaredAmount ?? 0;

  const invoiceRequestData = {
    invoice_number: invoiceNumber,
    tracking_code: awbNumber,
    service_code: serviceCode,
    customer_name: customerName,
    receiver_name: receiverName,
    origin_place: originPlace,
    destination_place: destinationPlace,
    shipment_type: shipment_type,
    customer_phone: senderData.contactNo || senderData.phoneNumber || '',
    receiver_address: receiverData.completeAddress || receiverData.addressLine1 || '',
    receiver_phone: receiverData.contactNo || receiverData.phoneNumber || '',
    receiver_company: receiverData.company || '',
    booking_snapshot: bookingSnapshot,
    booking_data: bookingDataClean,
    sender_delivery_option: senderData.deliveryOption || 'pickup',
    receiver_delivery_option: receiverData.deliveryOption || 'delivery',
    has_delivery: true,
    insured: normalizeBoolean(insuredRaw) ?? false,
    declaredAmount: toDecimal128(declaredAmountRaw),
    status: 'SUBMITTED',
    delivery_status: 'PENDING',
    is_leviable: true,
    created_by_employee_id: bookingData.reviewed_by_employee_id || undefined,
    notes: `Random PH TO UAE booking #${index}`,
    verification: {
      service_code: serviceCode,
      listed_commodities: commoditiesList,
      boxes: verificationBoxes,
      number_of_boxes: numberOfBoxes,
      receiver_address: receiverData.completeAddress || receiverData.addressLine1 || '',
      receiver_phone: receiverData.contactNo || receiverData.phoneNumber || '',
      agents_name: senderData.agentName || '',
      sender_details_complete: !!(senderData.fullName && senderData.contactNo),
      receiver_details_complete: !!(receiverData.fullName && receiverData.contactNo),
      actual_weight: toDecimal128(bookingData.weight || bookingData.weight_kg || weight),
      declared_value: toDecimal128(declaredAmountRaw),
      insured: normalizeBoolean(insuredRaw) ?? false
    },
  };

  const invoiceRequest = new InvoiceRequest(invoiceRequestData);
  await invoiceRequest.save();
  console.log(`✅ Created invoice request ${index}: ${invoiceNumber} (AWB: ${awbNumber})`);

  savedBooking.converted_to_invoice_request_id = invoiceRequest._id;
  await savedBooking.save();

  return { booking: savedBooking, invoiceRequest };
}

/**
 * Create a UAE TO PH booking and invoice request
 */
async function createUaeToPhBooking(index) {
  const uaeFirstName = getRandomElement(randomNames.uae.first);
  const uaeLastName = getRandomElement(randomNames.uae.last);
  const phFirstName = getRandomElement(randomNames.ph.first);
  const phLastName = getRandomElement(randomNames.ph.last);
  
  const weight = getRandomWeight();
  const boxes = getRandomBoxes();
  const commodity = getRandomElement(commodities);
  const uaeCity = getRandomElement(uaeCities);
  const phCity = getRandomElement(phCities);
  
  const sender = {
    firstName: uaeFirstName,
    lastName: uaeLastName,
    name: `${uaeFirstName} ${uaeLastName}`,
    phone: generatePhoneNumber('UAE'),
    email: generateEmail(uaeFirstName, uaeLastName),
    address: `${Math.floor(Math.random() * 999) + 1} Sheikh Zayed Road, ${uaeCity}, UAE`,
    city: uaeCity,
    country: 'UAE',
    countryCode: 'AE'
  };

  const receiver = {
    firstName: phFirstName,
    lastName: phLastName,
    name: `${phFirstName} ${phLastName}`,
    phone: generatePhoneNumber('PH'),
    email: generateEmail(phFirstName, phLastName),
    address: `${Math.floor(Math.random() * 999) + 1} Street, ${phCity}, Metro Manila, Philippines`,
    city: phCity,
    province: 'Metro Manila',
    country: 'Philippines',
    countryCode: 'PH'
  };

  const trackingCode = `PHWA${Date.now()}${index}UAE`;

  const booking = {
    tracking_code: trackingCode,
    awb_number: trackingCode,
    awb: trackingCode,
    service_code: 'UAE_TO_PH',
    service: 'UAE_TO_PH',
    weight: weight,
    weight_kg: weight,
    weightKg: weight,
    sender: sender,
    customer_name: `${uaeFirstName} ${uaeLastName}`,
    receiver: receiver,
    receiver_name: `${phFirstName} ${phLastName}`,
    origin_place: `${uaeCity}, UAE`,
    destination_place: `${phCity}, Metro Manila, Philippines`,
    origin: uaeCity,
    destination: phCity,
    sender_delivery_option: 'pickup',
    receiver_delivery_option: 'delivery',
    has_delivery: true,
    has_pickup: true,
    shipment_type: 'Non-Document',
    number_of_boxes: boxes,
    boxes_count: boxes,
    length: 40 + Math.floor(Math.random() * 20),
    width: 30 + Math.floor(Math.random() * 15),
    height: 25 + Math.floor(Math.random() * 15),
    dimensions: {
      length: 40 + Math.floor(Math.random() * 20),
      width: 30 + Math.floor(Math.random() * 15),
      height: 25 + Math.floor(Math.random() * 15),
      unit: 'CM'
    },
    status: 'pending',
    review_status: 'reviewed',
    reviewed_at: new Date(),
    reviewed_by_employee_id: new mongoose.Types.ObjectId('68f38205941695ddb6a193b5'),
    notes: `Random UAE TO PH booking #${index}`,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const bookingDoc = new Booking(booking);
  const savedBooking = await bookingDoc.save();
  console.log(`✅ Created UAE TO PH booking ${index}: ${savedBooking.tracking_code || savedBooking.awb_number}`);

  // Convert to invoice request
  const bookingData = savedBooking.toObject ? savedBooking.toObject() : savedBooking;
  const senderData = bookingData.sender || {};
  const receiverData = bookingData.receiver || {};

  const customerName = bookingData.customer_name || `${senderData.firstName || ''} ${senderData.lastName || ''}`.trim() || senderData.name || '';
  const receiverName = bookingData.receiver_name || `${receiverData.firstName || ''} ${receiverData.lastName || ''}`.trim() || receiverData.name || '';

  const shipment_type = 'NON_DOCUMENT';
  const originPlace = bookingData.origin_place || senderData.address || '';
  const destinationPlace = bookingData.destination_place || receiverData.address || '';

  let serviceCode = 'UAE_TO_PH';
  const invoiceNumber = await generateUniqueInvoiceID(InvoiceRequest);
  const awbPrefix = { prefix: 'PHL' };
  const awbNumber = await generateUniqueAWBNumber(InvoiceRequest, awbPrefix);

  const commoditiesList = commodity;

  const numberOfBoxes = bookingData.number_of_boxes || bookingData.boxes_count || 1;

  const bookingSnapshot = { ...bookingData };
  if (bookingSnapshot.__v !== undefined) delete bookingSnapshot.__v;
  if (bookingSnapshot._id) bookingSnapshot._id = bookingSnapshot._id.toString();

  const bookingDataClean = { ...bookingSnapshot };
  if (bookingDataClean.identityDocuments !== undefined) delete bookingDataClean.identityDocuments;
  if (bookingDataClean.images !== undefined) delete bookingDataClean.images;
  if (bookingDataClean.selfie !== undefined) delete bookingDataClean.selfie;
  if (bookingDataClean._id) bookingDataClean._id = bookingDataClean._id.toString();
  bookingDataClean.sender = senderData;
  bookingDataClean.receiver = receiverData;

  const invoiceRequestData = {
    invoice_number: invoiceNumber,
    tracking_code: awbNumber,
    service_code: serviceCode,
    customer_name: customerName,
    receiver_name: receiverName,
    origin_place: originPlace,
    destination_place: destinationPlace,
    shipment_type: shipment_type,
    customer_phone: senderData.phone || senderData.contactNo || '',
    receiver_address: receiverData.address || receiverData.completeAddress || '',
    receiver_phone: receiverData.phone || receiverData.contactNo || '',
    receiver_company: receiverData.company || '',
    booking_snapshot: bookingSnapshot,
    booking_data: bookingDataClean,
    sender_delivery_option: bookingData.sender_delivery_option || 'pickup',
    receiver_delivery_option: bookingData.receiver_delivery_option || 'delivery',
    has_delivery: true,
    insured: false,
    declaredAmount: undefined,
    status: 'SUBMITTED',
    delivery_status: 'PENDING',
    is_leviable: true,
    created_by_employee_id: bookingData.reviewed_by_employee_id || undefined,
    notes: `Random UAE TO PH booking #${index}`,
    verification: {
      service_code: serviceCode,
      listed_commodities: commoditiesList,
      boxes: [],
      number_of_boxes: numberOfBoxes,
      receiver_address: receiverData.address || receiverData.completeAddress || '',
      receiver_phone: receiverData.phone || receiverData.contactNo || '',
      agents_name: '',
      sender_details_complete: !!(senderData.name && senderData.phone),
      receiver_details_complete: !!(receiverData.name && receiverData.phone),
      actual_weight: toDecimal128(bookingData.weight || bookingData.weight_kg || weight),
      declared_value: undefined,
      insured: false
    },
  };

  const invoiceRequest = new InvoiceRequest(invoiceRequestData);
  await invoiceRequest.save();
  console.log(`✅ Created invoice request ${index}: ${invoiceNumber} (AWB: ${awbNumber})`);

  savedBooking.converted_to_invoice_request_id = invoiceRequest._id;
  await savedBooking.save();

  return { booking: savedBooking, invoiceRequest };
}

/**
 * Main function to create 10 random bookings
 */
async function createRandomBookings() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const results = {
      phToUae: [],
      uaeToPh: []
    };

    // Create 5 PH TO UAE bookings
    console.log('📦 Creating 5 PH TO UAE bookings...\n');
    for (let i = 1; i <= 5; i++) {
      const result = await createPhToUaeBooking(i);
      results.phToUae.push(result);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to avoid conflicts
    }

    // Create 5 UAE TO PH bookings
    console.log('\n📦 Creating 5 UAE TO PH bookings...\n');
    for (let i = 1; i <= 5; i++) {
      const result = await createUaeToPhBooking(i);
      results.uaeToPh.push(result);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to avoid conflicts
    }

    console.log('\n✅ Successfully created 10 bookings with invoice requests:');
    console.log(`   PH TO UAE: ${results.phToUae.length} bookings`);
    console.log(`   UAE TO PH: ${results.uaeToPh.length} bookings`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    console.log('\n✅ Script completed successfully!');
    
    return results;
  } catch (error) {
    console.error('❌ Error creating bookings:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  createRandomBookings()
    .then(() => {
      console.log('\n✅ All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createRandomBookings, createPhToUaeBooking, createUaeToPhBooking };

