/**
 * KNEXPRESS Air Waybill / shipping label PDF generator.
 * Layout inspired by carrier AWB packs: package label (barcodes) + waybill doc.
 */
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

const BRAND = {
  name: 'KNEXPRESS',
  legal: 'KNEX DELIVERY SERVICES L.L.C',
  website: 'www.knexpress.ae',
  email: 'customercare@knexpress.ae',
  phone: '+971559738713',
  address: 'Rocky Warehouse #19, 11th Street, Al Qusais Industrial Area 1, Dubai, UAE',
  productCode: 'KNX',
  productName: 'KNEXPRESS',
  terms:
    'KNEXPRESS Terms and Conditions of Carriage apply (www.knexpress.ae).',
};

const PAGE = { width: 841.89, height: 595.28 }; // A4 landscape (DHL-style)

function textOr(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = textOr(v, '');
    if (s) return s;
  }
  return '';
}

function normalizeService(service) {
  const raw = textOr(service, '').toUpperCase().replace(/[\s-]+/g, '_');
  if (raw.includes('PH_TO_UAE') || raw.includes('PHTOUAE')) return 'PH_TO_UAE';
  return 'UAE_TO_PH';
}

function routingForService(serviceCode) {
  if (serviceCode === 'PH_TO_UAE') {
    return {
      originCode: 'MNL',
      destCode: 'DXB',
      destFacility: 'AEDXBKN',
      destCountry: 'AE',
      originCountry: 'PH',
      routingLine: 'TDXB PH-MNL-KNX AE-DXB-KNX',
      serviceLabel: 'PH TO UAE',
    };
  }
  return {
    originCode: 'DXB',
    destCode: 'MNL',
    destFacility: 'PHMNLKN',
    destCountry: 'PH',
    originCountry: 'AE',
    routingLine: 'TMNL AE-DXB-KNX PH-MNL-KNX',
    serviceLabel: 'UAE TO PHILIPPINES',
  };
}

function formatAwbDisplay(awb) {
  const clean = textOr(awb, '').toUpperCase().replace(/\s+/g, '');
  if (!clean) return 'N/A';
  // Group for readability: chunks of 4 when long enough
  if (clean.length <= 8) return clean;
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

function sanitizeAwbForBarcode(awb) {
  return textOr(awb, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generatePieceId(awb, pieceIndex) {
  const clean = sanitizeAwbForBarcode(awb) || 'UNKNOWN';
  const piece = String(pieceIndex).padStart(3, '0');
  // Carrier-style license plate: KX + version + piece + AWB
  return `KX01${piece}${clean}`.slice(0, 30);
}

function routingBarcodeValue(route, awb) {
  const clean = sanitizeAwbForBarcode(awb).slice(-8) || '00000000';
  return `(2L)${route.destCountry}:${route.destFacility}+${clean}`;
}

function partyName(party = {}) {
  return firstNonEmpty(
    party.fullName,
    party.name,
    [party.firstName, party.lastName].filter(Boolean).join(' ')
  );
}

function partyAddressLines(party = {}) {
  const raw = firstNonEmpty(
    party.completeAddress,
    party.address,
    party.addressLine1,
    party.fullAddress
  );
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function partyPhone(party = {}) {
  return firstNonEmpty(party.contactNo, party.phone, party.phoneNumber, party.mobile);
}

function partyEmail(party = {}) {
  return firstNonEmpty(party.emailAddress, party.email);
}

function partyCountry(party = {}, fallback = '') {
  return firstNonEmpty(party.country, party.countryName, fallback);
}

function contentsFromItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) return 'General merchandise';
  const names = items
    .map((item) =>
      firstNonEmpty(item.commodity, item.name, item.description, item.item)
    )
    .filter(Boolean);
  if (names.length === 0) return 'General merchandise';
  const unique = [...new Set(names)];
  return unique.join(', ');
}

function parseWeightKg(data) {
  const candidates = [
    data.weight_kg,
    data.weight,
    data.chargeable_weight,
    data.actual_weight,
    data.verification?.chargeable_weight,
    data.verification?.actual_weight,
    data.verification?.weight,
    data.sender?.weight,
  ];
  for (const c of candidates) {
    if (c === null || c === undefined || c === '') continue;
    const n = parseFloat(String(c).replace(/[^\d.]/g, ''));
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

function pieceCount(data) {
  const n =
    data.number_of_boxes ||
    data.numberOfBoxes ||
    data.verification?.number_of_boxes ||
    (Array.isArray(data.verification?.boxes) ? data.verification.boxes.length : null) ||
    1;
  const parsed = parseInt(String(n), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 1;
}

function declaredValue(data) {
  const v =
    data.declaredAmount ??
    data.declared_amount ??
    data.sender?.declaredAmount ??
    data.custom_value;
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function formatDateStamp(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Build normalized AWB payload from booking / invoice-request merge.
 */
function buildAwbData(booking) {
  const data = booking || {};
  const sender = data.sender || {};
  const receiver = data.receiver || {};
  const serviceCode = normalizeService(data.service || data.service_code);
  const route = routingForService(serviceCode);
  const awb = firstNonEmpty(
    data.awb,
    data.awb_number,
    data.awbNumber,
    data.tracking_code
  );
  const pieces = pieceCount(data);
  const weightKg = parseWeightKg(data);
  const value = declaredValue(data);
  const items = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.listed_commodities)
      ? data.listed_commodities
      : Array.isArray(data.orderItems)
        ? data.orderItems
        : Array.isArray(data.verification?.listed_commodities)
          ? data.verification.listed_commodities
          : [];
  const commodities = contentsFromItems(items);
  // Ref shows commodities (not a generic "Personal items" label)
  const ref =
    textOr(data.shipmentType || data.shipment_type, '').toLowerCase() === 'document'
      ? 'Documents'
      : commodities;

  const pieceIds = [];
  for (let i = 1; i <= pieces; i += 1) {
    pieceIds.push(generatePieceId(awb, i));
  }

  return {
    awb: awb || 'PENDING',
    awbDisplay: formatAwbDisplay(awb || 'PENDING'),
    serviceCode,
    route,
    productCode: BRAND.productCode,
    productName: BRAND.productName,
    createdAt: formatDateStamp(data.createdAt || data.created_at || data.submissionTimestamp),
    sender: {
      name: partyName(sender) || firstNonEmpty(data.customer_name, data.sender_name, 'Shipper'),
      addressLines: partyAddressLines(sender),
      phone: partyPhone(sender),
      email: partyEmail(sender),
      country: partyCountry(
        sender,
        serviceCode === 'PH_TO_UAE' ? 'Philippines' : 'United Arab Emirates'
      ),
      contactName: firstNonEmpty(sender.agentName, partyName(sender)),
    },
    receiver: {
      name:
        partyName(receiver) ||
        firstNonEmpty(data.receiver_name, 'Consignee'),
      addressLines: partyAddressLines(receiver),
      phone: partyPhone(receiver),
      email: partyEmail(receiver),
      country: partyCountry(
        receiver,
        serviceCode === 'PH_TO_UAE' ? 'United Arab Emirates' : 'Philippines'
      ),
      contactName: firstNonEmpty(receiver.contactName, partyName(receiver)),
    },
    pieces,
    pieceIds,
    weightKg,
    weightLabel: weightKg != null ? `${weightKg.toFixed(1)} kg` : 'TBD',
    declaredValue: value,
    declaredValueLabel:
      value != null ? `${value.toFixed(2)} AED` : 'N/A',
    contents: commodities,
    reference: ref,
    shipmentType:
      textOr(data.shipmentType || data.shipment_type, 'non_document').toLowerCase() ===
      'document'
        ? 'DOCUMENT'
        : 'PACKAGE',
  };
}

async function makeBarcodePng(text, options = {}) {
  const png = await bwipjs.toBuffer({
    bcid: options.bcid || 'code128',
    text: String(text),
    scale: options.scale || 2,
    height: options.height || 12,
    includetext: false,
    textxalign: 'center',
    backgroundcolor: 'FFFFFF',
    paddingwidth: 0,
    paddingheight: 0,
  });
  return png;
}

function drawHLine(doc, x1, x2, y, lineWidth = 0.8) {
  doc
    .save()
    .lineWidth(lineWidth)
    .strokeColor('#000000')
    .moveTo(x1, y)
    .lineTo(x2, y)
    .stroke()
    .restore();
}

/** Draw wrapped text at an absolute position; returns Y below the block. Never truncates with "...". */
function drawTextAt(doc, text, x, y, opts = {}) {
  const {
    width = 200,
    fontSize = 9,
    font = 'Helvetica',
    color = '#000000',
    align = 'left',
    lineGap = 2,
  } = opts;
  const str = String(text == null ? '' : text);
  doc.save();
  doc.font(font).fontSize(fontSize).fillColor(color);
  const h = Math.max(
    fontSize + 2,
    doc.heightOfString(str, { width: Math.max(width, 20), align, lineGap })
  );
  doc.text(str, x, y, {
    width: Math.max(width, 20),
    align,
    lineGap,
    lineBreak: true,
  });
  doc.restore();
  return y + h;
}

function drawProductBadge(doc, x, y, code) {
  const w = 52;
  const h = 26;
  doc.save().rect(x, y, w, h).fill('#000000');
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(code, x, y + 6, { width: w, align: 'center', lineBreak: false });
  doc.restore();
  return { w, h };
}

/**
 * Page 1+: Package label(s) — attach to package. One page per piece.
 * Full left panel of landscape A4; text wraps fully (no ellipsis).
 */
async function drawPackageLabel(doc, awbData, pieceIndex) {
  const margin = 28;
  const left = margin;
  const right = PAGE.width / 2 - 16;
  const width = right - left;
  const gap = 8;
  let y = margin;

  // Header: product name, then badge + brand on the right
  const badge = { w: 52, h: 26 };
  const brandW = 130;
  drawTextAt(doc, awbData.productName, left, y + 5, {
    width: width - badge.w - brandW - 20,
    fontSize: 14,
    font: 'Helvetica-Bold',
  });
  drawProductBadge(doc, right - brandW - badge.w - 8, y, awbData.productCode);
  drawTextAt(doc, BRAND.name, right - brandW, y, {
    width: brandW,
    fontSize: 14,
    font: 'Helvetica-Bold',
    color: '#008000',
    align: 'right',
  });
  drawTextAt(doc, BRAND.website, right - brandW, y + 16, {
    width: brandW,
    fontSize: 7,
    color: '#444444',
    align: 'right',
  });
  y += 34;

  y = drawTextAt(doc, `${awbData.createdAt}  KNEXPRESS AWB 1.0`, left, y, {
    width,
    fontSize: 8,
    color: '#333333',
  });
  y += gap;
  drawHLine(doc, left, right, y, 1.2);
  y += gap;

  // FROM + ORIGIN
  const originCol = 78;
  const mainCol = width - originCol - 12;
  const fromTop = y;
  y = drawTextAt(doc, `From : ${awbData.sender.name}`, left, y, {
    width: mainCol,
    fontSize: 11,
    font: 'Helvetica-Bold',
  });
  drawTextAt(doc, 'Origin:', left + mainCol + 8, fromTop, {
    width: originCol,
    fontSize: 9,
    font: 'Helvetica-Bold',
  });
  drawTextAt(doc, awbData.route.originCode, left + mainCol + 8, fromTop + 14, {
    width: originCol,
    fontSize: 26,
    font: 'Helvetica-Bold',
  });
  for (const line of [...awbData.sender.addressLines, awbData.sender.country].filter(Boolean)) {
    y = drawTextAt(doc, line, left, y, { width: mainCol, fontSize: 9 });
  }
  y = Math.max(y, fromTop + 48) + gap;
  drawHLine(doc, left, right, y, 0.7);
  y += gap;

  // TO + CONTACT
  const contactCol = 130;
  const toCol = width - contactCol - 12;
  const toTop = y;
  y = drawTextAt(doc, `To : ${awbData.receiver.name}`, left, y, {
    width: toCol,
    fontSize: 11,
    font: 'Helvetica-Bold',
  });
  let cy = drawTextAt(doc, 'Contact:', left + toCol + 8, toTop, {
    width: contactCol,
    fontSize: 9,
    font: 'Helvetica-Bold',
  });
  cy = drawTextAt(
    doc,
    awbData.receiver.contactName || awbData.receiver.name,
    left + toCol + 8,
    cy,
    { width: contactCol, fontSize: 9 }
  );
  if (awbData.receiver.phone) {
    cy = drawTextAt(doc, awbData.receiver.phone, left + toCol + 8, cy, {
      width: contactCol,
      fontSize: 9,
    });
  }
  for (const line of [...awbData.receiver.addressLines, awbData.receiver.country].filter(Boolean)) {
    y = drawTextAt(doc, line, left, y, { width: toCol, fontSize: 9 });
  }
  y = Math.max(y, cy) + gap;
  drawHLine(doc, left, right, y, 1.2);
  y += gap;

  // Routing
  y = drawTextAt(doc, awbData.route.routingLine, left, y, {
    width,
    fontSize: 15,
    font: 'Helvetica-Bold',
  });
  y += gap;

  doc.save().rect(left, y, 84, 22).fill('#000000');
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('C-KNX', left, y + 5, { width: 84, align: 'center', lineBreak: false });
  doc.restore();
  drawTextAt(doc, 'Time', left + 96, y + 3, { width: 50, fontSize: 9 });
  drawTextAt(doc, 'Day', left + 150, y + 3, { width: 50, fontSize: 9 });
  y += 28;
  drawHLine(doc, left, right, y, 0.7);
  y += gap;

  // Ref full width, then weight + piece on next row
  y = drawTextAt(doc, `Ref: ${awbData.reference}`, left, y, {
    width,
    fontSize: 9,
  });
  y += 4;
  const metaTop = y;
  drawTextAt(doc, 'Pce/Shpt Weight', left, metaTop, {
    width: width / 2 - 8,
    fontSize: 8,
    font: 'Helvetica-Bold',
  });
  drawTextAt(doc, 'Piece', left + width / 2, metaTop, {
    width: width / 2,
    fontSize: 8,
    font: 'Helvetica-Bold',
  });
  drawTextAt(doc, awbData.weightLabel, left, metaTop + 12, {
    width: width / 2 - 8,
    fontSize: 14,
    font: 'Helvetica-Bold',
  });
  drawTextAt(doc, `${pieceIndex} / ${awbData.pieces}`, left + width / 2, metaTop + 12, {
    width: width / 2,
    fontSize: 14,
    font: 'Helvetica-Bold',
  });
  y = metaTop + 32;
  drawHLine(doc, left, right, y, 0.7);
  y += gap;

  y = drawTextAt(doc, BRAND.terms, left, y, {
    width,
    fontSize: 7,
    color: '#333333',
  });
  y += 3;
  y = drawTextAt(doc, `Contents: ${awbData.contents}`, left, y, {
    width,
    fontSize: 9,
  });
  y += gap;

  // Barcodes with full readable labels
  const waybillValue = sanitizeAwbForBarcode(awbData.awb) || 'PENDING';
  const routingValue = routingBarcodeValue(awbData.route, awbData.awb);
  const pieceId = awbData.pieceIds[pieceIndex - 1] || generatePieceId(awbData.awb, pieceIndex);
  const barcodeWidth = Math.min(340, width - 10);
  const barcodes = [
    { value: waybillValue, label: `WAYBILL ${awbData.awbDisplay}`, height: 12 },
    { value: routingValue, label: routingValue, height: 10 },
    { value: pieceId, label: `(J) ${pieceId}`, height: 10 },
  ];

  for (const bc of barcodes) {
    const imgH = 38;
    try {
      const png = await makeBarcodePng(bc.value, { height: bc.height, scale: 2 });
      doc.image(png, left + (width - barcodeWidth) / 2, y, {
        width: barcodeWidth,
        height: imgH,
      });
    } catch (_) {
      y = drawTextAt(doc, `[barcode] ${bc.label}`, left, y, {
        width,
        fontSize: 8,
        align: 'center',
      });
    }
    y += imgH + 3;
    y = drawTextAt(doc, bc.label, left, y, {
      width,
      fontSize: 11,
      font: 'Helvetica-Bold',
      align: 'center',
    });
    y += 10;
  }

  drawTextAt(doc, 'ATTACH TO PACKAGE', PAGE.width / 2 + 24, margin, {
    width: PAGE.width / 2 - 48,
    fontSize: 9,
    color: '#888888',
    align: 'center',
  });
}

/**
 * Final page: Waybill DOC — hand to courier (not attached to package).
 */
async function drawWaybillDoc(doc, awbData) {
  const margin = 28;
  const left = margin;
  const right = PAGE.width - margin;
  const width = right - left;
  const gap = 8;
  let y = margin;

  const brandW = 130;
  const badgeW = 52;
  drawTextAt(doc, '*WAYBILL DOC*', left, y, {
    width: width - badgeW - brandW - 24,
    fontSize: 14,
    font: 'Helvetica-Bold',
  });
  drawProductBadge(doc, right - brandW - badgeW - 10, y, awbData.productCode);
  drawTextAt(doc, BRAND.name, right - brandW, y, {
    width: brandW,
    fontSize: 14,
    font: 'Helvetica-Bold',
    color: '#008000',
    align: 'right',
  });
  drawTextAt(doc, BRAND.website, right - brandW, y + 16, {
    width: brandW,
    fontSize: 7,
    color: '#444444',
    align: 'right',
  });
  y += 34;

  y = drawTextAt(doc, 'Not to be attached to package — Hand to Courier', left, y, {
    width,
    fontSize: 9,
    color: '#333333',
  });
  y = drawTextAt(doc, `${awbData.createdAt}  KNEXPRESS /`, left, y + 2, {
    width,
    fontSize: 9,
    color: '#333333',
  });
  y += gap;
  drawHLine(doc, left, right, y, 1.2);
  y += gap;

  const colGap = 16;
  const colW = (width - colGap) / 2;
  const mid = left + colW + colGap;
  const sectionTop = y;

  let sy = drawTextAt(doc, 'Shipper :', left, sectionTop, {
    width: colW,
    fontSize: 10,
    font: 'Helvetica-Bold',
  });
  for (const line of [
    awbData.sender.name,
    ...awbData.sender.addressLines,
    awbData.sender.country,
  ].filter(Boolean)) {
    sy = drawTextAt(doc, line, left, sy, { width: colW, fontSize: 9 });
  }
  if (awbData.sender.phone) {
    sy = drawTextAt(doc, 'Contact:', left, sy + 2, {
      width: colW,
      fontSize: 8,
      font: 'Helvetica-Bold',
    });
    sy = drawTextAt(doc, awbData.sender.phone, left, sy, {
      width: colW,
      fontSize: 9,
    });
  }

  doc.font('Helvetica').fontSize(9);
  let estH = 18;
  for (const line of [
    awbData.receiver.name,
    ...awbData.receiver.addressLines,
    awbData.receiver.country,
    'Contact:',
    awbData.receiver.contactName || awbData.receiver.name,
    awbData.receiver.phone,
    awbData.receiver.email,
  ].filter(Boolean)) {
    estH += doc.heightOfString(String(line), { width: colW - 12, lineGap: 2 }) + 2;
  }
  const boxH = Math.max(estH, sy - sectionTop + 10, 110);
  doc.save().lineWidth(1.2).rect(mid, sectionTop - 2, colW, boxH).stroke().restore();

  let ry = drawTextAt(doc, 'Receiver :', mid + 6, sectionTop, {
    width: colW - 12,
    fontSize: 10,
    font: 'Helvetica-Bold',
  });
  for (const line of [
    awbData.receiver.name,
    ...awbData.receiver.addressLines,
    awbData.receiver.country,
  ].filter(Boolean)) {
    ry = drawTextAt(doc, line, mid + 6, ry, { width: colW - 12, fontSize: 9 });
  }
  ry = drawTextAt(doc, 'Contact:', mid + 6, ry + 2, {
    width: colW - 12,
    fontSize: 8,
    font: 'Helvetica-Bold',
  });
  ry = drawTextAt(
    doc,
    awbData.receiver.contactName || awbData.receiver.name,
    mid + 6,
    ry,
    { width: colW - 12, fontSize: 9 }
  );
  if (awbData.receiver.phone) {
    ry = drawTextAt(doc, awbData.receiver.phone, mid + 6, ry, {
      width: colW - 12,
      fontSize: 9,
    });
  }
  if (awbData.receiver.email) {
    ry = drawTextAt(doc, awbData.receiver.email, mid + 6, ry, {
      width: colW - 12,
      fontSize: 8,
    });
  }

  y = Math.max(sy, sectionTop - 2 + boxH, ry) + gap + 4;
  drawHLine(doc, left, right, y, 1);
  y += gap;

  y = drawTextAt(doc, awbData.route.routingLine, left, y, {
    width,
    fontSize: 15,
    font: 'Helvetica-Bold',
  });
  y += gap;
  drawHLine(doc, left, right, y, 0.7);
  y += gap;

  const col3 = width / 3;
  const trioTop = y;
  drawTextAt(doc, 'Product Details:', left, trioTop, {
    width: col3 - 8,
    fontSize: 9,
    font: 'Helvetica-Bold',
  });
  drawTextAt(doc, 'Payer Details', left + col3, trioTop, {
    width: col3 - 8,
    fontSize: 9,
    font: 'Helvetica-Bold',
  });
  drawTextAt(doc, 'Features / Services', left + col3 * 2, trioTop, {
    width: col3 - 8,
    fontSize: 9,
    font: 'Helvetica-Bold',
  });
  let t1 = drawTextAt(
    doc,
    `[P] ${awbData.productName} (${awbData.productCode})`,
    left,
    trioTop + 14,
    { width: col3 - 8, fontSize: 9 }
  );
  let t2 = drawTextAt(doc, 'Freight: Shipper', left + col3, trioTop + 14, {
    width: col3 - 8,
    fontSize: 9,
  });
  t2 = drawTextAt(doc, 'Duty / Taxes: Receiver Will Pay', left + col3, t2, {
    width: col3 - 8,
    fontSize: 9,
  });
  const t3 = drawTextAt(doc, 'Duties & Taxes Unpaid', left + col3 * 2, trioTop + 14, {
    width: col3 - 8,
    fontSize: 9,
  });
  y = Math.max(t1, t2, t3) + gap;
  drawHLine(doc, left, right, y, 0.7);
  y += gap;

  y = drawTextAt(doc, 'Shipment Details', left, y, {
    width,
    fontSize: 10,
    font: 'Helvetica-Bold',
  });
  y += 4;

  // Full-width ref/contents, then weight/pieces/value in a row
  y = drawTextAt(doc, `Ref: ${awbData.reference}`, left, y, { width, fontSize: 9 });
  y = drawTextAt(doc, `Contents: ${awbData.contents}`, left, y + 2, { width, fontSize: 9 });
  y += 6;

  const shipTop = y;
  drawTextAt(doc, 'Cust Decl Shpt Wgt (UOM):', left, shipTop, {
    width: col3 - 8,
    fontSize: 8,
  });
  drawTextAt(doc, 'Custom Val', left + col3, shipTop, {
    width: col3 - 8,
    fontSize: 8,
  });
  drawTextAt(doc, 'Pieces', left + col3 * 2, shipTop, {
    width: col3 - 8,
    fontSize: 8,
  });
  drawTextAt(doc, awbData.weightLabel, left, shipTop + 12, {
    width: col3 - 8,
    fontSize: 14,
    font: 'Helvetica-Bold',
  });
  drawTextAt(doc, awbData.declaredValueLabel, left + col3, shipTop + 12, {
    width: col3 - 8,
    fontSize: 14,
    font: 'Helvetica-Bold',
  });
  drawTextAt(doc, String(awbData.pieces), left + col3 * 2, shipTop + 12, {
    width: col3 - 8,
    fontSize: 14,
    font: 'Helvetica-Bold',
  });
  y = shipTop + 34;
  drawHLine(doc, left, right, y, 0.7);
  y += gap;

  y = drawTextAt(doc, BRAND.terms, left, y, {
    width,
    fontSize: 7,
    color: '#333333',
  });
  y += gap + 4;

  const sigW = (width - 20) / 3;
  drawTextAt(doc, 'Name (in Capital Letters)', left, y, { width: sigW, fontSize: 8 });
  drawTextAt(doc, 'Signature', left + sigW + 10, y, { width: sigW, fontSize: 8 });
  drawTextAt(doc, 'Date (DD.MM.YYYY)', left + (sigW + 10) * 2, y, {
    width: sigW,
    fontSize: 8,
  });
  y += 22;
  drawHLine(doc, left, left + sigW, y, 0.5);
  drawHLine(doc, left + sigW + 10, left + sigW * 2 + 10, y, 0.5);
  drawHLine(doc, left + (sigW + 10) * 2, left + (sigW + 10) * 2 + sigW, y, 0.5);
  y += gap + 8;

  const waybillValue = sanitizeAwbForBarcode(awbData.awb) || 'PENDING';
  const bw = Math.min(380, width - 40);
  try {
    const png = await makeBarcodePng(waybillValue, { height: 14, scale: 3 });
    doc.image(png, left + (width - bw) / 2, y, { width: bw, height: 42 });
    y += 46;
  } catch (_) {
    y += 8;
  }
  y = drawTextAt(doc, `WAYBILL ${awbData.awbDisplay}`, left, y, {
    width,
    fontSize: 13,
    font: 'Helvetica-Bold',
    align: 'center',
  });
  y += gap;

  y = drawTextAt(doc, 'License Plates of pieces in shipment', left, y, {
    width,
    fontSize: 9,
    font: 'Helvetica-Bold',
  });
  for (const pid of awbData.pieceIds.slice(0, 8)) {
    y = drawTextAt(doc, pid, left, y, { width, fontSize: 9 });
  }

  drawTextAt(doc, '- page 1 of 1 -', left, PAGE.height - 22, {
    width,
    fontSize: 8,
    color: '#666666',
    align: 'center',
  });
}

/**
 * Generate AWB PDF buffer for a booking record.
 * @returns {Promise<Buffer>}
 */
async function generateAwbPDF(booking) {
  const awbData = buildAwbData(booking);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE.width, PAGE.height],
      margin: 0,
      info: {
        Title: `KNEXPRESS AWB ${awbData.awb}`,
        Author: BRAND.legal,
        Subject: 'Air Waybill / Shipping Label',
      },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    (async () => {
      try {
        for (let i = 1; i <= awbData.pieces; i += 1) {
          if (i > 1) doc.addPage({ size: [PAGE.width, PAGE.height], margin: 0 });
          await drawPackageLabel(doc, awbData, i);
        }
        doc.addPage({ size: [PAGE.width, PAGE.height], margin: 0 });
        await drawWaybillDoc(doc, awbData);
        doc.end();
      } catch (err) {
        reject(err);
      }
    })();
  });
}

module.exports = {
  generateAwbPDF,
  buildAwbData,
  BRAND,
};
