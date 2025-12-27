require('dotenv').config();
const mongoose = require('mongoose');
const { InvoiceRequest } = require('../models');

/**
 * Script to create compound index for Finance department queries
 * Index: { status: 1, delivery_status: 1, createdAt: -1 }
 * This optimizes queries filtering by status='VERIFIED' and excluding CANCELLED shipments
 */
async function createIndex() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment variables');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      readPreference: 'primaryPreferred'
    });
    console.log('✅ Connected to MongoDB\n');

    // Get the collection using the model's collection name
    const collection = InvoiceRequest.collection;
    
    // Check if index already exists
    const indexes = await collection.indexes();
    const indexName = 'status_1_delivery_status_1_createdAt_-1';
    const indexExists = indexes.some(idx => 
      idx.name === indexName || 
      (idx.key && 
       idx.key.status === 1 && 
       idx.key.delivery_status === 1 && 
       idx.key.createdAt === -1)
    );

    if (indexExists) {
      console.log('ℹ️  Index already exists. Skipping creation.');
      console.log('   Index:', indexName);
    } else {
      console.log('📊 Creating compound index for Finance department queries...');
      console.log('   Index: { status: 1, delivery_status: 1, createdAt: -1 }');
      
      // Create the compound index
      await collection.createIndex(
        { status: 1, delivery_status: 1, createdAt: -1 },
        { 
          name: indexName,
          background: true // Create index in background to avoid blocking
        }
      );
      
      console.log('✅ Index created successfully!');
      console.log('   This index optimizes queries for:');
      console.log('   - status = VERIFIED');
      console.log('   - delivery_status != CANCELLED');
      console.log('   - Sorted by createdAt (descending)');
    }

    // List all indexes for verification
    console.log('\n📋 Current indexes on invoice_requests collection:');
    const allIndexes = await collection.indexes();
    allIndexes.forEach((idx, i) => {
      console.log(`   ${i + 1}. ${idx.name}:`, JSON.stringify(idx.key));
    });

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error creating index:', error);
    process.exit(1);
  }
}

// Run the script
createIndex();

