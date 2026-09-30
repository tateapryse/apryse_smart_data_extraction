import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────────────────
// RAW Apryse extraction dumper.
//
// extractPDFData() normalizes + flattens the SDK output (join words with " ",
// drop rects). This script writes the UNTOUCHED output.json the SDK produces,
// so we can inspect whether prose narrative is captured, how value words are
// split, and whether table columns keep any geometry.
//
//   node <node22> tsx server/dumpRawExtraction.ts [--page N]
// ─────────────────────────────────────────────────────────────────────────────

function resolvePdfPath(): string {
  const flagIdx = process.argv.indexOf("--pdf");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    return path.resolve(process.cwd(), process.argv[flagIdx + 1]);
  }
  const filesDir = path.join(process.cwd(), "files");
  const pdf = fs.readdirSync(filesDir).find((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdf) throw new Error(`No PDF found in ${filesDir}`);
  return path.join(filesDir, pdf);
}

function getDataExtractionResourcePath(): string {
  const baseLib = path.join(process.cwd(), "node_modules/@pdftron/data-extraction/lib");
  const platform = process.platform;
  const platformDir = platform === "win32" ? "Windows" : platform === "darwin" ? "Mac" : "Linux";
  const withSubdir = path.join(baseLib, platformDir);
  if (fs.existsSync(withSubdir)) return withSubdir;
  return baseLib;
}

async function main() {
  const pdfPath = resolvePdfPath();
  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) throw new Error("APRYSE_LICENSE_KEY not set");

  const pageFlagIdx = process.argv.indexOf("--page");
  const scopePage =
    pageFlagIdx !== -1 && process.argv[pageFlagIdx + 1]
      ? parseInt(process.argv[pageFlagIdx + 1], 10)
      : null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apryse-raw-"));
  const outputPath = path.join(tmpDir, "output.json");
  const savePath = path.join(process.cwd(), "server", "rawExtraction.json");

  const { PDFNet } = require("@pdftron/pdfnet-node");
  await PDFNet.runWithCleanup(async () => {
    await PDFNet.addResourceSearchPath(getDataExtractionResourcePath());
    await PDFNet.DataExtractionModule.extractData(
      pdfPath,
      outputPath,
      PDFNet.DataExtractionModule.DataExtractionEngine.e_GenericKeyValue
    );
  }, licenseKey);

  const raw = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as Record<string, unknown>;
  fs.writeFileSync(savePath, JSON.stringify(raw, null, 2));
  console.log(`\nRaw JSON saved to ${savePath}`);

  // Top-level shape
  console.log("\nTOP-LEVEL KEYS:", Object.keys(raw));
  const pages = (raw.pages as any[]) || [];
  console.log(`PAGES: ${pages.length}`);

  const targetPages = scopePage !== null ? [pages[scopePage - 1]] : pages;

  for (let pi = 0; pi < targetPages.length; pi++) {
    const page = targetPages[pi];
    if (!page) continue;
    const pageNum = scopePage !== null ? scopePage : pi + 1;
    console.log("\n" + "═".repeat(72));
    console.log(`PAGE ${pageNum}  —  keys: ${Object.keys(page).join(", ")}`);
    console.log("═".repeat(72));

    const kv = (page.keyValueElements as any[]) || [];
    console.log(`keyValueElements: ${kv.length}`);

    // Inspect first element shape in full
    if (kv.length > 0) {
      console.log("\n── FIRST ELEMENT (full shape) ──");
      console.log(JSON.stringify(kv[0], null, 2));
    }

    // Look for long values (prose candidates): value word-count >= 8
    console.log("\n── LONG VALUES (>=8 words) — prose candidates ──");
    let proseCount = 0;
    for (const el of kv) {
      const valWords = (el.words as any[]) || [];
      const keyWords = (el.key?.words as any[]) || [];
      const valText = valWords.map((w) => w.content).join(" ");
      const keyText = keyWords.map((w) => w.content).join(" ");
      if (valWords.length >= 8) {
        proseCount++;
        console.log(`\n  KEY(${keyWords.length}w): "${keyText}"`);
        console.log(`  VAL(${valWords.length}w): "${valText.slice(0, 400)}"`);
      }
    }
    if (proseCount === 0) console.log("  (none — no value has >=8 words)");

    // Distribution of value word counts
    const buckets = { "0": 0, "1": 0, "2-3": 0, "4-7": 0, "8+": 0 };
    for (const el of kv) {
      const n = ((el.words as any[]) || []).length;
      if (n === 0) buckets["0"]++;
      else if (n === 1) buckets["1"]++;
      else if (n <= 3) buckets["2-3"]++;
      else if (n <= 7) buckets["4-7"]++;
      else buckets["8+"]++;
    }
    console.log("\n── VALUE WORD-COUNT DISTRIBUTION ──");
    console.log("  " + JSON.stringify(buckets));

    // Are there any OTHER arrays on the page besides keyValueElements?
    // (StructuredOutput sometimes emits paragraphs/tables/lines.)
    for (const k of Object.keys(page)) {
      if (k === "keyValueElements") continue;
      const v = (page as any)[k];
      if (Array.isArray(v)) {
        console.log(`\n── page.${k} is an array of ${v.length} — sample:`);
        console.log(JSON.stringify(v[0], null, 2)?.slice(0, 600));
      }
    }
  }
}

main().catch((err) => {
  console.error("\n[dumpRawExtraction] ERROR:", err.message);
  process.exit(1);
});
