/**
 * Debug Utilities for Scripts
 * Import this in any script to get consistent debug logging
 */

// Debug logging utility
const debugLog = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔍 DEBUG: ${message}`);
  if (data !== null) {
    console.log(`[${timestamp}] 📊 Data:`, JSON.stringify(data, null, 2));
  }
};

// Performance logging utility
const performanceLog = (operation, startTime) => {
  const duration = Date.now() - startTime;
  console.log(`⏱️  PERFORMANCE: ${operation} took ${duration}ms`);
  return duration;
};

// Script start logging
const logScriptStart = (scriptName, params = {}) => {
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 SCRIPT START: ${scriptName}`);
  console.log('='.repeat(60));
  debugLog(`Script initialization`, params);
  debugLog('MongoDB URI configured', { uri: process.env.MONGODB_URI ? 'Set' : 'Not set' });
  return Date.now();
};

// Script end logging
const logScriptEnd = (scriptName, startTime) => {
  const totalDuration = Date.now() - startTime;
  performanceLog(`Total script execution`, startTime);
  console.log('\n' + '='.repeat(60));
  console.log(`✅ SCRIPT COMPLETED SUCCESSFULLY: ${scriptName}`);
  console.log('='.repeat(60) + '\n');
};

// Error logging
const logError = (error, context = {}) => {
  console.error('\n' + '='.repeat(60));
  console.error('❌ SCRIPT ERROR');
  console.error('='.repeat(60));
  console.error('❌ Error:', error);
  console.error('📊 Error details:', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context
  });
  debugLog('Error occurred', { error: error.toString(), stack: error.stack, context });
};

// Database connection logging
const logDbConnection = async (uri, options = {}) => {
  const connectStartTime = Date.now();
  debugLog('Attempting MongoDB connection...', { uri: uri ? 'Set' : 'Not set', options });
  const startTime = Date.now();
  return {
    startTime,
    logSuccess: () => {
      performanceLog('MongoDB connection', connectStartTime);
      console.log('✅ Connected to MongoDB\n');
    },
    logClose: async (connection) => {
      const closeStartTime = Date.now();
      await connection.close();
      performanceLog('Database connection close', closeStartTime);
      console.log('\n✅ Database connection closed');
    }
  };
};

// Query logging
const logQuery = (queryName, query, resultCount = null) => {
  debugLog(`Executing query: ${queryName}`, { query: JSON.stringify(query, null, 2) });
  const startTime = Date.now();
  return {
    startTime,
    logResult: (count) => {
      performanceLog(`Query: ${queryName}`, startTime);
      debugLog(`Query "${queryName}" returned ${count} results`);
    }
  };
};

module.exports = {
  debugLog,
  performanceLog,
  logScriptStart,
  logScriptEnd,
  logError,
  logDbConnection,
  logQuery
};

