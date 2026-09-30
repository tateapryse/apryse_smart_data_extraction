import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────────────────
// Form Recognition & Auto-fill Pipeline
//
// Uses Apryse DataExtractionModule.e_Form to visually detect form fields on a
// flat (non-interactive) PDF, then creates AcroForm widgets at the detected
// positions using the PDFNet Widget APIs and fills them with demo customer data.
//
// Coordinate system: e_Form output uses originTop (top-left origin).
// PDFNet uses bottom-left origin. Conversion: pdfY = pageHeight - originTopY
// ─────────────────────────────────────────────────────────────────────────────

const IBANKING_FORM_PATH = path.join(
  process.cwd(),
  "files",
  "674116839-IBanking-Amendment-3.pdf"
);

function getDataExtractionResourcePath(): string {
  const baseLib = path.join(
    process.cwd(),
    "node_modules/@pdftron/data-extraction/lib"
  );
  const platformDir =
    process.platform === "win32"
      ? "Windows"
      : process.platform === "darwin"
      ? "Mac"
      : "Linux";
  const withSubdir = path.join(baseLib, platformDir);
  try {
    if ((require("fs") as typeof import("fs")).existsSync(withSubdir))
      return withSubdir;
  } catch {
    // ignore
  }
  return baseLib;
}

// ─── Raw e_Form output types ─────────────────────────────────────────────────
type RawFieldType =
  | "formTextField"
  | "formCheckBox"
  | "formRadioButton"
  | "formDigitalSignature";

interface RawFormElement {
  type: RawFieldType;
  confidence: number;
  rect: [number, number, number, number]; // originTop: [x1, y1, x2, y2]
}

interface RawFormPage {
  properties: { pageNumber: number };
  formElements: RawFormElement[];
}

// ─── Public types ─────────────────────────────────────────────────────────────
export interface DetectedField {
  fieldName: string;
  type: RawFieldType;
  confidence: number;
  rect: [number, number, number, number]; // originTop coords as-is from SDK
  pageNumber: number;
}

export interface FormRecognitionResult {
  success: boolean;
  fromCache?: boolean;
  fields: DetectedField[];
  stats: {
    text: number;
    checkbox: number;
    radio: number;
    signature: number;
    total: number;
  };
  originalPdfBase64: string;
  emptyFormPdfBase64: string;
  filledPdfBase64: string;
  filledFieldNames: string[];
  detectionTimeMs: number;
  fillTimeMs: number;
  errorMessage?: string;
}

// ─── Demo customer profile — fills text fields top-to-bottom across all 3 pages
// Bangkok Bank (Bualuang) iBanking/mBanking Amendment Form layout:
// P1: Branch, Date, Customer name, Customer ID, Reference No., Address fields,
//     Contact fields, Name change, Primary account change
// P2: Add/cancel deposit accounts, credit cards, loan, 3rd-party accounts
// P3: No text fields (radio-button limit selectors only)
const DEMO_TEXT_VALUES: string[] = [
  // ── Page 1 ──────────────────────────────────────────────────────────────
  "Silom Branch",            // Branch (สาขา)
  "05/08/2026",              // Date (วันที่)
  "SOMCHAI WATTANA",         // Customer full name (นาย/นาง/นางสาว)
  "BBL-0098765432",          // Customer Unique ID No.
  "REF-2026-081451",         // Reference No. (เลขที่อางอิง)
  // Change Mailing Address
  "123/45",                  // Address No. (บานเลขที่)
  "Soi Silom 19",            // Trok/Soi
  "3",                       // Moo (หมูที่)
  "Silom Tower Unit 2405",   // Village/Building/P.O. Box
  "Silom Road",              // Street (ถนน)
  "Si Lom",                  // Sub-District (ตำบล/แขวง)
  "Bang Rak",                // District/City (อำเภอ/เขต)
  "Bangkok",                 // Province/State (จังหวัด/รัฐ)
  "10500",                   // Postal Code (รหัสไปรษณีย)
  "Thailand",                // Country (ประเทศ)
  // Change E-mail & Phone
  "somchai.w@gmail.com",     // New E-mail Address
  "081-234-5678",            // Mobile (มือถือ)
  "02-634-7890",             // Home (บาน)
  "02-634-7800",             // Office (ที่ทำงาน)
  "02-634-7801",             // Fax No. (โทรสาร)
  // Change Name
  "สมชาย",                   // First name in Thai (ชื่อ)
  "วัฒนา",                    // Last name in Thai (นามสกุล)
  "SOMCHAI",                 // First name in English
  "WATTANA",                 // Last name in English
  // Change Primary Account
  "123-4-56789-0",           // Existing Primary Account No.
  "234-5-67890-1",           // New Primary Account No.
  "SOMCHAI WATTANA",         // Account Name (ชื่อบัญชี)
  "123-4-56789-0",           // Account No. (signature section)
  // ── Page 2 ──────────────────────────────────────────────────────────────
  // Add Deposit Accounts
  "345-6-78901-2",           // Deposit Account No. 1
  "SOMCHAI WATTANA",         // Account Name 1
  "456-7-89012-3",           // Deposit Account No. 2
  "SOMCHAI WATTANA",         // Account Name 2
  // Add Foreign Currency Deposit Account
  "FC-789-01234-5",          // Foreign Currency Account No.
  "SOMCHAI WATTANA",         // Foreign Currency Account Name
  // Add Credit Card
  "4000-0012-3456-7890",     // Credit Card No. 1
  "4000-0098-7654-3210",     // Credit Card No. 2
  // Add Loan Account
  "LN-001-234567-8",         // Loan Account No.
  // Add Third Party Accounts
  "567-8-90123-4",           // 3rd Party Account No. 1
  "MALEE WATTANA",           // 3rd Party Account Name 1
  "678-9-01234-5",           // 3rd Party Account No. 2
  "BANGKOK HOSPITAL",        // 3rd Party Account Name 2
  // Cancel section account numbers
  "345-6-78901-2",           // Cancel Deposit Account No.
  "FC-789-01234-5",          // Cancel Foreign Currency Account No.
  "567-8-90123-4",           // Cancel 3rd Party Account No.
  "4000-0012-3456-7890",     // Cancel Credit Card No.
  "LN-001-234567-8",         // Cancel Loan Account No.
];

// ─── Persistent form-recognition cache keyed by PDF content hash ─────────────
interface CachedFormResult {
  fields: DetectedField[];
  stats: FormRecognitionResult["stats"];
  emptyFormPdfBase64: string;
  filledPdfBase64: string;
  filledFieldNames: string[];
  detectionTimeMs: number;
  fillTimeMs: number;
}

const FORM_CACHE_VERSION = "3";
const formCache = new Map<string, CachedFormResult>();
const FORM_CACHE_MAX_ENTRIES = 20;
const FORM_CACHE_FILE = path.join(process.cwd(), "files", ".form-recognition-cache.json");

function loadFormCacheFromDisk(): void {
  try {
    const raw = fs.readFileSync(FORM_CACHE_FILE, "utf8");
    const entries: [string, CachedFormResult][] = JSON.parse(raw);
    for (const [k, v] of entries) formCache.set(k, v);
  } catch {
    // no cache file yet
  }
}

function saveFormCacheToDisk(): void {
  try {
    fs.mkdirSync(path.dirname(FORM_CACHE_FILE), { recursive: true });
    fs.writeFileSync(FORM_CACHE_FILE, JSON.stringify([...formCache.entries()]), "utf8");
  } catch {
    // non-fatal
  }
}

function pruneFormCache(): void {
  if (formCache.size < FORM_CACHE_MAX_ENTRIES) return;
  const firstKey = formCache.keys().next().value;
  if (firstKey) formCache.delete(firstKey);
}

function buildFormCacheKey(hash: string): string {
  return `${hash}:e_form:v${FORM_CACHE_VERSION}`;
}

loadFormCacheFromDisk();

export async function detectAndFillForm(pdfBase64?: string): Promise<FormRecognitionResult> {
  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) {
    return {
      success: false,
      fields: [],
      stats: { text: 0, checkbox: 0, radio: 0, signature: 0, total: 0 },
      originalPdfBase64: "",
      emptyFormPdfBase64: "",
      filledPdfBase64: "",
      filledFieldNames: [],
      detectionTimeMs: 0,
      fillTimeMs: 0,
      errorMessage: "APRYSE_LICENSE_KEY is not set.",
    };
  }

  // Use uploaded PDF if provided, otherwise fall back to the bundled IBanking demo form
  let inputPath: string;
  let tmpUploadDir: string | undefined;

  if (pdfBase64) {
    tmpUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "apryse-form-upload-"));
    inputPath = path.join(tmpUploadDir, "uploaded-form.pdf");
    fs.writeFileSync(inputPath, Buffer.from(pdfBase64, "base64"));
  } else {
    inputPath = IBANKING_FORM_PATH;
    if (!fs.existsSync(inputPath)) {
      return {
        success: false,
        fields: [],
        stats: { text: 0, checkbox: 0, radio: 0, signature: 0, total: 0 },
        originalPdfBase64: "",
        emptyFormPdfBase64: "",
        filledPdfBase64: "",
        filledFieldNames: [],
        detectionTimeMs: 0,
        fillTimeMs: 0,
        errorMessage: `Default IBanking form not found at ${inputPath}`,
      };
    }
  }

  // Check cache before running the SDK
  const pdfBytes = fs.readFileSync(inputPath);
  const pdfHash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
  const cacheKey = buildFormCacheKey(pdfHash);
  const cached = formCache.get(cacheKey);
  if (cached) {
    console.log(`[formRecognition] Cache hit ${cacheKey.slice(0, 16)}… — skipping SDK`);
    if (tmpUploadDir) {
      try { fs.rmSync(tmpUploadDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    return { success: true, fromCache: true, originalPdfBase64: pdfBytes.toString("base64"), ...cached };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apryse-form-"));
  const detectOutputPath = path.join(tmpDir, "form-fields.json");
  const emptyFormOutputPath = path.join(tmpDir, "empty-form.pdf");
  const filledOutputPath = path.join(tmpDir, "filled-form.pdf");

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFNet } = require("@pdftron/pdfnet-node");

    let detectedFields: DetectedField[] = [];
    let stats = { text: 0, checkbox: 0, radio: 0, signature: 0, total: 0 };
    let emptyFormPdfBase64 = "";
    let filledPdfBase64 = "";
    const filledFieldNames: string[] = [];
    let detectionTimeMs = 0;
    let fillTimeMs = 0;
    let sdkError: string | undefined;

    await PDFNet.runWithCleanup(async () => {
      try {
        const resourcePath = getDataExtractionResourcePath();
        await PDFNet.addResourceSearchPath(resourcePath);

        // ── Phase 1: e_Form detection ─────────────────────────────────────
        const t0 = Date.now();
        console.log("[formRecognition] Running e_Form field detection...");

        await PDFNet.DataExtractionModule.extractData(
          inputPath,
          detectOutputPath,
          PDFNet.DataExtractionModule.DataExtractionEngine.e_Form
        );

        const raw = JSON.parse(fs.readFileSync(detectOutputPath, "utf8")) as {
          pages: RawFormPage[];
        };

        // Sort each page's elements top-to-bottom, left-to-right (originTop coords)
        const textCounters: Record<number, number> = {};
        const checkCounters: Record<number, number> = {};
        const radioCounters: Record<number, number> = {};

        for (const page of raw.pages) {
          const pn = page.properties.pageNumber;
          textCounters[pn] = 0;
          checkCounters[pn] = 0;
          radioCounters[pn] = 0;

          const sorted = [...(page.formElements || [])].sort((a, b) => {
            const yDiff = a.rect[1] - b.rect[1];
            return Math.abs(yDiff) < 5 ? a.rect[0] - b.rect[0] : yDiff;
          });

          for (const el of sorted) {
            let fieldName: string;
            if (el.type === "formTextField") {
              textCounters[pn]++;
              fieldName = `text_${String(textCounters[pn]).padStart(2, "0")}_p${pn}`;
              stats.text++;
            } else if (el.type === "formCheckBox") {
              checkCounters[pn]++;
              fieldName = `check_${String(checkCounters[pn]).padStart(2, "0")}_p${pn}`;
              stats.checkbox++;
            } else if (el.type === "formRadioButton") {
              radioCounters[pn]++;
              fieldName = `radio_${String(radioCounters[pn]).padStart(2, "0")}_p${pn}`;
              stats.radio++;
            } else {
              // formDigitalSignature — detect but don't create an interactive field
              fieldName = `sig_p${pn}`;
              stats.signature++;
              detectedFields.push({
                fieldName,
                type: el.type,
                confidence: el.confidence,
                rect: el.rect,
                pageNumber: pn,
              });
              continue;
            }

            detectedFields.push({
              fieldName,
              type: el.type,
              confidence: el.confidence,
              rect: el.rect,
              pageNumber: pn,
            });
          }
        }

        stats.total = stats.text + stats.checkbox + stats.radio + stats.signature;
        detectionTimeMs = Date.now() - t0;
        console.log(
          `[formRecognition] Detected ${stats.total} fields in ${detectionTimeMs}ms`
        );

        // ── Phase 2: Create interactive fields, save empty form, fill, save filled ───
        const t1 = Date.now();
        const doc = await PDFNet.PDFDoc.createFromFilePath(inputPath);
        await doc.initSecurityHandler();

        const pageCount = await doc.getPageCount();

        // Build a map of page heights for coordinate flipping
        const pageHeights: Record<number, number> = {};
        for (let i = 1; i <= pageCount; i++) {
          const page = await doc.getPage(i);
          pageHeights[i] = await page.getPageHeight();
        }

        // Group radio buttons on the same page into logical groups
        // (consecutive radio buttons within 30pt vertical distance share a group)
        const radioGroups: Map<string, DetectedField[]> = new Map();
        let lastRadioY = -999;
        let radioGroupIdx = 0;
        for (const field of detectedFields.filter((f) => f.type === "formRadioButton")) {
          const y = field.rect[1];
          if (Math.abs(y - lastRadioY) > 30) radioGroupIdx++;
          const groupKey = `radioGroup_${field.pageNumber}_${radioGroupIdx}`;
          if (!radioGroups.has(groupKey)) radioGroups.set(groupKey, []);
          radioGroups.get(groupKey)!.push(field);
          lastRadioY = y;
        }

        // ── Pass A: create all widgets with NO values — store refs for text/checkbox ──
        type WidgetRef =
          | { kind: "text"; widget: { setText: (v: string) => Promise<void> }; fieldName: string }
          | { kind: "check"; widget: { setChecked: (v: boolean) => Promise<void> }; fieldName: string };
        const widgetRefs: WidgetRef[] = [];

        for (const field of detectedFields) {
          if (field.type === "formDigitalSignature") continue;

          const page = await doc.getPage(field.pageNumber);
          const pH = pageHeights[field.pageNumber];
          const [x1, y1, x2, y2] = field.rect;
          // Flip Y from originTop to PDF bottom-left origin
          const rect = await PDFNet.Rect.init(x1, pH - y2, x2, pH - y1);

          if (field.type === "formTextField") {
            const widget = await PDFNet.TextWidget.create(doc, rect, field.fieldName);
            await page.annotPushBack(widget);
            widgetRefs.push({ kind: "text", widget, fieldName: field.fieldName });
          } else if (field.type === "formCheckBox") {
            const widget = await PDFNet.CheckBoxWidget.create(doc, rect, field.fieldName);
            await page.annotPushBack(widget);
            widgetRefs.push({ kind: "check", widget, fieldName: field.fieldName });
          } else if (field.type === "formRadioButton") {
            const group = await PDFNet.RadioButtonGroup.create(doc, field.fieldName);
            const rbRect = await PDFNet.Rect.init(x1, pH - y2, x2, pH - y1);
            await group.add(rbRect);
            await group.addGroupButtonsToPage(page);
          }
        }

        // Save empty interactive form without refreshing appearances (WebViewer renders defaults)
        await doc.save(emptyFormOutputPath, PDFNet.SDFDoc.SaveOptions.e_linearized);
        emptyFormPdfBase64 = fs.readFileSync(emptyFormOutputPath).toString("base64");

        // ── Pass B: fill values into the already-created widgets ──────────────────
        let textFillIdx = 0;
        for (const ref of widgetRefs) {
          if (ref.kind === "text") {
            if (textFillIdx < DEMO_TEXT_VALUES.length) {
              await ref.widget.setText(DEMO_TEXT_VALUES[textFillIdx]);
              filledFieldNames.push(ref.fieldName);
              textFillIdx++;
            }
          } else if (ref.kind === "check") {
            const checkNum = parseInt(ref.fieldName.split("_")[1], 10);
            if (checkNum % 3 === 1) {
              await ref.widget.setChecked(true);
              filledFieldNames.push(ref.fieldName);
            }
          }
        }

        // refreshFieldAppearances is called only ONCE — same cost as before this change
        await doc.refreshFieldAppearances();
        await doc.save(
          filledOutputPath,
          PDFNet.SDFDoc.SaveOptions.e_linearized
        );

        fillTimeMs = Date.now() - t1;
        const filledBuf = fs.readFileSync(filledOutputPath);
        filledPdfBase64 = filledBuf.toString("base64");
        console.log(
          `[formRecognition] Created ${stats.total} interactive fields, filled ${filledFieldNames.length} in ${fillTimeMs}ms`
        );
      } catch (innerErr: unknown) {
        sdkError =
          innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.error("[formRecognition] SDK error:", sdkError);
      }
    }, licenseKey);

    if (sdkError) {
      return {
        success: false,
        fields: detectedFields,
        stats,
        originalPdfBase64: "",
        emptyFormPdfBase64: "",
        filledPdfBase64: "",
        filledFieldNames: [],
        detectionTimeMs,
        fillTimeMs,
        errorMessage: sdkError,
      };
    }

    pruneFormCache();
    formCache.set(cacheKey, { fields: detectedFields, stats, emptyFormPdfBase64, filledPdfBase64, filledFieldNames, detectionTimeMs, fillTimeMs });
    saveFormCacheToDisk();

    return {
      success: true,
      fields: detectedFields,
      stats,
      originalPdfBase64: pdfBytes.toString("base64"),
      emptyFormPdfBase64,
      filledPdfBase64,
      filledFieldNames,
      detectionTimeMs,
      fillTimeMs,
    };
  } catch (err: unknown) {
    return {
      success: false,
      fields: [],
      stats: { text: 0, checkbox: 0, radio: 0, signature: 0, total: 0 },
      originalPdfBase64: "",
      emptyFormPdfBase64: "",
      filledPdfBase64: "",
      filledFieldNames: [],
      detectionTimeMs: 0,
      fillTimeMs: 0,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      if (tmpUploadDir) fs.rmSync(tmpUploadDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

// ─── Flatten + OCR-strip pipeline ────────────────────────────────────────────
// Bakes AcroForm fields into the page image (flattenAnnotations), then removes
// all text elements from every page content stream so the result is a pure-image
// PDF with no selectable/searchable text — "trapped data" proof for the demo.
export async function flattenAndRemoveOcr(filledPdfBase64: string): Promise<{
  success: boolean;
  strippedPdfBase64: string;
  errorMessage?: string;
}> {
  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) {
    return { success: false, strippedPdfBase64: "", errorMessage: "APRYSE_LICENSE_KEY is not set." };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apryse-ocr-strip-"));
  const inputPath = path.join(tmpDir, "filled.pdf");
  const outputPath = path.join(tmpDir, "stripped.pdf");

  try {
    fs.writeFileSync(inputPath, Buffer.from(filledPdfBase64, "base64"));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFNet } = require("@pdftron/pdfnet-node");
    let strippedPdfBase64 = "";
    let sdkError: string | undefined;

    await PDFNet.runWithCleanup(async () => {
      try {
        const doc = await PDFNet.PDFDoc.createFromFilePath(inputPath);
        await doc.initSecurityHandler();
        // Bake AcroForm fields into page content before rasterizing
        await doc.flattenAnnotations(false);

        const pageCount = await doc.getPageCount();
        // 150 DPI matches a typical office scanner — text becomes pixels
        const draw = await PDFNet.PDFDraw.create(150);

        const newDoc = await PDFNet.PDFDoc.create();
        const builder = await PDFNet.ElementBuilder.create();
        const writer = await PDFNet.ElementWriter.create();

        for (let i = 1; i <= pageCount; i++) {
          const page = await doc.getPage(i);
          const pageW = await page.getPageWidth();
          const pageH = await page.getPageHeight();

          // Render page to PNG — all content (including text) becomes pixel data
          const pngPath = path.join(tmpDir, `page_${i}.png`);
          await draw.export(page, pngPath, "PNG");

          const img = await PDFNet.Image.createFromFile(newDoc, pngPath);
          const newPage = await newDoc.pageCreate(await PDFNet.Rect.init(0, 0, pageW, pageH));
          await writer.beginOnPage(newPage, PDFNet.ElementWriter.WriteMode.e_overlay, false);
          const imgElem = await builder.createImageFromMatrix(
            img,
            new PDFNet.Matrix2D(pageW, 0, 0, pageH, 0, 0)
          );
          await writer.writePlacedElement(imgElem);
          writer.end();
          await newDoc.pagePushBack(newPage);
        }

        await newDoc.save(outputPath, PDFNet.SDFDoc.SaveOptions.e_linearized);
        strippedPdfBase64 = fs.readFileSync(outputPath).toString("base64");
        console.log(`[formRecognition] Rasterized ${pageCount} pages to scan-like PDF (${strippedPdfBase64.length} chars base64)`);
      } catch (innerErr: unknown) {
        sdkError = innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.error("[formRecognition] Rasterize-to-scan error:", sdkError);
      }
    }, licenseKey);

    if (sdkError) {
      return { success: false, strippedPdfBase64: "", errorMessage: sdkError };
    }
    return { success: true, strippedPdfBase64 };
  } catch (err: unknown) {
    return {
      success: false,
      strippedPdfBase64: "",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
