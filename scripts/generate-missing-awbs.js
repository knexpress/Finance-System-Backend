require('dotenv').config();
const mongoose = require('mongoose');
const { Booking } = require('../models');
const { generateAWBNumber, generateUniqueAWBNumber } = require('../utils/id-generators');

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

/**
 * Determine route from booking data
 * Returns 'AE' for UAE to PH, 'PH' for PH to UAE
 */
function determineRoute(booking) {
  debugLog(`determineRoute() called for booking ${booking._id}`);
  
  // Check various fields that might indicate origin/destination
  const origin = (
    booking.origin_place ||
    booking.origin ||
    booking.sender?.city ||
    booking.sender?.country ||
    booking.route?.origin?.country ||
    booking.route?.origin?.city ||
    ''
  ).toString().toUpperCase();

  const destination = (
    booking.destination_place ||
    booking.destination ||
    booking.receiver?.city ||
    booking.receiver?.country ||
    booking.route?.destination?.country ||
    booking.route?.destination?.city ||
    ''
  ).toString().toUpperCase();

  // Check service_code if available
  const serviceCode = (booking.service_code || booking.serviceCode || '').toString().toUpperCase();
  
  debugLog(`Route determination - Origin: "${origin}", Destination: "${destination}", Service Code: "${serviceCode}"`);

  // UAE indicators
  const uaeIndicators = ['DUBAI', 'ABU DHABI', 'SHARJAH', 'UAE', 'AE', 'UNITED ARAB EMIRATES'];
  // Philippines indicators
  const phIndicators = ['PHILIPPINES', 'PH', 'MANILA', 'LAGUNA', 'CEBU', 'DAVAO', 'QUEZON', 'CAVITE'];

  // Check if origin is UAE
  const originIsUAE = uaeIndicators.some(indicator => origin.includes(indicator));
  const destinationIsPH = phIndicators.some(indicator => destination.includes(indicator));

  // Check if origin is PH
  const originIsPH = phIndicators.some(indicator => origin.includes(indicator));
  const destinationIsUAE = uaeIndicators.some(indicator => destination.includes(indicator));

  // Service code patterns
  if (serviceCode.includes('UAE_TO_PH') || serviceCode.includes('AE_TO_PH')) {
    return 'AE'; // UAE to PH
  }
  if (serviceCode.includes('PH_TO_UAE') || serviceCode.includes('PH_TO_AE')) {
    return 'PH'; // PH to UAE
  }

  // Determine from origin/destination
  if (originIsUAE && destinationIsPH) {
    return 'AE'; // UAE to PH
  }
  if (originIsPH && destinationIsUAE) {
    return 'PH'; // PH to UAE
  }

  // Default: if we can't determine, check if destination is PH (likely UAE to PH)
  if (destinationIsPH) {
    return 'AE';
  }
  if (destinationIsUAE) {
    return 'PH';
  }

  // Default fallback: assume PH to UAE (most common)
  const route = 'PH';
  debugLog(`Route determined: ${route} (fallback - default)`);
  return route;
}

/**
 * Generate AWB with route-specific prefix
 */
async function generateAWBForRoute(route) {
  const prefix = route === 'AE' ? 'AE' : 'PH';
  // Generate AWB with prefix (first 2 letters will be AE or PH)
  // Format: AEX... or PHX... (15 characters total)
  return generateAWBNumber({ prefix: prefix });
}

/**
 * Check if AWB is unique in bookings collection
 */
async function isAWBUnique(awb) {
  const existing = await Booking.findOne({
    $or: [
      { awb: awb },
      { tracking_code: awb },
      { awb_number: awb }
    ]
  });
  return !existing;
}

async function generateMissingAWBs() {
  const scriptStartTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SCRIPT START: generate-missing-awbs.js');
  console.log('='.repeat(60));
  debugLog('Script initialization');
  debugLog('MongoDB URI configured', { uri: process.env.MONGODB_URI ? 'Set' : 'Not set' });
  
  try {
    const connectStartTime = Date.now();
    debugLog('Attempting MongoDB connection...');
    await mongoose.connect(process.env.MONGODB_URI, {
      readPreference: 'primaryPreferred'
    });
    performanceLog('MongoDB connection', connectStartTime);
    console.log('✅ Connected to MongoDB\n');

    // Find bookings without AWB (missing, null, or empty string)
    const query = {
      $or: [
        { awb: { $exists: false } },
        { awb: null },
        { awb: '' },
        { awb: { $in: [null, ''] } }
      ]
    };

    console.log('🔍 Finding bookings without AWB...\n');
    debugLog('Executing query to find bookings without AWB', { query: JSON.stringify(query, null, 2) });
    
    const queryStartTime = Date.now();
    const bookingsWithoutAWB = await Booking.find(query)
      .select('_id awb origin_place destination_place origin destination sender receiver route service_code serviceCode')
      .lean();
    performanceLog('Query bookings without AWB', queryStartTime);

    console.log(`📊 Found ${bookingsWithoutAWB.length} bookings without AWB\n`);
    debugLog(`Query returned ${bookingsWithoutAWB.length} bookings`);

    if (bookingsWithoutAWB.length === 0) {
      console.log('✅ All bookings have AWBs!');
      await mongoose.connection.close();
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const results = [];

    // Process bookings in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < bookingsWithoutAWB.length; i += BATCH_SIZE) {
      const batch = bookingsWithoutAWB.slice(i, i + BATCH_SIZE);
      
      for (const booking of batch) {
        try {
          debugLog(`Processing booking ${booking._id}`);
          
          // Determine route
          const routeStartTime = Date.now();
          const route = determineRoute(booking);
          performanceLog(`Route determination for booking ${booking._id}`, routeStartTime);
          debugLog(`Route determined: ${route}`, { bookingId: booking._id });
          
          // Generate unique AWB
          let awb;
          let attempts = 0;
          const maxAttempts = 10;
          const awbGenStartTime = Date.now();
          
          do {
            debugLog(`Generating AWB attempt ${attempts + 1}/${maxAttempts}`, { route });
            awb = await generateAWBForRoute(route);
            debugLog(`Generated AWB: ${awb}`, { attempt: attempts + 1 });
            
            const uniquenessStartTime = Date.now();
            const isUnique = await isAWBUnique(awb);
            performanceLog(`AWB uniqueness check`, uniquenessStartTime);
            debugLog(`AWB uniqueness check result: ${isUnique}`, { awb });
            
            if (isUnique) {
              debugLog(`AWB is unique, proceeding with: ${awb}`);
              break;
            }
            attempts++;
            debugLog(`AWB not unique, retrying...`, { attempts, maxAttempts });
            
            if (attempts >= maxAttempts) {
              // Fallback: append timestamp
              awb = await generateAWBForRoute(route) + Date.now().toString().slice(-6);
              debugLog(`Max attempts reached, using fallback AWB: ${awb}`);
              break;
            }
          } while (attempts < maxAttempts);
          
          performanceLog(`AWB generation for booking ${booking._id}`, awbGenStartTime);
          debugLog(`Final AWB generated: ${awb}`, { bookingId: booking._id, attempts });

          // Update booking with new AWB
          const updateStartTime = Date.now();
          debugLog(`Updating booking ${booking._id} with AWB ${awb}`);
          await Booking.findByIdAndUpdate(booking._id, {
            $set: { awb: awb }
          });
          performanceLog(`Database update for booking ${booking._id}`, updateStartTime);
          debugLog(`Booking updated successfully`, { bookingId: booking._id, awb });

          successCount++;
          results.push({
            id: booking._id,
            awb: awb,
            route: route,
            origin: booking.origin_place || booking.origin || 'N/A',
            destination: booking.destination_place || booking.destination || 'N/A'
          });

          if (successCount % 10 === 0) {
            console.log(`   ✅ Generated ${successCount} AWBs...`);
          }
        } catch (error) {
          errorCount++;
          console.error(`   ❌ Error processing booking ${booking._id}:`, error.message);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully generated: ${successCount} AWBs`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📦 Total processed: ${bookingsWithoutAWB.length}\n`);

    // Show sample results
    if (results.length > 0) {
      console.log('📋 Sample Results (first 10):\n');
      results.slice(0, 10).forEach((result, index) => {
        console.log(`${index + 1}. AWB: ${result.awb} (Route: ${result.route})`);
        console.log(`   Origin: ${result.origin} → Destination: ${result.destination}`);
        console.log(`   ID: ${result.id}\n`);
      });
      
      if (results.length > 10) {
        console.log(`... and ${results.length - 10} more\n`);
      }
    }

    // Route statistics
    const routeStats = {};
    results.forEach(r => {
      routeStats[r.route] = (routeStats[r.route] || 0) + 1;
    });
    
    console.log('📊 Route Distribution:');
    Object.entries(routeStats).forEach(([route, count]) => {
      console.log(`   ${route}: ${count} bookings`);
    });

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
      duration: `${errorTime}ms`
    });
    debugLog('Error occurred', { error: error.toString(), stack: error.stack });
    process.exit(1);
  }
}

// Run the script
generateMissingAWBs();

