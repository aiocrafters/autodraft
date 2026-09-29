/**
 * =========================================================================
 * Project:     Auto Drafting
 * Description: Dynamic Document & PDF Automation Engine powered by Google Sheets
 *
 * SETUP ONCE — ZERO TOUCH FOREVER
 * =========================================================================
 *
 * ▶ DEVELOPER SETUP (one-time only — 3 steps, no code editing):
 *   1. Open your Google Sheet → Extensions → Apps Script
 *   2. Paste this file into the editor → Save
 *      Select "setupTriggers" from the function dropdown → click ▶ Run → Authorize
 *      (This auto-saves your Sheet ID and installs the live-sync trigger)
 *   3. Deploy → New deployment → Web app
 *        Execute as: Me  |  Who has access: Anyone
 *      Copy the Web App URL → paste into frontend.local.html
 *   ✅ Done. Neither you nor the user ever needs to touch this file again.
 *
 * ▶ USER WORKFLOW — everything managed from Google Sheets:
 *   ┌─────────────────────┬──────────────────────────────────────────────┐
 *   │ USERS tab           │ Add / remove users and passwords             │
 *   │ TEMPLATES tab       │ Add / remove document templates              │
 *   │ Form Responses tab  │ Add / edit data records                      │
 *   │ CONFIG tab          │ Change folder, session timeout, sheet names  │
 *   └─────────────────────┴──────────────────────────────────────────────┘
 *   Any edit in the spreadsheet is reflected INSTANTLY in the web app.
 *   No redeployment. No cache clearing. No manual steps.
 *
 * ▶ CONFIG SHEET KEYS (all optional — defaults shown):
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
 *
 * PERFORMANCE: Serialisable config values (everything except the live `ss` object)
 * are cached in CacheService for 5 minutes. This means the CONFIG sheet is only
 * read on the very first request (or after a config change) — every subsequent
 * request within 5 minutes skips that Sheets API call entirely.
 *
 * To force a config refresh (e.g. after editing the CONFIG sheet), either:
 *   - Wait 5 minutes, OR
 *   - Run clearConfigCache() once from the Apps Script editor.
 */
function getConfig() {

  var CACHE_KEY = "autodraft_config_v1";
  var CACHE_TTL = 300; // seconds (5 minutes)

  // 1. Get Spreadsheet ID from Script Properties (never cached — must always be fresh)
  var props         = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty("SPREADSHEET_ID");

  if (!spreadsheetId) {
    throw new Error(
      "SPREADSHEET_ID is not set. " +
      "In Apps Script go to: Project Settings \u2192 Script Properties \u2192 Add property: " +
      "Key = SPREADSHEET_ID | Value = your Google Sheet ID."
    );
  }

  // 2. Try the cache first
  var cache      = CacheService.getScriptCache();
  var cachedJson = cache.get(CACHE_KEY);

  if (cachedJson) {
    try {
      var cached = JSON.parse(cachedJson);
      // Re-attach the live Spreadsheet object (not serialisable, always fresh)
      cached.ss = SpreadsheetApp.openById(spreadsheetId);
      return cached;
    } catch (e) { /* cache corrupt — fall through to full load */ }
  }

  // 3. Cache miss: open spreadsheet and read CONFIG sheet
  var ss = SpreadsheetApp.openById(spreadsheetId);

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

  function cfg(key) {
    var v = configMap[key] || "";
    return v !== "" ? v : DEFAULTS[key];
  }

  var config = {
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

  // 4. Store serialisable values in cache (ss object excluded)
  cache.put(CACHE_KEY, JSON.stringify(config), CACHE_TTL);

  // 5. Attach live Spreadsheet object before returning
  config.ss = ss;
  return config;
}

/**
 * [UTILITY] Manually clears the config cache.
 * Normally not needed — onSheetChange() does this automatically.
 * Fallback: run from Apps Script editor if the trigger was removed.
 */
function clearConfigCache() {
  CacheService.getScriptCache().remove("autodraft_config_v1");
  Logger.log("\u2705 Config cache cleared.");
}


// =========================================================================
// ONE-TIME DEVELOPER SETUP
// =========================================================================

/**
 * ▶ RUN THIS ONCE after pasting Code.gs into the Apps Script editor.
 *
 * What it does automatically:
 *   1. Reads the Google Sheet ID from the active spreadsheet
 *      and saves it to Script Properties — no manual copy-paste needed.
 *   2. Installs an onChange trigger so any edit to the spreadsheet
 *      instantly clears the config cache → the web app always reflects
 *      the current sheet state with zero manual intervention.
 *
 * How to run:
 *   Apps Script editor → function dropdown → select "setupTriggers" → ▶ Run
 *   Authorize when prompted (needed for trigger installation).
 *   Then deploy the script as a Web App.
 */
function setupTriggers() {
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  var spreadsheetId = "";

  // 1. Try detecting active spreadsheet (if script was opened via Extensions → Apps Script)
  try {
    ss = SpreadsheetApp.getActive();
    if (ss) {
      spreadsheetId = ss.getId();
      props.setProperty("SPREADSHEET_ID", spreadsheetId);
    }
  } catch (e) {
    // Standalone script — proceed to fallback
  }

  // 2. If standalone, check if SPREADSHEET_ID is already saved in Script Properties
  if (!ss) {
    spreadsheetId = props.getProperty("SPREADSHEET_ID");
    if (spreadsheetId) {
      try {
        ss = SpreadsheetApp.openById(spreadsheetId);
      } catch (err) {
        throw new Error(
          "SPREADSHEET_ID '" + spreadsheetId + "' was found in Script Properties, " +
          "but could not be opened. Please verify the ID and ensure your account has edit access."
        );
      }
    }
  }

  // 3. If still not found, provide helpful instructions
  if (!ss) {
    throw new Error(
      "SPREADSHEET_ID is not configured yet.\n\n" +
      "Because this Apps Script project was created as a standalone script (outside Google Sheets):\n" +
      "1. In Apps Script, click Project Settings (⚙ icon on left sidebar)\n" +
      "2. Under 'Script Properties', click 'Add script property'\n" +
      "     Property: SPREADSHEET_ID\n" +
      "     Value:    <Your Google Sheet ID from the URL between /d/ and /edit>\n" +
      "3. Click 'Save script properties', then click ▶ Run on setupTriggers again."
    );
  }

  // 4. Remove any existing onSheetChange triggers to prevent duplicates
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "onSheetChange") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 5. Install fresh onChange trigger on the target spreadsheet
  ScriptApp.newTrigger("onSheetChange")
    .forSpreadsheet(ss)
    .onChange()
    .create();

  Logger.log("\u2705 Setup complete!");
  Logger.log("   SPREADSHEET_ID linked: " + spreadsheetId);
  Logger.log("   onChange trigger installed.");
  Logger.log("   Next step: Deploy \u2192 New deployment \u2192 Web app.");
}


/**
 * Fires automatically whenever any cell in the spreadsheet is edited.
 * Clears the config cache so the next web app request always gets
 * the latest CONFIG sheet values — no manual cache clearing ever needed.
 *
 * Installed by setupTriggers(). Do not rename or delete this function.
 */
function onSheetChange(e) {
  CacheService.getScriptCache().remove("autodraft_config_v1");
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

/** Deletes expired rows from SESSIONS, but at most once per hour to avoid slowdowns. */
function cleanupSessions(sheet) {
  var CLEANUP_CACHE_KEY = "autodraft_session_cleanup";
  var cache = CacheService.getScriptCache();

  // Skip cleanup if it ran within the last hour
  if (cache.get(CLEANUP_CACHE_KEY)) return;

  var now  = new Date();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][2] && new Date(data[i][2]) < now) sheet.deleteRow(i + 1);
  }

  // Mark cleanup as done for the next hour
  cache.put(CLEANUP_CACHE_KEY, "1", 3600);
}

/** Creates a session entry in SESSIONS sheet and returns the token. */
function createSession(config, username) {
  var token     = generateToken();
  var expiresAt = new Date(Date.now() + config.sessionExpiryHours * 3600000).toISOString();
  var sheet     = getSessionsSheet(config);
  cleanupSessions(sheet); // deferred — only runs if >1 hour since last cleanup
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