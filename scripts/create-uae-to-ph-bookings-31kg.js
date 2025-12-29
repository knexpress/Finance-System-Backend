/**
 * Script to create 2 sample booking requests for UAE_TO_PH service
 * Requirements:
 * - Weight: 31 kgs for both
 * - Both should have delivery required and pickup required
 * - One booking should be within Metro Manila
 * - One booking should be outside Metro Manila
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Booking } = require('../models');

// Metro Manila cities
const METRO_MANILA_CITIES = [
  'Manila', 'Makati', 'Quezon City', 'Pasig', 'Taguig', 
  'Mandaluyong', 'San Juan', 'Pasay', 'Las Piñas', 'Parañaque',
  'Muntinlupa', 'Marikina', 'Caloocan', 'Valenzuela', 'Malabon',
  'Navotas', 'Pateros'
];

// Outside Metro Manila cities (example)
const OUTSIDE_MANILA_CITIES = [
  'Cebu City', 'Davao City', 'Bacolod', 'Iloilo City', 'Baguio',
  'Cagayan de Oro', 'Zamboanga City', 'Batangas City', 'Laguna', 'Cavite'
];

async function createBookings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Generate unique tracking codes
    const timestamp = Date.now();
    const trackingCode1 = `PHWA${timestamp.toString().slice(-10)}XUYZ`;
    const trackingCode2 = `PHWA${(timestamp + 1).toString().slice(-10)}XUYZ`;

    // Booking 1: Within Metro Manila
    const booking1 = {
      // Tracking information
      tracking_code: trackingCode1,
      awb_number: trackingCode1,
      awb: trackingCode1,
      
      // Service information
      service_code: 'UAE_TO_PH',
      service: 'UAE_TO_PH',
      
      // Weight information
      weight: 31,
      weight_kg: 31,
      weightKg: 31,
      
      // Sender information (UAE)
      sender: {
        firstName: 'Ahmed',
        lastName: 'Al-Mansoori',
        name: 'Ahmed Al-Mansoori',
        phone: '+971501234567',
        email: 'ahmed.almansoori@example.com',
        address: '123 Sheikh Zayed Road, Dubai, UAE',
        city: 'Dubai',
        country: 'UAE',
        countryCode: 'AE'
      },
      customer_name: 'Ahmed Al-Mansoori',
      
      // Receiver information (Metro Manila)
      receiver: {
        firstName: 'Maria',
        lastName: 'Santos',
        name: 'Maria Santos',
        phone: '+639171234567',
        email: 'maria.santos@example.com',
        address: '456 Rizal Avenue, Makati City, Metro Manila',
        city: 'Makati',
        province: 'Metro Manila',
        country: 'Philippines',
        countryCode: 'PH'
      },
      receiver_name: 'Maria Santos',
      
      // Origin and destination
      origin_place: 'Dubai, UAE',
      destination_place: 'Makati, Metro Manila, Philippines',
      origin: 'Dubai',
      destination: 'Makati',
      
      // Delivery and pickup options
      sender_delivery_option: 'pickup',
      receiver_delivery_option: 'delivery',
      has_delivery: true,
      has_pickup: true,
      
      // Shipment details
      shipment_type: 'Non-Document',
      number_of_boxes: 2,
      boxes_count: 2,
      
      // Dimensions (calculated for 31 kg)
      length: 50,
      width: 40,
      height: 35,
      dimensions: {
        length: 50,
        width: 40,
        height: 35,
        unit: 'CM'
      },
      
      // Status
      status: 'pending',
      review_status: 'not reviewed',
      
      // Additional information
      notes: 'Sample booking 1: Within Metro Manila - 31 kgs with pickup and delivery',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Booking 2: Outside Metro Manila
    const booking2 = {
      // Tracking information
      tracking_code: trackingCode2,
      awb_number: trackingCode2,
      awb: trackingCode2,
      
      // Service information
      service_code: 'UAE_TO_PH',
      service: 'UAE_TO_PH',
      
      // Weight information
      weight: 31,
      weight_kg: 31,
      weightKg: 31,
      
      // Sender information (UAE)
      sender: {
        firstName: 'Fatima',
        lastName: 'Al-Zahra',
        name: 'Fatima Al-Zahra',
        phone: '+971502345678',
        email: 'fatima.alzahra@example.com',
        address: '789 Jumeirah Beach Road, Dubai, UAE',
        city: 'Dubai',
        country: 'UAE',
        countryCode: 'AE'
      },
      customer_name: 'Fatima Al-Zahra',
      
      // Receiver information (Outside Metro Manila - Cebu)
      receiver: {
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        name: 'Juan Dela Cruz',
        phone: '+639172345678',
        email: 'juan.delacruz@example.com',
        address: '789 Colon Street, Cebu City, Cebu',
        city: 'Cebu City',
        province: 'Cebu',
        country: 'Philippines',
        countryCode: 'PH'
      },
      receiver_name: 'Juan Dela Cruz',
      
      // Origin and destination
      origin_place: 'Dubai, UAE',
      destination_place: 'Cebu City, Cebu, Philippines',
      origin: 'Dubai',
      destination: 'Cebu City',
      
      // Delivery and pickup options
      sender_delivery_option: 'pickup',
      receiver_delivery_option: 'delivery',
      has_delivery: true,
      has_pickup: true,
      
      // Shipment details
      shipment_type: 'Non-Document',
      number_of_boxes: 2,
      boxes_count: 2,
      
      // Dimensions (calculated for 31 kg)
      length: 50,
      width: 40,
      height: 35,
      dimensions: {
        length: 50,
        width: 40,
        height: 35,
        unit: 'CM'
      },
      
      // Status
      status: 'pending',
      review_status: 'not reviewed',
      
      // Additional information
      notes: 'Sample booking 2: Outside Metro Manila (Cebu) - 31 kgs with pickup and delivery',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create bookings
    console.log('\n📦 Creating booking 1 (Within Metro Manila)...');
    const createdBooking1 = await Booking.create(booking1);
    console.log('✅ Booking 1 created:', {
      _id: createdBooking1._id,
      tracking_code: createdBooking1.tracking_code,
      receiver: createdBooking1.receiver?.name || createdBooking1.receiver_name,
      destination: createdBooking1.destination_place,
      weight: createdBooking1.weight,
      has_pickup: createdBooking1.has_pickup,
      has_delivery: createdBooking1.has_delivery
    });

    console.log('\n📦 Creating booking 2 (Outside Metro Manila)...');
    const createdBooking2 = await Booking.create(booking2);
    console.log('✅ Booking 2 created:', {
      _id: createdBooking2._id,
      tracking_code: createdBooking2.tracking_code,
      receiver: createdBooking2.receiver?.name || createdBooking2.receiver_name,
      destination: createdBooking2.destination_place,
      weight: createdBooking2.weight,
      has_pickup: createdBooking2.has_pickup,
      has_delivery: createdBooking2.has_delivery
    });

    console.log('\n✅ Successfully created 2 booking requests:');
    console.log(`   Booking 1: ${createdBooking1.tracking_code} - Metro Manila (Makati)`);
    console.log(`   Booking 2: ${createdBooking2.tracking_code} - Outside Metro Manila (Cebu)`);
    console.log(`   Both bookings: 31 kgs, pickup required, delivery required`);

  } catch (error) {
    console.error('❌ Error creating bookings:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  createBookings()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createBookings };

