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

// List of names to search
const namesToSearch = [
  'Ramzay Aquino',
  'Anacleta Sacdalan',
  'Rosas Delos Reyes',
  'Evelyn Roque',
  'Emejin Baustista',
  'Chiara Vegafria',
  'Christine Joy Clariza',
  'Geneviev Dasal',
  'Cirila Maceda',
  'Chicko Nunez',
  'Catherine Latoza',
  'Jose Marwin Bariquit',
  'Rose Ann Cifra',
  'Ronaldo Bernardo',
  'Marinieta Paclibar',
  'Carl Dexter Gutierez',
  'Karen May Magno',
  'Rona Antonio',
  'Joy Moreno',
  'Ron Rommel Rodrigo',
  'Diane John Vestal',
  'Benjamin Moreno',
  'Kent Manimtim'
];

// Helper function to escape regex special characters
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper function to build name search query
function buildNameQuery(fullName) {
  debugLog(`buildNameQuery() called with name: "${fullName}"`);
  const trimmed = fullName.trim();
  const escaped = escapeRegex(trimmed);
  debugLog(`Name after trimming and escaping: "${escaped}"`);
  
  // Create regex patterns for flexible matching
  // Match full name (case-insensitive, partial match)
  const fullNameRegex = new RegExp(escaped, 'i');
  
  // Split name into parts for more flexible matching
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  debugLog(`Name parts - First: "${firstName}", Last: "${lastName}", Total parts: ${parts.length}`);
  
  const escapedFirstName = escapeRegex(firstName);
  const escapedLastName = escapeRegex(lastName);
  
  // Build query to search in multiple fields
  const query = {
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
  
  debugLog(`Built query with ${query.$or.length} OR conditions`);
  return query;
}

// Helper function to extract AWB from booking
function extractAWB(booking) {
  const awb = booking.tracking_code || 
         booking.awb_number || 
         booking.awb || 
         booking.referenceNumber || 
         booking.trackingNumber ||
         null;
  if (!awb) {
    debugLog(`extractAWB() - No AWB found in booking ${booking._id}`);
  }
  return awb;
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

// Helper function to build fuzzy search query (for names not found)
// This searches for names containing the first name OR last name
function buildFuzzyNameQuery(fullName) {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  
  const escapedFirstName = escapeRegex(firstName);
  const escapedLastName = escapeRegex(lastName);
  
  // Try partial matches - first name or last name (but require both to be present in the name)
  // This is more accurate - we want names that contain both first and last name parts
  const firstNameRegex = new RegExp(escapedFirstName, 'i');
  const lastNameRegex = new RegExp(escapedLastName, 'i');
  
  // Also try with common variations (e.g., "Bautista" vs "Baustista")
  const variations = [];
  if (lastName.toLowerCase().includes('bautista') || lastName.toLowerCase().includes('baustista')) {
    variations.push(new RegExp('bautista|baustista', 'i'));
  }
  if (lastName.toLowerCase().includes('gutierrez') || lastName.toLowerCase().includes('gutierez')) {
    variations.push(new RegExp('gutierrez|gutierez', 'i'));
  }
  
  const query = {
    $or: [
      // Match by first name (anywhere in name)
      { customer_name: firstNameRegex },
      { customerName: firstNameRegex },
      { name: firstNameRegex },
      { 'sender.fullName': firstNameRegex },
      { 'sender.name': firstNameRegex },
      { 'sender.firstName': firstNameRegex },
      { 'receiver.name': firstNameRegex },
      { 'receiver.fullName': firstNameRegex },
      { 'receiver.firstName': firstNameRegex },
      // Match by last name (anywhere in name)
      { customer_name: lastNameRegex },
      { customerName: lastNameRegex },
      { name: lastNameRegex },
      { 'sender.fullName': lastNameRegex },
      { 'sender.name': lastNameRegex },
      { 'sender.lastName': lastNameRegex },
      { 'receiver.name': lastNameRegex },
      { 'receiver.fullName': lastNameRegex },
      { 'receiver.lastName': lastNameRegex }
    ]
  };
  
  // Add variations if applicable
  if (variations.length > 0) {
    variations.forEach(variation => {
      query.$or.push(
        { customer_name: variation },
        { customerName: variation },
        { name: variation },
        { 'sender.fullName': variation },
        { 'sender.name': variation },
        { 'receiver.name': variation },
        { 'receiver.fullName': variation }
      );
    });
  }
  
  return query;
}

async function searchAWBs() {
  const scriptStartTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SCRIPT START: search-awbs-by-names.js');
  console.log('='.repeat(60));
  debugLog(`Starting search for ${namesToSearch.length} names`);
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

    const results = [];

    // Search for each name
    for (let i = 0; i < namesToSearch.length; i++) {
      const name = namesToSearch[i];
      const nameStartTime = Date.now();
      console.log(`\n🔍 [${i + 1}/${namesToSearch.length}] Searching for: ${name}...`);
      debugLog(`Processing name ${i + 1} of ${namesToSearch.length}`, { name });
      
      const query = buildNameQuery(name);
      debugLog(`Executing database query`, { query: JSON.stringify(query, null, 2) });
      
      const queryStartTime = Date.now();
      const bookings = await Booking.find(query)
        .select('tracking_code awb_number awb referenceNumber trackingNumber customer_name customerName sender receiver')
        .lean()
        .limit(100);
      performanceLog(`Database query for "${name}"`, queryStartTime);
      debugLog(`Query returned ${bookings.length} bookings`);

      const awbs = bookings
        .map(extractAWB)
        .filter(awb => awb !== null && awb !== undefined);

      const uniqueAWBs = [...new Set(awbs)];

      let similarNames = [];
      let similarAWBs = [];

      // If no exact match found, try fuzzy matching
      if (uniqueAWBs.length === 0) {
        console.log(`   ⚠️  No exact match found, trying fuzzy search...`);
        debugLog(`No exact matches found, attempting fuzzy search for "${name}"`);
        
        const fuzzyQuery = buildFuzzyNameQuery(name);
        debugLog(`Fuzzy query built`, { query: JSON.stringify(fuzzyQuery, null, 2) });
        
        const fuzzyStartTime = Date.now();
        const fuzzyBookings = await Booking.find(fuzzyQuery)
          .select('tracking_code awb_number awb referenceNumber trackingNumber customer_name customerName sender receiver')
          .lean()
          .limit(200);
        performanceLog(`Fuzzy search query for "${name}"`, fuzzyStartTime);
        debugLog(`Fuzzy search returned ${fuzzyBookings.length} bookings`);

        // Extract unique names and AWBs from fuzzy matches
        const foundNames = new Set();
        fuzzyBookings.forEach(booking => {
          const extractedName = extractName(booking);
          if (extractedName) {
            foundNames.add(extractedName);
          }
          const awb = extractAWB(booking);
          if (awb) {
            similarAWBs.push(awb);
          }
        });

        similarNames = Array.from(foundNames);
        similarAWBs = [...new Set(similarAWBs)];

        if (similarNames.length > 0) {
          console.log(`   🔎 Found ${similarNames.length} similar name(s):`);
          similarNames.slice(0, 10).forEach(n => console.log(`      - ${n}`));
          if (similarNames.length > 10) {
            console.log(`      ... and ${similarNames.length - 10} more`);
          }
          if (similarAWBs.length > 0) {
            console.log(`   ✅ Found ${similarAWBs.length} AWB(s) from similar names: ${similarAWBs.slice(0, 10).join(', ')}${similarAWBs.length > 10 ? '...' : ''}`);
          }
        }
      }

      results.push({
        name: name,
        awbs: uniqueAWBs,
        count: uniqueAWBs.length,
        bookingsFound: bookings.length,
        similarNames: similarNames,
        similarAWBs: similarAWBs
      });

      if (uniqueAWBs.length > 0) {
        console.log(`   ✅ Found ${uniqueAWBs.length} AWB(s): ${uniqueAWBs.join(', ')}`);
      } else if (similarAWBs.length > 0) {
        console.log(`   ⚠️  No exact match, but found ${similarAWBs.length} AWB(s) from similar names`);
      } else {
        console.log(`   ❌ No AWBs found`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.name}`);
      if (result.awbs.length > 0) {
        console.log(`   AWBs: ${result.awbs.join(', ')}`);
      } else if (result.similarNames.length > 0) {
        console.log(`   AWBs: None found (exact match)`);
        console.log(`   ⚠️  Similar names found in database:`);
        result.similarNames.forEach(n => console.log(`      - ${n}`));
        if (result.similarAWBs.length > 0) {
          console.log(`   📦 AWBs from similar names: ${result.similarAWBs.join(', ')}`);
        }
      } else {
        console.log(`   AWBs: None found`);
      }
    });

    // Print CSV format
    console.log('\n' + '='.repeat(60));
    console.log('📋 CSV FORMAT');
    console.log('='.repeat(60));
    console.log('Name,AWBs,Similar Names Found');
    results.forEach(result => {
      const awbsStr = result.awbs.length > 0 ? result.awbs.join('; ') : 
                     (result.similarAWBs.length > 0 ? result.similarAWBs.join('; ') : 'None');
      const similarNamesStr = result.similarNames.length > 0 ? result.similarNames.join(' | ') : 'None';
      console.log(`"${result.name}","${awbsStr}","${similarNamesStr}"`);
    });

    // Print detailed similar names section
    const namesWithSimilar = results.filter(r => r.similarNames.length > 0 && r.awbs.length === 0);
    if (namesWithSimilar.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('🔍 DETAILED SIMILAR NAMES ANALYSIS');
      console.log('='.repeat(60));
      namesWithSimilar.forEach(result => {
        console.log(`\n📌 Original: ${result.name}`);
        console.log(`   Similar names in database:`);
        result.similarNames.forEach((name, idx) => {
          console.log(`   ${idx + 1}. ${name}`);
        });
        if (result.similarAWBs.length > 0) {
          console.log(`   📦 AWBs: ${result.similarAWBs.join(', ')}`);
        }
      });
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
      duration: `${errorTime}ms`
    });
    debugLog('Error occurred', { error: error.toString(), stack: error.stack });
    process.exit(1);
  }
}

// Run the script
searchAWBs();

