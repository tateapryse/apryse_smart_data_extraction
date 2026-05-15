# Local Development Setup

This guide covers running the Apryse Investment Intelligence Demo locally on **Windows**, **macOS**, and **Linux**. It documents every known pitfall so you don't have to discover them the hard way.

---

## Prerequisites

| Tool | Required Version | Notes |
|------|-----------------|-------|
| **Node.js** | **v22.x only** | v24 is NOT supported — pdfnet-node native binaries are not yet built for Node v24 ABI |
| **pnpm** | v10.x | Do NOT use `npm install` — it ignores the lockfile and breaks dependency resolution |
| **MySQL** | 8.x | Or any MySQL-compatible cloud database (PlanetScale, Aiven, Railway) |

---

## Step 1 — Install Node.js v22 (Critical)

### Windows

Use **nvm-windows** to manage Node.js versions. Do NOT install Node.js directly from nodejs.org — it installs into a system directory that requires admin rights for global packages.

1. Download `nvm-setup.exe` from [github.com/coreybutler/nvm-windows/releases](https://github.com/coreybutler/nvm-windows/releases)
2. Run the installer
3. Open a new PowerShell window, then:

```powershell
nvm install 22
nvm use 22
node --version   # must show v22.x.x
```

### macOS

```bash
# Option A — Homebrew
brew install node@22

# Option B — nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 22 && nvm use 22
```

### Why v22 specifically

`@pdftron/pdfnet-node` ships pre-built native binaries for specific Node.js ABI versions. Node.js v22 uses ABI v127. Node.js v24 uses ABI v137, for which no pdfnet-node binary exists yet. Running `pnpm install` under v24 will appear to succeed but the SDK will fail at runtime with a `Cannot find module .../pdfnet.js` error.

---

## Step 2 — Install pnpm

### Windows

```powershell
# Do NOT use: npm install -g pnpm  (requires admin rights and breaks)
# Use the official installer instead:
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
```

Restart PowerShell after installation, then verify:

```powershell
pnpm --version
```

### macOS / Linux

```bash
brew install pnpm
# or:
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

---

## Step 3 — Install Dependencies

```bash
pnpm install
```

### Windows only — approve native binary downloads

pnpm blocks postinstall scripts by default for security. After `pnpm install` completes, you will see a warning like:

```
Ignored build scripts: @pdftron/data-extraction, @pdftron/pdfnet-node, @tailwindcss/oxide, esbuild.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

Run:

```powershell
pnpm approve-builds
```

A menu appears. Use **arrow keys** to navigate and **Space** to select each of these four:

- `@pdftron/data-extraction`
- `@pdftron/pdfnet-node`
- `@tailwindcss/oxide`
- `esbuild`

Press **Enter** to confirm. pnpm will download the Windows native binaries automatically. This may take 1–3 minutes.

**Verify the binaries downloaded correctly:**

```powershell
# Should show: OCRModule.exe, StructuredOutput.exe, tessdata/, AIPageObjectExtractor/, TabularData/
ls node_modules\@pdftron\data-extraction\lib\

# Should show: pdfnet.js, PDFNetC64.dll, addon.node
ls node_modules\.pnpm\@pdftron+pdfnet-node@11.11.1\node_modules\@pdftron\pdfnet-node\lib\
```
---

## Step 4 — Set Up MySQL

### Windows (local)

Download MySQL from [dev.mysql.com/downloads/installer](https://dev.mysql.com/downloads/installer/) and run the installer. Then:

```powershell
net start mysql
mysql -u root -e "CREATE DATABASE IF NOT EXISTS apryse_demo;"
```

### macOS (local)

```bash
brew install mysql
brew services start mysql
mysql -u root -e "CREATE DATABASE IF NOT EXISTS apryse_demo;"
```

### Cloud database (skip local install entirely)

Use a free hosted MySQL instance and paste the connection string into `DATABASE_URL` in your `.env`:

| Service | Free Tier |
|---------|-----------|
| [PlanetScale](https://planetscale.com) | 5 GB free, no credit card |
| [Aiven](https://aiven.io) | 1 free service |
| [Railway](https://railway.app) | $5 credit free |

---

## Step 5 — Create the `.env` File

Create a file named `.env` in the project root (same folder as `package.json`).

### Windows (PowerShell)

```powershell
notepad .env
```

### macOS / Linux

```bash
nano .env
# To save and exit nano: Ctrl+X → Y → Enter
```

Paste in the following and fill in your values:

```env
# ── Database ──────────────────────────────────────────────────────────────────
# Fresh local MySQL install (no password):
DATABASE_URL=mysql://root@localhost:3306/apryse_demo
# With password:
# DATABASE_URL=mysql://root:yourpassword@localhost:3306/apryse_demo

# ── Auth ──────────────────────────────────────────────────────────────────────
# Any random string of 32+ characters is fine for local dev
JWT_SECRET=local-dev-secret-replace-with-something-random

# ── Apryse SDK ────────────────────────────────────────────────────────────────
# Server-side extraction. Without this, set USE_MOCK_DATA=true in
# server/apryseExtraction.ts to run in demo mode with sample data.
APRYSE_LICENSE_KEY=

# Client-side WebViewer. Without this, WebViewer runs in trial mode (watermark).
VITE_APRYSE_LICENSE_KEY=

# ── LLM (AI Analysis) ─────────────────────────────────────────────────────────
# Google Gemini (recommended — get a free key at aistudio.google.com/apikey):
BUILT_IN_FORGE_API_URL=https://generativelanguage.googleapis.com/v1beta/openai
BUILT_IN_FORGE_API_KEY=your-google-ai-api-key

# OpenAI alternative:
# BUILT_IN_FORGE_API_URL=https://api.openai.com
# BUILT_IN_FORGE_API_KEY=sk-your-openai-key
# (also change model to gpt-4o-mini in server/_core/llm.ts)

```

> **macOS tip:** `.env` files are hidden by default. Press **Cmd+Shift+.** in Finder to toggle hidden file visibility.

---

## Step 6 — Push the Database Schema

```bash
pnpm db:push
```

Expected output: `No schema changes, nothing to migrate` (or a list of tables created on first run).

**Common errors:**

| Error | Fix |
|-------|-----|
| `DATABASE_URL is required` | The `.env` file is missing or not in the project root. Run `ls .env` (macOS) or `dir .env` (Windows) to check. |
| `Access denied for user 'root'@'localhost' (using password: YES)` | Your `DATABASE_URL` has a password but MySQL root has none. Remove `:password` → `mysql://root@localhost:3306/apryse_demo` |
| `Can't connect to local MySQL server through socket '/tmp/mysql.sock'` | MySQL is not running. Run `brew services start mysql` (macOS) or `net start mysql` (Windows). |

---

## Step 7 — Start the Dev Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Enabling Live Apryse SDK Extraction

The default behaviour is to attempt real SDK extraction. If `APRYSE_LICENSE_KEY` is not set, the extraction will fail with an error.

To run in **demo mode** with pre-extracted sample data instead, open `server/apryseExtraction.ts` and change:

```ts
const USE_MOCK_DATA = false;
```

to:

```ts
const USE_MOCK_DATA = true;
```

To re-enable live extraction, set `APRYSE_LICENSE_KEY` in your `.env` and revert the flag.

---

## Troubleshooting

### `npm error ERESOLVE unable to resolve dependency tree`

You ran `npm install` instead of `pnpm install`. Use pnpm — it reads the lockfile and resolves all version conflicts correctly.

### `EACCES: permission denied, mkdir '/usr/local/lib/node_modules'`

You tried to install pnpm globally via `npm install -g pnpm`. Use the official pnpm installer script instead (see Step 2).

### `Cannot find module .../pdfnet-node/lib/pdfnet.js`

The pdfnet-node native binaries were not downloaded. Causes:
- Running under Node.js v24 (not supported — downgrade to v22)
- Skipped `pnpm approve-builds` on Windows
- Ran `npm install` instead of `pnpm install`

Fix: switch to Node.js v22, delete `node_modules/`, run `pnpm install`, then `pnpm approve-builds`.

### `DataExtractionModule (e_generic_key_value) is not available`

The `@pdftron/data-extraction` binaries are missing. Run `pnpm approve-builds` and select `@pdftron/data-extraction`.

### `Analysis failed: Unknown name "thinking"`

Delete the `payload.thinking = { ... }` block from `server/_core/llm.ts` (see Step 7).

### `Analysis failed: model "gemini-2.5-flash" does not exist`

You are pointing `BUILT_IN_FORGE_API_URL` at OpenAI but using a Gemini model name. Either switch to Google's endpoint or change the model to `gpt-4o-mini` in `server/_core/llm.ts`.

### Port 3000 already in use

```powershell
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

```bash
# macOS / Linux
lsof -ti:3000 | xargs kill -9
```
