/**
 * Script to create 10 random bookings with random AWB numbers
 * Usage: node scripts/create-random-bookings.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Booking } = require('../models');
const { generateAWBNumber } = require('../utils/id-generators');

// MongoDB connection string
const MONGODB_URI = "mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance";

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

// Sample data for random generation
const firstNames = [
  'John', 'Maria', 'Ahmed', 'Fatima', 'Juan', 'Sarah', 'Mohammed', 'Anna',
  'Carlos', 'Lisa', 'David', 'Emily', 'Michael', 'Jessica', 'Robert', 'Amanda',
  'James', 'Michelle', 'William', 'Jennifer', 'Richard', 'Ashley', 'Joseph', 'Melissa',
  'Thomas', 'Nicole', 'Christopher', 'Stephanie', 'Daniel', 'Elizabeth'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
  'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris',
  'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker'
];

const cities = {
  uae: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah'],
  ph: ['Manila', 'Cebu', 'Davao', 'Quezon City', 'Makati', 'Laguna', 'Cavite', 'Baguio']
};

const services = ['UAE_TO_PINAS', 'PH_TO_UAE'];
const shipmentTypes = ['DOCUMENT', 'NON_DOCUMENT'];

// Generate random name
function randomName() {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${firstName} ${lastName}`;
}

// Generate random phone number
function randomPhone(country = 'UAE') {
  if (country === 'UAE') {
    return `+971${50 + Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
  } else {
    return `+63${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 100000000).toString().padStart(9, '0')}`;
  }
}

// Generate random email
function randomEmail(name) {
  const cleanName = name.toLowerCase().replace(/\s+/g, '.');
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
  return `${cleanName}@${domains[Math.floor(Math.random() * domains.length)]}`;
}

// Generate random weight
function randomWeight() {
  return parseFloat((Math.random() * 20 + 0.5).toFixed(2)); // 0.5 to 20.5 kg
}

// Determine route and generate AWB
function determineRouteAndAWB(service) {
  const isUaeToPh = service === 'UAE_TO_PINAS' || service.includes('UAE_TO_PH');
  const route = isUaeToPh ? 'AE' : 'PH';
  const awb = generateAWBNumber({ prefix: route });
  return { route, awb };
}

// Create a random booking
function createRandomBooking(index) {
  const service = services[Math.floor(Math.random() * services.length)];
  const { route, awb } = determineRouteAndAWB(service);
  
  const isUaeToPh = service === 'UAE_TO_PINAS' || service.includes('UAE_TO_PH');
  const originCity = isUaeToPh 
    ? cities.uae[Math.floor(Math.random() * cities.uae.length)]
    : cities.ph[Math.floor(Math.random() * cities.ph.length)];
  const destinationCity = isUaeToPh
    ? cities.ph[Math.floor(Math.random() * cities.ph.length)]
    : cities.uae[Math.floor(Math.random() * cities.uae.length)];
  
  const customerName = randomName();
  const receiverName = randomName();
  const weight = randomWeight();
  
  const booking = {
    awb: awb,
    tracking_code: awb,
    awb_number: awb,
    customer_name: customerName,
    customerName: customerName,
    customer_phone: randomPhone(isUaeToPh ? 'UAE' : 'PH'),
    customer_email: randomEmail(customerName),
    receiver_name: receiverName,
    receiverName: receiverName,
    receiver_phone: randomPhone(isUaeToPh ? 'PH' : 'UAE'),
    receiver_email: randomEmail(receiverName),
    origin_place: originCity,
    destination_place: destinationCity,
    origin: originCity,
    destination: destinationCity,
    service_code: service,
    serviceCode: service,
    shipment_type: shipmentTypes[Math.floor(Math.random() * shipmentTypes.length)],
    weight: weight,
    weight_kg: weight,
    amount: parseFloat((weight * (Math.random() * 50 + 20)).toFixed(2)), // Random amount based on weight
    sender: {
      name: customerName,
      fullName: customerName,
      firstName: customerName.split(' ')[0],
      lastName: customerName.split(' ').slice(1).join(' ') || 'Doe',
      contactNo: randomPhone(isUaeToPh ? 'UAE' : 'PH'),
      emailAddress: randomEmail(customerName),
      completeAddress: `${Math.floor(Math.random() * 999) + 1} Street, ${originCity}`,
      city: originCity,
      country: isUaeToPh ? 'UAE' : 'Philippines'
    },
    receiver: {
      name: receiverName,
      fullName: receiverName,
      firstName: receiverName.split(' ')[0],
      lastName: receiverName.split(' ').slice(1).join(' ') || 'Doe',
      contactNo: randomPhone(isUaeToPh ? 'PH' : 'UAE'),
      emailAddress: randomEmail(receiverName),
      completeAddress: `${Math.floor(Math.random() * 999) + 1} Street, ${destinationCity}`,
      city: destinationCity,
      country: isUaeToPh ? 'Philippines' : 'UAE'
    },
    review_status: 'not reviewed',
    status: 'PENDING',
    delivery_status: 'PENDING'
  };
  
  return booking;
}

async function createRandomBookings() {
  const scriptStartTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SCRIPT START: create-random-bookings.js');
  console.log('='.repeat(60));
  debugLog('Script initialization');
  debugLog('MongoDB URI', { uri: MONGODB_URI ? 'Set' : 'Not set' });
  
  try {
    const connectStartTime = Date.now();
    debugLog('Attempting MongoDB connection...');
    await mongoose.connect(MONGODB_URI, {
      readPreference: 'primaryPreferred'
    });
    performanceLog('MongoDB connection', connectStartTime);
    console.log('✅ Connected to MongoDB\n');

    const bookingsToCreate = 10;
    console.log(`📦 Creating ${bookingsToCreate} random bookings...\n`);
    debugLog(`Will create ${bookingsToCreate} bookings`);

    const createdBookings = [];
    const createStartTime = Date.now();

    for (let i = 0; i < bookingsToCreate; i++) {
      try {
        debugLog(`Creating booking ${i + 1}/${bookingsToCreate}`);
        const bookingData = createRandomBooking(i);
        debugLog(`Booking data generated`, { 
          awb: bookingData.awb, 
          customer: bookingData.customer_name,
          service: bookingData.service_code
        });

        const saveStartTime = Date.now();
        const booking = new Booking(bookingData);
        await booking.save();
        performanceLog(`Save booking ${i + 1}`, saveStartTime);

        createdBookings.push({
          id: booking._id,
          awb: bookingData.awb,
          customer: bookingData.customer_name,
          receiver: bookingData.receiver_name,
          origin: bookingData.origin_place,
          destination: bookingData.destination_place,
          service: bookingData.service_code
        });

        console.log(`✅ Created booking ${i + 1}/${bookingsToCreate}:`);
        console.log(`   AWB: ${bookingData.awb}`);
        console.log(`   Customer: ${bookingData.customer_name}`);
        console.log(`   Receiver: ${bookingData.receiver_name}`);
        console.log(`   Route: ${bookingData.origin_place} → ${bookingData.destination_place}`);
        console.log(`   Service: ${bookingData.service_code}`);
        console.log(`   Weight: ${bookingData.weight} kg\n`);
      } catch (error) {
        console.error(`❌ Error creating booking ${i + 1}:`, error.message);
        debugLog(`Error creating booking ${i + 1}`, { error: error.toString(), stack: error.stack });
      }
    }

    performanceLog(`Total booking creation`, createStartTime);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully created: ${createdBookings.length} bookings`);
    console.log(`❌ Errors: ${bookingsToCreate - createdBookings.length}\n`);

    if (createdBookings.length > 0) {
      console.log('📋 Created Bookings:\n');
      createdBookings.forEach((booking, index) => {
        console.log(`${index + 1}. AWB: ${booking.awb}`);
        console.log(`   Customer: ${booking.customer}`);
        console.log(`   Receiver: ${booking.receiver}`);
        console.log(`   Route: ${booking.origin} → ${booking.destination}`);
        console.log(`   Service: ${booking.service}`);
        console.log(`   ID: ${booking.id}\n`);
      });

      // Route statistics
      const routeStats = {};
      createdBookings.forEach(b => {
        const route = b.service.includes('UAE_TO') ? 'AE' : 'PH';
        routeStats[route] = (routeStats[route] || 0) + 1;
      });
      
      console.log('📊 Route Distribution:');
      Object.entries(routeStats).forEach(([route, count]) => {
        console.log(`   ${route} prefix: ${count} bookings`);
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
createRandomBookings();

