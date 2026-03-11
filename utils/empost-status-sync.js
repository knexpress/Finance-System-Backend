const empostAPI = require('../services/empost-api');
const { isEmpostDisabled } = require('./empost-disabled-check');

/**
 * Sync shipment status to EMPOST API
 * This function is called whenever a shipment status changes
 * 
 * @param {Object} options - Sync options
 * @param {string} options.trackingNumber - Tracking number (AWB/tracking_code/invoice_number, not UHAWB)
 * @param {string} options.status - New status to sync
 * @param {Object} options.additionalData - Additional data (deliveryDate, notes, etc.)
 * @param {boolean} options.silent - If true, errors won't be logged (default: false)
 * @returns {Promise<void>}
 */
async function syncStatusToEMPost({ trackingNumber, status, additionalData = {}, silent = false }) {
  if (isEmpostDisabled()) {
    if (!silent) {
      console.log('[EMPOST STATUS SYNC] EMPOST API is disabled. Skipping status sync.');
    }
    return;
  }

  // Skip if no tracking number or status
  if (!trackingNumber || !status || trackingNumber === 'N/A') {
    if (!silent) {
      console.log('⏭️ Skipping EMPOST sync: No tracking number or status provided');
    }
    return;
  }

  try {
    // Ensure UHAWB travels separately from trackingNumber for EMPOST create/update flow.
    const mergedAdditionalData = {
      ...additionalData,
      empost_uhawb:
        additionalData.empost_uhawb ||
        additionalData.uhawb ||
        additionalData.invoiceRequest?.empost_uhawb ||
        additionalData.invoice?.empost_uhawb ||
        additionalData.shipmentRequest?.empost_uhawb ||
        additionalData.request?.empost_uhawb ||
        null,
    };

    if (!silent) {
      console.log(`🔄 Syncing status to EMPOST: ${trackingNumber} -> ${status}`);
    }

    await empostAPI.updateShipmentStatus(trackingNumber, status, mergedAdditionalData);

    if (!silent) {
      console.log('✅ EMPOST status synced successfully');
    }
  } catch (error) {
    // Don't fail the main operation if EMPOST sync fails
    if (!silent) {
      console.error('❌ Failed to sync status to EMPOST (non-critical):', error.message);
    }
    // Re-throw only if we want to handle it upstream, but for now we'll just log
  }
}

/**
 * Extract tracking number from invoice request
 * @param {Object} invoiceRequest - InvoiceRequest object
 * @returns {string|null} - Tracking number or null
 */
function getTrackingNumberFromInvoiceRequest(invoiceRequest) {
  return invoiceRequest.tracking_code ||
         invoiceRequest.awb_number ||
         invoiceRequest.invoice_number || 
         null;
}

/**
 * Extract tracking number from invoice
 * @param {Object} invoice - Invoice object
 * @returns {string|null} - Tracking number or null
 */
function getTrackingNumberFromInvoice(invoice) {
  return invoice.awb_number || 
         (invoice.request_id && invoice.request_id.tracking_code) ||
         invoice.invoice_id || 
         null;
}

/**
 * Extract tracking number from shipment request
 * @param {Object} shipmentRequest - ShipmentRequest object
 * @returns {string|null} - Tracking number or null
 */
function getTrackingNumberFromShipmentRequest(shipmentRequest) {
  return shipmentRequest.awb_number || 
         shipmentRequest.tracking_code || 
         shipmentRequest?.operational?.tracking_number ||
         shipmentRequest.request_id ||
         null;
}

/**
 * Map invoice status to delivery status for EMPOST
 * Some invoice statuses should trigger delivery status updates
 * @param {string} invoiceStatus - Invoice status
 * @returns {string|null} - Delivery status or null if no mapping
 */
function mapInvoiceStatusToDeliveryStatus(invoiceStatus) {
  const statusMap = {
    'PAID': 'DELIVERED',
    'COLLECTED_BY_DRIVER': 'DELIVERED',
    'REMITTED': 'DELIVERED',
    'CANCELLED': 'CANCELLED',
  };
  return statusMap[invoiceStatus] || null;
}

module.exports = {
  syncStatusToEMPost,
  getTrackingNumberFromInvoiceRequest,
  getTrackingNumberFromInvoice,
  getTrackingNumberFromShipmentRequest,
  mapInvoiceStatusToDeliveryStatus,
};

