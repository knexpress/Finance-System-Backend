/**
 * Script to create 10 dummy bookings (5 UAE_TO_PINAS and 5 PH_TO_UAE)
 * Usage: node scripts/create-dummy-bookings.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Booking } = require('../models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance';

// Sample data for bookings
const uaeToPinasBookings = [
  {
    customer_name: 'Ahmed Al Mansoori',
    customer_phone: '+971501234567',
    customer_email: 'ahmed.almansoori@example.com',
    origin_place: 'Dubai, UAE',
    destination_place: 'Manila, Philippines',
    service: 'UAE_TO_PINAS',
    service_code: 'UAE_TO_PINAS',
    sender: {
      fullName: 'Ahmed Al Mansoori',
      firstName: 'Ahmed',
      lastName: 'Al Mansoori',
      contactNo: '+971501234567',
      emailAddress: 'ahmed.almansoori@example.com',
      completeAddress: 'Business Bay, Dubai, UAE',
      city: 'Dubai',
      country: 'UAE'
    },
    receiver: {
      fullName: 'Maria Santos',
      firstName: 'Maria',
      lastName: 'Santos',
      contactNo: '+639171234567',
      emailAddress: 'maria.santos@example.com',
      completeAddress: 'Makati City, Metro Manila, Philippines',
      city: 'Manila',
      country: 'Philippines'
    },
    items: [
      { commodity: 'Electronics', quantity: 2, weight: 5.5 },
      { commodity: 'Clothing', quantity: 10, weight: 3.2 }
    ],
    weight: 8.7,
    review_status: 'not reviewed'
  },
  {
    customer_name: 'Fatima Al Zaabi',
    customer_phone: '+971502345678',
    customer_email: 'fatima.alzaabi@example.com',
    origin_place: 'Abu Dhabi, UAE',
    destination_place: 'Cebu, Philippines',
    service: 'UAE_TO_PINAS',
    service_code: 'UAE_TO_PINAS',
    sender: {
      fullName: 'Fatima Al Zaabi',
      firstName: 'Fatima',
      lastName: 'Al Zaabi',
      contactNo: '+971502345678',
      emailAddress: 'fatima.alzaabi@example.com',
      completeAddress: 'Al Khalidiyah, Abu Dhabi, UAE',
      city: 'Abu Dhabi',
      country: 'UAE'
    },
    receiver: {
      fullName: 'Juan Dela Cruz',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      contactNo: '+639182345678',
      emailAddress: 'juan.delacruz@example.com',
      completeAddress: 'Lahug, Cebu City, Philippines',
      city: 'Cebu',
      country: 'Philippines'
    },
    items: [
      { commodity: 'Food Items', quantity: 5, weight: 12.3 },
      { commodity: 'Personal Care', quantity: 8, weight: 4.1 }
    ],
    weight: 16.4,
    review_status: 'not reviewed'
  },
  {
    customer_name: 'Mohammed Al Shamsi',
    customer_phone: '+971503456789',
    customer_email: 'mohammed.alshamsi@example.com',
    origin_place: 'Sharjah, UAE',
    destination_place: 'Davao, Philippines',
    service: 'UAE_TO_PINAS',
    service_code: 'UAE_TO_PINAS',
    sender: {
      fullName: 'Mohammed Al Shamsi',
      firstName: 'Mohammed',
      lastName: 'Al Shamsi',
      contactNo: '+971503456789',
      emailAddress: 'mohammed.alshamsi@example.com',
      completeAddress: 'Al Qasimia, Sharjah, UAE',
      city: 'Sharjah',
      country: 'UAE'
    },
    receiver: {
      fullName: 'Ana Garcia',
      firstName: 'Ana',
      lastName: 'Garcia',
      contactNo: '+639193456789',
      emailAddress: 'ana.garcia@example.com',
      completeAddress: 'Bajada, Davao City, Philippines',
      city: 'Davao',
      country: 'Philippines'
    },
    items: [
      { commodity: 'Books', quantity: 15, weight: 6.8 },
      { commodity: 'Toys', quantity: 3, weight: 2.5 }
    ],
    weight: 9.3,
    review_status: 'not reviewed'
  },
  {
    customer_name: 'Sara Al Nuaimi',
    customer_phone: '+971504567890',
    customer_email: 'sara.alnuaimi@example.com',
    origin_place: 'Ajman, UAE',
    destination_place: 'Iloilo, Philippines',
    service: 'UAE_TO_PINAS',
    service_code: 'UAE_TO_PINAS',
    sender: {
      fullName: 'Sara Al Nuaimi',
      firstName: 'Sara',
      lastName: 'Al Nuaimi',
      contactNo: '+971504567890',
      emailAddress: 'sara.alnuaimi@example.com',
      completeAddress: 'Al Nuaimiya, Ajman, UAE',
      city: 'Ajman',
      country: 'UAE'
    },
    receiver: {
      fullName: 'Carlos Rodriguez',
      firstName: 'Carlos',
      lastName: 'Rodriguez',
      contactNo: '+639204567890',
      emailAddress: 'carlos.rodriguez@example.com',
      completeAddress: 'Jaro, Iloilo City, Philippines',
      city: 'Iloilo',
      country: 'Philippines'
    },
    items: [
      { commodity: 'Medicines', quantity: 20, weight: 1.5 },
      { commodity: 'Cosmetics', quantity: 12, weight: 3.8 }
    ],
    weight: 5.3,
    review_status: 'not reviewed'
  },
  {
    customer_name: 'Khalid Al Maktoum',
    customer_phone: '+971505678901',
    customer_email: 'khalid.almaktoum@example.com',
    origin_place: 'Ras Al Khaimah, UAE',
    destination_place: 'Bacolod, Philippines',
    service: 'UAE_TO_PINAS',
    service_code: 'UAE_TO_PINAS',
    sender: {
      fullName: 'Khalid Al Maktoum',
      firstName: 'Khalid',
      lastName: 'Al Maktoum',
      contactNo: '+971505678901',
      emailAddress: 'khalid.almaktoum@example.com',
      completeAddress: 'Al Nakheel, Ras Al Khaimah, UAE',
      city: 'Ras Al Khaimah',
      country: 'UAE'
    },
    receiver: {
      fullName: 'Liza Martinez',
      firstName: 'Liza',
      lastName: 'Martinez',
      contactNo: '+639215678901',
      emailAddress: 'liza.martinez@example.com',
      completeAddress: 'Mandurriao, Bacolod City, Philippines',
      city: 'Bacolod',
      country: 'Philippines'
    },
    items: [
      { commodity: 'Home Decor', quantity: 4, weight: 7.2 },
      { commodity: 'Kitchenware', quantity: 6, weight: 5.6 }
    ],
    weight: 12.8,
    review_status: 'not reviewed'
  }
];

const phToUaeBookings = [
  {
    customer_name: 'Roberto Tan',
    customer_phone: '+639171234567',
    customer_email: 'roberto.tan@example.com',
    origin_place: 'Manila, Philippines',
    destination_place: 'Dubai, UAE',
    service: 'PH_TO_UAE',
    service_code: 'PH_TO_UAE',
    sender: {
      fullName: 'Roberto Tan',
      firstName: 'Roberto',
      lastName: 'Tan',
      contactNo: '+639171234567',
      emailAddress: 'roberto.tan@example.com',
      completeAddress: 'Ortigas, Pasig City, Metro Manila, Philippines',
      city: 'Manila',
      country: 'Philippines'
    },
    receiver: {
      fullName: 'Youssef Al Hamadi',
      firstName: 'Youssef',
      lastName: 'Al Hamadi',
      contactNo: '+971501234567',
      emailAddress: 'youssef.alhamadi@example.com',
      completeAddress: 'Downtown Dubai, Dubai, UAE',
      city: 'Dubai',
      country: 'UAE'
    },
    items: [
      { commodity: 'Handicrafts', quantity: 8, weight: 10.5 },
      { commodity: 'Textiles', quantity: 5, weight: 7.8 }
    ],
    weight: 18.3,
    review_status: 'not reviewed'
  },
  {
    customer_name: 'Jennifer Lopez',
    customer_phone: '+639182345678',
    customer_email: 'jennifer.lopez@example.com',
    origin_place: 'Cebu, Philippines',
    destination_place: 'Abu Dhabi, UAE',
    service: 'PH_TO_UAE',
    service_code: 'PH_TO_UAE',
    sender: {
      fullName: 'Jennifer Lopez',
      firstName: 'Jennifer',
      lastName: 'Lopez',
      contactNo: '+639182345678',
      emailAddress: 'jennifer.lopez@example.com',
      completeAddress: 'IT Park, Cebu City, Philippines',
      city: 'Cebu',
      country: 'Philippines'
    },
    receiver: {
      fullName: 'Omar Al Suwaidi',
      firstName: 'Omar',
      lastName: 'Al Suwaidi',
      contactNo: '+971502345678',
      emailAddress: 'omar.alsuwaidi@example.com',
      completeAddress: 'Al Khalidiyah, Abu Dhabi, UAE',
      city: 'Abu Dhabi',
      country: 'UAE'
    },
    items: [
      { commodity: 'Furniture', quantity: 2, weight: 25.6 },
      { commodity: 'Artwork', quantity: 3, weight: 4.2 }
    ],
    weight: 29.8,
    review_status: 'not reviewed'
  },
  {
    customer_name: 'Michael Cruz',
    customer_phone: '+639193456789',
    customer_email: 'michael.cruz@example.com',
    origin_place: 'Davao, Philippines',
    destination_place: 'Sharjah, UAE',
    service: 'PH_TO_UAE',
    service_code: 'PH_TO_UAE',
    sender: {
      fullName: 'Michael Cruz',
      firstName: 'Michael',
      lastName: 'Cruz',
      contactNo: '+639193456789',
      emailAddress: 'michael.cruz@example.com',
      completeAddress: 'Buhangin, Davao City, Philippines',
      city: 'Davao',
      country: 'Philippines'
    },
    receiver: {
      fullName: 'Hassan Al Qasimi',
      firstName: 'Hassan',
      lastName: 'Al Qasimi',
      contactNo: '+971503456789',
      emailAddress: 'hassan.alqasimi@example.com',
      completeAddress: 'Al Majaz, Sharjah, UAE',
      city: 'Sharjah',
      country: 'UAE'
    },
    items: [
      { commodity: 'Electronics', quantity: 3, weight: 8.9 },
      { commodity: 'Accessories', quantity: 10, weight: 2.1 }
    ],
    weight: 11.0,
    review_status: 'not reviewed'
  },
  {
    customer_name: 'Patricia Reyes',
    customer_phone: '+639204567890',
    customer_email: 'patricia.reyes@example.com',
    origin_place: 'Iloilo, Philippines',
    destination_place: 'Ajman, UAE',
    service: 'PH_TO_UAE',
    service_code: 'PH_TO_UAE',
    sender: {
      fullName: 'Patricia Reyes',
      firstName: 'Patricia',
      lastName: 'Reyes',
      contactNo: '+639204567890',
      emailAddress: 'patricia.reyes@example.com',
      completeAddress: 'Mandurriao, Iloilo City, Philippines',
      city: 'Iloilo',
      country: 'Philippines'
    },
    receiver: {
      fullName: 'Noor Al Zaabi',
      firstName: 'Noor',
      lastName: 'Al Zaabi',
      contactNo: '+971504567890',
      emailAddress: 'noor.alzaabi@example.com',
      completeAddress: 'Al Nuaimiya, Ajman, UAE',
      city: 'Ajman',
      country: 'UAE'
    },
    items: [
      { commodity: 'Food Products', quantity: 12, weight: 15.3 },
      { commodity: 'Spices', quantity: 6, weight: 3.7 }
    ],
    weight: 19.0,
    review_status: 'not reviewed'
  },
  {
    customer_name: 'Daniel Villanueva',
    customer_phone: '+639215678901',
    customer_email: 'daniel.villanueva@example.com',
    origin_place: 'Bacolod, Philippines',
    destination_place: 'Ras Al Khaimah, UAE',
    service: 'PH_TO_UAE',
    service_code: 'PH_TO_UAE',
    sender: {
      fullName: 'Daniel Villanueva',
      firstName: 'Daniel',
      lastName: 'Villanueva',
      contactNo: '+639215678901',
      emailAddress: 'daniel.villanueva@example.com',
      completeAddress: 'Lacson Street, Bacolod City, Philippines',
      city: 'Bacolod',
      country: 'Philippines'
    },
    receiver: {
      fullName: 'Salem Al Nuaimi',
      firstName: 'Salem',
      lastName: 'Al Nuaimi',
      contactNo: '+971505678901',
      emailAddress: 'salem.alnuaimi@example.com',
      completeAddress: 'Al Nakheel, Ras Al Khaimah, UAE',
      city: 'Ras Al Khaimah',
      country: 'UAE'
    },
    items: [
      { commodity: 'Machinery Parts', quantity: 4, weight: 22.4 },
      { commodity: 'Tools', quantity: 8, weight: 6.8 }
    ],
    weight: 29.2,
    review_status: 'not reviewed'
  }
];

async function createDummyBookings() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const allBookings = [...uaeToPinasBookings, ...phToUaeBookings];
    const createdBookings = [];

    console.log('📦 Creating 10 dummy bookings...\n');

    for (let i = 0; i < allBookings.length; i++) {
      const bookingData = allBookings[i];
      try {
        const booking = new Booking(bookingData);
        await booking.save();
        createdBookings.push({
          id: booking._id,
          customer: bookingData.customer_name,
          service: bookingData.service_code,
          origin: bookingData.origin_place,
          destination: bookingData.destination_place
        });
        console.log(`✅ Created booking ${i + 1}/10: ${bookingData.customer_name} (${bookingData.service_code})`);
      } catch (error) {
        console.error(`❌ Failed to create booking ${i + 1}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total bookings created: ${createdBookings.length}/10`);
    console.log(`UAE_TO_PINAS: ${createdBookings.filter(b => b.service === 'UAE_TO_PINAS').length}`);
    console.log(`PH_TO_UAE: ${createdBookings.filter(b => b.service === 'PH_TO_UAE').length}`);
    console.log('\nCreated bookings:');
    createdBookings.forEach((booking, index) => {
      console.log(`  ${index + 1}. ${booking.customer} - ${booking.service} (${booking.origin} → ${booking.destination})`);
    });

    console.log('\n✅ All bookings created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
createDummyBookings();

