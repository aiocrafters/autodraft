/**
 * =========================================================================
 * Project: Auto Drafting
 * Description: Dynamic Document & PDF Automation Engine powered by Google Sheets
 * =========================================================================
 */

// ==================== CONFIGURATION ====================
// Paste your Google Sheet ID here:
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";

// Sheet Tab Names:
const DATA_SHEET_NAME = "Form Responses 1";
const USERS_SHEET_NAME = "USERS";
const TEMPLATES_SHEET_NAME = "TEMPLATES";
const CONFIG_SHEET_NAME = "CONFIG";

const DEFAULT_FOLDER_NAME = "Generated Documents";
// =======================================================

function getCurrentFormattedDate() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd.MM.yyyy");
}

function getCurrentFormattedDateTime() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd.MM.yyyy HH:mm");
}

function formatDate(value) {
  if (!(value instanceof Date)) return value !== undefined && value !== null ? String(value) : "";
  return Utilities.formatDate(value, Session.getScriptTimeZone(), "dd.MM.yyyy");
}

function clearFolder(folder) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
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

/**
 * Accesses the spreadsheet explicitly via SPREADSHEET_ID.
 */
function getTargetSpreadsheet() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.includes("YOUR_")) {
    throw new Error("Please specify a valid SPREADSHEET_ID at the top of Code.gs.");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Resolves the Google Drive Folder dynamically:
 * Reads OUTPUT_FOLDER_ID from the CONFIG sheet tab.
 * Falls back to auto-creating a folder alongside the spreadsheet if not configured.
 */
function getOutputFolder(ss) {
  const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (configSheet) {
    const configData = configSheet.getDataRange().getValues();
    for (let i = 0; i < configData.length; i++) {
      const key = normalizeKey(configData[i][0]);
      const val = String(configData[i][1] || "").trim();
      if ((key === "outputfolderid" || key === "folderid") && val) {
        try {
          return DriveApp.getFolderById(val);
        } catch (e) {
          // If the ID in the sheet is invalid or inaccessible, fall through to auto-folder
        }
      }
    }
  }

  // Automatic fallback: creates or uses subfolder in the spreadsheet's parent folder
  const sheetFile = DriveApp.getFileById(ss.getId());
  const parents = sheetFile.getParents();
  const parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();

  const subFolders = parentFolder.getFoldersByName(DEFAULT_FOLDER_NAME);
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  return parentFolder.createFolder(DEFAULT_FOLDER_NAME);
}

/**
 * Loads templates dynamically from the TEMPLATES sheet tab.
 */
function loadTemplates(ss) {
  const templateSheet = ss.getSheetByName(TEMPLATES_SHEET_NAME);
  const templatesMap = {};
  const templateList = [];

  if (!templateSheet) {
    return { templatesMap, templateList };
  }

  const values = templateSheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const rawName = String(values[i][0] || "").trim();
    const docId = String(values[i][1] || "").trim();

    if (rawName && docId) {
      const key = normalizeKey(rawName);
      templatesMap[key] = {
        name: rawName,
        id: docId
      };
      templateList.push({ key: key, name: rawName });
    }
  }

  return { templatesMap, templateList };
}

/**
 * Validates users dynamically from the USERS sheet tab.
 */
function validateUser(username, password) {
  if (!username || !password) return false;

  const ss = getTargetSpreadsheet();
  const userSheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!userSheet) return false;

  const userData = userSheet.getDataRange().getValues();
  for (let i = 1; i < userData.length; i++) {
    const sheetUser = String(userData[i][0]).trim();
    const sheetPass = String(userData[i][1]).trim();
    if (sheetUser === String(username).trim() && sheetPass === String(password).trim()) {
      return true;
    }
  }
  return false;
}

function authenticateToken(token) {
  if (!token) return false;
  try {
    const decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    const parts = decoded.split(":");
    return validateUser(parts[0], parts[1]);
  } catch (e) {
    return false;
  }
}

/**
 * GET Request: Dynamically inspects Form Responses 1 and returns columns & rows
 */
function doGet(e) {
  try {
    const token = e.parameter ? e.parameter.token : null;
    if (!authenticateToken(token)) {
      return responseJSON({ status: "auth_error", message: "Unauthorized access. Please log in." });
    }

    const ss = getTargetSpreadsheet();
    const dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
    if (!dataSheet) return responseJSON({ status: "error", message: `Sheet "${DATA_SHEET_NAME}" not found.` });

    const rawData = dataSheet.getDataRange().getValues();
    if (rawData.length < 2) {
      return responseJSON({ status: "error", message: "No records found in sheet." });
    }

    // Dynamic headers strictly from Row 0
    const rawHeaders = rawData[0];
    const headers = [];
    for (let col = 0; col < rawHeaders.length; col++) {
      const title = String(rawHeaders[col]).trim();
      if (title !== "") {
        headers.push({ name: title, index: col });
      }
    }

    if (headers.length === 0) {
      return responseJSON({ status: "error", message: "Header row is empty." });
    }

    // First column is the display key / file identifier
    const primaryHeaderName = headers[0].name;
    const { templateList } = loadTemplates(ss);

    // Build row records dynamically based on active headers
    const entries = [];
    for (let r = 1; r < rawData.length; r++) {
      const row = rawData[r];
      const isBlankRow = row.every(cell => cell === "" || cell === null || cell === undefined);
      if (isBlankRow) continue;

      const record = {};
      headers.forEach(h => {
        let cellVal = row[h.index];
        if (cellVal instanceof Date) {
          cellVal = formatDate(cellVal);
        }
        record[h.name] = (cellVal !== undefined && cellVal !== null) ? String(cellVal).trim() : "";
      });

      const displayId = record[primaryHeaderName] || `Row-${r + 1}`;

      entries.push({
        rowId: r + 1,
        primaryIdentifier: displayId,
        details: record
      });
    }

    return responseJSON({
      status: "success",
      headers: headers.map(h => h.name),
      primaryHeaderName: primaryHeaderName,
      availableTemplates: templateList,
      entries: entries
    });

  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}

/**
 * POST Request: Handles Login & Document Generation
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    // --- LOGIN ---
    if (action === "login") {
      const isValid = validateUser(payload.username, payload.password);
      if (isValid) {
        const token = Utilities.base64Encode(payload.username + ":" + payload.password);
        return responseJSON({ status: "success", token: token, username: payload.username });
      } else {
        return responseJSON({ status: "error", message: "Invalid username or password." });
      }
    }

    // --- GENERATE DOCUMENTS ---
    if (action === "generate") {
      if (!authenticateToken(payload.token)) {
        return responseJSON({ status: "auth_error", message: "Session expired or invalid. Please log in again." });
      }

      const selectedRowIds = payload.selectedRowIds || [];
      const userSelectedTemplateKey = payload.selectedTemplate ? normalizeKey(payload.selectedTemplate) : "";

      if (selectedRowIds.length === 0) {
        return responseJSON({ status: "error", message: "No entries selected." });
      }

      const ss = getTargetSpreadsheet();
      const dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
      if (!dataSheet) return responseJSON({ status: "error", message: `Sheet "${DATA_SHEET_NAME}" not found.` });

      // Fetch dynamic templates from TEMPLATES tab
      const { templatesMap, templateList } = loadTemplates(ss);
      if (templateList.length === 0) {
        return responseJSON({ status: "error", message: `No templates configured in "${TEMPLATES_SHEET_NAME}" sheet.` });
      }

      let templateObj = templatesMap[userSelectedTemplateKey] || templatesMap[templateList[0].key];
      if (!templateObj) {
        return responseJSON({ status: "error", message: "Invalid template selection." });
      }

      const rawData = dataSheet.getDataRange().getValues();
      const rawHeaders = rawData[0];

      // Extract column headers dynamically
      const headers = [];
      for (let c = 0; c < rawHeaders.length; c++) {
        const title = String(rawHeaders[c]).trim();
        if (title !== "") {
          headers.push({ name: title, index: c });
        }
      }

      const primaryColIndex = headers[0].index;
      
      // Fetch dynamic output folder from CONFIG tab
      const folder = getOutputFolder(ss);
      clearFolder(folder);

      const generatedFiles = [];

      selectedRowIds.forEach((rowId, index) => {
        const rowIndex = parseInt(rowId, 10) - 1;
        const row = rawData[rowIndex];
        if (!row) return;

        const recordId = String(row[primaryColIndex] || `ENTRY-${rowId}`).trim();
        const baseFileName = `AUTODRAFT_${templateObj.name.toUpperCase()}_${recordId}_${getCurrentFormattedDate()}_(${index + 1})`;

        // Copy template doc
        const tempFile = DriveApp.getFileById(templateObj.id).makeCopy(baseFileName, folder);
        const doc = DocumentApp.openById(tempFile.getId());
        const body = doc.getBody();

        // Dynamically replace placeholders corresponding to all column headers
        headers.forEach(headerObj => {
          const headerName = headerObj.name;
          let value = row[headerObj.index];

          if (value instanceof Date) {
            value = formatDate(value);
          }

          const stringVal = (value !== undefined && value !== null) ? String(value) : "";
          body.replaceText("{{" + headerName + "}}", stringVal);
          body.replaceText("{{" + headerName.toLowerCase() + "}}", stringVal);
        });

        // Built-in universal timestamp tags
        body.replaceText("{{today}}", getCurrentFormattedDate());
        body.replaceText("{{now}}", getCurrentFormattedDateTime());

        doc.saveAndClose();

        tempFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        // Convert to PDF
        const pdfBlob = tempFile.getAs(MimeType.PDF);
        const pdfFile = folder.createFile(pdfBlob);
        pdfFile.setName(`${baseFileName}.pdf`);
        pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        generatedFiles.push({
          identifier: recordId,
          templateUsed: templateObj.name,
          docName: tempFile.getName(),
          docUrl: tempFile.getUrl(),
          pdfName: pdfFile.getName(),
          pdfUrl: pdfFile.getDownloadUrl()
        });
      });

      return responseJSON({
        status: "success",
        count: generatedFiles.length,
        outputFolderUrl: folder.getUrl(),
        files: generatedFiles
      });
    }

  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}