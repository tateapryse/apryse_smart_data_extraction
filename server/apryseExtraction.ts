import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA TOGGLE
//
// By default this file runs the real Apryse Server SDK extraction.
// If you do NOT have a license key and want to run the app with pre-extracted
// demo data instead, set USE_MOCK_DATA = true below.
//
// Requirements for real extraction:
//   1. Set APRYSE_LICENSE_KEY in your .env file
//   2. Run `pnpm install` so @pdftron/pdfnet-node and @pdftron/data-extraction
//      are installed with their native binaries
//   3. On Windows: run `pnpm approve-builds` during install to allow
//      @pdftron/pdfnet-node and @pdftron/data-extraction to download their binaries
// ─────────────────────────────────────────────────────────────────────────────
const USE_MOCK_DATA = false;
// Set to true ONLY if you have no license key and want demo mode:
// const USE_MOCK_DATA = true;

// Resolve the resource path for the data-extraction module.
//
// The package ships differently per platform:
//   Windows: binaries (OCRModule.exe, StructuredOutput.exe) sit directly in lib/
//   Linux:   binaries sit in lib/Linux/
//   macOS:   binaries sit in lib/Mac/
//
// We try the platform subdirectory first; if it doesn't exist we fall back to
// lib/ directly (which is the Windows layout).
function getDataExtractionResourcePath(): string {
  const baseLib = path.join(
    process.cwd(),
    "node_modules/@pdftron/data-extraction/lib"
  );

  const platform: string = process.platform; // 'linux' | 'win32' | 'darwin'
  const platformDir: string =
    platform === "win32" ? "Windows" : platform === "darwin" ? "Mac" : "Linux";
  const withSubdir = path.join(baseLib, platformDir);

  // If the platform subdirectory exists, use it; otherwise fall back to lib/ root
  try {
    const fs = require("fs") as typeof import("fs");
    if (fs.existsSync(withSubdir)) {
      return withSubdir;
    }
  } catch {
    // ignore
  }
  return baseLib;
}

// Path to the staged Apryse OCR module (v12 deep-learning engine).
// Registered via addResourceSearchPath so OCRModule.isModuleAvailable() is true.
const OCR_MODULE_PATH = path.resolve(process.cwd(), "apryse-ocr-module", "Lib");

// Per-upload OCR measurement surfaced to the demo UI.
export interface OcrInfo {
  applied: boolean;      // whether processPDF was actually run on this file
  available: boolean;    // whether the OCR module loaded
  charsBefore: number;   // text-layer chars before OCR (the no-OCR floor)
  charsAfter: number;    // text-layer chars after OCR (or same if skipped)
  pageCount: number;
  timeMs: number;        // OCR processing time
}

export interface ExtractionResult {
  success: boolean;
  data: Record<string, unknown>;
  usedMock: boolean;
  extractionTime: number;
  errorMessage?: string;
  ocr?: OcrInfo;
  fromCache?: boolean;
  ocrPdfBase64?: string; // only present when OCR was applied
}

// Sum trimmed text-layer characters across every page of an open PDFDoc.
async function measureDocText(
  PDFNet: any,
  doc: any
): Promise<{ chars: number; pageCount: number }> {
  await doc.initSecurityHandler();
  const pageCount: number = await doc.getPageCount();
  const txt = await PDFNet.TextExtractor.create();
  let chars = 0;
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    txt.begin(page);
    chars += (await txt.getAsText()).trim().length;
  }
  return { chars, pageCount };
}

// ─── Schema normalizer ────────────────────────────────────────────────────────
// Real Apryse SDK output schema per element:
//   el.rect          → VALUE bounding box  [x1, y1, x2, y2]
//   el.words         → VALUE word objects  [{ content, rect }]
//   el.key.rect      → KEY bounding box    [x1, y1, x2, y2]
//   el.key.words     → KEY word objects    [{ content, rect }]
//
// We normalise this to the flat schema used everywhere in the app:
//   key_text, value_text, key_rect, value_rect, confidence
//
// The mock data in mockExtractedData.ts already uses this flat schema, so it
// does NOT need to be normalised again.
function normalizeRawExtractionData(
  rawData: Record<string, unknown>
): Record<string, unknown> {
  interface RawWord { content: string; rect: number[] }
  interface RawKeyEl {
    confidence: number;
    rect: number[];           // value bbox
    words: RawWord[];         // value words
    key: {
      rect: number[];         // key bbox
      words: RawWord[];       // key words
    };
  }
  interface RawPage {
    properties: { pageNumber: number };
    keyValueElements: RawKeyEl[];
  }

  const pages = (rawData.pages as RawPage[]) || [];

  const normalizedPages = pages.map((page) => ({
    ...page,
    keyValueElements: (page.keyValueElements || []).map((el) => ({
      key_text: (el.key?.words || []).map((w) => w.content).join(" "),
      value_text: (el.words || []).map((w) => w.content).join(" "),
      key_rect: el.key?.rect ?? null,
      value_rect: el.rect ?? null,
      confidence: el.confidence ?? 0.999,
    })),
  }));

  return { ...rawData, pages: normalizedPages };
}

/**
 * Extracts key-value pairs from a PDF using the Apryse DataExtractionModule.
 *
 * Runs the documented SDK call:
 *   DataExtractionModule.extractData(
 *     "InvestmentFactSheet.pdf",
 *     "output.json",
 *     DataExtractionModule.DataExtractionEngine.e_generic_key_value
 *   )
 *
 * Returns a typed ExtractionResult. On failure, success is false and
 * errorMessage contains the actual SDK error — no silent fallback.
 *
 * To enable mock data instead (no license key required), set
 * USE_MOCK_DATA = true at the top of this file.
 */
export async function extractPDFData(
  pdfBuffer: Buffer,
  originalFileName: string
): Promise<ExtractionResult> {
  const startTime = Date.now();

  // ── Mock data path (opt-in only) ──────────────────────────────────────────
  if (USE_MOCK_DATA) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { mockExtractionResult } = require("./mockExtractedData");
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return {
      success: true,
      data: {
        ...mockExtractionResult,
        _meta: {
          extraction_timestamp: new Date().toISOString(),
          source_file: originalFileName,
          engine: "e_generic_key_value",
          mode: "demo_mock",
          note: "Mock mode enabled (USE_MOCK_DATA=true). Set USE_MOCK_DATA=false and provide APRYSE_LICENSE_KEY for live extraction.",
        },
      } as unknown as Record<string, unknown>,
      usedMock: true,
      extractionTime: Date.now() - startTime,
    };
  }

  // ── Real SDK extraction ───────────────────────────────────────────────────
  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) {
    return {
      success: false,
      data: {},
      usedMock: false,
      extractionTime: Date.now() - startTime,
      errorMessage:
        "APRYSE_LICENSE_KEY is not set. Add it to your .env file. " +
        "If you want to run without a license key, set USE_MOCK_DATA=true in server/apryseExtraction.ts.",
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apryse-"));
  const inputPath = path.join(tmpDir, originalFileName || "input.pdf");
  const ocrInputPath = path.join(tmpDir, "ocr-input.pdf");
  const outputPath = path.join(tmpDir, "output.json");

  try {
    fs.writeFileSync(inputPath, pdfBuffer);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFNet } = require("@pdftron/pdfnet-node");

    let extractedData: Record<string, unknown> | null = null;
    let sdkError: string | undefined;
    let ocrInfo: OcrInfo | undefined;

    await PDFNet.runWithCleanup(async () => {
      try {
        // Point the SDK at the platform-specific data-extraction native module.
        // On Windows this resolves to lib/Windows/, on Linux to lib/Linux/, etc.
        const resourcePath = getDataExtractionResourcePath();
        console.log(`[apryseExtraction] Resource path: ${resourcePath}`);
        await PDFNet.addResourceSearchPath(resourcePath);
        await PDFNet.addResourceSearchPath(OCR_MODULE_PATH);

        const isAvailable = await PDFNet.DataExtractionModule.isModuleAvailable(
          PDFNet.DataExtractionModule.DataExtractionEngine.e_GenericKeyValue
        );

        if (!isAvailable) {
          sdkError =
            "DataExtractionModule (e_generic_key_value) is not available. " +
            "Ensure @pdftron/data-extraction is installed and its native binaries " +
            "are present in node_modules/@pdftron/data-extraction/lib/. " +
            "Run: node node_modules/@pdftron/pdfnet-node/scripts/install.js";
          return;
        }

        // ── OCR pre-pass ──────────────────────────────────────────────────────
        // Measure the existing text layer. If the document is a scan (little to
        // no extractable text) and the OCR module is available, burn a searchable
        // text layer in with OCRModule.processPDF, then extract from that copy.
        // Report the real before/after character counts for THIS file.
        let extractionInputPath = inputPath;
        try {
          const ocrAvailable = await PDFNet.OCRModule.isModuleAvailable();
          const doc = await PDFNet.PDFDoc.createFromFilePath(inputPath);
          const before = await measureDocText(PDFNet, doc);
          // Heuristic: fewer than ~20 chars/page means effectively no text layer.
          const needsOcr = before.chars < before.pageCount * 20;

          let charsAfter = before.chars;
          let applied = false;
          let timeMs = 0;

          if (ocrAvailable && needsOcr) {
            console.log(
              `[apryseExtraction] Sparse text layer (${before.chars} chars / ${before.pageCount} pages) — running OCR`
            );
            const t0 = Date.now();
            const opts = await PDFNet.OCRModule.createOCROptions();
            opts.addLang("eng");
            await PDFNet.OCRModule.processPDF(doc, opts);
            await doc.save(
              ocrInputPath,
              PDFNet.SDFDoc.SaveOptions.e_linearized
            );
            timeMs = Date.now() - t0;
            const after = await measureDocText(PDFNet, doc);
            charsAfter = after.chars;
            applied = true;
            extractionInputPath = ocrInputPath;
            console.log(
              `[apryseExtraction] OCR recovered ${charsAfter} chars in ${timeMs}ms`
            );
          } else {
            console.log(
              `[apryseExtraction] Text layer present (${before.chars} chars) — OCR not needed`
            );
          }

          ocrInfo = {
            applied,
            available: ocrAvailable,
            charsBefore: before.chars,
            charsAfter,
            pageCount: before.pageCount,
            timeMs,
          };
        } catch (ocrErr: unknown) {
          // OCR is best-effort — never fail extraction because of it.
          console.warn(
            "[apryseExtraction] OCR pre-pass skipped:",
            ocrErr instanceof Error ? ocrErr.message : String(ocrErr)
          );
        }

        console.log(`[apryseExtraction] Running live extraction on: ${originalFileName}`);

        // ── Core extraction call ──────────────────────────────────────────────
        // Mirrors the documented Apryse API:
        //   DataExtractionModule.extractData(
        //     "InvestmentFactSheet.pdf",
        //     "output.json",
        //     DataExtractionModule.DataExtractionEngine.e_generic_key_value
        //   )
        await PDFNet.DataExtractionModule.extractData(
          extractionInputPath,
          outputPath,
          PDFNet.DataExtractionModule.DataExtractionEngine.e_GenericKeyValue
        );

        if (fs.existsSync(outputPath)) {
          const raw = fs.readFileSync(outputPath, "utf-8");
          const rawParsed = JSON.parse(raw) as Record<string, unknown>;
          // Normalize from the real Apryse schema (el.rect = value, el.key.rect = key)
          // into the flat key_text/value_text/key_rect/value_rect format.
          extractedData = normalizeRawExtractionData(rawParsed);
          console.log("[apryseExtraction] Live extraction succeeded (normalized)");
        } else {
          sdkError =
            "SDK completed without error but produced no output file. " +
            "The PDF may be empty, encrypted, or unsupported.";
        }
      } catch (innerErr: unknown) {
        sdkError =
          innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.error("[apryseExtraction] SDK inner error:", sdkError);
      }
    }, licenseKey);

    if (extractedData) {
      return {
        success: true,
        data: extractedData,
        usedMock: false,
        extractionTime: Date.now() - startTime,
        ocr: ocrInfo,
      };
    }

    // SDK ran but failed — return the real error, do NOT silently fall back
    return {
      success: false,
      data: {},
      usedMock: false,
      extractionTime: Date.now() - startTime,
      errorMessage: sdkError ?? "SDK extraction failed with no error message.",
      ocr: ocrInfo,
    };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);
    console.error("[apryseExtraction] Unexpected error:", errorMessage);
    return {
      success: false,
      data: {},
      usedMock: false,
      extractionTime: Date.now() - startTime,
      errorMessage,
    };
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(ocrInputPath)) fs.unlinkSync(ocrInputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      fs.rmdirSync(tmpDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TWO-PHASE FLOW (so the UI can show OCR vs Extraction separately)
//
// Phase 1: detectAndOcr()  — read the text layer, decide scan vs digital, and
//          run OCR if needed. Returns a token pointing at a server-side temp
//          copy of the (possibly OCR'd) PDF, plus the per-file OCR numbers.
// Phase 2: extractFromToken() — run DataExtractionModule.extractData on that
//          temp copy, then delete it.
//
// The client drives both calls, so it always knows which phase is running.
// ─────────────────────────────────────────────────────────────────────────────

interface OcrJob {
  dir: string;
  pdfPath: string; // the (possibly OCR'd) PDF to extract from
  originalName: string;
  ocr: OcrInfo;
  timer: NodeJS.Timeout;
  cacheKey?: string; // set when we want to write to extraction cache on phase-2 success
}

// Short-lived server-side store bridging the two calls. Entries self-expire.
const ocrJobs = new Map<string, OcrJob>();
const OCR_JOB_TTL_MS = 10 * 60 * 1000;

// ── Extraction cache keyed by pdf content hash ────────────────────────────
const PIPELINE_VERSION = "1";
interface CachedExtraction {
  ocr: OcrInfo;
  data: Record<string, unknown>;
  ocrPdfBase64?: string;
}
const extractionCache = new Map<string, CachedExtraction>();
const CACHE_MAX_ENTRIES = 50;
const CACHE_FILE = path.join(process.cwd(), "files", ".extraction-cache.json");

function loadCacheFromDisk(): void {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const entries: [string, CachedExtraction][] = JSON.parse(raw);
    for (const [k, v] of entries) {
      extractionCache.set(k, v);
    }
  } catch {
    // no cache file yet — that's fine
  }
}

function saveCacheToDisk(): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify([...extractionCache.entries()]), "utf8");
  } catch {
    // non-fatal: next write will retry
  }
}

loadCacheFromDisk();

function computePdfHash(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function buildCacheKey(hash: string): string {
  return `${hash}:e_generic_key_value:v${PIPELINE_VERSION}`;
}

function pruneCache(): void {
  if (extractionCache.size < CACHE_MAX_ENTRIES) return;
  // evict the first (insertion-order oldest) entry
  const firstKey = extractionCache.keys().next().value;
  if (firstKey) extractionCache.delete(firstKey);
}

function cleanupJob(token: string): void {
  const job = ocrJobs.get(token);
  if (!job) return;
  clearTimeout(job.timer);
  ocrJobs.delete(token);
  try {
    fs.rmSync(job.dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

export interface DetectAndOcrResult {
  success: boolean;
  token?: string;
  ocr?: OcrInfo;
  usedMock?: boolean;
  errorMessage?: string;
  fromCache?: boolean;
}

/**
 * Phase 1 — detect scanned pages and OCR only if needed.
 * Keeps the resulting PDF in a temp dir and returns a token for phase 2.
 */
export async function detectAndOcr(
  pdfBuffer: Buffer,
  originalFileName: string
): Promise<DetectAndOcrResult> {
  if (USE_MOCK_DATA) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      success: true,
      token: "mock",
      usedMock: true,
      ocr: {
        applied: false,
        available: false,
        charsBefore: 0,
        charsAfter: 0,
        pageCount: 0,
        timeMs: 0,
      },
    };
  }

  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) {
    return {
      success: false,
      errorMessage:
        "APRYSE_LICENSE_KEY is not set. Add it to your .env file. " +
        "If you want to run without a license key, set USE_MOCK_DATA=true in server/apryseExtraction.ts.",
    };
  }

  // Cache fast path — if we've already processed this exact document, skip OCR + extraction
  const pdfHash = computePdfHash(pdfBuffer);
  const key = buildCacheKey(pdfHash);
  const cached = extractionCache.get(key);
  if (cached) {
    console.log(`[detectAndOcr] Cache hit ${key.slice(0, 16)}… — skipping OCR + extraction`);
    return { success: true, token: `cache:${key}`, ocr: cached.ocr, usedMock: false, fromCache: true };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apryse-ocr-"));
  const inputPath = path.join(dir, originalFileName || "input.pdf");
  const ocrPath = path.join(dir, "ocr-output.pdf");

  try {
    fs.writeFileSync(inputPath, pdfBuffer);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFNet } = require("@pdftron/pdfnet-node");

    let ocrInfo: OcrInfo | undefined;
    let processedPath = inputPath;
    let phaseError: string | undefined;

    await PDFNet.runWithCleanup(async () => {
      await PDFNet.addResourceSearchPath(OCR_MODULE_PATH);

      const ocrAvailable = await PDFNet.OCRModule.isModuleAvailable();
      const doc = await PDFNet.PDFDoc.createFromFilePath(inputPath);
      const before = await measureDocText(PDFNet, doc);
      // Heuristic: fewer than ~20 chars/page means effectively no text layer.
      const needsOcr = before.chars < before.pageCount * 20;

      let charsAfter = before.chars;
      let applied = false;
      let timeMs = 0;

      if (ocrAvailable && needsOcr) {
        console.log(
          `[detectAndOcr] Scanned doc (${before.chars} chars / ${before.pageCount} pages) — running OCR`
        );
        const t0 = Date.now();
        const opts = await PDFNet.OCRModule.createOCROptions();
        opts.addLang("eng");
        await PDFNet.OCRModule.processPDF(doc, opts);
        await doc.save(ocrPath, PDFNet.SDFDoc.SaveOptions.e_linearized);
        timeMs = Date.now() - t0;
        const after = await measureDocText(PDFNet, doc);
        charsAfter = after.chars;
        applied = true;
        processedPath = ocrPath;
        console.log(`[detectAndOcr] OCR recovered ${charsAfter} chars in ${timeMs}ms`);
      } else {
        console.log(
          `[detectAndOcr] Digital PDF (${before.chars} chars) — OCR not needed`
        );
      }

      ocrInfo = {
        applied,
        available: ocrAvailable,
        charsBefore: before.chars,
        charsAfter,
        pageCount: before.pageCount,
        timeMs,
      };
    }, licenseKey);

    if (phaseError || !ocrInfo) {
      fs.rmSync(dir, { recursive: true, force: true });
      return { success: false, errorMessage: phaseError ?? "OCR phase failed." };
    }

    const token = crypto.randomUUID();
    const timer = setTimeout(() => cleanupJob(token), OCR_JOB_TTL_MS);
    ocrJobs.set(token, {
      dir,
      pdfPath: processedPath,
      originalName: originalFileName,
      ocr: ocrInfo,
      timer,
      cacheKey: key,
    });

    return { success: true, token, ocr: ocrInfo, usedMock: false, fromCache: false };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[detectAndOcr] Error:", errorMessage);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    return { success: false, errorMessage };
  }
}

/**
 * Phase 2 — extract key-value data from the PDF prepared in phase 1.
 * Consumes the token, runs extractData, then removes the temp copy.
 */
export async function extractFromToken(token: string): Promise<ExtractionResult> {
  const startTime = Date.now();

  if (USE_MOCK_DATA || token === "mock") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { mockExtractionResult } = require("./mockExtractedData");
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      success: true,
      data: mockExtractionResult as Record<string, unknown>,
      usedMock: true,
      extractionTime: Date.now() - startTime,
    };
  }

  // Cache fast path — token issued by detectAndOcr when it found a cache hit
  if (token.startsWith("cache:")) {
    const entry = extractionCache.get(token.slice("cache:".length));
    if (entry) {
      console.log(`[extractFromToken] Returning cached extraction`);
      return {
        success: true,
        data: entry.data,
        usedMock: false,
        extractionTime: 0,
        ocr: entry.ocr,
        fromCache: true,
        ocrPdfBase64: entry.ocrPdfBase64,
      };
    }
    return {
      success: false,
      data: {},
      usedMock: false,
      extractionTime: 0,
      errorMessage: "Cache entry expired. Please re-upload the document.",
    };
  }

  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) {
    return {
      success: false,
      data: {},
      usedMock: false,
      extractionTime: Date.now() - startTime,
      errorMessage: "APRYSE_LICENSE_KEY is not set.",
    };
  }

  const job = ocrJobs.get(token);
  if (!job) {
    return {
      success: false,
      data: {},
      usedMock: false,
      extractionTime: Date.now() - startTime,
      errorMessage:
        "OCR session expired or was not found. Please re-upload the document.",
    };
  }

  const outputPath = path.join(job.dir, "output.json");

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFNet } = require("@pdftron/pdfnet-node");

    let extractedData: Record<string, unknown> | null = null;
    let sdkError: string | undefined;

    await PDFNet.runWithCleanup(async () => {
      try {
        const resourcePath = getDataExtractionResourcePath();
        await PDFNet.addResourceSearchPath(resourcePath);

        const isAvailable = await PDFNet.DataExtractionModule.isModuleAvailable(
          PDFNet.DataExtractionModule.DataExtractionEngine.e_GenericKeyValue
        );
        if (!isAvailable) {
          sdkError =
            "DataExtractionModule (e_generic_key_value) is not available.";
          return;
        }

        await PDFNet.DataExtractionModule.extractData(
          job.pdfPath,
          outputPath,
          PDFNet.DataExtractionModule.DataExtractionEngine.e_GenericKeyValue
        );

        if (fs.existsSync(outputPath)) {
          const raw = fs.readFileSync(outputPath, "utf-8");
          const rawParsed = JSON.parse(raw) as Record<string, unknown>;
          extractedData = normalizeRawExtractionData(rawParsed);
        } else {
          sdkError = "SDK completed without error but produced no output file.";
        }
      } catch (innerErr: unknown) {
        sdkError =
          innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.error("[extractFromToken] SDK inner error:", sdkError);
      }
    }, licenseKey);

    if (extractedData) {
      const ocrPdfBase64 = job.ocr.applied
        ? fs.readFileSync(job.pdfPath).toString("base64")
        : undefined;
      if (job.cacheKey) {
        pruneCache();
        extractionCache.set(job.cacheKey, { ocr: job.ocr, data: extractedData, ocrPdfBase64 });
        saveCacheToDisk();
        console.log(`[extractFromToken] Cached extraction under ${job.cacheKey.slice(0, 16)}…`);
      }
      return {
        success: true,
        data: extractedData,
        usedMock: false,
        extractionTime: Date.now() - startTime,
        ocr: job.ocr,
        fromCache: false,
        ocrPdfBase64,
      };
    }

    return {
      success: false,
      data: {},
      usedMock: false,
      extractionTime: Date.now() - startTime,
      errorMessage: sdkError ?? "SDK extraction failed with no error message.",
      ocr: job.ocr,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[extractFromToken] Error:", errorMessage);
    return {
      success: false,
      data: {},
      usedMock: false,
      extractionTime: Date.now() - startTime,
      errorMessage,
      ocr: job.ocr,
    };
  } finally {
    cleanupJob(token);
  }
}

