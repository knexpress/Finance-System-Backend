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

/** Draw wrapped text at an absolute position; returns Y below the block. */
function drawTextAt(doc, text, x, y, opts = {}) {
  const {
    width = 200,
    fontSize = 9,
    font = 'Helvetica',
    color = '#000000',
    align = 'left',
    lineGap = 1,
    maxLines = 0,
  } = opts;
  let str = String(text == null ? '' : text);
  doc.save();
  doc.font(font).fontSize(fontSize).fillColor(color);
  if (maxLines > 0) {
    const lineH = fontSize + lineGap;
    const maxH = maxLines * lineH;
    while (str && doc.heightOfString(str, { width, lineGap }) > maxH && str.length > 3) {
      str = `${str.slice(0, Math.max(1, str.length - 4))}…`;
    }
  }
  const h = Math.max(fontSize + 2, doc.heightOfString(str, { width, align, lineGap }));
  doc.text(str, x, y, {
    width,
    align,
    lineGap,
    lineBreak: true,
  });
  doc.restore();
  return y + h;
}

function drawProductBadge(doc, x, y, code) {
  const w = 50;
  const h = 24;
  doc.save().rect(x, y, w, h).fill('#000000');
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(code, x, y + 5, { width: w, align: 'center', lineBreak: false });
  doc.restore();
  return h;
}

/**
 * Page 1+: Package label(s) — attach to package. One page per piece.
 */
async function drawPackageLabel(doc, awbData, pieceIndex) {
  const margin = 24;
  const left = margin;
  // Use left ~48% of landscape page as the label column to avoid crowding
  const right = Math.min(PAGE.width * 0.48, 400);
  const width = right - left;
  const gap = 6;
  let y = margin;

  // Header row: title | badge | brand (non-overlapping columns)
  const badgeW = 50;
  const brandW = 110;
  const titleW = Math.max(80, width - badgeW - brandW - 16);
  drawTextAt(doc, awbData.productName, left, y + 4, {
    width: titleW,
    fontSize: 13,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  drawProductBadge(doc, left + titleW + 8, y, awbData.productCode);
  drawTextAt(doc, BRAND.name, left + titleW + badgeW + 12, y, {
    width: brandW,
    fontSize: 12,
    font: 'Helvetica-Bold',
    color: '#008000',
    align: 'right',
    maxLines: 1,
  });
  drawTextAt(doc, BRAND.website, left + titleW + badgeW + 12, y + 14, {
    width: brandW,
    fontSize: 7,
    color: '#333333',
    align: 'right',
    maxLines: 1,
  });
  y += 30;

  y = drawTextAt(doc, `${awbData.createdAt}  KNEXPRESS AWB 1.0`, left, y, {
    width,
    fontSize: 8,
    color: '#333333',
    maxLines: 1,
  });
  y += gap;
  drawHLine(doc, left, right, y, 1.2);
  y += gap + 2;

  // From + Origin (two columns with clear widths)
  const originW = 70;
  const leftColW = width - originW - 10;
  const fromTop = y;
  y = drawTextAt(doc, `From : ${awbData.sender.name}`, left, y, {
    width: leftColW,
    fontSize: 10,
    font: 'Helvetica-Bold',
    maxLines: 2,
  });
  drawTextAt(doc, 'Origin:', left + leftColW + 6, fromTop, {
    width: originW,
    fontSize: 8,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  drawTextAt(doc, awbData.route.originCode, left + leftColW + 6, fromTop + 12, {
    width: originW,
    fontSize: 22,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });

  const fromBody = [
    ...awbData.sender.addressLines,
    awbData.sender.country,
  ].filter(Boolean);
  for (const line of fromBody) {
    y = drawTextAt(doc, line, left, y, {
      width: leftColW,
      fontSize: 9,
      maxLines: 2,
    });
  }
  y = Math.max(y, fromTop + 40) + gap;
  drawHLine(doc, left, right, y, 0.6);
  y += gap + 2;

  // To + Contact
  const contactW = 120;
  const toColW = width - contactW - 10;
  const toTop = y;
  y = drawTextAt(doc, `To : ${awbData.receiver.name}`, left, y, {
    width: toColW,
    fontSize: 10,
    font: 'Helvetica-Bold',
    maxLines: 2,
  });
  let cy = toTop;
  cy = drawTextAt(doc, 'Contact:', left + toColW + 6, cy, {
    width: contactW,
    fontSize: 8,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  cy = drawTextAt(
    doc,
    awbData.receiver.contactName || awbData.receiver.name,
    left + toColW + 6,
    cy,
    { width: contactW, fontSize: 9, maxLines: 2 }
  );
  if (awbData.receiver.phone) {
    cy = drawTextAt(doc, awbData.receiver.phone, left + toColW + 6, cy, {
      width: contactW,
      fontSize: 9,
      maxLines: 1,
    });
  }

  const toBody = [...awbData.receiver.addressLines, awbData.receiver.country].filter(Boolean);
  for (const line of toBody) {
    y = drawTextAt(doc, line, left, y, {
      width: toColW,
      fontSize: 9,
      maxLines: 2,
    });
  }
  y = Math.max(y, cy) + gap;
  drawHLine(doc, left, right, y, 1.2);
  y += gap + 2;

  // Routing
  y = drawTextAt(doc, awbData.route.routingLine, left, y, {
    width,
    fontSize: 14,
    font: 'Helvetica-Bold',
    maxLines: 2,
  });
  y += gap;

  // Service band
  doc.save().rect(left, y, 78, 20).fill('#000000');
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('C-KNX', left, y + 4, { width: 78, align: 'center', lineBreak: false });
  doc.restore();
  drawTextAt(doc, 'Time', left + 88, y + 2, { width: 40, fontSize: 8, maxLines: 1 });
  drawTextAt(doc, 'Day', left + 130, y + 2, { width: 40, fontSize: 8, maxLines: 1 });
  y += 26;
  drawHLine(doc, left, right, y, 0.6);
  y += gap + 2;

  // Ref / weight / pieces — three fixed columns
  const c1 = width * 0.46;
  const c2 = width * 0.30;
  const c3 = width * 0.24;
  const metaTop = y;
  let y1 = drawTextAt(doc, `Ref: ${awbData.reference}`, left, metaTop, {
    width: c1 - 6,
    fontSize: 8,
    maxLines: 3,
  });
  drawTextAt(doc, 'Pce/Shpt Weight', left + c1, metaTop, {
    width: c2 - 4,
    fontSize: 8,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  drawTextAt(doc, awbData.weightLabel, left + c1, metaTop + 12, {
    width: c2 - 4,
    fontSize: 12,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  drawTextAt(doc, 'Piece', left + c1 + c2, metaTop, {
    width: c3,
    fontSize: 8,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  drawTextAt(doc, `${pieceIndex} / ${awbData.pieces}`, left + c1 + c2, metaTop + 12, {
    width: c3,
    fontSize: 12,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  y = Math.max(y1, metaTop + 28) + gap;
  drawHLine(doc, left, right, y, 0.6);
  y += gap + 2;

  y = drawTextAt(doc, BRAND.terms, left, y, {
    width,
    fontSize: 7,
    color: '#333333',
    maxLines: 2,
  });
  y += 3;
  y = drawTextAt(doc, `Contents: ${awbData.contents}`, left, y, {
    width,
    fontSize: 8,
    maxLines: 2,
  });
  y += gap + 2;

  // Barcodes — fixed block heights so labels never collide
  const waybillValue = sanitizeAwbForBarcode(awbData.awb) || 'PENDING';
  const routingValue = routingBarcodeValue(awbData.route, awbData.awb);
  const pieceId = awbData.pieceIds[pieceIndex - 1] || generatePieceId(awbData.awb, pieceIndex);
  const barcodeWidth = Math.min(300, width - 16);
  const barcodes = [
    { value: waybillValue, label: `WAYBILL ${awbData.awbDisplay}`, height: 12 },
    { value: routingValue, label: routingValue, height: 10 },
    { value: pieceId, label: `(J) ${pieceId}`, height: 10 },
  ];

  for (const bc of barcodes) {
    const blockTop = y;
    const imgH = 36;
    try {
      const png = await makeBarcodePng(bc.value, { height: bc.height, scale: 2 });
      const imgX = left + (width - barcodeWidth) / 2;
      doc.image(png, imgX, blockTop, { width: barcodeWidth, height: imgH });
    } catch (_) {
      drawTextAt(doc, `[barcode] ${bc.label}`, left, blockTop, {
        width,
        fontSize: 8,
        align: 'center',
        maxLines: 1,
      });
    }
    y = blockTop + imgH + 2;
    y = drawTextAt(doc, bc.label, left, y, {
      width,
      fontSize: 10,
      font: 'Helvetica-Bold',
      align: 'center',
      maxLines: 1,
    });
    y += 8;
  }

  drawTextAt(doc, 'ATTACH TO PACKAGE', PAGE.width / 2 + 30, margin, {
    width: PAGE.width / 2 - 60,
    fontSize: 8,
    color: '#999999',
    align: 'center',
    maxLines: 1,
  });
}

/**
 * Final page: Waybill DOC — hand to courier (not attached to package).
 */
async function drawWaybillDoc(doc, awbData) {
  const margin = 24;
  const left = margin;
  const right = PAGE.width - margin;
  const width = right - left;
  const gap = 6;
  let y = margin;

  // Header
  const badgeW = 50;
  const brandW = 120;
  drawTextAt(doc, '*WAYBILL DOC*', left, y, {
    width: width - badgeW - brandW - 20,
    fontSize: 13,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  drawProductBadge(doc, right - brandW - badgeW - 10, y, awbData.productCode);
  drawTextAt(doc, BRAND.name, right - brandW, y, {
    width: brandW,
    fontSize: 12,
    font: 'Helvetica-Bold',
    color: '#008000',
    align: 'right',
    maxLines: 1,
  });
  drawTextAt(doc, BRAND.website, right - brandW, y + 14, {
    width: brandW,
    fontSize: 7,
    color: '#333333',
    align: 'right',
    maxLines: 1,
  });
  y += 28;

  y = drawTextAt(doc, 'Not to be attached to package — Hand to Courier', left, y, {
    width,
    fontSize: 9,
    color: '#333333',
    maxLines: 1,
  });
  y = drawTextAt(doc, `${awbData.createdAt}  KNEXPRESS /`, left, y + 2, {
    width,
    fontSize: 9,
    color: '#333333',
    maxLines: 1,
  });
  y += gap;
  drawHLine(doc, left, right, y, 1.2);
  y += gap + 2;

  // Shipper | Receiver columns
  const colGap = 14;
  const colW = (width - colGap) / 2;
  const mid = left + colW + colGap;
  const sectionTop = y;

  let sy = drawTextAt(doc, 'Shipper :', left, sectionTop, {
    width: colW,
    fontSize: 10,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  for (const line of [
    awbData.sender.name,
    ...awbData.sender.addressLines,
    awbData.sender.country,
  ].filter(Boolean)) {
    sy = drawTextAt(doc, line, left, sy, { width: colW, fontSize: 9, maxLines: 2 });
  }
  if (awbData.sender.phone) {
    sy = drawTextAt(doc, 'Contact:', left, sy + 2, {
      width: colW,
      fontSize: 8,
      font: 'Helvetica-Bold',
      maxLines: 1,
    });
    sy = drawTextAt(doc, awbData.sender.phone, left, sy, {
      width: colW,
      fontSize: 9,
      maxLines: 1,
    });
  }

  // Measure receiver height first, then draw box
  const receiverLines = [
    awbData.receiver.name,
    ...awbData.receiver.addressLines,
    awbData.receiver.country,
    awbData.receiver.contactName || awbData.receiver.name,
    awbData.receiver.phone,
    awbData.receiver.email,
  ].filter(Boolean);
  doc.font('Helvetica').fontSize(9);
  let estH = 16; // "Receiver :"
  receiverLines.forEach((line) => {
    estH += doc.heightOfString(String(line), { width: colW - 12, lineGap: 1 }) + 1;
  });
  estH += 20; // contact label spacing
  const boxH = Math.max(estH, sy - sectionTop + 8, 100);
  doc
    .save()
    .lineWidth(1.2)
    .rect(mid, sectionTop - 2, colW, boxH)
    .stroke()
    .restore();

  let ry = drawTextAt(doc, 'Receiver :', mid + 6, sectionTop, {
    width: colW - 12,
    fontSize: 10,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  for (const line of [
    awbData.receiver.name,
    ...awbData.receiver.addressLines,
    awbData.receiver.country,
  ].filter(Boolean)) {
    ry = drawTextAt(doc, line, mid + 6, ry, {
      width: colW - 12,
      fontSize: 9,
      maxLines: 2,
    });
  }
  ry = drawTextAt(doc, 'Contact:', mid + 6, ry + 2, {
    width: colW - 12,
    fontSize: 8,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  ry = drawTextAt(
    doc,
    awbData.receiver.contactName || awbData.receiver.name,
    mid + 6,
    ry,
    { width: colW - 12, fontSize: 9, maxLines: 2 }
  );
  if (awbData.receiver.phone) {
    ry = drawTextAt(doc, awbData.receiver.phone, mid + 6, ry, {
      width: colW - 12,
      fontSize: 9,
      maxLines: 1,
    });
  }
  if (awbData.receiver.email) {
    ry = drawTextAt(doc, awbData.receiver.email, mid + 6, ry, {
      width: colW - 12,
      fontSize: 8,
      maxLines: 1,
    });
  }

  y = Math.max(sy, sectionTop - 2 + boxH, ry) + gap + 4;
  drawHLine(doc, left, right, y, 1);
  y += gap + 2;

  y = drawTextAt(doc, awbData.route.routingLine, left, y, {
    width,
    fontSize: 14,
    font: 'Helvetica-Bold',
    maxLines: 2,
  });
  y += gap;
  drawHLine(doc, left, right, y, 0.6);
  y += gap + 2;

  // Product / payer / features
  const col3 = width / 3;
  const trioTop = y;
  drawTextAt(doc, 'Product Details:', left, trioTop, {
    width: col3 - 8,
    fontSize: 9,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  drawTextAt(doc, 'Payer Details', left + col3, trioTop, {
    width: col3 - 8,
    fontSize: 9,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  drawTextAt(doc, 'Features / Services', left + col3 * 2, trioTop, {
    width: col3 - 8,
    fontSize: 9,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  let t1 = drawTextAt(
    doc,
    `[P] ${awbData.productName} (${awbData.productCode})`,
    left,
    trioTop + 12,
    { width: col3 - 8, fontSize: 9, maxLines: 2 }
  );
  let t2 = drawTextAt(doc, 'Freight: Shipper', left + col3, trioTop + 12, {
    width: col3 - 8,
    fontSize: 9,
    maxLines: 1,
  });
  t2 = drawTextAt(doc, 'Duty / Taxes: Receiver Will Pay', left + col3, t2, {
    width: col3 - 8,
    fontSize: 9,
    maxLines: 2,
  });
  let t3 = drawTextAt(doc, 'Duties & Taxes Unpaid', left + col3 * 2, trioTop + 12, {
    width: col3 - 8,
    fontSize: 9,
    maxLines: 2,
  });
  y = Math.max(t1, t2, t3) + gap;
  drawHLine(doc, left, right, y, 0.6);
  y += gap + 2;

  y = drawTextAt(doc, 'Shipment Details', left, y, {
    width,
    fontSize: 10,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  y += 4;

  const shipTop = y;
  let s1 = drawTextAt(doc, `Ref: ${awbData.reference}`, left, shipTop, {
    width: col3 - 8,
    fontSize: 9,
    maxLines: 3,
  });
  s1 = drawTextAt(doc, 'Cust Decl Shpt Wgt (UOM):', left, s1 + 4, {
    width: col3 - 8,
    fontSize: 8,
    maxLines: 1,
  });
  s1 = drawTextAt(doc, awbData.weightLabel, left, s1, {
    width: col3 - 8,
    fontSize: 14,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });

  let s2 = drawTextAt(doc, `Custom Val: ${awbData.declaredValueLabel}`, left + col3, shipTop, {
    width: col3 - 8,
    fontSize: 9,
    maxLines: 2,
  });
  s2 = drawTextAt(doc, 'Pieces', left + col3, s2 + 4, {
    width: col3 - 8,
    fontSize: 8,
    maxLines: 1,
  });
  s2 = drawTextAt(doc, String(awbData.pieces), left + col3, s2, {
    width: col3 - 8,
    fontSize: 14,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });

  const s3 = drawTextAt(doc, `Contents: ${awbData.contents}`, left + col3 * 2, shipTop, {
    width: col3 - 8,
    fontSize: 8,
    maxLines: 4,
  });

  y = Math.max(s1, s2, s3) + gap;
  drawHLine(doc, left, right, y, 0.6);
  y += gap + 2;

  y = drawTextAt(doc, BRAND.terms, left, y, {
    width,
    fontSize: 7,
    color: '#333333',
    maxLines: 2,
  });
  y += gap + 4;

  // Signature lines
  const sigW = (width - 20) / 3;
  drawTextAt(doc, 'Name (in Capital Letters)', left, y, {
    width: sigW,
    fontSize: 8,
    maxLines: 1,
  });
  drawTextAt(doc, 'Signature', left + sigW + 10, y, {
    width: sigW,
    fontSize: 8,
    maxLines: 1,
  });
  drawTextAt(doc, 'Date (DD.MM.YYYY)', left + (sigW + 10) * 2, y, {
    width: sigW,
    fontSize: 8,
    maxLines: 1,
  });
  y += 22;
  drawHLine(doc, left, left + sigW, y, 0.5);
  drawHLine(doc, left + sigW + 10, left + sigW * 2 + 10, y, 0.5);
  drawHLine(doc, left + (sigW + 10) * 2, left + (sigW + 10) * 2 + sigW, y, 0.5);
  y += gap + 8;

  // Waybill barcode
  const waybillValue = sanitizeAwbForBarcode(awbData.awb) || 'PENDING';
  const bw = Math.min(360, width - 40);
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
    maxLines: 1,
  });
  y += gap;

  y = drawTextAt(doc, 'License Plates of pieces in shipment', left, y, {
    width,
    fontSize: 9,
    font: 'Helvetica-Bold',
    maxLines: 1,
  });
  for (const pid of awbData.pieceIds.slice(0, 8)) {
    y = drawTextAt(doc, pid, left, y, { width, fontSize: 9, maxLines: 1 });
  }

  drawTextAt(doc, '- page 1 of 1 -', left, PAGE.height - 22, {
    width,
    fontSize: 8,
    color: '#666666',
    align: 'center',
    maxLines: 1,
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
