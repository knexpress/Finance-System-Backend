/**
 * Script to check for bookings that haven't been reviewed yet
 * Usage: node scripts/check-unreviewed-bookings.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Booking } = require('../models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance';

async function checkUnreviewedBookings() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Query for unreviewed bookings
    // This includes bookings where review_status is 'not reviewed' or doesn't exist
    const unreviewedBookings = await Booking.find({
      $or: [
        { review_status: 'not reviewed' },
        { review_status: { $exists: false } },
        { review_status: null }
      ]
    })
    .select('_id customer_name customer_phone customer_email service service_code review_status createdAt sender receiver items weight')
    .sort({ createdAt: -1 })
    .lean();

    const totalUnreviewed = unreviewedBookings.length;

    console.log('='.repeat(80));
    console.log(`📊 UNREVIEWED BOOKINGS REPORT`);
    console.log('='.repeat(80));
    console.log(`\nTotal unreviewed bookings: ${totalUnreviewed}\n`);

    if (totalUnreviewed === 0) {
      console.log('✅ All bookings have been reviewed!\n');
    } else {
      console.log('📋 Unreviewed Bookings List:\n');
      console.log('-'.repeat(80));
      
      unreviewedBookings.forEach((booking, index) => {
        console.log(`\n${index + 1}. Booking ID: ${booking._id}`);
        console.log(`   Customer: ${booking.customer_name || booking.sender?.fullName || booking.sender?.name || 'N/A'}`);
        console.log(`   Phone: ${booking.customer_phone || booking.sender?.contactNo || booking.sender?.phone || 'N/A'}`);
        console.log(`   Email: ${booking.customer_email || booking.sender?.emailAddress || booking.sender?.email || 'N/A'}`);
        console.log(`   Service: ${booking.service || booking.service_code || 'N/A'}`);
        console.log(`   Weight: ${booking.weight || 'N/A'} kg`);
        console.log(`   Items: ${booking.items?.length || 0} item(s)`);
        console.log(`   Review Status: ${booking.review_status || 'NOT SET'}`);
        console.log(`   Created At: ${booking.createdAt ? new Date(booking.createdAt).toLocaleString() : 'N/A'}`);
        console.log('-'.repeat(80));
      });

      // Summary by service
      const summaryByService = {};
      unreviewedBookings.forEach(booking => {
        const service = booking.service || booking.service_code || 'UNKNOWN';
        summaryByService[service] = (summaryByService[service] || 0) + 1;
      });

      console.log('\n📊 Summary by Service:');
      console.log('-'.repeat(80));
      Object.entries(summaryByService).forEach(([service, count]) => {
        console.log(`   ${service}: ${count} booking(s)`);
      });
    }

    // Also check total bookings count for reference
    const totalBookings = await Booking.countDocuments({});
    const reviewedBookings = await Booking.countDocuments({
      review_status: { $in: ['reviewed', 'rejected'] }
    });

    console.log('\n' + '='.repeat(80));
    console.log('📈 OVERALL STATISTICS:');
    console.log('='.repeat(80));
    console.log(`   Total Bookings: ${totalBookings}`);
    console.log(`   Reviewed/Rejected: ${reviewedBookings}`);
    console.log(`   Unreviewed: ${totalUnreviewed}`);
    console.log(`   Review Rate: ${totalBookings > 0 ? ((reviewedBookings / totalBookings) * 100).toFixed(2) : 0}%`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error checking unreviewed bookings:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run the script
checkUnreviewedBookings();

