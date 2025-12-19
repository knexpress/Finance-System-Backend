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

async function checkAWB() {
  const scriptStartTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SCRIPT START: check-awb.js');
  console.log('='.repeat(60));
  debugLog(`Script started with AWB: ${awbToCheck}`);
  debugLog('MongoDB URI configured', { uri: process.env.MONGODB_URI ? 'Set' : 'Not set' });
  
  try {
    const connectStartTime = Date.now();
    debugLog('Attempting MongoDB connection...');
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      readPreference: 'primaryPreferred'
    });
    performanceLog('MongoDB connection', connectStartTime);
    console.log('✅ Connected to MongoDB\n');

    console.log(`🔍 Checking for AWB: ${awbToCheck}\n`);
    debugLog(`Searching for AWB: ${awbToCheck}`);

    // Search in all possible AWB fields
    const query = {
      $or: [
        { awb: awbToCheck },
        { tracking_code: awbToCheck },
        { awb_number: awbToCheck },
        { referenceNumber: awbToCheck },
        { trackingNumber: awbToCheck }
      ]
    };
    debugLog('Built query', { query: JSON.stringify(query, null, 2) });

    const queryStartTime = Date.now();
    const bookings = await Booking.find(query)
      .select('_id awb tracking_code awb_number referenceNumber trackingNumber customer_name customerName sender receiver createdAt updatedAt')
      .lean()
      .limit(10);
    performanceLog('Database query execution', queryStartTime);
    debugLog(`Query returned ${bookings.length} bookings`);

    if (bookings.length > 0) {
      console.log(`✅ Found ${bookings.length} booking(s) with this AWB:\n`);
      
      bookings.forEach((booking, index) => {
        console.log(`📦 Booking ${index + 1}:`);
        console.log(`   ID: ${booking._id}`);
        console.log(`   AWB: ${booking.awb || 'N/A'}`);
        console.log(`   Tracking Code: ${booking.tracking_code || 'N/A'}`);
        console.log(`   AWB Number: ${booking.awb_number || 'N/A'}`);
        console.log(`   Reference Number: ${booking.referenceNumber || 'N/A'}`);
        console.log(`   Tracking Number: ${booking.trackingNumber || 'N/A'}`);
        console.log(`   Customer Name: ${booking.customer_name || booking.customerName || booking.sender?.name || booking.sender?.fullName || 'N/A'}`);
        console.log(`   Receiver Name: ${booking.receiver?.name || booking.receiver?.fullName || 'N/A'}`);
        console.log(`   Created At: ${booking.createdAt || 'N/A'}`);
        console.log(`   Updated At: ${booking.updatedAt || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log(`❌ No bookings found with AWB: ${awbToCheck}\n`);
      
      // Try case-insensitive partial search
      console.log('🔍 Trying case-insensitive partial search...\n');
      const partialQuery = {
        $or: [
          { awb: { $regex: awbToCheck, $options: 'i' } },
          { tracking_code: { $regex: awbToCheck, $options: 'i' } },
          { awb_number: { $regex: awbToCheck, $options: 'i' } },
          { referenceNumber: { $regex: awbToCheck, $options: 'i' } },
          { trackingNumber: { $regex: awbToCheck, $options: 'i' } }
        ]
      };

      const partialBookings = await Booking.find(partialQuery)
        .select('_id awb tracking_code awb_number referenceNumber trackingNumber')
        .lean()
        .limit(5);

      if (partialBookings.length > 0) {
        console.log(`⚠️  Found ${partialBookings.length} booking(s) with similar AWB:\n`);
        partialBookings.forEach((booking, index) => {
          console.log(`   ${index + 1}. AWB: ${booking.awb || booking.tracking_code || booking.awb_number || 'N/A'}`);
        });
      } else {
        console.log('❌ No similar AWBs found either.');
      }
    }

    // Close connection
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

// Run the script
checkAWB();

