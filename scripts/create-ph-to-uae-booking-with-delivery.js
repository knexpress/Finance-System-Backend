const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance';

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

/**
 * Create a PH to UAE booking with delivery charge and convert to invoice request
 */
async function createPhToUaeBookingWithDelivery() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Sample data for PH to UAE booking
    const sender = {
      fullName: 'Maria Santos',
      firstName: 'Maria',
      lastName: 'Santos',
      emailAddress: 'maria.santos@example.com',
      agentName: 'Jhenn',
      completeAddress: '123 Rizal Street, Barangay San Jose, Quezon City, Metro Manila',
      country: 'PHILIPPINES',
      region: 'NCR',
      province: 'Metro Manila',
      city: 'Quezon City',
      barangay: 'San Jose',
      addressLine1: '123 Rizal Street, Barangay San Jose',
      dialCode: '+63',
      phoneNumber: '9123456789',
      contactNo: '+639123456789',
      deliveryOption: 'pickup', // Sender wants pickup
      insured: true,
      declaredAmount: 5000,
      declared_value: 5000
    };

    const receiver = {
      fullName: 'Ahmed Al-Mansoori',
      firstName: 'Ahmed',
      lastName: 'Al-Mansoori',
      emailAddress: 'ahmed.almansoori@example.com',
      completeAddress: '456 Sheikh Zayed Road, Dubai Marina, Dubai, UAE',
      country: 'UNITED ARAB EMIRATES',
      emirates: 'Dubai',
      city: 'Dubai',
      district: 'Dubai Marina',
      addressLine1: '456 Sheikh Zayed Road, Dubai Marina',
      dialCode: '+971',
      phoneNumber: '501234567',
      contactNo: '+971501234567',
      deliveryOption: 'delivery' // Receiver wants delivery
    };

    const items = [
      {
        description: 'Personal items and electronics',
        commodity: 'Personal items and electronics',
        quantity: 2,
        weight: 15.5,
        value: 5000,
        length: 40,
        width: 30,
        height: 25
      }
    ];

    // Create booking
    const booking = {
      referenceNumber: `PHUAE${Date.now().toString().slice(-6)}`,
      awb: null, // Will be generated when converted to invoice request
      service: 'ph-to-uae',
      service_code: 'PH_TO_UAE',
      
      sender: sender,
      receiver: receiver,
      items: items,
      
      origin_place: 'Quezon City, Metro Manila, Philippines',
      destination_place: 'Dubai, UAE',
      
      number_of_boxes: 2,
      weight: 15.5,
      weight_kg: 15.5,
      
      // Delivery information
      has_delivery: true,
      sender_delivery_option: 'pickup',
      receiver_delivery_option: 'delivery',
      
      // Insurance information
      insured: true,
      declaredAmount: 5000,
      declared_amount: 5000,
      
      // Status
      status: 'pending',
      review_status: 'reviewed',
      reviewed_at: new Date(),
      reviewed_by_employee_id: new mongoose.Types.ObjectId('68f38205941695ddb6a193b5'),
      
      // Additional info
      additionalDetails: 'Dummy booking for PH to UAE with delivery charge',
      termsAccepted: true,
      submittedAt: new Date(),
      submissionTimestamp: new Date().toISOString(),
      source: 'web'
    };

    console.log('\n📦 Creating PH to UAE booking...');
    const bookingDoc = new Booking(booking);
    const savedBooking = await bookingDoc.save();
    console.log(`✅ Created booking: ${savedBooking.referenceNumber} (ID: ${savedBooking._id})`);

    // Now convert to invoice request using the same logic as the review endpoint
    console.log('\n🔄 Converting booking to invoice request...');
    
    // Extract data from booking
    const bookingData = savedBooking.toObject ? savedBooking.toObject() : savedBooking;
    const senderData = bookingData.sender || {};
    const receiverData = bookingData.receiver || {};
    const itemsData = Array.isArray(bookingData.items) ? bookingData.items : [];
    
    // Get customer information
    const customerFirstName = senderData.firstName || '';
    const customerLastName = senderData.lastName || '';
    const customerName = customerFirstName && customerLastName 
      ? `${customerFirstName} ${customerLastName}`.trim()
      : senderData.fullName || '';
    
    // Get receiver information
    const receiverFirstName = receiverData.firstName || '';
    const receiverLastName = receiverData.lastName || '';
    const receiverName = receiverFirstName && receiverLastName
      ? `${receiverFirstName} ${receiverLastName}`.trim()
      : receiverData.fullName || '';
    
    // Determine shipment_type
    const documentKeywords = ['document', 'documents', 'paper', 'papers', 'letter', 'letters', 'file', 'files'];
    const isDocument = itemsData.some(item => {
      const commodity = (item.commodity || item.name || item.description || '').toLowerCase();
      return documentKeywords.some(keyword => commodity.includes(keyword));
    });
    const shipment_type = isDocument ? 'DOCUMENT' : 'NON_DOCUMENT';
    
    // Get origin and destination
    const originPlace = bookingData.origin_place || senderData.completeAddress || senderData.addressLine1 || senderData.country || '';
    const destinationPlace = bookingData.destination_place || receiverData.completeAddress || receiverData.addressLine1 || receiverData.country || '';
    
    // Service code
    let serviceCode = bookingData.service_code || bookingData.service || 'PH_TO_UAE';
    if (serviceCode) {
      const normalized = serviceCode.toString().toUpperCase().replace(/[\s-]+/g, '_');
      if (normalized === 'PH_TO_UAE' || normalized.startsWith('PH_TO_UAE')) {
        serviceCode = 'PH_TO_UAE';
      } else if (normalized === 'UAE_TO_PH' || normalized.startsWith('UAE_TO_PH')) {
        serviceCode = 'UAE_TO_PH';
      } else {
        serviceCode = normalized;
      }
    }
    
    // Generate Invoice ID and AWB number
    const invoiceNumber = await generateUniqueInvoiceID(InvoiceRequest);
    console.log(`✅ Generated Invoice ID: ${invoiceNumber}`);
    
    let awbNumber;
    if (bookingData.awb && bookingData.awb.trim()) {
      awbNumber = bookingData.awb.trim();
      const existingInvoiceRequest = await InvoiceRequest.findOne({
        $or: [
          { tracking_code: awbNumber },
          { awb_number: awbNumber }
        ]
      });
      
      if (existingInvoiceRequest) {
        console.warn(`⚠️  AWB ${awbNumber} already exists. Generating new AWB.`);
        const awbPrefix = { prefix: 'PHL' };
        awbNumber = await generateUniqueAWBNumber(InvoiceRequest, awbPrefix);
      }
    } else {
      const awbPrefix = { prefix: 'PHL' };
      awbNumber = await generateUniqueAWBNumber(InvoiceRequest, awbPrefix);
    }
    console.log(`✅ Generated AWB Number: ${awbNumber}`);
    
    // Map commodities
    const commoditiesList = itemsData
      .map(item => {
        const commodity = item.commodity || item.name || item.description || '';
        const qty = item.qty ? ` (Qty: ${item.qty})` : '';
        return commodity + qty;
      })
      .filter(Boolean)
      .join(', ') || '';
    
    // Map boxes
    let verificationBoxes = [];
    if (bookingData.boxes && Array.isArray(bookingData.boxes)) {
      verificationBoxes = bookingData.boxes.map(box => ({
        items: box.items || box.commodity || box.description || '',
        length: toDecimal128(box.length),
        width: toDecimal128(box.width),
        height: toDecimal128(box.height),
        vm: toDecimal128(box.vm || box.volume),
      }));
    } else if (itemsData.length > 0) {
      verificationBoxes = itemsData.map((item, index) => ({
        items: item.commodity || item.name || item.description || `Item ${index + 1}`,
        length: toDecimal128(item.length),
        width: toDecimal128(item.width),
        height: toDecimal128(item.height),
        vm: toDecimal128(item.vm || item.volume),
      }));
    }
    
    const numberOfBoxes = bookingData.number_of_boxes || verificationBoxes.length || itemsData.length || 1;
    
    // Capture booking snapshot
    const bookingSnapshot = { ...bookingData };
    if (bookingSnapshot.__v !== undefined) {
      delete bookingSnapshot.__v;
    }
    if (bookingSnapshot._id) {
      bookingSnapshot._id = bookingSnapshot._id.toString();
    }
    
    // Create booking_data
    const bookingDataClean = { ...bookingSnapshot };
    if (bookingDataClean.identityDocuments !== undefined) {
      delete bookingDataClean.identityDocuments;
    }
    if (bookingDataClean.images !== undefined) {
      delete bookingDataClean.images;
    }
    if (bookingDataClean.selfie !== undefined) {
      delete bookingDataClean.selfie;
    }
    if (bookingDataClean._id) {
      bookingDataClean._id = bookingDataClean._id.toString();
    }
    bookingDataClean.sender = senderData;
    bookingDataClean.receiver = receiverData;
    bookingDataClean.items = itemsData;
    
    // Extract insurance data
    const insuredRaw = bookingData.insured ?? bookingData.insurance ?? bookingData.isInsured ?? bookingData.is_insured 
      ?? senderData.insured ?? senderData.insurance ?? senderData.isInsured ?? senderData.is_insured;
    const declaredAmountRaw = bookingData.declaredAmount ?? bookingData.declared_amount ?? bookingData.declared_value ?? bookingData.declaredValue
      ?? senderData.declaredAmount ?? senderData.declared_amount ?? senderData.declared_value ?? senderData.declaredValue;

    // Build invoice request data
    const invoiceRequestData = {
      invoice_number: invoiceNumber,
      tracking_code: awbNumber,
      service_code: serviceCode,
      
      // Required fields
      customer_name: customerName,
      receiver_name: receiverName,
      origin_place: originPlace,
      destination_place: destinationPlace,
      shipment_type: shipment_type,
      
      // Customer details
      customer_phone: senderData.contactNo || senderData.phoneNumber || senderData.phone || '',
      receiver_address: receiverData.completeAddress || receiverData.addressLine1 || receiverData.address || destinationPlace,
      receiver_phone: receiverData.contactNo || receiverData.phoneNumber || receiverData.phone || '',
      receiver_company: receiverData.company || '',
      
      // Booking snapshot
      booking_snapshot: bookingSnapshot,
      booking_data: bookingDataClean,
      
      // Delivery options (IMPORTANT: includes delivery charge info)
      sender_delivery_option: senderData.deliveryOption || bookingData.sender_delivery_option || 'pickup',
      receiver_delivery_option: receiverData.deliveryOption || bookingData.receiver_delivery_option || 'delivery',
      has_delivery: true, // Has delivery (receiver wants delivery)
      
      // Insurance information
      insured: normalizeBoolean(insuredRaw) ?? false,
      declaredAmount: toDecimal128(declaredAmountRaw),
      
      // Status
      status: 'SUBMITTED',
      delivery_status: 'PENDING',
      is_leviable: true,
      
      // Employee reference
      created_by_employee_id: bookingData.reviewed_by_employee_id || undefined,
      
      // Additional notes
      notes: bookingData.additionalDetails || bookingData.notes || 'Dummy booking for PH to UAE with delivery charge',
      
      // Verification data (pre-populated)
      verification: {
        service_code: serviceCode,
        listed_commodities: commoditiesList,
        boxes: verificationBoxes,
        number_of_boxes: numberOfBoxes,
        receiver_address: receiverData.completeAddress || receiverData.addressLine1 || receiverData.address || '',
        receiver_phone: receiverData.contactNo || receiverData.phoneNumber || receiverData.phone || '',
        agents_name: senderData.agentName || '',
        sender_details_complete: !!(senderData.fullName && senderData.contactNo),
        receiver_details_complete: !!(receiverData.fullName && receiverData.contactNo),
        actual_weight: toDecimal128(bookingData.weight || bookingData.weight_kg || 15.5),
        declared_value: toDecimal128(declaredAmountRaw),
        insured: normalizeBoolean(insuredRaw) ?? false
      },
    };

    const invoiceRequest = new InvoiceRequest(invoiceRequestData);
    await invoiceRequest.save();
    console.log(`✅ Created invoice request: ${invoiceNumber} (AWB: ${awbNumber})`);

    // Link booking to invoice request
    savedBooking.converted_to_invoice_request_id = invoiceRequest._id;
    await savedBooking.save();
    console.log(`✅ Linked booking to invoice request`);

    console.log('\n📋 Summary:');
    console.log(`   Booking ID: ${savedBooking._id}`);
    console.log(`   Booking Reference: ${savedBooking.referenceNumber}`);
    console.log(`   Invoice Request ID: ${invoiceRequest._id}`);
    console.log(`   Invoice Number: ${invoiceNumber}`);
    console.log(`   AWB Number: ${awbNumber}`);
    console.log(`   Service: ${serviceCode}`);
    console.log(`   Origin: ${originPlace}`);
    console.log(`   Destination: ${destinationPlace}`);
    console.log(`   Has Delivery: ${invoiceRequest.has_delivery}`);
    console.log(`   Sender Delivery Option: ${invoiceRequest.sender_delivery_option}`);
    console.log(`   Receiver Delivery Option: ${invoiceRequest.receiver_delivery_option}`);
    console.log(`   Status: ${invoiceRequest.status}`);
    console.log(`   Delivery Status: ${invoiceRequest.delivery_status}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    console.log('\n✅ Script completed successfully!');
    
    return { booking: savedBooking, invoiceRequest };
  } catch (error) {
    console.error('❌ Error creating PH to UAE booking:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  createPhToUaeBookingWithDelivery()
    .then(() => {
      console.log('\n✅ All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createPhToUaeBookingWithDelivery };

