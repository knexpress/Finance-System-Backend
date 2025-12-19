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

const nameToSearch = process.argv[2] || 'Nancy Caballero';

// Helper function to escape regex special characters
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper function to build name search query
function buildNameQuery(fullName) {
  const trimmed = fullName.trim();
  const escaped = escapeRegex(trimmed);
  
  // Create regex patterns for flexible matching
  // Match full name (case-insensitive, partial match)
  const fullNameRegex = new RegExp(escaped, 'i');
  
  // Split name into parts for more flexible matching
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  
  const escapedFirstName = escapeRegex(firstName);
  const escapedLastName = escapeRegex(lastName);
  
  // Build query to search in multiple fields
  return {
    $or: [
      // Match customer_name field
      { customer_name: fullNameRegex },
      // Match customerName field
      { customerName: fullNameRegex },
      // Match name field
      { name: fullNameRegex },
      // Match sender fields
      { 'sender.fullName': fullNameRegex },
      { 'sender.name': fullNameRegex },
      { 'sender.firstName': new RegExp(`^${escapedFirstName}$`, 'i') },
      { 'sender.lastName': new RegExp(`^${escapedLastName}$`, 'i') },
      // Match receiver fields
      { 'receiver.name': fullNameRegex },
      { 'receiver.fullName': fullNameRegex },
      { 'receiver.firstName': new RegExp(`^${escapedFirstName}$`, 'i') },
      { 'receiver.lastName': new RegExp(`^${escapedLastName}$`, 'i') },
      // Match customer fields (if exists)
      { 'customer.firstName': new RegExp(`^${escapedFirstName}$`, 'i') },
      { 'customer.lastName': new RegExp(`^${escapedLastName}$`, 'i') }
    ]
  };
}

// Helper function to extract AWB from booking
function extractAWB(booking) {
  return booking.tracking_code || 
         booking.awb_number || 
         booking.awb || 
         booking.referenceNumber || 
         booking.trackingNumber ||
         null;
}

// Helper function to extract name from booking
function extractName(booking) {
  return booking.customer_name || 
         booking.customerName || 
         booking.name ||
         (booking.sender && (booking.sender.fullName || booking.sender.name || 
          `${booking.sender.firstName || ''} ${booking.sender.lastName || ''}`.trim())) ||
         (booking.receiver && (booking.receiver.fullName || booking.receiver.name ||
          `${booking.receiver.firstName || ''} ${booking.receiver.lastName || ''}`.trim())) ||
         null;
}

async function searchAWB() {
  const scriptStartTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SCRIPT START: search-single-name.js');
  console.log('='.repeat(60));
  debugLog(`Script started with name: "${nameToSearch}"`);
  debugLog('MongoDB URI configured', { uri: process.env.MONGODB_URI ? 'Set' : 'Not set' });
  
  try {
    const connectStartTime = Date.now();
    debugLog('Attempting MongoDB connection...');
    // Connect to MongoDB with read preference
    await mongoose.connect(process.env.MONGODB_URI, {
      readPreference: 'primaryPreferred'
    });
    performanceLog('MongoDB connection', connectStartTime);
    console.log('✅ Connected to MongoDB\n');

    console.log(`🔍 Searching for: ${nameToSearch}...\n`);
    debugLog(`Building query for name: "${nameToSearch}"`);
    
    const queryStartTime = Date.now();
    const query = buildNameQuery(nameToSearch);
    debugLog('Query built', { query: JSON.stringify(query, null, 2) });
    
    const dbQueryStartTime = Date.now();
    const bookings = await Booking.find(query)
      .select('tracking_code awb_number awb referenceNumber trackingNumber customer_name customerName sender receiver')
      .lean()
      .limit(100);
    performanceLog('Database query execution', dbQueryStartTime);
    debugLog(`Query returned ${bookings.length} bookings`);

    const awbs = bookings
      .map(extractAWB)
      .filter(awb => awb !== null && awb !== undefined);

    const uniqueAWBs = [...new Set(awbs)];

    if (uniqueAWBs.length > 0) {
      console.log(`✅ Found ${uniqueAWBs.length} AWB(s) for "${nameToSearch}":\n`);
      uniqueAWBs.forEach((awb, index) => {
        console.log(`   ${index + 1}. ${awb}`);
      });
      
      // Show booking details
      console.log(`\n📦 Booking Details:\n`);
      bookings.forEach((booking, index) => {
        const name = extractName(booking);
        const awb = extractAWB(booking);
        console.log(`   Booking ${index + 1}:`);
        console.log(`      Name: ${name || 'N/A'}`);
        console.log(`      AWB: ${awb || 'N/A'}`);
        console.log(`      ID: ${booking._id}`);
        console.log('');
      });
    } else {
      console.log(`❌ No AWBs found for "${nameToSearch}"\n`);
      
      // Try fuzzy search
      console.log('🔍 Trying fuzzy search...\n');
      const parts = nameToSearch.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      
      const fuzzyQuery = {
        $or: [
          { customer_name: new RegExp(firstName, 'i') },
          { customer_name: new RegExp(lastName, 'i') },
          { customerName: new RegExp(firstName, 'i') },
          { customerName: new RegExp(lastName, 'i') },
          { 'sender.name': new RegExp(firstName, 'i') },
          { 'sender.name': new RegExp(lastName, 'i') },
          { 'receiver.name': new RegExp(firstName, 'i') },
          { 'receiver.name': new RegExp(lastName, 'i') }
        ]
      };
      
      const fuzzyBookings = await Booking.find(fuzzyQuery)
        .select('tracking_code awb_number awb referenceNumber customer_name customerName sender receiver')
        .lean()
        .limit(10);
      
      if (fuzzyBookings.length > 0) {
        console.log(`⚠️  Found ${fuzzyBookings.length} similar name(s):\n`);
        fuzzyBookings.forEach((booking, index) => {
          const name = extractName(booking);
          const awb = extractAWB(booking);
          console.log(`   ${index + 1}. ${name || 'N/A'} - AWB: ${awb || 'N/A'}`);
        });
      } else {
        console.log('❌ No similar names found either.');
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
      searchName: nameToSearch
    });
    debugLog('Error occurred', { error: error.toString(), stack: error.stack });
    process.exit(1);
  }
}

// Run the script
searchAWB();

