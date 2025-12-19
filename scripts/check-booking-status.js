require('dotenv').config();
const mongoose = require('mongoose');
const { Booking } = require('../models');

// Debug logging utility
const debugLog = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔍 DEBUG: ${message}`);
  if (data !== null) {
    console.log(`[${timestamp}] 📊 Data:`, JSON.stringify(data, null, 2));
  }
};

const performanceLog = (operation, startTime) => {
  const duration = Date.now() - startTime;
  console.log(`⏱️  PERFORMANCE: ${operation} took ${duration}ms`);
  return duration;
};

const awbToCheck = process.argv[2] || 'AEMQ307OB3PHZCTR3';

async function checkBookingStatus() {
  const scriptStartTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SCRIPT START: check-booking-status.js');
  console.log('='.repeat(60));
  debugLog(`Script started with AWB: ${awbToCheck}`);
  debugLog('MongoDB URI configured', { uri: process.env.MONGODB_URI ? 'Set' : 'Not set' });
  
  try {
    const connectStartTime = Date.now();
    debugLog('Attempting MongoDB connection...');
    await mongoose.connect(process.env.MONGODB_URI, {
      readPreference: 'primaryPreferred'
    });
    performanceLog('MongoDB connection', connectStartTime);
    console.log('✅ Connected to MongoDB\n');

    console.log(`🔍 Checking booking status for AWB: ${awbToCheck}\n`);
    debugLog(`Searching for booking with AWB: ${awbToCheck}`);

    // Find the booking
    const booking = await Booking.findOne({
      $or: [
        { awb: awbToCheck },
        { tracking_code: awbToCheck },
        { awb_number: awbToCheck }
      ]
    })
    .select('_id awb review_status reviewed_at reviewed_by_employee_id customer_name')
    .lean();

    if (booking) {
      console.log('📦 Booking Details:');
      console.log(`   ID: ${booking._id}`);
      console.log(`   AWB: ${booking.awb || 'N/A'}`);
      console.log(`   Review Status: ${booking.review_status || 'not set (defaults to "not reviewed")'}`);
      console.log(`   Reviewed At: ${booking.reviewed_at || 'N/A'}`);
      console.log(`   Reviewed By Employee ID: ${booking.reviewed_by_employee_id || 'N/A'}`);
      console.log(`   Customer Name: ${booking.customer_name || 'N/A'}`);
      console.log('');

      // Test the status query logic (replicate the logic from routes/bookings.js)
      const sanitizeAwb = (awb) => {
        if (!awb || typeof awb !== 'string') return null;
        return awb.trim().replace(/[^a-zA-Z0-9]/g, '');
      };
      
      const sanitizeRegex = (pattern) => {
        if (!pattern || typeof pattern !== 'string') return pattern;
        // Remove dangerous quantifiers and limit length
        let sanitized = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (sanitized.length > 100) sanitized = sanitized.substring(0, 100);
        return sanitized;
      };
      
      const buildAwbQuery = (awb) => {
        if (!awb || !awb.trim()) return null;
        const awbSearch = sanitizeAwb(awb);
        if (!awbSearch) return null;
        const escapedAwb = sanitizeRegex(awbSearch);
        return {
          $or: [
            { awb: { $regex: escapedAwb, $options: 'i' } },
            { tracking_code: { $regex: escapedAwb, $options: 'i' } },
            { awb_number: { $regex: escapedAwb, $options: 'i' } },
            { referenceNumber: { $regex: escapedAwb, $options: 'i' } },
            { trackingNumber: { $regex: escapedAwb, $options: 'i' } }
          ]
        };
      };
      
      // Test "not reviewed" query (simplified version)
      const notReviewedQuery = {
        $or: [
          {
            $and: [
              { $or: [{ reviewed_at: { $exists: false } }, { reviewed_at: null }] },
              { $or: [{ reviewed_by_employee_id: { $exists: false } }, { reviewed_by_employee_id: null }] }
            ]
          },
          { review_status: { $exists: false } },
          { review_status: null },
          { review_status: { $in: ['not reviewed', 'not_reviewed', 'pending'] } }
        ]
      };
      
      const awbQuery = buildAwbQuery(awbToCheck);
      
      console.log('🔍 Testing Query Logic:');
      console.log(`   AWB Query:`, JSON.stringify(awbQuery, null, 2));
      
      // Combine queries
      const combinedQuery = {
        $and: [
          notReviewedQuery,
          awbQuery
        ]
      };
      
      // Test the combined query
      const testResult = await Booking.find(combinedQuery).countDocuments();
      console.log(`\n✅ Test Result: Found ${testResult} booking(s) with combined query`);
      
      if (testResult === 0) {
        console.log('\n⚠️  WARNING: Query returns 0 results! This is the bug.');
      } else {
        console.log('\n✅ SUCCESS: Query now works correctly!');
      }
    } else {
      console.log('❌ Booking not found');
    }

    const closeStartTime = Date.now();
    await mongoose.connection.close();
    performanceLog('Database connection close', closeStartTime);
    console.log('\n✅ Database connection closed');
    
    const totalDuration = Date.now() - scriptStartTime;
    performanceLog('Total script execution', scriptStartTime);
    console.log('\n' + '='.repeat(60));
    console.log('✅ SCRIPT COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    const errorTime = Date.now() - scriptStartTime;
    console.error('\n' + '='.repeat(60));
    console.error('❌ SCRIPT ERROR');
    console.error('='.repeat(60));
    console.error('❌ Error:', error);
    console.error('📊 Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      duration: `${errorTime}ms`,
      awb: awbToCheck
    });
    debugLog('Error occurred', { error: error.toString(), stack: error.stack });
    process.exit(1);
  }
}

checkBookingStatus();

