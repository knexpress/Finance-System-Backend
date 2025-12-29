const mongoose = require('mongoose');
require('dotenv').config();

// Import models and utilities
const { generateUniqueAWBNumber, generateUniqueInvoiceID } = require('../utils/id-generators');
const { syncInvoiceWithEMPost } = require('../utils/empost-sync');
const { createNotificationsForDepartment } = require('../routes/notifications');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance';

// Load models
require('../models/index');

const Booking = mongoose.models.Booking;
const InvoiceRequest = mongoose.models.InvoiceRequest;

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

// Normalize truthy/falsey values that may arrive as strings/numbers
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
 * Convert a reviewed booking to an invoice request
 * Uses the same logic as the review endpoint
 */
async function convertBookingToInvoiceRequest(booking) {
  try {
    // Extract data from booking
    const sender = booking.sender || {};
    const receiver = booking.receiver || {};
    const items = Array.isArray(booking.items) ? booking.items : [];
    
    // Get customer information
    const customerFirstName = sender.firstName || booking.customer_first_name || '';
    const customerLastName = sender.lastName || booking.customer_last_name || '';
    const customerName = customerFirstName && customerLastName 
      ? `${customerFirstName} ${customerLastName}`.trim()
      : booking.customer_name || booking.name || sender.fullName || '';
    
    // Get receiver information
    const receiverFirstName = receiver.firstName || booking.receiver_first_name || '';
    const receiverLastName = receiver.lastName || booking.receiver_last_name || '';
    const receiverName = receiverFirstName && receiverLastName
      ? `${receiverFirstName} ${receiverLastName}`.trim()
      : booking.receiver_name || booking.receiverName || receiver.fullName || '';
    
    // Determine shipment_type from items or default to NON_DOCUMENT
    const itemsDescription = items
      .map(item => item.commodity || item.name || item.description || '')
      .filter(Boolean)
      .join(', ') || '';
    
    // Determine shipment type - check if items contain document-related keywords
    const documentKeywords = ['document', 'documents', 'paper', 'papers', 'letter', 'letters', 'file', 'files'];
    const isDocument = items.some(item => {
      const commodity = (item.commodity || item.name || item.description || '').toLowerCase();
      return documentKeywords.some(keyword => commodity.includes(keyword));
    });
    const shipment_type = isDocument ? 'DOCUMENT' : 'NON_DOCUMENT';
    
    // Get origin and destination
    const originPlace = booking.origin_place || booking.origin || sender.completeAddress || sender.addressLine1 || sender.address || sender.country || '';
    const destinationPlace = booking.destination_place || booking.destination || receiver.completeAddress || receiver.addressLine1 || receiver.address || receiver.country || '';
    
    // Get service code from booking
    let serviceCode = booking.service || booking.service_code || '';
    
    // Normalize service code for price bracket determination
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
    
    // Auto-generate Invoice ID and get AWB number from booking
    let invoiceNumber;
    let awbNumber;
    
    // Generate unique Invoice ID
    invoiceNumber = await generateUniqueInvoiceID(InvoiceRequest);
    
    // Get AWB number from booking (priority: booking.awb)
    if (booking.awb && booking.awb.trim()) {
      awbNumber = booking.awb.trim();
      
      // Check if this AWB already exists in InvoiceRequest (to avoid duplicates)
      const existingInvoiceRequest = await InvoiceRequest.findOne({
        $or: [
          { tracking_code: awbNumber },
          { awb_number: awbNumber }
        ]
      });
      
      if (existingInvoiceRequest) {
        console.warn(`⚠️  AWB ${awbNumber} already exists in InvoiceRequest. Generating new AWB as fallback.`);
        const isPhToUae = serviceCode === 'PH_TO_UAE' || serviceCode.startsWith('PH_TO_UAE');
        const awbPrefix = isPhToUae ? { prefix: 'PHL' } : {};
        awbNumber = await generateUniqueAWBNumber(InvoiceRequest, awbPrefix);
      }
    } else {
      // Generate unique AWB number if not provided in booking
      const isPhToUae = serviceCode === 'PH_TO_UAE' || serviceCode.startsWith('PH_TO_UAE');
      const isUaeToPh = serviceCode === 'UAE_TO_PH' || serviceCode.startsWith('UAE_TO_PH');
      
      let awbPrefix = {};
      if (isPhToUae) {
        awbPrefix = { prefix: 'PHL' };
      } else if (isUaeToPh) {
        awbPrefix = {};
      }
      
      awbNumber = await generateUniqueAWBNumber(InvoiceRequest, awbPrefix);
    }
    
    // Map commodities to verification.listed_commodities
    const commoditiesList = items
      .map(item => {
        const commodity = item.commodity || item.name || item.description || '';
        const qty = item.qty ? ` (Qty: ${item.qty})` : '';
        return commodity + qty;
      })
      .filter(Boolean)
      .join(', ') || itemsDescription;
    
    // Map boxes if available (from booking or items)
    let verificationBoxes = [];
    if (booking.boxes && Array.isArray(booking.boxes)) {
      verificationBoxes = booking.boxes.map(box => ({
        items: box.items || box.commodity || box.description || '',
        length: toDecimal128(box.length),
        width: toDecimal128(box.width),
        height: toDecimal128(box.height),
        vm: toDecimal128(box.vm || box.volume),
      }));
    } else if (items.length > 0) {
      verificationBoxes = items.map((item, index) => ({
        items: item.commodity || item.name || item.description || `Item ${index + 1}`,
        length: toDecimal128(item.length),
        width: toDecimal128(item.width),
        height: toDecimal128(item.height),
        vm: toDecimal128(item.vm || item.volume),
      }));
    }
    
    // Calculate number of boxes
    const numberOfBoxes = booking.number_of_boxes || verificationBoxes.length || items.length || 1;
    
    // Capture booking snapshot for audit/debug
    const bookingSnapshot = booking.toObject ? booking.toObject() : booking;
    if (bookingSnapshot && bookingSnapshot.__v !== undefined) {
      delete bookingSnapshot.__v;
    }
    if (bookingSnapshot && bookingSnapshot._id) {
      bookingSnapshot._id = bookingSnapshot._id.toString();
    }
    
    // Create booking_data with all booking details EXCEPT identityDocuments
    const bookingData = { ...bookingSnapshot };
    
    // Remove identityDocuments and related sensitive fields
    if (bookingData.identityDocuments !== undefined) {
      delete bookingData.identityDocuments;
    }
    if (bookingData.images !== undefined) {
      delete bookingData.images;
    }
    if (bookingData.selfie !== undefined) {
      delete bookingData.selfie;
    }
    
    // Convert _id to string if present
    if (bookingData._id) {
      bookingData._id = bookingData._id.toString();
    }
    
    // Ensure sender and receiver objects are included
    bookingData.sender = sender;
    bookingData.receiver = receiver;
    bookingData.items = items;
    
    // Extract insurance data with fallbacks
    const insuredRaw = booking.insured ?? booking.insurance ?? booking.isInsured ?? booking.is_insured 
      ?? sender.insured ?? sender.insurance ?? sender.isInsured ?? sender.is_insured;
    const declaredAmountRaw = booking.declaredAmount ?? booking.declared_amount ?? booking.declared_value ?? booking.declaredValue
      ?? sender.declaredAmount ?? sender.declared_amount ?? sender.declared_value ?? sender.declaredValue;

    // Build invoice request data
    const invoiceRequestData = {
      invoice_number: invoiceNumber,
      tracking_code: awbNumber,
      service_code: serviceCode || undefined,
      
      // Required fields
      customer_name: customerName,
      receiver_name: receiverName,
      origin_place: originPlace,
      destination_place: destinationPlace,
      shipment_type: shipment_type,
      
      // Customer details
      customer_phone: sender.contactNo || sender.phoneNumber || sender.phone || booking.customer_phone || '',
      receiver_address: receiver.completeAddress || receiver.addressLine1 || receiver.address || booking.receiver_address || booking.receiverAddress || destinationPlace,
      receiver_phone: receiver.contactNo || receiver.phoneNumber || receiver.phone || booking.receiver_phone || booking.receiverPhone || '',
      receiver_company: receiver.company || booking.receiver_company || '',
      
      // Customer images
      customerImage: booking.customerImage || booking.customer_image || '',
      customerImages: Array.isArray(booking.customerImages) ? booking.customerImages : (booking.customer_images || []),
      
      // Booking snapshot
      booking_snapshot: bookingSnapshot,
      booking_data: bookingData,
      
      // Delivery options
      sender_delivery_option: sender.deliveryOption || booking.sender?.deliveryOption || undefined,
      receiver_delivery_option: receiver.deliveryOption || booking.receiver?.deliveryOption || undefined,
      
      // Insurance information
      insured: normalizeBoolean(insuredRaw) ?? false,
      declaredAmount: toDecimal128(declaredAmountRaw),
      
      // Status
      status: 'SUBMITTED',
      delivery_status: 'PENDING',
      is_leviable: true,
      
      // Employee reference (use reviewed_by_employee_id if available)
      created_by_employee_id: booking.reviewed_by_employee_id || undefined,
      
      // Additional notes
      notes: booking.additionalDetails || booking.notes || '',
      
      // Verification data
      verification: {
        service_code: serviceCode,
        listed_commodities: commoditiesList,
        boxes: verificationBoxes,
        number_of_boxes: numberOfBoxes,
        receiver_address: receiver.completeAddress || receiver.addressLine1 || receiver.address || '',
        receiver_phone: receiver.contactNo || receiver.phoneNumber || receiver.phone || '',
        agents_name: sender.agentName || '',
        sender_details_complete: !!(sender.fullName && sender.contactNo),
        receiver_details_complete: !!(receiver.fullName && receiver.contactNo),
      },
    };

    const invoiceRequest = new InvoiceRequest(invoiceRequestData);
    await invoiceRequest.save();

    // Sync with EMPost (non-critical, don't fail if it errors)
    try {
      await syncInvoiceWithEMPost({
        requestId: invoiceRequest._id,
        reason: `Invoice request created from reviewed booking migration (${invoiceRequest.status})`,
      });
    } catch (syncError) {
      console.warn(`⚠️ EMPost sync failed for booking ${booking._id} (non-critical):`, syncError.message);
    }

    // Link booking to invoice request
    const bookingDoc = await Booking.findById(booking._id);
    if (bookingDoc) {
      bookingDoc.converted_to_invoice_request_id = invoiceRequest._id;
      await bookingDoc.save();
    }

    // Create notifications for relevant departments
    if (booking.reviewed_by_employee_id) {
      const relevantDepartments = ['Sales', 'Operations', 'Finance'];
      for (const deptName of relevantDepartments) {
        try {
          const dept = await mongoose.model('Department').findOne({ name: deptName });
          if (dept) {
            await createNotificationsForDepartment('invoice_request', invoiceRequest._id, dept._id, booking.reviewed_by_employee_id);
          }
        } catch (notifError) {
          console.warn(`⚠️ Failed to create notification for ${deptName} (non-critical):`, notifError.message);
        }
      }
    }

    return { booking, invoiceRequest };
  } catch (error) {
    console.error(`❌ Error converting booking ${booking._id}:`, error);
    throw error;
  }
}

/**
 * Main migration function
 */
async function migrateReviewedBookingsToInvoiceRequests() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all bookings that are reviewed but don't have an invoice request
    const reviewedBookings = await Booking.find({
      review_status: 'reviewed',
      reviewed_at: { $exists: true, $ne: null },
      $or: [
        { converted_to_invoice_request_id: { $exists: false } },
        { converted_to_invoice_request_id: null }
      ]
    }).lean();

    console.log(`\n📋 Found ${reviewedBookings.length} reviewed bookings without invoice requests`);

    if (reviewedBookings.length === 0) {
      console.log('✅ No bookings to migrate. All reviewed bookings already have invoice requests.');
      await mongoose.disconnect();
      return;
    }

    const results = {
      success: [],
      failed: []
    };

    // Process each booking
    for (let i = 0; i < reviewedBookings.length; i++) {
      const booking = reviewedBookings[i];
      console.log(`\n[${i + 1}/${reviewedBookings.length}] Processing booking ${booking._id}...`);
      console.log(`   Reference: ${booking.referenceNumber || 'N/A'}`);
      console.log(`   AWB: ${booking.awb || 'N/A'}`);
      console.log(`   Customer: ${booking.sender?.fullName || booking.customer_name || 'N/A'}`);

      try {
        const result = await convertBookingToInvoiceRequest(booking);
        results.success.push({
          bookingId: booking._id,
          referenceNumber: booking.referenceNumber,
          invoiceRequestId: result.invoiceRequest._id,
          invoiceNumber: result.invoiceRequest.invoice_number,
          trackingCode: result.invoiceRequest.tracking_code
        });
        console.log(`   ✅ Successfully created invoice request: ${result.invoiceRequest.invoice_number} (${result.invoiceRequest.tracking_code})`);
      } catch (error) {
        results.failed.push({
          bookingId: booking._id,
          referenceNumber: booking.referenceNumber,
          error: error.message
        });
        console.error(`   ❌ Failed: ${error.message}`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${results.success.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`📋 Total processed: ${reviewedBookings.length}`);

    if (results.success.length > 0) {
      console.log('\n✅ Successfully migrated bookings:');
      results.success.forEach((item, index) => {
        console.log(`   ${index + 1}. Booking ${item.bookingId} → Invoice Request ${item.invoiceRequestId}`);
        console.log(`      Reference: ${item.referenceNumber || 'N/A'}`);
        console.log(`      Invoice: ${item.invoiceNumber}, AWB: ${item.trackingCode}`);
      });
    }

    if (results.failed.length > 0) {
      console.log('\n❌ Failed migrations:');
      results.failed.forEach((item, index) => {
        console.log(`   ${index + 1}. Booking ${item.bookingId} (${item.referenceNumber || 'N/A'}): ${item.error}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
    return results;
  } catch (error) {
    console.error('❌ Error during migration:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  migrateReviewedBookingsToInvoiceRequests()
    .then((results) => {
      console.log('\n✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateReviewedBookingsToInvoiceRequests, convertBookingToInvoiceRequest };

