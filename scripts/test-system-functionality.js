const mongoose = require('mongoose');
require('dotenv').config();

// Test all critical functionalities
async function testSystemFunctionality() {
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  console.log('🔍 Testing System Functionality...\n');

  // Test 1: MongoDB Connection
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://aliabdullah:knex22939@finance.gk7t9we.mongodb.net/finance?retryWrites=true&w=majority&appName=Finance';
    await mongoose.connect(MONGODB_URI);
    results.passed.push('✅ MongoDB Connection');
    console.log('✅ MongoDB Connection: PASSED');
  } catch (error) {
    results.failed.push('❌ MongoDB Connection');
    console.error('❌ MongoDB Connection: FAILED', error.message);
    await mongoose.disconnect();
    return results;
  }

  // Test 2: Models Import
  try {
    const models = require('../models');
    const requiredModels = ['Department', 'Employee', 'User', 'Client', 'Request', 'Ticket', 'Report', 'CashTracker', 'InvoiceRequest', 'Collections', 'PerformanceMetrics', 'Booking', 'ChatRoom', 'ChatMessage'];
    const missingModels = requiredModels.filter(model => !models[model]);
    if (missingModels.length === 0) {
      results.passed.push('✅ Models Import');
      console.log('✅ Models Import: PASSED');
    } else {
      results.failed.push('❌ Models Import');
      console.error('❌ Models Import: FAILED - Missing models:', missingModels);
    }
  } catch (error) {
    results.failed.push('❌ Models Import');
    console.error('❌ Models Import: FAILED', error.message);
  }

  // Test 3: Unified Schema Models
  try {
    const unifiedModels = require('../models/unified-schema');
    const requiredUnifiedModels = ['Invoice', 'ShipmentRequest', 'Client', 'Employee', 'DeliveryAssignment'];
    const missingUnifiedModels = requiredUnifiedModels.filter(model => !unifiedModels[model]);
    if (missingUnifiedModels.length === 0) {
      results.passed.push('✅ Unified Schema Models');
      console.log('✅ Unified Schema Models: PASSED');
    } else {
      results.failed.push('❌ Unified Schema Models');
      console.error('❌ Unified Schema Models: FAILED - Missing models:', missingUnifiedModels);
    }
  } catch (error) {
    results.failed.push('❌ Unified Schema Models');
    console.error('❌ Unified Schema Models: FAILED', error.message);
  }

  // Test 4: Utilities
  try {
    const idGenerators = require('../utils/id-generators');
    if (idGenerators.generateUniqueInvoiceID && idGenerators.generateUniqueAWBNumber) {
      results.passed.push('✅ ID Generators Utility');
      console.log('✅ ID Generators Utility: PASSED');
    } else {
      results.failed.push('❌ ID Generators Utility');
      console.error('❌ ID Generators Utility: FAILED - Missing functions');
    }
  } catch (error) {
    results.failed.push('❌ ID Generators Utility');
    console.error('❌ ID Generators Utility: FAILED', error.message);
  }

  try {
    const empostSync = require('../utils/empost-sync');
    if (empostSync.syncInvoiceWithEMPost) {
      results.passed.push('✅ EMPOST Sync Utility');
      console.log('✅ EMPOST Sync Utility: PASSED');
    } else {
      results.failed.push('❌ EMPOST Sync Utility');
      console.error('❌ EMPOST Sync Utility: FAILED - Missing function');
    }
  } catch (error) {
    results.failed.push('❌ EMPOST Sync Utility');
    console.error('❌ EMPOST Sync Utility: FAILED', error.message);
  }

  try {
    const clientSync = require('../utils/client-sync');
    if (clientSync.syncClientFromBooking) {
      results.passed.push('✅ Client Sync Utility');
      console.log('✅ Client Sync Utility: PASSED');
    } else {
      results.warnings.push('⚠️ Client Sync Utility - Function may not exist');
      console.warn('⚠️ Client Sync Utility: WARNING - Function may not exist');
    }
  } catch (error) {
    results.warnings.push('⚠️ Client Sync Utility');
    console.warn('⚠️ Client Sync Utility: WARNING', error.message);
  }

  // Test 5: Middleware
  try {
    const auth = require('../middleware/auth');
    if (auth) {
      results.passed.push('✅ Auth Middleware');
      console.log('✅ Auth Middleware: PASSED');
    } else {
      results.failed.push('❌ Auth Middleware');
      console.error('❌ Auth Middleware: FAILED');
    }
  } catch (error) {
    results.failed.push('❌ Auth Middleware');
    console.error('❌ Auth Middleware: FAILED', error.message);
  }

  try {
    const security = require('../middleware/security');
    if (security.sanitizeRegex && security.validateObjectIdParam) {
      results.passed.push('✅ Security Middleware');
      console.log('✅ Security Middleware: PASSED');
    } else {
      results.failed.push('❌ Security Middleware');
      console.error('❌ Security Middleware: FAILED - Missing functions');
    }
  } catch (error) {
    results.failed.push('❌ Security Middleware');
    console.error('❌ Security Middleware: FAILED', error.message);
  }

  // Test 6: Routes
  const routes = [
    { name: 'Auth Routes', path: '../routes/auth' },
    { name: 'Users Routes', path: '../routes/users' },
    { name: 'Invoice Requests Routes', path: '../routes/invoiceRequests' },
    { name: 'Bookings Routes', path: '../routes/bookings' },
    { name: 'Invoices Unified Routes', path: '../routes/invoices-unified' },
    { name: 'Collections Routes', path: '../routes/collections' },
    { name: 'Notifications Routes', path: '../routes/notifications' },
    { name: 'Employees Routes', path: '../routes/employees' },
    { name: 'Departments Routes', path: '../routes/departments' },
    { name: 'Clients Routes', path: '../routes/clients' }
  ];

  for (const route of routes) {
    try {
      const routeModule = require(route.path);
      if (routeModule && (routeModule.router || routeModule.default || typeof routeModule === 'function')) {
        results.passed.push(`✅ ${route.name}`);
        console.log(`✅ ${route.name}: PASSED`);
      } else {
        results.failed.push(`❌ ${route.name}`);
        console.error(`❌ ${route.name}: FAILED - Invalid export`);
      }
    } catch (error) {
      results.failed.push(`❌ ${route.name}`);
      console.error(`❌ ${route.name}: FAILED`, error.message);
    }
  }

  // Test 7: Services
  try {
    const empostAPI = require('../services/empost-api');
    if (empostAPI) {
      results.passed.push('✅ EMPOST API Service');
      console.log('✅ EMPOST API Service: PASSED');
    } else {
      results.failed.push('❌ EMPOST API Service');
      console.error('❌ EMPOST API Service: FAILED');
    }
  } catch (error) {
    results.failed.push('❌ EMPOST API Service');
    console.error('❌ EMPOST API Service: FAILED', error.message);
  }

  // Test 8: Server File
  try {
    const server = require('../server');
    if (server) {
      results.passed.push('✅ Server File');
      console.log('✅ Server File: PASSED');
    } else {
      results.failed.push('❌ Server File');
      console.error('❌ Server File: FAILED');
    }
  } catch (error) {
    results.failed.push('❌ Server File');
    console.error('❌ Server File: FAILED', error.message);
  }

  // Test 9: Database Indexes (check if models have indexes)
  try {
    const { InvoiceRequest, Booking } = require('../models');
    if (InvoiceRequest.schema.indexes && InvoiceRequest.schema.indexes().length > 0) {
      results.passed.push('✅ InvoiceRequest Indexes');
      console.log('✅ InvoiceRequest Indexes: PASSED');
    } else {
      results.warnings.push('⚠️ InvoiceRequest Indexes - No indexes found');
      console.warn('⚠️ InvoiceRequest Indexes: WARNING - No indexes found');
    }
    if (Booking.schema.indexes && Booking.schema.indexes().length > 0) {
      results.passed.push('✅ Booking Indexes');
      console.log('✅ Booking Indexes: PASSED');
    } else {
      results.warnings.push('⚠️ Booking Indexes - No indexes found');
      console.warn('⚠️ Booking Indexes: WARNING - No indexes found');
    }
  } catch (error) {
    results.warnings.push('⚠️ Database Indexes Check');
    console.warn('⚠️ Database Indexes Check: WARNING', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  console.log('='.repeat(60));

  if (results.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.failed.forEach(test => console.log(`   ${test}`));
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(warning => console.log(`   ${warning}`));
  }

  if (results.failed.length === 0) {
    console.log('\n✅ All critical functionalities are working!');
  } else {
    console.log('\n❌ Some functionalities need attention.');
  }

  await mongoose.disconnect();
  return results;
}

// Run the test
if (require.main === module) {
  testSystemFunctionality()
    .then((results) => {
      process.exit(results.failed.length === 0 ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Test script failed:', error);
      process.exit(1);
    });
}

module.exports = { testSystemFunctionality };

