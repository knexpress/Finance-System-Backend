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
  const joined = unique.slice(0, 4).join(', ');
  return unique.length > 4 ? `${joined}…` : joined;
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

function drawHLine(doc, x1, x2, y, width = 0.8) {
  doc
    .save()
    .lineWidth(width)
    .strokeColor('#000000')
    .moveTo(x1, y)
    .lineTo(x2, y)
    .stroke()
    .restore();
}

function drawBrandMark(doc, x, y) {
  doc
    .save()
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#008000')
    .text(BRAND.name, x, y, { width: 160, align: 'right', lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#333333')
    .text(BRAND.website, x, y + 20, { width: 160, align: 'right', lineBreak: false });
  doc.restore();
}

function drawProductBadge(doc, x, y, code) {
  const w = 54;
  const h = 28;
  doc.save().rect(x, y, w, h).fill('#000000');
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(code, x, y + 7, { width: w, align: 'center', lineBreak: false });
  doc.restore();
}

/**
 * Page 1+: Package label(s) — attach to package. One page per piece.
 */
async function drawPackageLabel(doc, awbData, pieceIndex) {
  const margin = 28;
  const left = margin;
  const right = PAGE.width / 2 - 10; // left half of landscape (printable label area)
  const width = right - left;
  let y = margin;

  // Header
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#000000')
    .text(awbData.productName, left, y + 4, {
      width: width - 230,
      lineBreak: false,
      ellipsis: false,
    });
  drawProductBadge(doc, left + width - 220, y - 2, awbData.productCode);
  drawBrandMark(doc, left + width - 160, y);

  y += 36;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#333333')
    .text(`${awbData.createdAt}  KNEXPRESS AWB 1.0`, left, y);
  y += 14;
  drawHLine(doc, left, right, y, 1.2);
  y += 10;

  // From + Origin
  const colLeftW = width * 0.62;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(`From : ${awbData.sender.name}`, left, y);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('Origin:', left + colLeftW, y);
  doc
    .font('Helvetica-Bold')
    .fontSize(28)
    .text(awbData.route.originCode, left + colLeftW, y + 12);

  y += 14;
  doc.font('Helvetica').fontSize(9).fillColor('#000000');
  const fromLines = [
    awbData.sender.name,
    ...awbData.sender.addressLines,
    awbData.sender.country,
  ].filter(Boolean);
  fromLines.forEach((line) => {
    doc.text(line, left, y, { width: colLeftW - 8 });
    y += 11;
  });

  y += 6;
  drawHLine(doc, left, right, y, 0.6);
  y += 8;

  // To + Contact
  const toTop = y;
  doc.font('Helvetica-Bold').fontSize(11).text(`To : ${awbData.receiver.name}`, left, y);
  doc.font('Helvetica-Bold').fontSize(9).text('Contact:', left + colLeftW, y);
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(awbData.receiver.contactName || awbData.receiver.name, left + colLeftW, y + 12, {
      width: width - colLeftW - 4,
    });
  if (awbData.receiver.phone) {
    doc.text(awbData.receiver.phone, left + colLeftW, y + 24, {
      width: width - colLeftW - 4,
    });
  }

  y += 14;
  const toLines = [...awbData.receiver.addressLines, awbData.receiver.country].filter(Boolean);
  toLines.forEach((line) => {
    doc.font('Helvetica').fontSize(10).text(line, left, y, { width: colLeftW - 8 });
    y += 12;
  });
  y = Math.max(y, toTop + 70);

  y += 6;
  drawHLine(doc, left, right, y, 1.5);
  y += 8;

  // Routing
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(awbData.route.routingLine, left, y, { width: width - 8 });
  y += 26;

  // Service band
  doc.save().rect(left, y, 90, 22).fill('#000000');
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('C-KNX', left, y + 5, { width: 90, align: 'center', lineBreak: false });
  doc.restore();
  doc
    .fillColor('#000000')
    .font('Helvetica')
    .fontSize(8)
    .text('Time', left + 100, y + 2)
    .text('Day', left + 140, y + 2);
  y += 30;
  drawHLine(doc, left, right, y, 0.6);
  y += 8;

  // Ref / weight / pieces
  doc.font('Helvetica').fontSize(9).fillColor('#000000');
  doc.text(`Ref: ${awbData.reference}`, left, y, { width: width * 0.45 });
  doc.font('Helvetica-Bold').fontSize(8).text('Pce/Shpt Weight', left + width * 0.45, y);
  doc.font('Helvetica-Bold').fontSize(8).text('Piece', left + width * 0.78, y);
  y += 12;
  doc.font('Helvetica-Bold').fontSize(14).text(awbData.weightLabel, left + width * 0.45, y);
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(`${pieceIndex} / ${awbData.pieces}`, left + width * 0.78, y);
  y += 22;
  drawHLine(doc, left, right, y, 0.6);
  y += 8;

  doc.font('Helvetica').fontSize(8).text(BRAND.terms, left, y, { width: width, align: 'left' });
  y += 18;
  doc.font('Helvetica').fontSize(8).text(`Contents: ${awbData.contents}`, left, y, { width: width });
  y += 16;

  // Barcodes
  const waybillValue = sanitizeAwbForBarcode(awbData.awb) || 'PENDING';
  const routingValue = routingBarcodeValue(awbData.route, awbData.awb);
  const pieceId = awbData.pieceIds[pieceIndex - 1] || generatePieceId(awbData.awb, pieceIndex);

  const barcodeWidth = Math.min(320, width - 20);
  const barcodes = [
    { value: waybillValue, label: `WAYBILL ${awbData.awbDisplay}`, height: 14 },
    { value: routingValue, label: routingValue, height: 12 },
    { value: pieceId, label: `(J) ${pieceId}`, height: 12 },
  ];

  for (const bc of barcodes) {
    try {
      const png = await makeBarcodePng(bc.value, { height: bc.height, scale: 2 });
      const imgX = left + (width - barcodeWidth) / 2;
      doc.image(png, imgX, y, { width: barcodeWidth, height: 42 });
      y += 46;
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#000000')
        .text(bc.label, left, y, { width: width, align: 'center' });
      y += 18;
    } catch (err) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(`[barcode] ${bc.label}`, left, y, { width: width, align: 'center' });
      y += 16;
    }
  }

  // Right-side tear-off hint (empty half for fold/print)
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#999999')
    .text('ATTACH TO PACKAGE', PAGE.width / 2 + 40, margin, {
      width: PAGE.width / 2 - 70,
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
  let y = margin;

  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#000000')
    .text('*WAYBILL DOC*', left, y);
  drawProductBadge(doc, right - 220, y - 2, awbData.productCode);
  drawBrandMark(doc, right - 160, y);

  y += 22;
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#333333')
    .text('Not to be attached to package — Hand to Courier', left, y);
  y += 12;
  doc.text(`${awbData.createdAt}  KNEXPRESS /`, left, y);
  y += 14;
  drawHLine(doc, left, right, y, 1.2);
  y += 10;

  const mid = left + width / 2;
  const colW = width / 2 - 12;

  // Shipper
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('Shipper :', left, y);
  let sy = y + 14;
  doc.font('Helvetica').fontSize(9);
  [awbData.sender.name, ...awbData.sender.addressLines, awbData.sender.country]
    .filter(Boolean)
    .forEach((line) => {
      doc.text(line, left, sy, { width: colW });
      sy += 11;
    });
  if (awbData.sender.phone) {
    doc.font('Helvetica-Bold').fontSize(8).text('Contact:', left, sy);
    sy += 11;
    doc.font('Helvetica').fontSize(9).text(awbData.sender.phone, left, sy);
    sy += 11;
  }

  // Receiver (boxed)
  const boxX = mid;
  const boxY = y - 2;
  const boxH = Math.max(110, sy - y + 10);
  doc.save().lineWidth(1.5).rect(boxX, boxY, colW + 8, boxH).stroke().restore();
  let ry = y;
  doc.font('Helvetica-Bold').fontSize(10).text('Receiver :', boxX + 6, ry);
  ry += 14;
  doc.font('Helvetica').fontSize(9);
  [awbData.receiver.name, ...awbData.receiver.addressLines, awbData.receiver.country]
    .filter(Boolean)
    .forEach((line) => {
      doc.text(line, boxX + 6, ry, { width: colW - 4 });
      ry += 11;
    });
  doc.font('Helvetica-Bold').fontSize(8).text('Contact:', boxX + 6, ry);
  ry += 11;
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(awbData.receiver.contactName || awbData.receiver.name, boxX + 6, ry, {
      width: colW - 4,
    });
  ry += 11;
  if (awbData.receiver.phone) {
    doc.text(awbData.receiver.phone, boxX + 6, ry, { width: colW - 4 });
    ry += 11;
  }
  if (awbData.receiver.email) {
    doc.text(awbData.receiver.email, boxX + 6, ry, { width: colW - 4 });
  }

  y = Math.max(sy, boxY + boxH) + 12;
  drawHLine(doc, left, right, y, 1);
  y += 10;

  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(awbData.route.routingLine, left, y, { width: width });
  y += 24;
  drawHLine(doc, left, right, y, 0.6);
  y += 10;

  // Product / payer / features
  const col3 = width / 3;
  doc.font('Helvetica-Bold').fontSize(9).text('Product Details:', left, y);
  doc.font('Helvetica-Bold').fontSize(9).text('Payer Details', left + col3, y);
  doc.font('Helvetica-Bold').fontSize(9).text('Features / Services', left + col3 * 2, y);
  y += 12;
  doc.font('Helvetica').fontSize(9);
  doc.text(`[P] ${awbData.productName} (${awbData.productCode})`, left, y, { width: col3 - 8 });
  doc.text('Freight: Shipper', left + col3, y);
  doc.text('Duties & Taxes Unpaid', left + col3 * 2, y);
  y += 12;
  doc.text(`Duty / Taxes: Receiver Will Pay`, left + col3, y);
  y += 16;
  drawHLine(doc, left, right, y, 0.6);
  y += 10;

  doc.font('Helvetica-Bold').fontSize(10).text('Shipment Details', left, y);
  y += 14;
  doc.font('Helvetica').fontSize(9);
  doc.text(`Ref: ${awbData.reference}`, left, y);
  doc.text(`Custom Val: ${awbData.declaredValueLabel}`, left + col3, y);
  y += 14;
  doc.text('Cust Decl Shpt Wgt (UOM):', left, y);
  doc.font('Helvetica-Bold').fontSize(16).text(awbData.weightLabel, left, y + 14);
  doc.font('Helvetica').fontSize(9).text('Pieces', left + col3, y);
  doc.font('Helvetica-Bold').fontSize(16).text(String(awbData.pieces), left + col3, y + 14);
  doc.font('Helvetica').fontSize(8).text(`Contents: ${awbData.contents}`, left + col3 * 2, y, {
    width: col3 - 4,
  });
  y += 40;
  drawHLine(doc, left, right, y, 0.6);
  y += 10;

  doc.font('Helvetica').fontSize(8).fillColor('#333333').text(BRAND.terms, left, y, { width: width });
  y += 16;

  // Signature lines
  const sigW = width / 3 - 10;
  doc.font('Helvetica').fontSize(8).fillColor('#000000');
  doc.text('Name (in Capital Letters)', left, y);
  doc.text('Signature', left + sigW + 10, y);
  doc.text('Date (DD.MM.YYYY)', left + (sigW + 10) * 2, y);
  y += 28;
  drawHLine(doc, left, left + sigW, y, 0.5);
  drawHLine(doc, left + sigW + 10, left + sigW * 2 + 10, y, 0.5);
  drawHLine(doc, left + (sigW + 10) * 2, left + (sigW + 10) * 2 + sigW, y, 0.5);
  y += 18;

  // Waybill barcode
  const waybillValue = sanitizeAwbForBarcode(awbData.awb) || 'PENDING';
  try {
    const png = await makeBarcodePng(waybillValue, { height: 16, scale: 3 });
    const bw = 360;
    doc.image(png, left + (width - bw) / 2, y, { width: bw, height: 48 });
    y += 52;
  } catch (_) {
    y += 10;
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(`WAYBILL ${awbData.awbDisplay}`, left, y, { width: width, align: 'center' });
  y += 22;

  doc.font('Helvetica-Bold').fontSize(9).text('License Plates of pieces in shipment', left, y);
  y += 12;
  doc.font('Helvetica').fontSize(9);
  awbData.pieceIds.forEach((pid) => {
    doc.text(pid, left, y);
    y += 11;
  });

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#666666')
    .text('- page 1 of 1 -', left, PAGE.height - 24, { width: width, align: 'center' });
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
