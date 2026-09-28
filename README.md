# 📄 Auto Drafting

> A fully dynamic, zero-maintenance document and PDF automation system powered by Google Sheets, Google Docs, Google Drive, and Google Apps Script.

**Auto Drafting** bridges your spreadsheet data with formatted Google Docs and downloadable PDFs. It dynamically renders records into a web portal, adapts instantly to any changes in your spreadsheet's structure, and batch-generates ready-to-dispatch documents in seconds.

---

## 📑 Table of Contents
1. [Core Features](#-core-features)
2. [How It Works](#-how-it-works)
3. [Step 1: Google Sheet Architecture](#-step-1-google-sheet-architecture)
4. [Step 2: Google Doc Template Setup](#-step-2-google-doc-template-setup)
5. [Step 3: Apps Script Deployment (`Code.gs`)](#-step-3-apps-script-deployment-codegs)
6. [Step 4: Frontend Web App Setup (`frontend.html`)](#-step-4-frontend-web-app-setup-frontendhtml)
7. [Step 5: Using the Application](#-step-5-using-the-application)
8. [Troubleshooting & FAQ](#-troubleshooting--faq)
9. [Security Considerations](#-security-considerations)

---

## 🌟 Core Features

- **100% Dynamic Column Headers**: Rename, add, remove, or reorder columns in `Form Responses 1` at any time. The web portal updates instantly without changing a line of code.
- **Dynamic Template Registry**: Add new document formats (e.g., Office Memorandums, Sanctions, Letters, Advice) by adding a row to the `TEMPLATES` sheet tab.
- **Template Override Selector**: Pick the target template directly from the web portal's dynamic dropdown, or let entries default automatically to the first template.
- **Dynamic File Naming & Tracking**: Column 1 automatically serves as the primary identifier in generated file names (e.g., `AUTODRAFT_LETTER_CN-102_28.09.2026_(1).pdf`).
- **Zero Hardcoded Drive Folders**: Automatically manages an output subfolder called `"Generated Documents"` alongside your Sheet, or reads an explicit `OUTPUT_FOLDER_ID` from the `CONFIG` tab.
- **Batch Processing**: Select individual rows or use "Select All" to process multiple records simultaneously.
- **Dual Output**: Every record generates an editable Google Doc (with a view/edit link) and a compiled, direct-download PDF link.
- **XSS & Injection Safe**: The frontend dynamically constructs DOM elements using `textContent`, ensuring quotes, brackets, and code-like characters inside spreadsheet cells never break the layout.

---

## ⚙️ How It Works

1. A user logs in via `frontend.html` using credentials stored in the `USERS` sheet.
2. On successful login, a Base64 token is issued and stored in `sessionStorage`.
3. The frontend fetches all records and headers dynamically from the `Form Responses 1` sheet.
4. The user selects one or more rows, picks a template from the dropdown, and clicks **Generate**.
5. `Code.gs` copies the selected Google Doc template, replaces all `{{ColumnName}}` placeholders with the corresponding row values, and exports a PDF — all saved to the output Drive folder.
6. Direct links to the editable Doc and downloadable PDF are returned and displayed in the portal.

---

## 🗂️ Step 1: Google Sheet Architecture

You need **3 sheets minimum** (and 1 optional sheet) in your Google Spreadsheet — making it **3 or 4 tabs in total**.

---

### ✅ Required Sheets (3)

#### 1. `Form Responses 1`
**Purpose:** Stores all your form submissions or data records.
- **Row 1**: Your custom column headings (e.g., `Computer No`, `Name`, `Subject`, etc.). There are **no mandatory names** — the system reads whatever headers you define.
- **Row 2+**: The actual records.
- **Important**: **Column A (the first column)** is automatically treated as the Record ID for file names and display labels.

*Example:*

| Computer No | Subject       | Applicant Name | Department     | Order No      |
|-------------|---------------|----------------|----------------|---------------|
| CN-1001     | Pay Fixation  | John Smith     | Finance        | FIN-2026-09   |
| CN-1002     | LTC Sanction  | Jane Doe       | Administration | ADM-2026-11   |

---

#### 2. `USERS`
**Purpose:** Stores the login credentials for your portal.
- **Row 1**: Header row (e.g., `Username`, `Password`) — skipped by the script.
- **Row 2+**: One authorized user per row.
- **Columns**: Column A = Username, Column B = Password.

*Example:*

| Username | Password        |
|----------|-----------------|
| admin    | SecretPass@2026 |
| officer1 | DeskFlow#99     |

---

#### 3. `TEMPLATES`
**Purpose:** Registers your Google Doc templates.
- **Row 1**: Header row (e.g., `Template Name`, `Template Doc ID`) — skipped by the script.
- **Row 2+**: One template per row.
- **Columns**: Column A = Template display name, Column B = Google Doc Template ID.

*Example:*

| Template Name     | Template Doc ID                                 |
|-------------------|-------------------------------------------------|
| Letter            | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms` |
| Office Memorandum | `1Eo3KBDMl6fiamGCqoJH8sXkQPz9vYrNtW2dLcAbF7ue` |
| Advice            | `1HpTnQs2WdRfCyJkUxLVoIbMeG8zNhA3KrPmYt6DlEs` |

> **How to find a Google Doc Template ID:**
> Open your template Google Doc. Look at the URL:
> `https://docs.google.com/document/d/`**`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`**`/edit`
> The bold string between `/d/` and `/edit` is your Doc ID.

---

### ⚙️ Optional Sheet (1)

#### 4. `CONFIG` *(Optional)*
**Purpose:** Custom settings, such as directing generated files to a specific Google Drive folder.
- **Columns**: Column A = Key, Column B = Value.

| Key              | Value                                    |
|------------------|------------------------------------------|
| OUTPUT_FOLDER_ID | `1F3pXcAkLDD795jZQfd6QNmDfLHuw7hBv2rMcR` |

> If you omit this sheet (or leave the value blank), the script automatically creates and uses a folder named `"Generated Documents"` in the same parent folder as your spreadsheet.

---

## 📝 Step 2: Google Doc Template Setup

1. Create a Google Doc for each document type you need.
2. Use **double-curly-brace placeholders** matching your sheet's column header names exactly:
   ```
   {{Column Header Name}}
   ```
3. Two built-in universal placeholders are always available regardless of your column names:
   - `{{today}}` — inserts the current date formatted as `DD.MM.YYYY`
   - `{{now}}` — inserts the current date and time formatted as `DD.MM.YYYY HH:mm`
4. Placeholder matching is **case-insensitive for lowercase variants** — e.g., `{{name}}` will also match the column `Name`.
5. Copy the **Document ID** from the Google Doc URL (the long alphanumeric string between `/d/` and `/edit`) and paste it into the `TEMPLATES` sheet.

---

## 🚀 Step 3: Apps Script Deployment (`Code.gs`)

### 3.1 — Create the Apps Script Project

1. Open your Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Delete any existing code in the editor.
4. Paste the full contents of `Code.gs` into the editor.

### 3.2 — Configure the Spreadsheet ID

At the top of `Code.gs`, replace the placeholder with your actual Google Sheet ID:

```javascript
const SPREADSHEET_ID = "1Tq8fWvR3mZnKpXoHjDcBsYeLu2gA5NdCiMbOtGkVwQr";
```

Your Sheet ID is the alphanumeric string in the Sheet URL between `/d/` and `/edit`.

### 3.3 — (Optional) Adjust Sheet Tab Names

If your sheet tabs have different names, update these constants:

```javascript
const DATA_SHEET_NAME      = "Form Responses 1";
const USERS_SHEET_NAME     = "USERS";
const TEMPLATES_SHEET_NAME = "TEMPLATES";
const CONFIG_SHEET_NAME    = "CONFIG";
```

### 3.4 — Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon ⚙ next to **"Select type"** and choose **Web app**.
3. Fill in the deployment settings:
   - **Description**: `Auto Drafting v1` (or any label)
   - **Execute as**: `Me` (your Google account)
   - **Who has access**: `Anyone` *(authentication is handled by the app itself)*
4. Click **Deploy** and **Authorize** when prompted.
5. Copy the **Web App URL** — you will need it in Step 4.

> **Note:** Every time you modify `Code.gs`, you must create a **New Deployment** (or update the existing one). Saving the script file alone does **not** automatically update the live Web App.

---

## 🖥️ Step 4: Frontend Web App Setup (`frontend.html`)

1. Open `frontend.html` in any text editor.
2. Locate this line near the top of the `<script>` block:
   ```javascript
   const WEB_APP_URL = "YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
3. Replace the placeholder with the Web App URL you copied in Step 3.4:
   ```javascript
   const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwZ3mXqR8vNpLtKoD2eJhYcGsUiF7aBnMwT5lPd/exec";
   ```
4. Save the file.
5. Open `frontend.html` directly in any modern web browser — **no server required**.

---

## 🎯 Step 5: Using the Application

### Login
- Enter a username and password from your `USERS` sheet.
- Click **Sign In**. Your session is stored temporarily in `sessionStorage` and clears when you close the browser tab.

### Browse & Filter Records
- All rows from `Form Responses 1` are loaded into a dynamic table.
- Use the **Filter Records** search box to instantly narrow down records across all columns.

### Select a Template
- The **Select Template** dropdown is populated automatically from your `TEMPLATES` sheet.
- Choose the template you want to apply to the selected records.

### Generate Documents
1. Check one or more rows in the table, or use the **Select All** checkbox in the header.
2. Choose a template from the dropdown.
3. Click **Generate Selected Documents & PDFs**.
4. Wait for processing — each selected row generates one Google Doc and one PDF.
5. Direct links for **Edit Doc** and **Download PDF** appear below the button when complete.

> **Important:** Each generation run **clears the output folder** before creating new files. Download or move any previously generated files before running again.

---

## 🛠️ Troubleshooting & FAQ

**Q: I get `"Please specify a valid SPREADSHEET_ID"` error.**
> A: You have not replaced the `SPREADSHEET_ID` placeholder in `Code.gs`. Open Apps Script, update the constant, and redeploy.

**Q: No templates appear in the dropdown.**
> A: Create the `TEMPLATES` tab with the correct column structure as shown in Step 1. The system returns an error if no templates are configured.

**Q: My placeholder `{{Column Name}}` is not being replaced.**
> A: Ensure the placeholder text in your Google Doc matches the column header in your sheet exactly (spaces and capitalisation matter, except that all-lowercase variants are also replaced). Check for invisible characters or extra spaces.

**Q: The output folder is not being created where I expect.**
> A: By default, the system creates a `"Generated Documents"` subfolder in the same Drive folder as your Google Sheet. To override this, add `OUTPUT_FOLDER_ID` to the `CONFIG` sheet tab with the target folder's Drive ID.

**Q: Login fails with valid credentials.**
> A: Confirm the `USERS` sheet has a header row (Row 1) that is skipped. Credentials start from Row 2. Also check for accidental leading/trailing spaces in sheet cells.

**Q: The Web App returns a CORS or network error.**
> A: Make sure you deployed with **"Who has access: Anyone"** and that you are using the correct `/exec` URL (not the `/dev` preview URL).

**Q: I updated `Code.gs` but changes are not taking effect.**
> A: You must create a **New Deployment** in Apps Script after every code change. Saving the script alone does not update the live Web App.

---

## 🔒 Security Considerations

- **Credentials are stored in plaintext** in the `USERS` Google Sheet. This is suitable for internal, low-sensitivity workflows. Do not use this system for high-security environments without adding proper encryption.
- **Token mechanism**: The session token is a Base64-encoded `username:password` string. It provides session continuity but is not cryptographically secure. Avoid exposing the Web App URL publicly in sensitive contexts.
- **Drive permissions**: Generated files are shared as `ANYONE_WITH_LINK` (view only for Docs, view/download for PDFs). Anyone who obtains a direct file link can access it. Restrict sharing settings in `Code.gs` if needed.
- **Apps Script execution**: The script runs as *you* (the deployer) and has access to your Google Drive and Sheets. Review the OAuth scopes granted during the authorization step.
