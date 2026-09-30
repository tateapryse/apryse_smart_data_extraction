import "dotenv/config";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createRequire } from "module";
import { extractPDFData } from "./apryseExtraction";

const require = createRequire(import.meta.url);

const PDF_PATH = path.join(process.cwd(), "files", "InvestmentFactSheet.pdf");
const MODEL = "gemini-2.5-flash";

// ── Exact Gemini token count via the native countTokens endpoint ──────────────
async function countTokens(text: string): Promise<number> {
  const raw = process.env.BUILT_IN_FORGE_API_URL ?? "";
  // Turn the OpenAI-compat base (…/v1beta/openai) into the native base (…/v1beta)
  const base = raw.replace(/\/openai\/?$/, "").replace(/\/$/, "");
  const url = `${base}/models/${MODEL}:countTokens`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.BUILT_IN_FORGE_API_KEY ?? "",
    },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
  });
  if (!res.ok) {
    throw new Error(`countTokens failed: ${res.status} ${res.statusText} – ${await res.text()}`);
  }
  const json = (await res.json()) as { totalTokens: number };
  return json.totalTokens;
}

// ── Full raw text of the PDF (the "dump the document to the LLM" baseline) ─────
async function extractFullText(pdfPath: string): Promise<string> {
  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) throw new Error("APRYSE_LICENSE_KEY is not set");
  const { PDFNet } = require("@pdftron/pdfnet-node");
  let fullText = "";
  await PDFNet.runWithCleanup(async () => {
    const doc = await PDFNet.PDFDoc.createFromFilePath(pdfPath);
    await doc.initSecurityHandler();
    const pageCount: number = await doc.getPageCount();
    const txt = await PDFNet.TextExtractor.create();
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      txt.begin(page);
      fullText += (await txt.getAsText()) + "\n";
    }
  }, licenseKey);
  return fullText;
}

// ── Build the structured summary exactly like server/routers.ts ───────────────
function buildStructuredSummary(data: Record<string, unknown>): string {
  const pages =
    (data.pages as Array<{
      keyValueElements: Array<{ confidence: number; key_text: string; value_text: string }>;
    }>) || [];
  const flatPairs = pages.flatMap((p) =>
    (p.keyValueElements || [])
      .filter((e) => e.key_text && e.value_text)
      .map((e) => `${e.key_text}: ${e.value_text} (conf: ${Math.round(e.confidence * 100)}%)`)
  );
  return flatPairs.join("\n");
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) throw new Error(`PDF not found: ${PDF_PATH}`);
  const buffer = fs.readFileSync(PDF_PATH);
  const sizeKb = (buffer.length / 1024).toFixed(1);

  console.log(`\n═══ Token measurement · ${MODEL} ═══`);
  console.log(`PDF: ${PDF_PATH} (${sizeKb} KB)\n`);

  // 1) RAW baseline: full extracted text
  console.log("Extracting full raw text (TextExtractor)…");
  const rawText = await extractFullText(PDF_PATH);
  const rawChars = rawText.length;

  // 2) STRUCTURED: run the same Apryse extraction the app uses
  console.log("Running Apryse key-value extraction (e_generic_key_value)…");
  const result = await extractPDFData(buffer, "InvestmentFactSheet.pdf");
  if (!result.success) throw new Error(`Extraction failed: ${result.errorMessage}`);
  const structuredSummary = buildStructuredSummary(result.data);
  const pairCount = structuredSummary.split("\n").filter(Boolean).length;

  // 3) Count tokens with Gemini's own tokenizer
  console.log("Counting tokens via Gemini countTokens…\n");
  const rawTokens = await countTokens(rawText);
  const structuredTokens = await countTokens(structuredSummary);

  const reduction = rawTokens > 0 ? ((rawTokens - structuredTokens) / rawTokens) * 100 : 0;

  // Cost per run at Gemini 2.5 Flash input rate ($0.30 / 1M tokens), 5,000 docs
  const RATE = 0.3;
  const DOCS = 5000;
  const rawCost = (DOCS * rawTokens * RATE) / 1_000_000;
  const structuredCost = (DOCS * structuredTokens * RATE) / 1_000_000;

  console.log("─".repeat(60));
  console.log("RAW  (full document text → LLM)");
  console.log(`   chars:  ${rawChars.toLocaleString()}`);
  console.log(`   tokens: ${rawTokens.toLocaleString()}`);
  console.log("STRUCTURED (Apryse key-value JSON → LLM)");
  console.log(`   pairs:  ${pairCount}`);
  console.log(`   chars:  ${structuredSummary.length.toLocaleString()}`);
  console.log(`   tokens: ${structuredTokens.toLocaleString()}`);
  console.log("─".repeat(60));
  console.log(`TOKEN REDUCTION: ${reduction.toFixed(1)}%  (${rawTokens.toLocaleString()} → ${structuredTokens.toLocaleString()})`);
  console.log(
    `COST @ $${RATE}/1M, ${DOCS.toLocaleString()} docs:  ` +
      `$${rawCost.toFixed(2)} → $${structuredCost.toFixed(2)}  (save $${(rawCost - structuredCost).toFixed(2)})`
  );
  console.log("─".repeat(60) + "\n");
}

main().catch((err) => {
  console.error("\n[measureTokens] ERROR:", err.message);
  process.exit(1);
});
