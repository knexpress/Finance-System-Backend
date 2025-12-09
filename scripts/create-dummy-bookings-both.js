require('dotenv').config();
const mongoose = require('mongoose');
const { Booking } = require('../models');

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('Missing MONGODB_URI/MONGO_URI');
  process.exit(1);
}

function randFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function generateAWB(prefix) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix;
  for (let i = 0; i < 15; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function generateReferenceNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'KNX';
  for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

const uaeSenders = [
  {
    fullName: 'Ahmed Al Mansoori',
    city: 'Dubai',
    emirates: 'Dubai',
    addressLine1: 'Dubai Marina, Tower 3, Apt 1204',
    phone: '501112233',
    agentName: 'DXB Hub'
  },
  {
    fullName: 'Fatima Al Zaabi',
    city: 'Abu Dhabi',
    emirates: 'Abu Dhabi',
    addressLine1: 'Al Khalidiyah, Villa 21',
    phone: '502223344',
    agentName: 'AUH Hub'
  },
  {
    fullName: 'Omar Al Hameli',
    city: 'Sharjah',
    emirates: 'Sharjah',
    addressLine1: 'Al Majaz, Tower 5, Apt 901',
    phone: '503334455',
    agentName: 'SHJ Hub'
  },
  {
    fullName: 'Layla Al Suwaidi',
    city: 'Ajman',
    emirates: 'Ajman',
    addressLine1: 'Al Nuaimiya, Villa 10',
    phone: '504445566',
    agentName: 'AJM Hub'
  },
  {
    fullName: 'Khalid Al Maktoum',
    city: 'Ras Al Khaimah',
    emirates: 'Ras Al Khaimah',
    addressLine1: 'Al Nakheel, Building 2, Apt 402',
    phone: '505556677',
    agentName: 'RAK Hub'
  }
];

const phReceivers = [
  { fullName: 'Maria Santos', city: 'Makati City', address: '123 Ayala Ave, Makati' },
  { fullName: 'Juan Dela Cruz', city: 'Quezon City', address: '456 EDSA, QC' },
  { fullName: 'Ana Garcia', city: 'Pasig City', address: '789 Ortigas Ave, Pasig' },
  { fullName: 'Carlos Rodriguez', city: 'Manila', address: '321 Taft Ave, Manila' },
  { fullName: 'Sofia Martinez', city: 'Cebu City', address: '888 Osmeña Blvd, Cebu' }
];

const phSenders = [
  { fullName: 'Liza Dela Cruz', city: 'Makati', address: '12 Ayala Ave, Makati', phone: '917111222', agent: 'Makati Hub' },
  { fullName: 'Mark Santos', city: 'Manila', address: '45 Taft Ave, Manila', phone: '918222333', agent: 'Manila Hub' },
  { fullName: 'Joanna Reyes', city: 'Cebu City', address: '78 Osmeña Blvd, Cebu', phone: '915333444', agent: 'Cebu Hub' },
  { fullName: 'Paolo Gutierrez', city: 'Davao City', address: '9 JP Laurel Ave, Davao', phone: '919444555', agent: 'Davao Hub' },
  { fullName: 'Mia Flores', city: 'Baguio', address: '23 Session Rd, Baguio', phone: '917555666', agent: 'Baguio Hub' }
];

const uaeReceivers = [
  { fullName: 'Hessa Al Mansouri', city: 'Dubai', address: 'Dubai Marina, Tower 9, Apt 703', phone: '501987654' },
  { fullName: 'Abdullah Al Falasi', city: 'Abu Dhabi', address: 'Al Khalidiyah, Villa 22', phone: '502876543' },
  { fullName: 'Mariam Al Shehhi', city: 'Sharjah', address: 'Al Majaz, Tower 4, Apt 1204', phone: '503765432' },
  { fullName: 'Salem Al Nuaimi', city: 'Ajman', address: 'Ajman One, Tower B, Apt 605', phone: '504654321' },
  { fullName: 'Yousef Al Ameri', city: 'Ras Al Khaimah', address: 'Al Nakheel, Building 7, Apt 301', phone: '505543210' }
];

const commoditiesUaeToPh = [
  { commodity: 'Electronics', qty: 2, description: 'Mobiles and accessories' },
  { commodity: 'Clothing', qty: 6, description: 'Casual and formal wear' },
  { commodity: 'Documents', qty: 1, description: 'Papers and certificates' },
  { commodity: 'Personal Items', qty: 3, description: 'Gifts and souvenirs' },
  { commodity: 'Accessories', qty: 5, description: 'Chargers and cables' }
];

const commoditiesPhToUae = [
  { commodity: 'Gifts', qty: 2, description: 'Handmade gifts' },
  { commodity: 'Food Items', qty: 3, description: 'Packaged snacks' },
  { commodity: 'Clothing', qty: 4, description: 'Casual wear' },
  { commodity: 'Documents', qty: 1, description: 'Paperwork' },
  { commodity: 'Accessories', qty: 2, description: 'Small accessories' }
];

function makeUaeToPhBooking(i) {
  const sender = uaeSenders[i];
  const receiver = phReceivers[i];
  const insured = randFrom([true, false, true]); // bias slightly toward insured
  const declared = insured ? randFrom([800, 1500, 2500, 3200]) : 0;
  const insuranceAmount = insured ? Math.max(50, Math.round((declared * 0.01) || 0)) : 0;

  return {
    referenceNumber: generateReferenceNumber(),
    awb: generateAWB('AE'),
    service: 'uae-to-pinas',
    sender: {
      fullName: sender.fullName,
      firstName: sender.fullName.split(' ')[0],
      lastName: sender.fullName.split(' ').slice(1).join(' ') || sender.fullName.split(' ')[0],
      emailAddress: `${sender.fullName.split(' ')[0].toLowerCase()}.${sender.city.toLowerCase()}@example.com`,
      agentName: sender.agentName,
      completeAddress: sender.addressLine1,
      country: 'UNITED ARAB EMIRATES',
      emirates: sender.emirates,
      city: sender.city,
      addressLine1: sender.addressLine1,
      dialCode: '+971',
      phoneNumber: sender.phone,
      contactNo: `+971${sender.phone}`,
      deliveryOption: randFrom(['pickup', 'warehouse']),
      insured,
      declaredAmount: declared,
      insurance_amount: insuranceAmount
    },
    receiver: {
      fullName: receiver.fullName,
      firstName: receiver.fullName.split(' ')[0],
      lastName: receiver.fullName.split(' ').slice(1).join(' ') || receiver.fullName.split(' ')[0],
      emailAddress: `${receiver.fullName.split(' ')[0].toLowerCase()}.${receiver.city.toLowerCase()}@example.com`,
      completeAddress: receiver.address,
      country: 'PHILIPPINES',
      city: receiver.city,
      addressLine1: receiver.address,
      dialCode: '+63',
      phoneNumber: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      contactNo: `+63${Math.floor(9000000000 + Math.random() * 99999999)}`,
      deliveryOption: 'delivery'
    },
    items: commoditiesUaeToPh.map((c, idx) => ({
      commodity: c.commodity,
      qty: c.qty,
      description: `${c.description} #${idx + 1}`
    })),
    insurance: insured ? { option: 'percent', rate: 1, amount: insuranceAmount } : undefined,
    identityDocuments: {
      eidFrontImage: 'data:image/jpeg;base64,dummy_eid_front',
      eidBackImage: 'data:image/jpeg;base64,dummy_eid_back'
    },
    otpVerification: {
      otp: `${Math.floor(100000 + Math.random() * 900000)}`,
      verified: true,
      verifiedAt: new Date(),
      phoneNumber: `+971${sender.phone}`
    },
    termsAccepted: true,
    submittedAt: new Date(),
    submissionTimestamp: new Date().toISOString(),
    status: 'pending',
    source: 'web',
    review_status: 'not reviewed'
  };
}

function makePhToUaeBooking(i) {
  const sender = phSenders[i];
  const receiver = uaeReceivers[i];
  return {
    referenceNumber: generateReferenceNumber(),
    awb: generateAWB('PH'),
    service: 'ph-to-uae',
    sender: {
      fullName: sender.fullName,
      firstName: sender.fullName.split(' ')[0],
      lastName: sender.fullName.split(' ').slice(1).join(' ') || sender.fullName.split(' ')[0],
      emailAddress: `${sender.fullName.split(' ')[0].toLowerCase()}.${sender.city.toLowerCase()}@example.com`,
      agentName: sender.agent,
      completeAddress: sender.address,
      country: 'PHILIPPINES',
      city: sender.city,
      addressLine1: sender.address,
      dialCode: '+63',
      phoneNumber: sender.phone,
      contactNo: `+63${sender.phone}`,
      deliveryOption: 'pickup', // PH side pickup
      insured: false, // Insurance disabled for PH->UAE
      declaredAmount: 0
    },
    receiver: {
      fullName: receiver.fullName,
      firstName: receiver.fullName.split(' ')[0],
      lastName: receiver.fullName.split(' ').slice(1).join(' ') || receiver.fullName.split(' ')[0],
      emailAddress: `${receiver.fullName.split(' ')[0].toLowerCase()}.${receiver.city.toLowerCase()}@example.com`,
      completeAddress: receiver.address,
      country: 'UNITED ARAB EMIRATES',
      city: receiver.city,
      addressLine1: receiver.address,
      dialCode: '+971',
      phoneNumber: receiver.phone,
      contactNo: `+971${receiver.phone}`,
      deliveryOption: 'delivery'
    },
    items: commoditiesPhToUae.map((c, idx) => ({
      commodity: c.commodity,
      qty: c.qty,
      description: `${c.description} #${idx + 1}`
    })),
    otpVerification: {
      otp: `${Math.floor(100000 + Math.random() * 900000)}`,
      verified: true,
      verifiedAt: new Date(),
      phoneNumber: `+63${sender.phone}`
    },
    termsAccepted: true,
    submittedAt: new Date(),
    submissionTimestamp: new Date().toISOString(),
    status: 'pending',
    source: 'web',
    review_status: 'not reviewed'
  };
}

const dummyBookings = [
  ...[0,1,2,3,4].map(makeUaeToPhBooking),
  ...[0,1,2,3,4].map(makePhToUaeBooking)
];

(async () => {
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const created = await Booking.insertMany(dummyBookings);
    console.log(`✅ Inserted ${created.length} dummy bookings (5 UAE→PH, 5 PH→UAE)`);
    created.forEach((b, i) => {
      console.log(`${i + 1}. ${b.service} | Ref: ${b.referenceNumber} | AWB: ${b.awb} | Sender: ${b.sender?.fullName} | Receiver: ${b.receiver?.fullName}`);
    });

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (err) {
    console.error('❌ Error inserting dummy bookings:', err);
    process.exit(1);
  }
})();


