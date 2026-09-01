const APP_CONFIG = Object.freeze({
  SHEET_NAME: 'sheet_1',
  TIME_ZONE: 'Asia/Bangkok',
  ID_MIGRATION_PROPERTY: 'RUNNING_ID_MIGRATION_VERSION',
  ID_COUNTER_PROPERTY: 'RUNNING_ID_LAST',
  ID_MIGRATION_VERSION: '1',
  HEADERS: [
    'id',
    'title',
    'total_calorie',
    'unit',
    'calorie_per_unit',
    'remark',
    'total_protein',
    'protein_per_unit',
    'tdee',
    'created_at',
    'updated_at'
  ]
});

/**
 * Serves the web app.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('แคลอรีของฉัน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Adds a small setup menu when the project is bound to a spreadsheet.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('แคลอรีของฉัน')
    .addItem('ตั้งค่า sheet_1', 'setupSheet')
    .addToUi();
}

/**
 * Creates the required tab and header row, or validates an existing tab.
 * Run this once from the Apps Script editor before deploying the web app.
 */
function setupSheet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const spreadsheet = getSpreadsheet_();
    let sheet = spreadsheet.getSheetByName(APP_CONFIG.SHEET_NAME);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(APP_CONFIG.SHEET_NAME);
    }

    const hasRows = sheet.getLastRow() > 0;
    if (!hasRows) {
      sheet.getRange(1, 1, 1, APP_CONFIG.HEADERS.length)
        .setValues([APP_CONFIG.HEADERS]);
    } else {
      const header = sheet.getRange(1, 1, 1, APP_CONFIG.HEADERS.length)
        .getDisplayValues()[0]
        .map(String);
      const isBlankHeader = header.every(function (value) { return value.trim() === ''; });

      if (isBlankHeader) {
        sheet.getRange(1, 1, 1, APP_CONFIG.HEADERS.length)
          .setValues([APP_CONFIG.HEADERS]);
      } else if (JSON.stringify(header) !== JSON.stringify(APP_CONFIG.HEADERS)) {
        throw new Error(
          'หัวตารางของ sheet_1 ไม่ตรงกับโครงสร้างที่กำหนด กรุณาตรวจสอบชื่อคอลัมน์แถวแรก'
        );
      }
    }

    formatSheet_(sheet);
    migrateRunningIds_(sheet);
    validateRunningIds_(sheet);
    return {
      ok: true,
      sheetName: APP_CONFIG.SHEET_NAME,
      spreadsheetId: spreadsheet.getId()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Returns all data needed to render the dashboard and CRUD list.
 */
function getAppData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    return buildAppData_();
  } finally {
    lock.releaseLock();
  }
}

function buildAppData_() {
  const records = readRecords_();
  return {
    records: records,
    latestTdee: getLatestTdee_(records),
    today: formatDateInput_(new Date()),
    timeZone: getTimeZone_()
  };
}

/**
 * Creates a new record or updates an existing record.
 * total_calorie and total_protein are always calculated on the server.
 */
function saveRecord(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = ensureSheet_();
    const records = readRecords_();
    const data = payload || {};
    const hasId = cleanText_(data.id) !== '';
    let existing = null;
    if (hasId) {
      const requestedId = parseRunningId_(data.id);
      if (requestedId === null) {
        throw new Error('รหัสรายการต้องเป็นเลขจำนวนเต็มบวก');
      }
      existing = records.find(function (record) {
        return record.id === requestedId;
      });
      if (!existing) {
        throw new Error('ไม่พบรายการที่ต้องการแก้ไข');
      }
    }

    const title = requireText_(data.title, 'กรุณากรอกชื่ออาหาร');
    const unit = requireNumber_(data.unit, 'กรุณากรอกปริมาณหน่วย', 0.000001);
    const caloriePerUnit = requireNumber_(
      data.caloriePerUnit,
      'กรุณากรอกแคลอรีต่อหน่วย',
      0
    );
    const proteinPerUnit = requireNumber_(
      data.proteinPerUnit,
      'กรุณากรอกโปรตีนต่อหน่วย',
      0
    );
    const tdee = resolveTdee_(data.tdee, records);
    const createdAt = parseDateTimeInput_(
      data.createdAt || (existing && existing.createdAt) || formatDateTimeInput_(new Date())
    );
    const now = new Date();
    const id = existing ? existing.id : nextRunningId_();
    const row = [
      id,
      title,
      roundNumber_(unit * caloriePerUnit),
      unit,
      caloriePerUnit,
      cleanText_(data.remark),
      roundNumber_(unit * proteinPerUnit),
      proteinPerUnit,
      tdee,
      createdAt,
      now
    ];

    const rowNumber = findRowNumberById_(sheet, id);
    if (rowNumber > 0) {
      sheet.getRange(rowNumber, 1, 1, APP_CONFIG.HEADERS.length).setValues([row]);
    } else {
      const nextRow = Math.max(sheet.getLastRow() + 1, 2);
      sheet.getRange(nextRow, 1, 1, APP_CONFIG.HEADERS.length).setValues([row]);
    }

    return buildAppData_();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a record by id.
 */
function deleteRecord(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = ensureSheet_();
    const records = readRecords_();
    const requestedId = parseRunningId_(id);
    if (requestedId === null) {
      throw new Error('รหัสรายการต้องเป็นเลขจำนวนเต็มบวก');
    }
    if (!records.some(function (record) { return record.id === requestedId; })) {
      throw new Error('ไม่พบรายการที่ต้องการลบ');
    }

    const rowNumber = findRowNumberById_(sheet, requestedId);
    if (rowNumber < 2) {
      throw new Error('ไม่พบรายการที่ต้องการลบ');
    }

    sheet.deleteRow(rowNumber);
    return buildAppData_();
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty('SPREADSHEET_ID');
  if (savedId) {
    return SpreadsheetApp.openById(savedId);
  }

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) {
    properties.setProperty('SPREADSHEET_ID', activeSpreadsheet.getId());
    return activeSpreadsheet;
  }

  throw new Error(
    'ยังไม่ได้เชื่อมต่อ Google Sheet กรุณาเปิด Apps Script จาก Google Sheet แล้วเรียก setupSheet() หนึ่งครั้ง'
  );
}

function ensureSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(APP_CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(APP_CONFIG.SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, APP_CONFIG.HEADERS.length)
      .setValues([APP_CONFIG.HEADERS]);
    formatSheet_(sheet);
  } else {
    const header = sheet.getRange(1, 1, 1, APP_CONFIG.HEADERS.length)
      .getDisplayValues()[0]
      .map(String);
    if (JSON.stringify(header) !== JSON.stringify(APP_CONFIG.HEADERS)) {
      throw new Error('หัวตารางของ sheet_1 ไม่ตรงกับโครงสร้างที่กำหนด');
    }
  }
  return sheet;
}

function formatSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, APP_CONFIG.HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#e8f0fe')
    .setFontColor('#16325c');

  sheet.getRange('A:A').setNumberFormat('0');
  sheet.getRange('C:C').setNumberFormat('0.##');
  sheet.getRange('D:D').setNumberFormat('0.##');
  sheet.getRange('E:E').setNumberFormat('0.##');
  sheet.getRange('G:G').setNumberFormat('0.##');
  sheet.getRange('H:H').setNumberFormat('0.##');
  sheet.getRange('I:I').setNumberFormat('0.##');
  sheet.getRange('J:J').setNumberFormat('yyyy-mm-dd HH:mm:ss');
  sheet.getRange('K:K').setNumberFormat('yyyy-mm-dd HH:mm:ss');

  const widths = [75, 220, 115, 90, 135, 260, 115, 135, 100, 115, 160];
  widths.forEach(function (width, index) {
    sheet.setColumnWidth(index + 1, width);
  });
}

function readRecords_() {
  const sheet = ensureSheet_();
  migrateRunningIds_(sheet);
  validateRunningIds_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, APP_CONFIG.HEADERS.length).getValues();
  return values
    .map(recordFromRow_)
    .filter(function (record) { return record.id !== null; })
    .sort(function (a, b) {
      return b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt);
    });
}

function migrateRunningIds_(sheet) {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(APP_CONFIG.ID_MIGRATION_PROPERTY) === APP_CONFIG.ID_MIGRATION_VERSION) {
    return;
  }

  let nextId = 1;
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, APP_CONFIG.HEADERS.length).getValues();
    const seen = Object.create(null);
    const migratedIds = values.map(function (row) {
      if (isBlankRow_(row)) {
        return [row[0]];
      }

      const legacyId = cleanText_(row[0]);
      const isValidLegacyId = isLegacyUuid_(legacyId) || parseRunningIdValue_(row[0]) !== null;
      if (!isValidLegacyId) {
        throw new Error('รหัสรายการเดิมต้องเป็น UUID หรือเลขจำนวนเต็มบวก');
      }
      if (seen[legacyId.toLowerCase()]) {
        throw new Error('รหัสรายการเดิม ' + legacyId + ' ซ้ำกันใน sheet_1');
      }
      seen[legacyId.toLowerCase()] = true;

      const id = nextId;
      nextId += 1;
      return [id];
    });
    sheet.getRange(2, 1, migratedIds.length, 1).setValues(migratedIds);
  }

  properties.setProperty(APP_CONFIG.ID_COUNTER_PROPERTY, String(nextId - 1));
  properties.setProperty(APP_CONFIG.ID_MIGRATION_PROPERTY, APP_CONFIG.ID_MIGRATION_VERSION);
}

function validateRunningIds_(sheet) {
  const lastRow = sheet.getLastRow();
  let maxId = 0;
  const seen = Object.create(null);

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, APP_CONFIG.HEADERS.length).getValues();
    values.forEach(function (row, index) {
      if (isBlankRow_(row)) {
        return;
      }

      const id = parseRunningIdValue_(row[0]);
      const rowNumber = index + 2;
      if (id === null) {
        throw new Error('รหัสรายการในแถวที่ ' + rowNumber + ' ต้องเป็นเลขจำนวนเต็มบวก');
      }
      if (seen[String(id)]) {
        throw new Error('รหัสรายการ ' + id + ' ซ้ำกันใน sheet_1');
      }
      seen[String(id)] = true;
      maxId = Math.max(maxId, id);
    });
  }

  ensureRunningIdCounterAtLeast_(maxId);
}

function isBlankRow_(row) {
  return row.every(function (value) {
    return value === '' || value === null;
  });
}

function parseRunningId_(value) {
  if (typeof value === 'number') {
    return parseRunningIdValue_(value);
  }
  return parseRunningIdInput_(value);
}

function parseRunningIdValue_(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function parseRunningIdInput_(value) {
  const text = cleanText_(value);
  if (!/^[1-9]\d*$/.test(text)) {
    return null;
  }
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

function isLegacyUuid_(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getRunningIdCounter_() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(APP_CONFIG.ID_COUNTER_PROPERTY);
  if (raw === null || raw === '') {
    return 0;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error('ตัวนับรหัสรายการไม่ถูกต้อง');
  }
  const counter = Number(raw);
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new Error('ตัวนับรหัสรายการไม่ถูกต้อง');
  }
  return counter;
}

function ensureRunningIdCounterAtLeast_(minimum) {
  const counter = getRunningIdCounter_();
  if (minimum > counter) {
    PropertiesService.getScriptProperties()
      .setProperty(APP_CONFIG.ID_COUNTER_PROPERTY, String(minimum));
  }
}

function nextRunningId_() {
  const nextId = getRunningIdCounter_() + 1;
  if (!Number.isSafeInteger(nextId)) {
    throw new Error('ไม่สามารถสร้างรหัสรายการเพิ่มได้');
  }
  PropertiesService.getScriptProperties()
    .setProperty(APP_CONFIG.ID_COUNTER_PROPERTY, String(nextId));
  return nextId;
}

function recordFromRow_(row) {
  return {
    id: parseRunningIdValue_(row[0]),
    title: cleanText_(row[1]),
    totalCalorie: numberOrZero_(row[2]),
    unit: numberOrZero_(row[3]),
    caloriePerUnit: numberOrZero_(row[4]),
    remark: cleanText_(row[5]),
    totalProtein: numberOrZero_(row[6]),
    proteinPerUnit: numberOrZero_(row[7]),
    tdee: numberOrZero_(row[8]),
    createdAt: formatCellDateTime_(row[9]),
    updatedAt: formatCellDateTime_(row[10])
  };
}

function findRowNumberById_(sheet, id) {
  const targetId = parseRunningId_(id);
  if (targetId === null || sheet.getLastRow() < 2) {
    return -1;
  }

  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let index = 0; index < ids.length; index += 1) {
    if (parseRunningIdValue_(ids[index][0]) === targetId) {
      return index + 2;
    }
  }
  return -1;
}

function getLatestTdee_(records) {
  const candidates = records
    .filter(function (record) { return record.tdee > 0 && record.updatedAt; })
    .sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
  return candidates.length ? candidates[0].tdee : null;
}

function resolveTdee_(value, records) {
  if (value !== '' && value !== null && value !== undefined) {
    return requireNumber_(value, 'ค่า TDEE ต้องเป็นตัวเลข', 0.000001);
  }

  const latestTdee = getLatestTdee_(records);
  if (latestTdee === null) {
    throw new Error('รายการแรกต้องกรอกค่า TDEE');
  }
  return latestTdee;
}

function requireText_(value, message) {
  const text = cleanText_(value);
  if (!text) {
    throw new Error(message);
  }
  return text;
}

function requireNumber_(value, message, minimum) {
  if (value === '' || value === null || value === undefined) {
    throw new Error(message);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    throw new Error(message);
  }
  return roundNumber_(number);
}

function cleanText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function numberOrZero_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundNumber_(value) {
  return Math.round(Number(value) * 100) / 100;
}

function parseDateTimeInput_(value) {
  const text = cleanText_(value);
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) {
    throw new Error('กรุณาเลือกวันที่ให้ถูกต้อง');
  }

  const dateText = text.slice(0, 10);
  const rawTimeText = text.length > 10 ? text.slice(11) : '';
  const timeText = text.length > 10
    ? (rawTimeText.length === 5 ? rawTimeText + ':00' : rawTimeText)
    : Utilities.formatDate(new Date(), getTimeZone_(), 'HH:mm:ss');
  const date = Utilities.parseDate(
    dateText + ' ' + timeText,
    getTimeZone_(),
    'yyyy-MM-dd HH:mm:ss'
  );
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('กรุณาเลือกวันที่ให้ถูกต้อง');
  }
  return date;
}

function getTimeZone_() {
  try {
    const spreadsheet = getSpreadsheet_();
    return spreadsheet.getSpreadsheetTimeZone() || APP_CONFIG.TIME_ZONE;
  } catch (error) {
    return APP_CONFIG.TIME_ZONE;
  }
}

function formatDateInput_(date) {
  return Utilities.formatDate(date, getTimeZone_(), 'yyyy-MM-dd');
}

function formatDateTimeInput_(date) {
  return Utilities.formatDate(date, getTimeZone_(), "yyyy-MM-dd'T'HH:mm");
}

function formatCellDateTime_(value) {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime())
    ? ''
    : Utilities.formatDate(date, getTimeZone_(), "yyyy-MM-dd'T'HH:mm:ss");
}
