/**
 * Script to cancel a shipment in EMPOST
 * Usage: node scripts/cancel-empost-shipment.js <tracking_number>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const empostAPI = require('../services/empost-api');

// Get tracking number from command line argument
const trackingNumber = process.argv[2];

if (!trackingNumber) {
  console.error('❌ Error: Please provide a tracking number');
  console.log('Usage: node scripts/cancel-empost-shipment.js <tracking_number>');
  console.log('Example: node scripts/cancel-empost-shipment.js PHABKXN1ZU2IZ48HN');
  process.exit(1);
}

async function cancelShipment() {
  try {
    console.log(`🔄 Cancelling EMPOST shipment: ${trackingNumber}`);
    
    // Update shipment status to CANCELLED
    const result = await empostAPI.updateShipmentStatus(trackingNumber, 'CANCELLED', {
      notes: 'Shipment cancelled via script'
    });
    
    console.log('✅ Shipment cancelled successfully in EMPOST');
    console.log('📦 Response:', JSON.stringify(result, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to cancel shipment in EMPOST:');
    console.error('   Error:', error.message);
    if (error.response) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the script
cancelShipment();

