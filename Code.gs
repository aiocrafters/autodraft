/**
 * =========================================================================
 * Project:     Auto Drafting
 * Description: Dynamic Document & PDF Automation Engine powered by Google Sheets
 *
 * DEPLOY ONCE — MANAGE EVERYTHING VIA GOOGLE SHEETS
 * =========================================================================
 *
 * ▶ INITIAL SETUP (one-time only, no code editing needed):
 *   1. Deploy this script as a Web App (Deploy → New deployment)
 *        Execute as: Me | Who has access: Anyone
 *   2. In Apps Script → Project Settings → Script Properties → Add property:
 *        Key   = SPREADSHEET_ID
 *        Value = your Google Sheet ID  (the string in the Sheet URL between /d/ and /edit)
 *   3. Paste the Web App URL into your frontend.local.html
 *   ✅ Done. You NEVER need to edit or redeploy this file again.
 *
 * ▶ AFTER SETUP — manage everything from your Google Sheet:
 *   ┌─────────────────────┬──────────────────────────────────────────────┐
 *   │ USERS tab           │ Add / remove users and passwords             │
 *   │ TEMPLATES tab       │ Add / remove document templates              │
 *   │ CONFIG tab          │ Change sheet names, folder, security timings │
 *   └─────────────────────┴──────────────────────────────────────────────┘
 *
 * ▶ FULL LIST OF CONFIG SHEET KEYS (all optional — defaults shown):
 *   Key                   Default value
 *   ─────────────────     ─────────────────────
 *   DATA_SHEET_NAME       Form Responses 1
 *   USERS_SHEET_NAME      USERS
 *   TEMPLATES_SHEET_NAME  TEMPLATES
 *   SESSIONS_SHEET_NAME   SESSIONS
 *   DEFAULT_FOLDER_NAME   Generated Documents
 *   OUTPUT_FOLDER_ID      (blank = auto-create alongside Sheet)
 *   SESSION_EXPIRY_HOURS  8
 *   MAX_FAILED_ATTEMPTS   5
 *   LOCKOUT_MINUTES       15
 * =========================================================================
 */


// =========================================================================
// BUILT-IN DEFAULTS  (used when a CONFIG key is absent or blank)
// Never edit these — change them via the CONFIG sheet instead.
// =========================================================================
var DEFAULTS = {
  DATA_SHEET_NAME:      "Form Responses 1",
  USERS_SHEET_NAME:     "USERS",
  TEMPLATES_SHEET_NAME: "TEMPLATES",
  SESSIONS_SHEET_NAME:  "SESSIONS",
  DEFAULT_FOLDER_NAME:  "Generated Documents",
  SESSION_EXPIRY_HOURS: 8,
  MAX_FAILED_ATTEMPTS:  5,
  LOCKOUT_MINUTES:      15
};


// =========================================================================
// CONFIGURATION LOADER
// =========================================================================

/**
 * Reads all runtime configuration.
 *   - SPREADSHEET_ID  → from Script Properties (set once in Apps Script UI)
 *   - Everything else → from CONFIG sheet rows, falling back to DEFAULTS
 *
 * Returns a plain config object passed to every other function.
 */
function getConfig() {

  // 1. Get Spreadsheet ID from Script Properties
  var props         = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty("SPREADSHEET_ID");

  if (!spreadsheetId) {
    throw new Error(
      "SPREADSHEET_ID is not set. " +
      "In Apps Script go to: Project Settings → Script Properties → Add property: " +
      "Key = SPREADSHEET_ID | Value = your Google Sheet ID."
    );
  }

  var ss = SpreadsheetApp.openById(spreadsheetId);

  // 2. Load the CONFIG sheet into a key→value map (keys are normalised to UPPER_SNAKE_CASE)
  var configMap   = {};
  var configSheet = ss.getSheetByName("CONFIG");

  if (configSheet) {
    var rows = configSheet.getDataRange().getValues();
    rows.forEach(function (row) {
      var key = String(row[0] || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      var val = String(row[1] || "").trim();
      if (key) configMap[key] = val;
    });
  }

  // Helper: return config value if present and non-empty, else the built-in default
  function cfg(key) {
    var v = configMap[key] || "";
    return v !== "" ? v : DEFAULTS[key];
  }

  return {
    ss:                 ss,
    spreadsheetId:      spreadsheetId,
    dataSheetName:      cfg("DATA_SHEET_NAME"),
    usersSheetName:     cfg("USERS_SHEET_NAME"),
    templatesSheetName: cfg("TEMPLATES_SHEET_NAME"),
    sessionsSheetName:  cfg("SESSIONS_SHEET_NAME"),
    defaultFolderName:  cfg("DEFAULT_FOLDER_NAME"),
    outputFolderId:     configMap["OUTPUT_FOLDER_ID"] || "",
    sessionExpiryHours: Math.max(1, parseInt(cfg("SESSION_EXPIRY_HOURS")) || DEFAULTS.SESSION_EXPIRY_HOURS),
    maxFailedAttempts:  Math.max(1, parseInt(cfg("MAX_FAILED_ATTEMPTS"))  || DEFAULTS.MAX_FAILED_ATTEMPTS),
    lockoutMinutes:     Math.max(1, parseInt(cfg("LOCKOUT_MINUTES"))      || DEFAULTS.LOCKOUT_MINUTES)
  };
}


// =========================================================================
// DATE HELPERS
// =========================================================================

function getCurrentFormattedDate() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd.MM.yyyy");
}

function getCurrentFormattedDateTime() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd.MM.yyyy HH:mm");
}

function formatDate(value) {
  if (!(value instanceof Date)) return (value !== undefined && value !== null) ? String(value) : "";
  return Utilities.formatDate(value, Session.getScriptTimeZone(), "dd.MM.yyyy");
}


// =========================================================================
// GENERAL UTILITIES
// =========================================================================

function clearFolder(folder) {
  var files = folder.getFiles();
  while (files.hasNext()) files.next().setTrashed(true);
}

function responseJSON(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeKey(val) {
  if (!val) return "";
  return String(val).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}


// =========================================================================
// DRIVE FOLDER
// =========================================================================

/**
 * Resolves the output Drive folder from config.
 * Priority: OUTPUT_FOLDER_ID (CONFIG sheet) → auto-created subfolder alongside spreadsheet.
 */
function getOutputFolder(config) {
  if (config.outputFolderId) {
    try { return DriveApp.getFolderById(config.outputFolderId); } catch (e) { /* fall through */ }
  }
  var sheetFile    = DriveApp.getFileById(config.spreadsheetId);
  var parents      = sheetFile.getParents();
  var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var subFolders   = parentFolder.getFoldersByName(config.defaultFolderName);
  return subFolders.hasNext() ? subFolders.next() : parentFolder.createFolder(config.defaultFolderName);
}


// =========================================================================
// TEMPLATE LOADER
// =========================================================================

function loadTemplates(config) {
  var templateSheet = config.ss.getSheetByName(config.templatesSheetName);
  var templatesMap  = {};
  var templateList  = [];
  if (!templateSheet) return { templatesMap: templatesMap, templateList: templateList };

  var values = templateSheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var rawName = String(values[i][0] || "").trim();
    var docId   = String(values[i][1] || "").trim();
    if (rawName && docId) {
      var key          = normalizeKey(rawName);
      templatesMap[key] = { name: rawName, id: docId };
      templateList.push({ key: key, name: rawName });
    }
  }
  return { templatesMap: templatesMap, templateList: templateList };
}


// =========================================================================
// SESSION MANAGEMENT
// =========================================================================

/**
 * Returns the SESSIONS sheet, auto-creating it (hidden, write-protected) if missing.
 * Columns: Token | Username | ExpiresAt | FailedAttempts | LockoutUntil
 */
function getSessionsSheet(config) {
  var sheet = config.ss.getSheetByName(config.sessionsSheetName);
  if (!sheet) {
    sheet = config.ss.insertSheet(config.sessionsSheetName);
    sheet.appendRow(["Token", "Username", "ExpiresAt", "FailedAttempts", "LockoutUntil"]);
    sheet.hideSheet();
    sheet.protect().setDescription("Auto Drafting — managed by script").setWarningOnly(true);
  }
  return sheet;
}

/**
 * Generates a 32-character random session token (SHA-256 of time + entropy).
 */
function generateToken() {
  var chars       = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var randomBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    new Date().getTime() + ":" + Math.random()
  );
  var token = "";
  randomBytes.forEach(function (b) { token += chars.charAt(Math.abs(b) % chars.length); });
  return token;
}

/** Deletes rows from SESSIONS where ExpiresAt is in the past. */
function cleanupSessions(sheet) {
  var now  = new Date();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][2] && new Date(data[i][2]) < now) sheet.deleteRow(i + 1);
  }
}

/** Creates a session entry in SESSIONS sheet and returns the token. */
function createSession(config, username) {
  var token     = generateToken();
  var expiresAt = new Date(Date.now() + config.sessionExpiryHours * 3600000).toISOString();
  var sheet     = getSessionsSheet(config);
  cleanupSessions(sheet);
  sheet.appendRow([token, username, expiresAt, 0, ""]);
  return token;
}

/** Returns true if token exists in SESSIONS sheet and has not expired. */
function authenticateToken(config, token) {
  if (!token) return false;
  try {
    var sheet = getSessionsSheet(config);
    var data  = sheet.getDataRange().getValues();
    var now   = new Date();
    for (var i = 1; i < data.length; i++) {
      var rowToken = String(data[i][0]).trim();
      if (rowToken && rowToken === String(token).trim()) {
        return data[i][2] && new Date(data[i][2]) > now;
      }
    }
    return false;
  } catch (e) { return false; }
}


// =========================================================================
// RATE LIMITING
// =========================================================================

function checkRateLimit(config, username) {
  var sheet = getSessionsSheet(config);
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();
  for (var i = 1; i < data.length; i++) {
    if (!String(data[i][0]).trim() &&
        String(data[i][1]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
      if (data[i][4] && new Date(data[i][4]) > now) {
        return { locked: true, minutesLeft: Math.ceil((new Date(data[i][4]) - now) / 60000) };
      }
    }
  }
  return { locked: false };
}

function recordFailedAttempt(config, username) {
  var sheet = getSessionsSheet(config);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (!String(data[i][0]).trim() &&
        String(data[i][1]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
      var attempts = (parseInt(data[i][3]) || 0) + 1;
      sheet.getRange(i + 1, 4).setValue(attempts);
      if (attempts >= config.maxFailedAttempts) {
        sheet.getRange(i + 1, 5).setValue(
          new Date(Date.now() + config.lockoutMinutes * 60000).toISOString()
        );
      }
      return;
    }
  }
  sheet.appendRow(["", String(username).trim(), "", 1, ""]);
}

function clearFailedAttempts(config, username) {
  var sheet = getSessionsSheet(config);
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (!String(data[i][0]).trim() &&
        String(data[i][1]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
      sheet.deleteRow(i + 1);
    }
  }
}


// =========================================================================
// USER VALIDATION
// =========================================================================

function validateUser(config, username, password) {
  if (!username || !password) return false;
  var userSheet = config.ss.getSheetByName(config.usersSheetName);
  if (!userSheet) return false;
  var userData = userSheet.getDataRange().getValues();
  for (var i = 1; i < userData.length; i++) {
    if (String(userData[i][0]).trim() === String(username).trim() &&
        String(userData[i][1]).trim() === String(password).trim()) {
      return true;
    }
  }
  return false;
}


// =========================================================================
// GET REQUEST — returns records, headers & templates (requires valid token)
// =========================================================================

function doGet(e) {
  try {
    var config = getConfig();
    var token  = e.parameter ? e.parameter.token : null;

    if (!authenticateToken(config, token)) {
      return responseJSON({ status: "auth_error", message: "Unauthorized access. Please log in." });
    }

    var dataSheet = config.ss.getSheetByName(config.dataSheetName);
    if (!dataSheet) return responseJSON({ status: "error", message: "Sheet \"" + config.dataSheetName + "\" not found." });

    var rawData = dataSheet.getDataRange().getValues();
    if (rawData.length < 2) return responseJSON({ status: "error", message: "No records found in sheet." });

    var rawHeaders = rawData[0];
    var headers    = [];
    for (var col = 0; col < rawHeaders.length; col++) {
      var title = String(rawHeaders[col]).trim();
      if (title !== "") headers.push({ name: title, index: col });
    }
    if (headers.length === 0) return responseJSON({ status: "error", message: "Header row is empty." });

    var primaryHeaderName = headers[0].name;
    var tplResult         = loadTemplates(config);

    var entries = [];
    for (var r = 1; r < rawData.length; r++) {
      var row        = rawData[r];
      var isBlankRow = row.every(function (cell) { return cell === "" || cell === null || cell === undefined; });
      if (isBlankRow) continue;

      var record = {};
      headers.forEach(function (h) {
        var cellVal = row[h.index];
        if (cellVal instanceof Date) cellVal = formatDate(cellVal);
        record[h.name] = (cellVal !== undefined && cellVal !== null) ? String(cellVal).trim() : "";
      });

      entries.push({
        rowId:             r + 1,
        primaryIdentifier: record[primaryHeaderName] || ("Row-" + (r + 1)),
        details:           record
      });
    }

    return responseJSON({
      status:             "success",
      headers:            headers.map(function (h) { return h.name; }),
      primaryHeaderName:  primaryHeaderName,
      availableTemplates: tplResult.templateList,
      entries:            entries
    });

  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}


// =========================================================================
// POST REQUEST — handles login and document generation
// =========================================================================

function doPost(e) {
  try {
    var config  = getConfig();
    var payload = JSON.parse(e.postData.contents);
    var action  = payload.action;

    // ----------------------------------------------------------------
    // ACTION: LOGIN
    // ----------------------------------------------------------------
    if (action === "login") {
      var username = String(payload.username || "").trim();
      var password = String(payload.password || "").trim();

      var rateCheck = checkRateLimit(config, username);
      if (rateCheck.locked) {
        return responseJSON({
          status:  "error",
          message: "Too many failed attempts. Account locked for " + rateCheck.minutesLeft + " more minute(s)."
        });
      }

      if (validateUser(config, username, password)) {
        clearFailedAttempts(config, username);
        var token = createSession(config, username);
        return responseJSON({ status: "success", token: token, username: username });
      } else {
        recordFailedAttempt(config, username);
        return responseJSON({ status: "error", message: "Invalid username or password." });
      }
    }

    // ----------------------------------------------------------------
    // ACTION: GENERATE DOCUMENTS
    // ----------------------------------------------------------------
    if (action === "generate") {
      if (!authenticateToken(config, payload.token)) {
        return responseJSON({ status: "auth_error", message: "Session expired or invalid. Please log in again." });
      }

      var selectedRowIds          = payload.selectedRowIds || [];
      var userSelectedTemplateKey = payload.selectedTemplate ? normalizeKey(payload.selectedTemplate) : "";

      if (selectedRowIds.length === 0) {
        return responseJSON({ status: "error", message: "No entries selected." });
      }

      var dataSheet = config.ss.getSheetByName(config.dataSheetName);
      if (!dataSheet) return responseJSON({ status: "error", message: "Sheet \"" + config.dataSheetName + "\" not found." });

      var tplResult = loadTemplates(config);
      if (tplResult.templateList.length === 0) {
        return responseJSON({ status: "error", message: "No templates configured in \"" + config.templatesSheetName + "\" sheet." });
      }

      var templateObj = tplResult.templatesMap[userSelectedTemplateKey] || tplResult.templatesMap[tplResult.templateList[0].key];
      if (!templateObj) return responseJSON({ status: "error", message: "Invalid template selection." });

      var rawData    = dataSheet.getDataRange().getValues();
      var totalRows  = rawData.length;
      var rawHeaders = rawData[0];

      var headers = [];
      for (var c = 0; c < rawHeaders.length; c++) {
        var t = String(rawHeaders[c]).trim();
        if (t !== "") headers.push({ name: t, index: c });
      }

      var primaryColIndex = headers[0].index;
      var folder          = getOutputFolder(config);
      clearFolder(folder);

      var generatedFiles = [];

      selectedRowIds.forEach(function (rowId, index) {
        var rowIndex = parseInt(rowId, 10) - 1;
        if (isNaN(rowIndex) || rowIndex < 1 || rowIndex >= totalRows) return;

        var row = rawData[rowIndex];
        if (!row) return;

        var recordId     = String(row[primaryColIndex] || ("ENTRY-" + rowId)).trim();
        var baseFileName = "AUTODRAFT_" + templateObj.name.toUpperCase() + "_" + recordId + "_" + getCurrentFormattedDate() + "_(" + (index + 1) + ")";

        var tempFile = DriveApp.getFileById(templateObj.id).makeCopy(baseFileName, folder);
        var doc      = DocumentApp.openById(tempFile.getId());
        var body     = doc.getBody();

        headers.forEach(function (headerObj) {
          var value = row[headerObj.index];
          if (value instanceof Date) value = formatDate(value);
          var stringVal = (value !== undefined && value !== null) ? String(value) : "";
          body.replaceText("{{" + headerObj.name + "}}", stringVal);
          body.replaceText("{{" + headerObj.name.toLowerCase() + "}}", stringVal);
        });

        body.replaceText("{{today}}", getCurrentFormattedDate());
        body.replaceText("{{now}}",   getCurrentFormattedDateTime());

        doc.saveAndClose();
        tempFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        var pdfBlob = tempFile.getAs(MimeType.PDF);
        var pdfFile = folder.createFile(pdfBlob);
        pdfFile.setName(baseFileName + ".pdf");
        pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        generatedFiles.push({
          identifier:   recordId,
          templateUsed: templateObj.name,
          docName:      tempFile.getName(),
          docUrl:       tempFile.getUrl(),
          pdfName:      pdfFile.getName(),
          pdfUrl:       pdfFile.getDownloadUrl()
        });
      });

      return responseJSON({
        status:          "success",
        count:           generatedFiles.length,
        outputFolderUrl: folder.getUrl(),
        files:           generatedFiles
      });
    }

  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}