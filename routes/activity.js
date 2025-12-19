const express = require('express');
const router = express.Router();

// Import models
const { Booking, InvoiceRequest, Collections, Ticket, Report } = require('../models');
const { Invoice, DeliveryAssignment, CashFlowTransaction, InternalRequest } = require('../models/unified-schema');

// Cache configuration
let activityCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 30000; // 30 seconds (matches frontend poll interval)

/**
 * GET /api/activity/last-updated
 * Returns the last updated timestamp for each tracked activity type.
 * 
 * This endpoint is polled every 30 seconds by the frontend to show "new" badges
 * on dashboard tabs when there are updates since the user last visited.
 * 
 * Response format:
 * {
 *   "success": true,
 *   "data": {
 *     "requests": "2024-01-15T10:30:00.000Z",
 *     "invoice_requests": "2024-01-15T11:45:00.000Z",
 *     ...
 *   }
 * }
 */
router.get('/last-updated', async (req, res) => {
  try {
    const now = Date.now();
    
    // Return cached data if still valid
    if (activityCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
      return res.json({
        success: true,
        data: activityCache
      });
    }

    // Fetch fresh data from all collections in parallel for better performance
    const [
      latestBooking,
      latestInvoiceRequest,
      latestInvoice,
      latestDeliveryAssignment,
      latestTicket,
      latestCollection,
      latestInternalRequest,
      latestCashFlow,
      latestReport
    ] = await Promise.all([
      // 1. Requests/Bookings
      Booking.findOne()
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .catch(() => null), // Handle missing collection gracefully
      
      // 2. Invoice Requests
      InvoiceRequest.findOne()
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .catch(() => null),
      
      // 3. Invoices
      Invoice.findOne()
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .catch(() => null),
      
      // 4. Delivery Assignments
      DeliveryAssignment.findOne()
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .catch(() => null),
      
      // 5. Tickets
      Ticket.findOne()
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .catch(() => null),
      
      // 6. Collections
      Collections.findOne()
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .catch(() => null),
      
      // 7. Jobs/Internal Requests (using InternalRequest as jobs)
      InternalRequest.findOne()
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .catch(() => null),
      
      // 8. Cash Flow
      CashFlowTransaction.findOne()
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .catch(() => null),
      
      // 9. Reports
      Report.findOne()
        .sort({ updatedAt: -1 })
        .select('updatedAt')
        .lean()
        .catch(() => null)
    ]);

    // Build response object with timestamps
    const lastUpdated = {
      requests: latestBooking?.updatedAt?.toISOString() || null,
      invoice_requests: latestInvoiceRequest?.updatedAt?.toISOString() || null,
      invoices: latestInvoice?.updatedAt?.toISOString() || null,
      delivery_assignments: latestDeliveryAssignment?.updatedAt?.toISOString() || null,
      tickets: latestTicket?.updatedAt?.toISOString() || null,
      collections: latestCollection?.updatedAt?.toISOString() || null,
      jobs: latestInternalRequest?.updatedAt?.toISOString() || null,
      cash_flow: latestCashFlow?.updatedAt?.toISOString() || null,
      reports: latestReport?.updatedAt?.toISOString() || null
    };

    // Update cache
    activityCache = lastUpdated;
    cacheTimestamp = now;

    return res.json({
      success: true,
      data: lastUpdated
    });
  } catch (error) {
    console.error('Error fetching activity last updated:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;

