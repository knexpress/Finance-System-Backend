/**
 * Script to create 10 dummy bookings with pickup and delivery variations
 * - 5 UAE_TO_PH bookings with pickup and delivery variations
 * - 5 PH_TO_UAE bookings with delivery service variations only
 * Usage: node scripts/create-dummy-bookings-with-delivery.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Booking } = require('../models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance';

// UAE_TO_PH bookings with pickup and delivery variations
const uaeToPhBookings = [
  {
    customer_name: 'Ahmed Al Mansoori',
    customer_phone: '+971501234567',
    customer_email: 'ahmed.almansoori@example.com',
    origin_place: 'Dubai, UAE',
    destination_place: 'Manila, Philippines',
    service: 'UAE_TO_PH',
    service_code: 'UAE_TO_PH',
    sender: {
      fullName: 'Ahmed Al Mansoori',
      firstName: 'Ahmed',
      lastName: 'Al Mansoori',
      contactNo: '+971501234567',
      emailAddress: 'ahmed.almansoori@example.com',
      completeAddress: 'Business Bay, Dubai, UAE',
      addressLine1: 'Business Bay Tower',
      addressLine2: 'Floor 15, Office 1502',
      city: 'Dubai',
      country: 'UAE',
      deliveryOption: 'pickup' // Sender will drop off at warehouse
    },
    receiver: {
      fullName: 'Maria Santos',
      firstName: 'Maria',
      lastName: 'Santos',
      contactNo: '+639171234567',
      emailAddress: 'maria.santos@example.com',
      completeAddress: 'Makati City, Metro Manila, Philippines',
      addressLine1: '123 Ayala Avenue',
      addressLine2: 'Makati City',
      city: 'Manila',
      country: 'Philippines',
      deliveryOption: 'delivery' // Receiver wants home delivery
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
    service: 'UAE_TO_PH',
    service_code: 'UAE_TO_PH',
    sender: {
      fullName: 'Fatima Al Zaabi',
      firstName: 'Fatima',
      lastName: 'Al Zaabi',
      contactNo: '+971502345678',
      emailAddress: 'fatima.alzaabi@example.com',
      completeAddress: 'Al Khalidiyah, Abu Dhabi, UAE',
      addressLine1: 'Villa 45, Al Khalidiyah',
      city: 'Abu Dhabi',
      country: 'UAE',
      deliveryOption: 'delivery' // Sender wants pickup service
    },
    receiver: {
      fullName: 'Juan Dela Cruz',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      contactNo: '+639182345678',
      emailAddress: 'juan.delacruz@example.com',
      completeAddress: 'Lahug, Cebu City, Philippines',
      addressLine1: '456 IT Park Road',
      city: 'Cebu',
      country: 'Philippines',
      deliveryOption: 'pickup' // Receiver will pick up from warehouse
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
    service: 'UAE_TO_PH',
    service_code: 'UAE_TO_PH',
    sender: {
      fullName: 'Mohammed Al Shamsi',
      firstName: 'Mohammed',
      lastName: 'Al Shamsi',
      contactNo: '+971503456789',
      emailAddress: 'mohammed.alshamsi@example.com',
      completeAddress: 'Al Qasimia, Sharjah, UAE',
      addressLine1: 'Shop 12, Al Qasimia Mall',
      city: 'Sharjah',
      country: 'UAE',
      deliveryOption: 'warehouse' // Sender will bring to warehouse
    },
    receiver: {
      fullName: 'Ana Garcia',
      firstName: 'Ana',
      lastName: 'Garcia',
      contactNo: '+639193456789',
      emailAddress: 'ana.garcia@example.com',
      completeAddress: 'Bajada, Davao City, Philippines',
      addressLine1: '789 Bajada Street',
      city: 'Davao',
      country: 'Philippines',
      deliveryOption: 'delivery' // Receiver wants home delivery
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
    service: 'UAE_TO_PH',
    service_code: 'UAE_TO_PH',
    sender: {
      fullName: 'Sara Al Nuaimi',
      firstName: 'Sara',
      lastName: 'Al Nuaimi',
      contactNo: '+971504567890',
      emailAddress: 'sara.alnuaimi@example.com',
      completeAddress: 'Al Nuaimiya, Ajman, UAE',
      addressLine1: 'Villa 78, Al Nuaimiya',
      city: 'Ajman',
      country: 'UAE',
      deliveryOption: 'pickup' // Sender will drop off at warehouse
    },
    receiver: {
      fullName: 'Carlos Rodriguez',
      firstName: 'Carlos',
      lastName: 'Rodriguez',
      contactNo: '+639204567890',
      emailAddress: 'carlos.rodriguez@example.com',
      completeAddress: 'Jaro, Iloilo City, Philippines',
      addressLine1: '321 Jaro Plaza',
      city: 'Iloilo',
      country: 'Philippines',
      deliveryOption: 'warehouse' // Receiver will pick up from warehouse
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
    service: 'UAE_TO_PH',
    service_code: 'UAE_TO_PH',
    sender: {
      fullName: 'Khalid Al Maktoum',
      firstName: 'Khalid',
      lastName: 'Al Maktoum',
      contactNo: '+971505678901',
      emailAddress: 'khalid.almaktoum@example.com',
      completeAddress: 'Al Nakheel, Ras Al Khaimah, UAE',
      addressLine1: 'Office Building 5, Al Nakheel',
      city: 'Ras Al Khaimah',
      country: 'UAE',
      deliveryOption: 'delivery' // Sender wants pickup service
    },
    receiver: {
      fullName: 'Liza Martinez',
      firstName: 'Liza',
      lastName: 'Martinez',
      contactNo: '+639215678901',
      emailAddress: 'liza.martinez@example.com',
      completeAddress: 'Mandurriao, Bacolod City, Philippines',
      addressLine1: '654 Mandurriao Avenue',
      city: 'Bacolod',
      country: 'Philippines',
      deliveryOption: 'delivery' // Receiver wants home delivery
    },
    items: [
      { commodity: 'Home Decor', quantity: 4, weight: 7.2 },
      { commodity: 'Kitchenware', quantity: 6, weight: 5.6 }
    ],
    weight: 12.8,
    review_status: 'not reviewed'
  }
];

// PH_TO_UAE bookings with delivery service variations only
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
      addressLine1: '123 Ortigas Avenue',
      city: 'Manila',
      country: 'Philippines'
      // No sender deliveryOption for PH_TO_UAE
    },
    receiver: {
      fullName: 'Youssef Al Hamadi',
      firstName: 'Youssef',
      lastName: 'Al Hamadi',
      contactNo: '+971501234567',
      emailAddress: 'youssef.alhamadi@example.com',
      completeAddress: 'Downtown Dubai, Dubai, UAE',
      addressLine1: 'Burj Khalifa Area',
      addressLine2: 'Apartment 2501',
      city: 'Dubai',
      country: 'UAE',
      deliveryOption: 'delivery' // Receiver wants home delivery
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
      addressLine1: '456 IT Park Road',
      city: 'Cebu',
      country: 'Philippines'
      // No sender deliveryOption for PH_TO_UAE
    },
    receiver: {
      fullName: 'Omar Al Suwaidi',
      firstName: 'Omar',
      lastName: 'Al Suwaidi',
      contactNo: '+971502345678',
      emailAddress: 'omar.alsuwaidi@example.com',
      completeAddress: 'Al Khalidiyah, Abu Dhabi, UAE',
      addressLine1: 'Villa 23, Al Khalidiyah',
      city: 'Abu Dhabi',
      country: 'UAE',
      deliveryOption: 'pickup' // Receiver will pick up from warehouse
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
      addressLine1: '789 Buhangin Road',
      city: 'Davao',
      country: 'Philippines'
      // No sender deliveryOption for PH_TO_UAE
    },
    receiver: {
      fullName: 'Hassan Al Qasimi',
      firstName: 'Hassan',
      lastName: 'Al Qasimi',
      contactNo: '+971503456789',
      emailAddress: 'hassan.alqasimi@example.com',
      completeAddress: 'Al Majaz, Sharjah, UAE',
      addressLine1: 'Shop 45, Al Majaz Mall',
      city: 'Sharjah',
      country: 'UAE',
      deliveryOption: 'warehouse' // Receiver will pick up from warehouse
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
      addressLine1: '321 Mandurriao Street',
      city: 'Iloilo',
      country: 'Philippines'
      // No sender deliveryOption for PH_TO_UAE
    },
    receiver: {
      fullName: 'Noor Al Zaabi',
      firstName: 'Noor',
      lastName: 'Al Zaabi',
      contactNo: '+971504567890',
      emailAddress: 'noor.alzaabi@example.com',
      completeAddress: 'Al Nuaimiya, Ajman, UAE',
      addressLine1: 'Villa 67, Al Nuaimiya',
      city: 'Ajman',
      country: 'UAE',
      deliveryOption: 'delivery' // Receiver wants home delivery
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
      addressLine1: '654 Lacson Street',
      city: 'Bacolod',
      country: 'Philippines'
      // No sender deliveryOption for PH_TO_UAE
    },
    receiver: {
      fullName: 'Salem Al Nuaimi',
      firstName: 'Salem',
      lastName: 'Al Nuaimi',
      contactNo: '+971505678901',
      emailAddress: 'salem.alnuaimi@example.com',
      completeAddress: 'Al Nakheel, Ras Al Khaimah, UAE',
      addressLine1: 'Office 12, Al Nakheel Business Center',
      city: 'Ras Al Khaimah',
      country: 'UAE',
      deliveryOption: 'delivery' // Receiver wants home delivery
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

    const allBookings = [...uaeToPhBookings, ...phToUaeBookings];
    const createdBookings = [];

    console.log('📦 Creating 10 dummy bookings with delivery variations...\n');

    for (let i = 0; i < allBookings.length; i++) {
      const bookingData = allBookings[i];
      try {
        const booking = new Booking(bookingData);
        await booking.save();
        
        const senderOption = bookingData.sender?.deliveryOption || 'N/A';
        const receiverOption = bookingData.receiver?.deliveryOption || 'N/A';
        
        createdBookings.push({
          id: booking._id,
          customer: bookingData.customer_name,
          service: bookingData.service_code,
          origin: bookingData.origin_place,
          destination: bookingData.destination_place,
          senderOption: senderOption,
          receiverOption: receiverOption
        });
        
        console.log(`✅ Created booking ${i + 1}/10: ${bookingData.customer_name} (${bookingData.service_code})`);
        console.log(`   Sender: ${senderOption} | Receiver: ${receiverOption}`);
      } catch (error) {
        console.error(`❌ Failed to create booking ${i + 1}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total bookings created: ${createdBookings.length}/10`);
    console.log(`UAE_TO_PH: ${createdBookings.filter(b => b.service === 'UAE_TO_PH').length}`);
    console.log(`PH_TO_UAE: ${createdBookings.filter(b => b.service === 'PH_TO_UAE').length}`);
    console.log('\n📋 UAE_TO_PH Bookings (with pickup & delivery variations):');
    createdBookings
      .filter(b => b.service === 'UAE_TO_PH')
      .forEach((booking, index) => {
        console.log(`  ${index + 1}. ${booking.customer}`);
        console.log(`     Route: ${booking.origin} → ${booking.destination}`);
        console.log(`     Sender: ${booking.senderOption} | Receiver: ${booking.receiverOption}`);
      });
    console.log('\n📋 PH_TO_UAE Bookings (with delivery variations only):');
    createdBookings
      .filter(b => b.service === 'PH_TO_UAE')
      .forEach((booking, index) => {
        console.log(`  ${index + 1}. ${booking.customer}`);
        console.log(`     Route: ${booking.origin} → ${booking.destination}`);
        console.log(`     Receiver: ${booking.receiverOption}`);
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

