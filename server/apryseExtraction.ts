import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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

export interface ExtractionResult {
  success: boolean;
  data: Record<string, unknown>;
  usedMock: boolean;
  extractionTime: number;
  errorMessage?: string;
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
  const outputPath = path.join(tmpDir, "output.json");

  try {
    fs.writeFileSync(inputPath, pdfBuffer);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFNet } = require("@pdftron/pdfnet-node");

    let extractedData: Record<string, unknown> | null = null;
    let sdkError: string | undefined;

    await PDFNet.runWithCleanup(async () => {
      try {
        // Point the SDK at the platform-specific data-extraction native module.
        // On Windows this resolves to lib/Windows/, on Linux to lib/Linux/, etc.
        const resourcePath = getDataExtractionResourcePath();
        console.log(`[apryseExtraction] Resource path: ${resourcePath}`);
        await PDFNet.addResourceSearchPath(resourcePath);

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

        console.log(`[apryseExtraction] Running live extraction on: ${originalFileName}`);

        // ── Core extraction call ──────────────────────────────────────────────
        // Mirrors the documented Apryse API:
        //   DataExtractionModule.extractData(
        //     "InvestmentFactSheet.pdf",
        //     "output.json",
        //     DataExtractionModule.DataExtractionEngine.e_generic_key_value
        //   )
        await PDFNet.DataExtractionModule.extractData(
          inputPath,
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
      };
    }

    // SDK ran but failed — return the real error, do NOT silently fall back
    return {
      success: false,
      data: {},
      usedMock: false,
      extractionTime: Date.now() - startTime,
      errorMessage: sdkError ?? "SDK extraction failed with no error message.",
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
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      fs.rmdirSync(tmpDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}
