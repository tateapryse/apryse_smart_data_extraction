import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────────────────
// OCR A SCANNED PDF WITH THE APRYSE OCR MODULE (v12, deep-learning engine)
//
// A scanned PDF has no text layer — a plain text extractor returns ~nothing.
// This runs PDFNet.OCRModule.processPDF() to burn a searchable text layer into
// the document, then re-extracts to show the text that OCR recovered.
//
//   BEFORE: TextExtractor on the raw scan            → the "no-OCR" floor
//   AFTER:  OCRModule.processPDF → TextExtractor      → text OCR recovered
//
// Writes the searchable PDF next to the source as *.ocr.pdf.
//
// Usage:
//   node ... server/ocrScannedDoc.ts --pdf files/<scan>.pdf
// ─────────────────────────────────────────────────────────────────────────────

const OCR_MODULE_PATH = path.resolve(process.cwd(), "apryse-ocr-module", "Lib");

function resolvePdfPath(): string {
  const flagIdx = process.argv.indexOf("--pdf");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    return path.resolve(process.cwd(), process.argv[flagIdx + 1]);
  }
  throw new Error("Pass --pdf <path> to the scanned PDF");
}

async function extractPerPage(PDFNet: any, doc: any): Promise<string[]> {
  await doc.initSecurityHandler();
  const pageCount: number = await doc.getPageCount();
  const txt = await PDFNet.TextExtractor.create();
  const pages: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    txt.begin(page);
    pages.push(await txt.getAsText());
  }
  return pages;
}

async function main() {
  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) throw new Error("APRYSE_LICENSE_KEY not set");
  const pdfPath = resolvePdfPath();
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);
  const outPath = pdfPath.replace(/\.pdf$/i, ".ocr.pdf");

  const { PDFNet } = require("@pdftron/pdfnet-node");

  await PDFNet.runWithCleanup(async () => {
    await PDFNet.addResourceSearchPath(OCR_MODULE_PATH);
    const available = await PDFNet.OCRModule.isModuleAvailable();
    console.log("OCR module available:", available);
    if (!available) throw new Error("OCR module not available on resource path");

    // ── BEFORE: raw text on the untouched scan ────────────────────────────────
    const before = await PDFNet.PDFDoc.createFromFilePath(pdfPath);
    const beforePages = await extractPerPage(PDFNet, before);
    const beforeChars = beforePages.reduce((n, p) => n + p.trim().length, 0);

    // ── OCR: burn a searchable text layer into the document ───────────────────
    console.log("\nRunning OCRModule.processPDF (eng)…");
    const t0 = Date.now();
    const doc = await PDFNet.PDFDoc.createFromFilePath(pdfPath);
    await doc.initSecurityHandler();
    const opts = await PDFNet.OCRModule.createOCROptions();
    opts.addLang("eng");
    await PDFNet.OCRModule.processPDF(doc, opts);
    await doc.save(outPath, PDFNet.SDFDoc.SaveOptions.e_linearized);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    // ── AFTER: raw text on the OCR'd document ─────────────────────────────────
    const afterPages = await extractPerPage(PDFNet, doc);
    const afterChars = afterPages.reduce((n, p) => n + p.trim().length, 0);

    console.log("\n" + "═".repeat(70));
    console.log(`SCANNED DOCUMENT OCR RESULT · ${path.basename(pdfPath)}`);
    console.log("═".repeat(70));
    console.log(`Pages:            ${afterPages.length}`);
    console.log(`OCR time:         ${secs}s`);
    console.log(`Text BEFORE OCR:  ${beforeChars.toLocaleString()} chars  (the no-OCR floor)`);
    console.log(`Text AFTER OCR:   ${afterChars.toLocaleString()} chars`);
    console.log(`Searchable PDF:   ${outPath}`);
    afterPages.forEach((t, i) => {
      const clean = t.replace(/\s+/g, " ").trim();
      console.log("\n" + "─".repeat(70));
      console.log(`PAGE ${i + 1} — ${clean.length} chars recovered`);
      console.log("─".repeat(70));
      console.log(clean.slice(0, 1200) + (clean.length > 1200 ? " …" : ""));
    });
  }, licenseKey);

  await PDFNet.shutdown();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERR", e);
    process.exit(1);
  });
