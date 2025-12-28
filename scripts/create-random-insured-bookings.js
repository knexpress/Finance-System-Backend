const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance';

// Sample names for random generation
const firstNames = ['Maria', 'Juan', 'Anna', 'Carlos', 'Sofia', 'Miguel', 'Isabella', 'Diego', 'Elena', 'Fernando', 'Carmen', 'Ricardo', 'Laura', 'Jose', 'Patricia', 'Luis', 'Monica', 'Roberto', 'Andrea', 'Francisco'];
const lastNames = ['Santos', 'Dela Cruz', 'Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Flores', 'Rivera', 'Gomez', 'Diaz', 'Reyes', 'Cruz', 'Morales', 'Ortiz', 'Ramos'];

// Generate random name
function getRandomName() {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return { firstName, lastName, fullName: `${firstName} ${lastName}` };
}

// Generate random phone number
function getRandomPhone(countryCode) {
  const number = Math.floor(100000000 + Math.random() * 900000000);
  return `${countryCode}${number}`;
}

// Generate random AWB
function getRandomAWB() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let awb = 'AEFC';
  for (let i = 0; i < 11; i++) {
    awb += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return awb;
}

// Generate random reference number
function getRandomReferenceNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let ref = 'KNX';
  for (let i = 0; i < 9; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

async function createRandomInsuredBookings(count = 10) {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get Booking model (using flexible schema)
    const Booking = mongoose.models.Booking || mongoose.model('Booking', new mongoose.Schema({}, { strict: false, timestamps: true }));

    const createdBookings = [];

    for (let i = 0; i < count; i++) {
      const sender = getRandomName();
      const receiver = getRandomName();
      const senderPhone = getRandomPhone('+971');
      const receiverPhone = getRandomPhone('+63');
      
      const booking = {
        referenceNumber: getRandomReferenceNumber(),
        awb: getRandomAWB(),
        service: 'uae-to-pinas',
        
        sender: {
          fullName: sender.fullName,
          firstName: sender.firstName,
          lastName: sender.lastName,
          emailAddress: `${sender.firstName.toLowerCase()}.${sender.lastName.toLowerCase().replace(' ', '')}@example.com`,
          agentName: 'Jhenn',
          completeAddress: `Dubai ${Math.floor(Math.random() * 100) + 1} Street, Building ${Math.floor(Math.random() * 50) + 1}`,
          country: 'UNITED ARAB EMIRATES',
          emirates: null,
          city: null,
          district: null,
          zone: null,
          landmark: null,
          addressLine1: `Dubai ${Math.floor(Math.random() * 100) + 1} Street, Building ${Math.floor(Math.random() * 50) + 1}`,
          dialCode: '+971',
          phoneNumber: senderPhone.substring(4),
          contactNo: senderPhone,
          deliveryOption: ['pickup', 'delivery'][Math.floor(Math.random() * 2)],
          insured: true, // ✅ Always true for these bookings
          formFillerLatitude: 25.0 + Math.random() * 0.5,
          formFillerLongitude: 55.0 + Math.random() * 0.5
        },
        
        receiver: {
          fullName: receiver.fullName,
          firstName: receiver.firstName,
          lastName: receiver.lastName,
          emailAddress: `${receiver.firstName.toLowerCase()}.${receiver.lastName.toLowerCase().replace(' ', '')}@example.com`,
          completeAddress: `${Math.floor(Math.random() * 100) + 1} Main Street, Barangay ${receiver.lastName}, Quezon City`,
          country: 'PHILIPPINES',
          region: null,
          province: null,
          city: null,
          barangay: null,
          landmark: null,
          addressLine1: `${Math.floor(Math.random() * 100) + 1} Main Street, Barangay ${receiver.lastName}, Quezon City`,
          dialCode: '+63',
          phoneNumber: receiverPhone.substring(3),
          contactNo: receiverPhone,
          deliveryOption: 'delivery'
        },
        
        items: [
          {
            description: 'Personal items and documents',
            quantity: Math.floor(Math.random() * 5) + 1,
            weight: (Math.random() * 20 + 1).toFixed(2),
            value: Math.floor(Math.random() * 10000) + 1000
          }
        ],
        
        identityDocuments: {
          eidFrontImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgA...',
          eidBackImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgA...',
          eidFrontImageFirstName: sender.firstName,
          eidFrontImageLastName: sender.lastName,
          philippinesIdFront: 'data:image/jpeg;base64,/9j/2wCEAAUGBgsICwsLCwsNCwsLDQ4ODQ0ODg8NDg4ODQ8...',
          philippinesIdBack: 'data:image/jpeg;base64,/9j/2wCEAAoJCREMEREREREaExQTGhsbFxcbGx4ZGxsbGR4...',
          customerImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgA...'
        },
        
        customerImages: [
          'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgA...'
        ],
        
        eidVerification: {
          isEmiratesId: true,
          isFrontSide: true,
          isBackSide: true,
          verificationMessage: 'Valid Emirates ID front side detected. Valid Emirates ID back side detected.'
        },
        
        otpVerification: {
          phoneNumber: senderPhone,
          otp: Math.floor(100000 + Math.random() * 900000).toString(),
          verified: true,
          verifiedAt: new Date()
        },
        
        additionalDetails: null,
        termsAccepted: true,
        submittedAt: new Date(),
        submissionTimestamp: new Date().toISOString(),
        status: 'pending',
        source: 'web',
        review_status: 'reviewed',
        reviewed_at: new Date(),
        reviewed_by_employee_id: new mongoose.Types.ObjectId('68f38205941695ddb6a193b5'),
        updatedAt: new Date()
      };

      const bookingDoc = new Booking(booking);
      const savedBooking = await bookingDoc.save();
      createdBookings.push(savedBooking);
      
      console.log(`✅ Created booking ${i + 1}/${count}: ${savedBooking.referenceNumber} (insured: ${savedBooking.sender?.insured})`);
    }

    console.log('\n✅ All bookings created successfully!');
    console.log(`📋 Summary:`);
    console.log(`   Total bookings: ${createdBookings.length}`);
    console.log(`   All with insured: true`);
    console.log(`   Service: uae-to-pinas`);
    console.log(`   Review status: reviewed`);
    
    console.log('\n📋 Booking Details:');
    createdBookings.forEach((booking, index) => {
      console.log(`   ${index + 1}. ${booking.referenceNumber} - ${booking.sender?.fullName} → ${booking.receiver?.fullName} (AWB: ${booking.awb})`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
    return createdBookings;
  } catch (error) {
    console.error('❌ Error creating random insured bookings:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  const count = parseInt(process.argv[2]) || 10;
  createRandomInsuredBookings(count)
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createRandomInsuredBookings };

