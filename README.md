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

You need **3 sheets minimum** (and up to 2 optional sheets) in your Google Spreadsheet.

> **Note:** A 5th sheet tab named `SESSIONS` is **automatically created and managed** by `Code.gs` on first login. Do not delete or edit it manually.

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

#### 4. `CONFIG` *(Optional but Recommended)*
**Purpose:** Controls all application settings without ever touching `Code.gs`.
- **Columns**: Column A = Key, Column B = Value.
- All keys are optional. If a key is absent or blank, the built-in default is used.

| Key                   | Default Value          | Description                                         |
|-----------------------|------------------------|-----------------------------------------------------|
| `DATA_SHEET_NAME`     | `Form Responses 1`     | Tab containing your form/data records               |
| `USERS_SHEET_NAME`    | `USERS`                | Tab containing login credentials                    |
| `TEMPLATES_SHEET_NAME`| `TEMPLATES`            | Tab listing document templates                      |
| `SESSIONS_SHEET_NAME` | `SESSIONS`             | Tab auto-managed by script (do not edit manually)   |
| `DEFAULT_FOLDER_NAME` | `Generated Documents`  | Name of the auto-created output Drive folder        |
| `OUTPUT_FOLDER_ID`    | *(blank)*              | Specific Drive Folder ID to use instead of auto     |
| `SESSION_EXPIRY_HOURS`| `8`                    | Hours before a login session expires                |
| `MAX_FAILED_ATTEMPTS` | `5`                    | Failed logins before account lockout                |
| `LOCKOUT_MINUTES`     | `15`                   | Minutes an account stays locked after too many fails|

> **Tip:** You only need to add rows for settings you want to override. Any missing key uses its default value automatically.

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

> **You only do this once. You will never need to edit or redeploy `Code.gs` again.**

### 3.1 — Create the Apps Script Project

1. Open your Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Delete any existing code in the editor.
4. Paste the full contents of `Code.gs` into the editor.
5. Click **Save** (💾).

### 3.2 — Run `setupTriggers` (One-Click Auto-Setup — No Copy-Pasting Sheet ID)

1. In the Apps Script toolbar at the top, click the **function dropdown** (next to "Debug" / "Run", which may say `doGet`).
2. Select **`setupTriggers`**.
3. Click **▶ Run**.
4. When prompted, click **Review permissions** and choose your Google account to authorize the script.

> **What `setupTriggers()` does automatically:**
> - Detects your Google Sheet ID directly from the active spreadsheet and saves `SPREADSHEET_ID` to Script Properties.
> - Installs an `onChange` trigger so that any edit to your Google Sheet automatically refreshes the system cache instantly.
> - **Neither you nor your users will ever have to manually copy IDs or clear caches.**

### 3.3 — Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon ⚙ next to **"Select type"** and choose **Web app**.
3. Fill in the deployment settings:
   - **Description**: `Auto Drafting v1` (or any label)
   - **Execute as**: `Me` (your Google account)
   - **Who has access**: `Anyone` *(authentication is handled by the app itself)*
4. Click **Deploy**.
5. Copy the **Web App URL** — you will need it in Step 4.

> **Note:** Because `Code.gs` is 100% dynamic and reads everything from your Google Sheet, you will **never need to redeploy** unless you intentionally change the script code itself.

---

## 🖥️ Step 4: Frontend Web App Setup (`frontend.html`)

> **Security note:** `frontend.html` in this repository contains only a placeholder URL and is safe to share publicly. For your personal deployment, follow the steps below using `frontend.local.html`.

1. Make a copy of `frontend.html` and name it **`frontend.local.html`**.
   - This filename is listed in `.gitignore` and will **never be committed** to version control.
2. Open `frontend.local.html` in any text editor.
3. Locate this line near the top of the `<script>` block:
   ```javascript
   const WEB_APP_URL = "YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
4. Replace the placeholder with the Web App URL you copied in Step 3.4:
   ```javascript
   const WEB_APP_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
   ```
5. Save the file.
6. Open `frontend.local.html` directly in any modern web browser — **no server required**.

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

**Q: I get `"SPREADSHEET_ID is not set"` error.**
> A: You have not run `setupTriggers` yet. In Apps Script, select **`setupTriggers`** from the function dropdown and click **▶ Run** (or manually add `SPREADSHEET_ID` under **Project Settings → Script Properties**). No code editing or redeployment needed.

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

**Q: Do changes in the Google Sheet reflect automatically?**
> A: **Yes, instantly!** When you run `setupTriggers()`, an `onChange` trigger is installed on your spreadsheet. Any time you add a user, template, data record, or modify the CONFIG tab, the cache is automatically refreshed. You do NOT need to redeploy or clear caches manually.

**Q: My account is locked and I can't log in.**
> A: After 5 failed login attempts, the account is locked for 15 minutes. The lockout is tracked in the `SESSIONS` sheet. To unlock immediately, open your Google Sheet, unhide the `SESSIONS` tab, delete the row for your username that has no token value, then re-hide the sheet.

**Q: The `SESSIONS` sheet appeared automatically — is that normal?**
> A: Yes. `Code.gs` automatically creates and manages the `SESSIONS` sheet on the first login. It stores active session tokens (with expiry) and failed-attempt counters. Do not delete or modify it manually.

---

## 🔧 Utility Functions

These helper functions are built into [`Code.gs`](Code.gs) and can be run manually from the Apps Script editor when needed.

**How to run any utility function:**
> Apps Script editor → top toolbar → click the **function name dropdown** (shows `doGet` by default) → select the function → click **▶ Run**.

| Function | Purpose | When to use |
|---|---|---|
| `setupTriggers()` | Auto-detects Sheet ID, saves `SPREADSHEET_ID` to Script Properties, and installs the live `onChange` trigger | **Run ONCE during initial setup** |
| `clearConfigCache()` | Clears the 5-minute config cache manually | Fallback only — changes to the Google Sheet are already synced automatically via `onChange` |

---

## 🔒 Security Considerations

### What has been hardened

- **Secure Session Tokens**: Login no longer issues a reversible Base64 token. A random 32-character token (derived from SHA-256 of time + entropy) is issued instead and stored server-side in the `SESSIONS` sheet with an **8-hour expiry**. Tokens cannot be decoded to recover the password.
- **Login Rate Limiting**: After **5 consecutive failed login attempts**, the account is locked for **15 minutes**. The lockout is tracked per username in the `SESSIONS` sheet and automatically lifted after the lockout period.
- **Automatic Session Cleanup**: Expired sessions are pruned from the `SESSIONS` sheet automatically, but at most **once per hour** to avoid slowing down logins. The cleanup runs in the background on the first login after an hour has passed.
- **Row ID Validation**: The generate action validates every row ID from the client — checking for NaN, negative values, and out-of-bounds indices — before any data access.
- **Safe URL in Version Control**: `frontend.html` in the repository contains only a placeholder URL. The live URL lives in `frontend.local.html`, which is excluded by `.gitignore`.

### Known limitations (remaining risk)

- **Credentials stored in plaintext**: Passwords in the `USERS` sheet are plain text. This is suitable for internal, low-sensitivity workflows. For higher security, store SHA-256 hashes of passwords and hash the login input before comparing.
- **Drive file sharing**: Generated files are set to `ANYONE_WITH_LINK`. Anyone who obtains a direct link can view the file without logging in. Restrict to `DOMAIN_WITH_LINK` if you are in a Google Workspace organisation.
- **Apps Script execution context**: The script runs as *you* (the deployer) and has full access to your Google Drive and Sheets. Review the OAuth scopes granted during authorisation.
- **No HTTPS enforcement on the frontend**: `frontend.local.html` is a local file opened via `file://`. Tokens are sent over HTTPS to the Apps Script endpoint, but the file itself is not served over a secure server.
