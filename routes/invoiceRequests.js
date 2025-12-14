const express = require('express');
const mongoose = require('mongoose');
const { InvoiceRequest, Employee, Collections } = require('../models');
const { createNotificationsForAllUsers, createNotificationsForDepartment } = require('./notifications');
const { syncInvoiceWithEMPost } = require('../utils/empost-sync');
const { generateUniqueAWBNumber, generateUniqueInvoiceID } = require('../utils/id-generators');

const router = express.Router();

// Force PH_TO_UAE classification to GENERAL (ignore incoming box classifications)
const normalizePhToUaeClassification = (invoiceRequest) => {
  if (!invoiceRequest) return;
  const code = (invoiceRequest.service_code || invoiceRequest.verification?.service_code || '').toUpperCase();
  if (!code.includes('PH_TO_UAE')) return;

  if (!invoiceRequest.verification) {
    invoiceRequest.verification = {};
  }
  invoiceRequest.verification.shipment_classification = 'GENERAL';

  if (Array.isArray(invoiceRequest.verification.boxes)) {
    invoiceRequest.verification.boxes = invoiceRequest.verification.boxes.map((box) => ({
      ...box,
      classification: 'GENERAL',
      shipment_classification: 'GENERAL',
    }));
  }
};

// Helper to normalize Decimal128 fields for frontend-friendly JSON
const normalizeInvoiceRequest = (request) => {
  if (!request) return request;
  const obj = request.toObject ? request.toObject() : request;

  const normalizeDecimal = (value) => {
    if (value === null || value === undefined) return value;
    try {
      return parseFloat(value.toString());
    } catch (e) {
      return value;
    }
  };

  // Top-level Decimal128 fields we care about
  obj.weight = normalizeDecimal(obj.weight);
  obj.weight_kg = normalizeDecimal(obj.weight_kg);
  obj.invoice_amount = normalizeDecimal(obj.invoice_amount);
  obj.amount = normalizeDecimal(obj.amount);
  obj.declaredAmount = normalizeDecimal(obj.declaredAmount);

  // Nested verification decimals
  if (obj.verification) {
    obj.verification.amount = normalizeDecimal(obj.verification.amount);
    obj.verification.volume_cbm = normalizeDecimal(obj.verification.volume_cbm);
    obj.verification.declared_value = normalizeDecimal(obj.verification.declared_value);
    obj.verification.total_vm = normalizeDecimal(obj.verification.total_vm);
    obj.verification.actual_weight = normalizeDecimal(obj.verification.actual_weight);
    obj.verification.volumetric_weight = normalizeDecimal(obj.verification.volumetric_weight);
    obj.verification.chargeable_weight = normalizeDecimal(obj.verification.chargeable_weight);
    obj.verification.calculated_rate = normalizeDecimal(obj.verification.calculated_rate);

    if (Array.isArray(obj.verification.boxes)) {
      obj.verification.boxes = obj.verification.boxes.map((box) => ({
        ...box,
        length: normalizeDecimal(box.length),
        width: normalizeDecimal(box.width),
        height: normalizeDecimal(box.height),
        vm: normalizeDecimal(box.vm),
      }));
    }
  }

  // Exclude identityDocuments from API responses
  if (obj.identityDocuments !== undefined) {
    delete obj.identityDocuments;
  }

  return obj;
};

// Get all invoice requests
router.get('/', async (req, res) => {
  try {
    const invoiceRequests = await InvoiceRequest.find()
      .populate('created_by_employee_id')
      .populate('assigned_to_employee_id')
      .sort({ createdAt: -1 });
    res.json(invoiceRequests.map(normalizeInvoiceRequest));
  } catch (error) {
    console.error('Error fetching invoice requests:', error);
    res.status(500).json({ error: 'Failed to fetch invoice requests' });
  }
});

// Get invoice requests by status
router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const invoiceRequests = await InvoiceRequest.find({ status })
      .populate('created_by_employee_id')
      .populate('assigned_to_employee_id')
      .sort({ createdAt: -1 });
    
    // Convert Decimal128 fields to numbers for proper JSON serialization
    const processedRequests = invoiceRequests.map(normalizeInvoiceRequest);

    res.json(processedRequests);
  } catch (error) {
    console.error('Error fetching invoice requests by status:', error);
    res.status(500).json({ error: 'Failed to fetch invoice requests' });
  }
});

// Get invoice requests by delivery status
router.get('/delivery-status/:deliveryStatus', async (req, res) => {
  try {
    const { deliveryStatus } = req.params;
    const invoiceRequests = await InvoiceRequest.find({ delivery_status: deliveryStatus })
      .populate('created_by_employee_id')
      .populate('assigned_to_employee_id')
      .sort({ createdAt: -1 });
    res.json(invoiceRequests.map(normalizeInvoiceRequest));
  } catch (error) {
    console.error('Error fetching invoice requests by delivery status:', error);
    res.status(500).json({ error: 'Failed to fetch invoice requests' });
  }
});

// Create invoice request
router.post('/', async (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      receiver_name,
      receiver_company,
      receiver_phone,
      sender_address,
      receiver_address,
      origin_place, // Keep for backward compatibility
      destination_place, // Keep for backward compatibility
      shipment_type,
      service_code,
      amount_per_kg,
      total_weight,
      notes,
      created_by_employee_id,
      status
    } = req.body;
    
    // Use new field names if provided, otherwise fall back to old field names
    const originPlace = sender_address || origin_place;
    const destinationPlace = receiver_address || destination_place;
    
    if (!customer_name || !receiver_name || !originPlace || !destinationPlace || !shipment_type || !created_by_employee_id) {
      return res.status(400).json({ error: 'Required fields are missing: customer_name, receiver_name, sender_address (or origin_place), receiver_address (or destination_place), shipment_type, and created_by_employee_id are required' });
    }

    // Auto-generate Invoice ID and AWB number
    let invoiceNumber;
    let awbNumber;
    
    try {
      // Generate unique Invoice ID
      invoiceNumber = await generateUniqueInvoiceID(InvoiceRequest);
      console.log('✅ Generated Invoice ID:', invoiceNumber);
      
      // Generate unique AWB number following pattern PHL2VN3KT28US9H
      const normalizedServiceCode = (service_code || '').toString().toUpperCase().replace(/[\s-]+/g, '_');
      const isPhToUae = normalizedServiceCode === 'PH_TO_UAE' || normalizedServiceCode.startsWith('PH_TO_UAE_') || normalizedServiceCode === 'PHL_ARE_AIR';
      awbNumber = await generateUniqueAWBNumber(InvoiceRequest, isPhToUae ? { prefix: 'PHL' } : {});
      console.log('✅ Generated AWB Number:', awbNumber);
    } catch (error) {
      console.error('❌ Error generating IDs:', error);
      return res.status(500).json({ error: 'Failed to generate Invoice ID or AWB number' });
    }

    // Calculate amount from amount_per_kg and total_weight
    let calculatedAmount = null;
    if (amount_per_kg && total_weight) {
      try {
        calculatedAmount = parseFloat(amount_per_kg) * parseFloat(total_weight);
      } catch (error) {
        console.error('Error calculating amount:', error);
      }
    }

    const invoiceRequest = new InvoiceRequest({
      invoice_number: invoiceNumber, // Auto-generated Invoice ID
      tracking_code: awbNumber, // Auto-generated AWB number
      service_code: service_code || undefined,
      customer_name,
      customer_phone, // Customer phone number instead of company
      receiver_name,
      receiver_company,
      receiver_phone,
      receiver_address: destinationPlace, // Store receiver address separately
      origin_place: originPlace, // Map sender_address to origin_place
      destination_place: destinationPlace, // Map receiver_address to destination_place
      shipment_type,
      amount: calculatedAmount ? calculatedAmount : undefined,
      weight_kg: total_weight ? parseFloat(total_weight) : undefined,
      weight: total_weight ? parseFloat(total_weight) : undefined, // Also set weight field for backward compatibility
      // is_leviable will default to true from schema
      notes,
      created_by_employee_id,
      status: status || 'DRAFT'
    });

    await invoiceRequest.save();

    // Sync invoice request to EMPOST
    await syncInvoiceWithEMPost({
      requestId: invoiceRequest._id,
      reason: `Invoice request status update (${status || 'no status'})`,
    });

    // Create notifications for relevant departments (Sales, Operations, Finance)
    const relevantDepartments = ['Sales', 'Operations', 'Finance'];
    for (const deptName of relevantDepartments) {
      // Get department ID (you might need to adjust this based on your department structure)
      const dept = await mongoose.model('Department').findOne({ name: deptName });
      if (dept) {
        await createNotificationsForDepartment('invoice_request', invoiceRequest._id, dept._id, created_by_employee_id);
      }
    }

    res.status(201).json({
      success: true,
      invoiceRequest: normalizeInvoiceRequest(invoiceRequest),
      message: 'Invoice request created successfully'
    });
  } catch (error) {
    console.error('Error creating invoice request:', error);
    res.status(500).json({ error: 'Failed to create invoice request' });
  }
});

// Update invoice request
router.put('/:id', async (req, res) => {
  try {
    const invoiceRequestId = req.params.id;
    const updateData = req.body;

    const invoiceRequest = await InvoiceRequest.findById(invoiceRequestId);
    if (!invoiceRequest) {
      return res.status(404).json({ error: 'Invoice request not found' });
    }

    // Store old values for comparison
    const oldStatus = invoiceRequest.status;
    const oldDeliveryStatus = invoiceRequest.delivery_status;
    
    // Update fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        invoiceRequest[key] = updateData[key];
      }
    });

    await invoiceRequest.save();

    // Sync status to EMPOST if status or delivery_status changed
    const statusChanged = updateData.status && updateData.status !== oldStatus;
    const deliveryStatusChanged = updateData.delivery_status && updateData.delivery_status !== oldDeliveryStatus;
    
    if (statusChanged || deliveryStatusChanged) {
      const { syncStatusToEMPost, getTrackingNumberFromInvoiceRequest } = require('../utils/empost-status-sync');
      const trackingNumber = getTrackingNumberFromInvoiceRequest(invoiceRequest);
      const statusToUpdate = updateData.delivery_status || updateData.status;
      
      await syncStatusToEMPost({
        trackingNumber,
        status: statusToUpdate,
        additionalData: {
          deliveryDate: statusToUpdate === 'DELIVERED' ? new Date() : undefined
        }
      });
    }

    res.json({
      success: true,
      invoiceRequest: normalizeInvoiceRequest(invoiceRequest),
      message: 'Invoice request updated successfully'
    });
  } catch (error) {
    console.error('Error updating invoice request:', error);
    res.status(500).json({ error: 'Failed to update invoice request' });
  }
});

// Update invoice request status
router.put('/:id/status', async (req, res) => {
  try {
    const { status, delivery_status } = req.body;
    const invoiceRequestId = req.params.id;

    const invoiceRequest = await InvoiceRequest.findById(invoiceRequestId);
    if (!invoiceRequest) {
      return res.status(404).json({ error: 'Invoice request not found' });
    }

    // Store old status for comparison
    const oldStatus = invoiceRequest.status;
    const oldDeliveryStatus = invoiceRequest.delivery_status;
    
    // Update status if provided
    if (status) {
      invoiceRequest.status = status;
    }
    
    // Update delivery_status if provided
    if (delivery_status) {
      invoiceRequest.delivery_status = delivery_status;
    }
    
    if (status === 'COMPLETED') {
      invoiceRequest.invoice_generated_at = new Date();
      
      // Automatically create collection entry when invoice is generated
      if (invoiceRequest.invoice_amount || invoiceRequest.financial?.invoice_amount) {
        // Use the auto-generated invoice_number from the invoice request
        const invoiceId = invoiceRequest.invoice_number || `INV-${invoiceRequest._id.toString().slice(-6).toUpperCase()}`;
        const invoiceAmount = invoiceRequest.financial?.invoice_amount || invoiceRequest.invoice_amount;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // 30 days from now
        
        const collection = new Collections({
          invoice_id: invoiceId,
          client_name: invoiceRequest.customer_name,
          amount: invoiceAmount,
          due_date: dueDate,
          invoice_request_id: invoiceRequest._id,
          status: 'not_paid'
        });
        
        await collection.save();
        
        // Create notifications for Finance department about new collection
        const financeDept = await mongoose.model('Department').findOne({ name: 'Finance' });
        if (financeDept) {
          await createNotificationsForDepartment('collection', collection._id, financeDept._id);
        }
      }
    }

    await invoiceRequest.save();

    // Sync status to EMPOST if status or delivery_status changed
    if ((status && status !== oldStatus) || (delivery_status && delivery_status !== oldDeliveryStatus)) {
      const { syncStatusToEMPost, getTrackingNumberFromInvoiceRequest } = require('../utils/empost-status-sync');
      const trackingNumber = getTrackingNumberFromInvoiceRequest(invoiceRequest);
      const statusToUpdate = delivery_status || status;
      
      await syncStatusToEMPost({
        trackingNumber,
        status: statusToUpdate,
        additionalData: {
          deliveryDate: statusToUpdate === 'DELIVERED' ? new Date() : undefined
        }
      });
    }

    res.json({
      success: true,
      invoiceRequest: normalizeInvoiceRequest(invoiceRequest),
      message: 'Invoice request status updated successfully'
    });
  } catch (error) {
    console.error('Error updating invoice request status:', error);
    res.status(500).json({ error: 'Failed to update invoice request status' });
  }
});

// Update delivery status
router.put('/:id/delivery-status', async (req, res) => {
  try {
    const { delivery_status, notes } = req.body;
    const invoiceRequestId = req.params.id;

    const invoiceRequest = await InvoiceRequest.findById(invoiceRequestId);
    if (!invoiceRequest) {
      return res.status(404).json({ error: 'Invoice request not found' });
    }

    // Store old delivery status for comparison
    const oldDeliveryStatus = invoiceRequest.delivery_status;
    
    // Update delivery status
    invoiceRequest.delivery_status = delivery_status;
    
    // Update notes if provided
    if (notes) {
      invoiceRequest.notes = notes;
    }
    
    // Update the updated_at timestamp
    invoiceRequest.updatedAt = new Date();
    
    await invoiceRequest.save();

    // Sync delivery status to EMPOST if changed
    if (delivery_status && delivery_status !== oldDeliveryStatus) {
      const { syncStatusToEMPost, getTrackingNumberFromInvoiceRequest } = require('../utils/empost-status-sync');
      const trackingNumber = getTrackingNumberFromInvoiceRequest(invoiceRequest);
      
      await syncStatusToEMPost({
        trackingNumber,
        status: delivery_status,
        additionalData: {
          deliveryDate: delivery_status === 'DELIVERED' ? new Date() : undefined,
          notes: notes
        }
      });
    }

    res.json({
      success: true,
      invoiceRequest: normalizeInvoiceRequest(invoiceRequest),
      message: 'Delivery status updated successfully'
    });
  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
});

// Add weight (for operations team)
router.put('/:id/weight', async (req, res) => {
  try {
    const { weight } = req.body;
    const invoiceRequestId = req.params.id;

    const invoiceRequest = await InvoiceRequest.findById(invoiceRequestId);
    if (!invoiceRequest) {
      return res.status(404).json({ error: 'Invoice request not found' });
    }

    invoiceRequest.weight = weight;
    await invoiceRequest.save();

    // Sync invoice request to EMPOST after weight update
    await syncInvoiceWithEMPost({
      requestId: invoiceRequestId,
      reason: 'Invoice request weight update',
    });

    res.json({
      success: true,
      invoiceRequest: normalizeInvoiceRequest(invoiceRequest),
      message: 'Weight updated successfully'
    });
  } catch (error) {
    console.error('Error updating weight:', error);
    res.status(500).json({ error: 'Failed to update weight' });
  }
});

// Update verification details (for operations team)
router.put('/:id/verification', async (req, res) => {
  try {
    const verificationData = req.body;
    const invoiceRequestId = req.params.id;

    console.log('📝 Verification update request:', {
      id: invoiceRequestId,
      data: verificationData
    });

    const invoiceRequest = await InvoiceRequest.findById(invoiceRequestId);
    if (!invoiceRequest) {
      return res.status(404).json({ error: 'Invoice request not found' });
    }

    // Determine service route for classification logic
    const serviceCode = (invoiceRequest.service_code || invoiceRequest.verification?.service_code || verificationData.service_code || '').toUpperCase();
    const isPhToUae = serviceCode.includes('PH_TO_UAE');
    const isUaeToPh = serviceCode.includes('UAE_TO_PH') || serviceCode.includes('UAE_TO_PINAS');

    // Initialize verification object if it doesn't exist
    if (!invoiceRequest.verification) {
      invoiceRequest.verification = {};
    }

    // Helper function to safely convert to Decimal128
    const toDecimal128 = (value) => {
      if (value === null || value === undefined || value === '') {
        return undefined;
      }
      try {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
          return undefined;
        }
        return new mongoose.Types.Decimal128(numValue.toFixed(2));
      } catch (error) {
        console.error('Error converting to Decimal128:', value, error);
        return undefined;
      }
    };

    // Normalize classification helper
    const normalizeClass = (value) => {
      if (!value) return undefined;
      return value.toString().trim().toUpperCase();
    };

    // Handle boxes data - accept empty array (Box List removed from frontend)
    // For backward compatibility, still process boxes if provided, but allow empty array
    if (verificationData.boxes !== undefined) {
      if (Array.isArray(verificationData.boxes) && verificationData.boxes.length > 0) {
        // Process boxes if provided (for backward compatibility)
        invoiceRequest.verification.boxes = verificationData.boxes.map(box => {
          // Force GENERAL for PH_TO_UAE, otherwise normalize provided classification
          const normalizedClassification = isPhToUae ? 'GENERAL' : normalizeClass(box.classification);
          
          return {
            items: box.items || '',
            quantity: box.quantity,
            length: toDecimal128(box.length),
            width: toDecimal128(box.width),
            height: toDecimal128(box.height),
            vm: toDecimal128(box.vm),
            classification: normalizedClassification,
            shipment_classification: isPhToUae ? 'GENERAL' : normalizedClassification
          };
        });
      } else {
        // Empty array - set to empty array
        invoiceRequest.verification.boxes = [];
      }
    }

    // Handle listed_commodities - accept empty string (Box List removed)
    if (verificationData.listed_commodities !== undefined) {
      invoiceRequest.verification.listed_commodities = verificationData.listed_commodities || '';
    }

    // Shipment classification handling
    // PH_TO_UAE: Always GENERAL (enforce)
    // UAE_TO_PH: Must be FLOWMIC or COMMERCIAL (validate)
    if (isPhToUae) {
      // PH_TO_UAE: Force to GENERAL regardless of input
      invoiceRequest.verification.shipment_classification = 'GENERAL';
      console.log('✅ PH_TO_UAE route detected - classification set to GENERAL');
    } else if (isUaeToPh) {
      // UAE_TO_PH: Must be FLOWMIC or COMMERCIAL
      if (verificationData.shipment_classification !== undefined) {
        const normalizedClass = normalizeClass(verificationData.shipment_classification);
        if (normalizedClass === 'FLOWMIC' || normalizedClass === 'COMMERCIAL') {
          invoiceRequest.verification.shipment_classification = normalizedClass;
        } else {
          return res.status(400).json({
            success: false,
            error: 'For UAE_TO_PH shipments, shipment_classification must be either FLOWMIC or COMMERCIAL'
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          error: 'shipment_classification is required for UAE_TO_PH shipments (must be FLOWMIC or COMMERCIAL)'
        });
      }
    } else if (verificationData.shipment_classification !== undefined) {
      // Other routes: accept provided classification
      invoiceRequest.verification.shipment_classification = normalizeClass(verificationData.shipment_classification);
    }

    // Validate and handle actual_weight (required)
    if (verificationData.actual_weight === undefined || verificationData.actual_weight === null || verificationData.actual_weight === '') {
      return res.status(400).json({
        success: false,
        error: 'actual_weight is required'
      });
    }
    const actualWeight = parseFloat(verificationData.actual_weight);
    if (isNaN(actualWeight) || actualWeight < 0) {
      return res.status(400).json({
        success: false,
        error: 'actual_weight must be a positive number'
      });
    }
    invoiceRequest.verification.actual_weight = toDecimal128(actualWeight);

    // Validate and handle volumetric_weight (required - now direct input)
    if (verificationData.volumetric_weight === undefined || verificationData.volumetric_weight === null || verificationData.volumetric_weight === '') {
      return res.status(400).json({
        success: false,
        error: 'volumetric_weight is required'
      });
    }
    const volumetricWeight = parseFloat(verificationData.volumetric_weight);
    if (isNaN(volumetricWeight) || volumetricWeight < 0) {
      return res.status(400).json({
        success: false,
        error: 'volumetric_weight must be a positive number'
      });
    }
    invoiceRequest.verification.volumetric_weight = toDecimal128(volumetricWeight);

    // Calculate chargeable_weight = max(actual_weight, volumetric_weight)
    // Use provided chargeable_weight if available, otherwise calculate
    let chargeableWeight;
    if (verificationData.chargeable_weight !== undefined && verificationData.chargeable_weight !== null && verificationData.chargeable_weight !== '') {
      chargeableWeight = parseFloat(verificationData.chargeable_weight);
      if (isNaN(chargeableWeight) || chargeableWeight <= 0) {
        return res.status(400).json({
          success: false,
          error: 'chargeable_weight must be a positive number greater than 0'
        });
      }
    } else {
      // Auto-calculate: chargeable_weight = max(actual_weight, volumetric_weight)
      chargeableWeight = Math.max(actualWeight, volumetricWeight);
      console.log(`✅ Auto-calculated chargeable_weight: ${chargeableWeight} kg (Actual: ${actualWeight} kg, Volumetric: ${volumetricWeight} kg)`);
    }
    invoiceRequest.verification.chargeable_weight = toDecimal128(chargeableWeight);

    // Handle total_vm (for backward compatibility - same as volumetric_weight)
    // Set after volumetric_weight is validated
    if (verificationData.total_vm !== undefined && verificationData.total_vm !== null && verificationData.total_vm !== '') {
      invoiceRequest.verification.total_vm = toDecimal128(verificationData.total_vm);
    } else {
      // Set total_vm to volumetric_weight if not provided (for backward compatibility)
      invoiceRequest.verification.total_vm = invoiceRequest.verification.volumetric_weight;
    }

    if (verificationData.rate_bracket !== undefined) {
      invoiceRequest.verification.rate_bracket = verificationData.rate_bracket;
    }
    if (verificationData.calculated_rate !== undefined && verificationData.calculated_rate !== null && verificationData.calculated_rate !== '') {
      invoiceRequest.verification.calculated_rate = toDecimal128(verificationData.calculated_rate);
    }

    // Auto-determine weight_type based on actual_weight and volumetric_weight comparison
    // weight_type = 'ACTUAL' if actual_weight >= volumetric_weight, else 'VOLUMETRIC'
    if (actualWeight >= volumetricWeight) {
      invoiceRequest.verification.weight_type = 'ACTUAL';
    } else {
      invoiceRequest.verification.weight_type = 'VOLUMETRIC';
    }
    console.log(`✅ Auto-determined weight type: ${invoiceRequest.verification.weight_type} (Actual: ${actualWeight} kg, Volumetric: ${volumetricWeight} kg, Chargeable: ${chargeableWeight} kg)`);

    // Handle number_of_boxes (simple input, default 1, must be >= 1)
    if (verificationData.number_of_boxes !== undefined) {
      const numBoxes = parseInt(verificationData.number_of_boxes);
      if (isNaN(numBoxes) || numBoxes < 1) {
        return res.status(400).json({
          success: false,
          error: 'number_of_boxes must be a number greater than or equal to 1'
        });
      }
      invoiceRequest.verification.number_of_boxes = numBoxes;
    } else {
      // Default to 1 if not provided
      invoiceRequest.verification.number_of_boxes = 1;
    }

    // Update service_code from verification data if provided (this is the source of truth)
    if (verificationData.service_code !== undefined && verificationData.service_code !== null && verificationData.service_code !== '') {
      invoiceRequest.service_code = verificationData.service_code;
      invoiceRequest.verification.service_code = verificationData.service_code;
      console.log(`✅ Updated service_code from verification: ${verificationData.service_code}`);
    }

    // Update other verification fields (excluding fields handled separately above)
    Object.keys(verificationData).forEach(key => {
      if (verificationData[key] !== undefined && 
          verificationData[key] !== null &&
          key !== 'boxes' && 
          key !== 'listed_commodities' &&
          key !== 'total_vm' && 
          key !== 'weight' && 
          key !== 'actual_weight' && 
          key !== 'volumetric_weight' && 
          key !== 'chargeable_weight' &&
          key !== 'weight_type' &&
          key !== 'rate_bracket' &&
          key !== 'calculated_rate' &&
          key !== 'shipment_classification' &&
          key !== 'number_of_boxes' &&
          key !== 'service_code') { // service_code is handled separately above
        // Handle Decimal128 fields
        if (key === 'amount' || key === 'volume_cbm') {
          invoiceRequest.verification[key] = toDecimal128(verificationData[key]);
        } else {
          invoiceRequest.verification[key] = verificationData[key];
        }
      }
    });

    // Update main weight field with chargeable weight (higher of actual or volumetric)
    if (verificationData.chargeable_weight !== undefined && verificationData.chargeable_weight !== null && verificationData.chargeable_weight !== '') {
      invoiceRequest.weight = toDecimal128(verificationData.chargeable_weight);
    } else if (verificationData.weight !== undefined && verificationData.weight !== null && verificationData.weight !== '') {
      invoiceRequest.weight = toDecimal128(verificationData.weight);
    }

    // If PH_TO_UAE, force classification to GENERAL on the request object too
    if (isPhToUae) {
      normalizePhToUaeClassification(invoiceRequest);
    }

    // Set verification metadata
    invoiceRequest.verification.verified_at = new Date();
    
    await invoiceRequest.save();

    // Create EMPOST shipment when verification is updated (only shipment, NOT invoice)
    // Only create if UHAWB doesn't already exist (avoid duplicates)
    if (!invoiceRequest.empost_uhawb || invoiceRequest.empost_uhawb === 'N/A') {
      try {
        const empostAPI = require('../services/empost-api');
        console.log('📦 Creating EMPOST shipment from verified InvoiceRequest...');
        
        const shipmentResult = await empostAPI.createShipmentFromInvoiceRequest(invoiceRequest);
        
        if (shipmentResult && shipmentResult.data && shipmentResult.data.uhawb) {
          // Store UHAWB in invoiceRequest for future reference
          invoiceRequest.empost_uhawb = shipmentResult.data.uhawb;
          await invoiceRequest.save();
          console.log('✅ EMPOST shipment created with UHAWB:', shipmentResult.data.uhawb);
        }
      } catch (empostError) {
        console.error('❌ Failed to create EMPOST shipment (non-critical, will retry later):', empostError.message);
        // Don't fail the verification update if EMPOST fails
      }
    } else {
      console.log('ℹ️ EMPOST shipment already exists with UHAWB:', invoiceRequest.empost_uhawb);
    }

    res.json({
      success: true,
      invoiceRequest: normalizeInvoiceRequest(invoiceRequest),
      message: 'Verification details updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating verification:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    res.status(500).json({ 
      error: 'Failed to update verification details',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Complete verification (for operations team)
router.put('/:id/complete-verification', async (req, res) => {
  try {
    const { verified_by_employee_id, verification_notes } = req.body;
    const invoiceRequestId = req.params.id;

    const invoiceRequest = await InvoiceRequest.findById(invoiceRequestId);
    if (!invoiceRequest) {
      return res.status(404).json({ error: 'Invoice request not found' });
    }

    // Complete verification
    invoiceRequest.verification.verified_by_employee_id = verified_by_employee_id;
    invoiceRequest.verification.verified_at = new Date();
    invoiceRequest.verification.verification_notes = verification_notes;
    
    // Move to next status - ready for finance
    invoiceRequest.status = 'VERIFIED';
    
    await invoiceRequest.save();

    // Create EMPOST shipment automatically when verification is completed
    // This creates ONLY the shipment, NOT the invoice (invoice will be generated later by Finance)
    // Only create if UHAWB doesn't already exist (avoid duplicates)
    if (!invoiceRequest.empost_uhawb || invoiceRequest.empost_uhawb === 'N/A') {
      try {
        const empostAPI = require('../services/empost-api');
        console.log('📦 Automatically creating EMPOST shipment from verified InvoiceRequest...');
        
        const shipmentResult = await empostAPI.createShipmentFromInvoiceRequest(invoiceRequest);
        
        if (shipmentResult && shipmentResult.data && shipmentResult.data.uhawb) {
          // Store UHAWB in invoiceRequest for future reference
          invoiceRequest.empost_uhawb = shipmentResult.data.uhawb;
          await invoiceRequest.save();
          console.log('✅ EMPOST shipment created automatically with UHAWB:', shipmentResult.data.uhawb);
        }
      } catch (empostError) {
        console.error('❌ Failed to create EMPOST shipment automatically (non-critical):', empostError.message);
        // Don't fail verification completion if EMPOST fails - can be retried later
      }
    } else {
      console.log('ℹ️ EMPOST shipment already exists with UHAWB:', invoiceRequest.empost_uhawb);
    }

    res.json({
      success: true,
      invoiceRequest: normalizeInvoiceRequest(invoiceRequest),
      message: 'Verification completed successfully'
    });
  } catch (error) {
    console.error('Error completing verification:', error);
    res.status(500).json({ error: 'Failed to complete verification' });
  }
});

// Delete invoice request
router.delete('/:id', async (req, res) => {
  try {
    const invoiceRequestId = req.params.id;

    const invoiceRequest = await InvoiceRequest.findById(invoiceRequestId);
    if (!invoiceRequest) {
      return res.status(404).json({ error: 'Invoice request not found' });
    }

    await InvoiceRequest.findByIdAndDelete(invoiceRequestId);

    res.json({
      success: true,
      message: 'Invoice request deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting invoice request:', error);
    res.status(500).json({ error: 'Failed to delete invoice request' });
  }
});

module.exports = router;
