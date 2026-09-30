import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import { extractPDFData } from "./apryseExtraction";
import { invokeLLM } from "./_core/llm";

const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────────────────
// RAG ANSWER-ACCURACY A/B EXPERIMENT
//
// Same model, same questions, same answering prompt. The ONLY thing that
// changes between the two arms is the CONTEXT handed to the LLM:
//
//   Arm A (baseline):  full raw text from PDFNet.TextExtractor
//                      — a table/multi-column layout linearised into a flat
//                        stream of words (what a naive "dump the PDF text"
//                        pipeline feeds its model).
//
//   Arm B (Apryse):    structured key→value pairs from the Apryse
//                      DataExtractionModule (e_GenericKeyValue) — the same
//                      extraction the app already uses — where every value is
//                      anchored to its label.
//
// We ask a hand-labelled golden set of fact-lookup questions, have the model
// answer strictly from each context, then grade both answers with an LLM judge
// against the gold answer. The output is per-arm accuracy — evidence, not a
// marketing claim.
//
// Usage:
//   pnpm tsx server/measureRagQuality.ts --dump   → print both contexts, exit
//   pnpm tsx server/measureRagQuality.ts          → run the full experiment
// ─────────────────────────────────────────────────────────────────────────────

// Target PDF: --pdf <name> overrides; otherwise the first .pdf found in files/.
function resolvePdfPath(): string {
  const flagIdx = process.argv.indexOf("--pdf");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    return path.resolve(process.cwd(), process.argv[flagIdx + 1]);
  }
  const filesDir = path.join(process.cwd(), "files");
  const pdf = fs
    .readdirSync(filesDir)
    .find((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdf) throw new Error(`No PDF found in ${filesDir}`);
  return path.join(filesDir, pdf);
}

const PDF_PATH = resolvePdfPath();
const GOLDEN_PATH = path.join(process.cwd(), "server", "ragGoldenSet.json");

interface GoldenQuestion {
  id: string;
  tier: "prose" | "label-value" | "table";
  question: string;
  expected: string;
}

// ── Arm A context: raw text, one string per physical PDF page ─────────────────
async function extractTextByPage(pdfPath: string): Promise<string[]> {
  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) throw new Error("APRYSE_LICENSE_KEY is not set");
  const { PDFNet } = require("@pdftron/pdfnet-node");
  const pages: string[] = [];
  await PDFNet.runWithCleanup(async () => {
    const doc = await PDFNet.PDFDoc.createFromFilePath(pdfPath);
    await doc.initSecurityHandler();
    const pageCount: number = await doc.getPageCount();
    const txt = await PDFNet.TextExtractor.create();
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      txt.begin(page);
      pages.push(await txt.getAsText());
    }
  }, licenseKey);
  return pages;
}

interface StructuredPage {
  keyValueElements: Array<{
    confidence: number;
    key_text: string;
    value_text: string;
  }>;
}

function getStructuredPages(data: Record<string, unknown>): StructuredPage[] {
  return (data.pages as StructuredPage[]) || [];
}

// ── Arm B context: Apryse structured key→value pairs (same as the app) ────────
function buildStructuredContext(pages: StructuredPage[]): string {
  const flatPairs = pages.flatMap((p) =>
    (p.keyValueElements || [])
      .filter((e) => e.key_text && e.value_text)
      .map((e) => `${e.key_text}: ${e.value_text}`)
  );
  return flatPairs.join("\n");
}

// ── One batched call: answer every question strictly from one context ─────────
// Batched to stay well under the free-tier rate limit (5 requests/minute).
async function answerAll(
  context: string,
  questions: GoldenQuestion[]
): Promise<Record<string, string>> {
  const list = questions.map((q) => ({ id: q.id, question: q.question }));
  const res = await withRetry(() =>
    invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a precise document question-answering assistant. Answer " +
            "each question ONLY using the provided context. If an answer is not " +
            "present in the context, use the exact string NOT FOUND. Keep each " +
            "answer as short as possible — a single number, value, or short " +
            "phrase. Respond with a JSON object mapping each question id to its " +
            "answer string, e.g. {\"q01\":\"...\",\"q02\":\"NOT FOUND\"}.",
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestions:\n${JSON.stringify(list, null, 2)}`,
        },
      ],
      response_format: { type: "json_object" },
    })
  );
  const content = res.choices?.[0]?.message?.content;
  try {
    return JSON.parse(typeof content === "string" ? content : "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

// ── One batched call: grade every candidate answer against its gold answer ────
async function judgeAll(
  items: Array<{ id: string; question: string; expected: string; candidate: string }>
): Promise<Record<string, boolean>> {
  const res = await withRetry(() =>
    invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a strict grader. For each item decide whether the candidate " +
            "answer states the same factual value as the gold answer for the " +
            "question. Ignore formatting, units phrasing, and extra words. A " +
            "candidate of NOT FOUND or a wrong value is incorrect. Respond with a " +
            'JSON object mapping each id to true or false, e.g. {"q01":true}.',
        },
        {
          role: "user",
          content: JSON.stringify(items, null, 2),
        },
      ],
      response_format: { type: "json_object" },
    })
  );
  const content = res.choices?.[0]?.message?.content;
  try {
    return JSON.parse(typeof content === "string" ? content : "{}") as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
}

// ── Retry wrapper: back off and retry on transient 429 rate-limit errors ──────
async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("429")) throw err;
      const waitMs = 15000 * (i + 1);
      console.log(`   …rate-limited, waiting ${waitMs / 1000}s before retry`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) throw new Error(`PDF not found: ${PDF_PATH}`);
  const buffer = fs.readFileSync(PDF_PATH);

  console.log("\n═══ RAG answer-accuracy A/B · gemini-2.5-flash ═══");
  console.log(`PDF: ${PDF_PATH}`);

  console.log("Extracting Arm A context (raw TextExtractor)…");
  const rawPages = await extractTextByPage(PDF_PATH);

  console.log("Extracting Arm B context (Apryse key-value)…");
  const result = await extractPDFData(buffer, path.basename(PDF_PATH));
  if (!result.success) throw new Error(`Extraction failed: ${result.errorMessage}`);
  const structPages = getStructuredPages(result.data);

  // Optional single-page scope: --page N restricts BOTH arms to physical page N
  // (used to isolate one fund from a multi-fund book so the table-linearisation
  // effect is measured without cross-fund attribution noise).
  const pageFlagIdx = process.argv.indexOf("--page");
  const scopePage =
    pageFlagIdx !== -1 && process.argv[pageFlagIdx + 1]
      ? parseInt(process.argv[pageFlagIdx + 1], 10)
      : null;

  const rawText =
    scopePage !== null
      ? rawPages[scopePage - 1] ?? ""
      : rawPages.join("\n");
  const structuredContext =
    scopePage !== null
      ? buildStructuredContext([structPages[scopePage - 1]].filter(Boolean))
      : buildStructuredContext(structPages);

  // ── Inspection mode: print both contexts so questions can be grounded ───────
  if (process.argv.includes("--dump")) {
    console.log("\n" + "═".repeat(70));
    console.log(
      `PAGE MAP — ${rawPages.length} physical pages / ${structPages.length} structured pages`
    );
    console.log("═".repeat(70));
    rawPages.forEach((t, i) => {
      const firstLine =
        t.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "(empty)";
      const pairs = (structPages[i]?.keyValueElements || []).filter(
        (e) => e.key_text && e.value_text
      ).length;
      console.log(`  page ${i + 1}: ${pairs} pairs  ·  “${firstLine.slice(0, 60)}”`);
    });
    console.log("\n" + "═".repeat(70));
    console.log(
      `ARM A — RAW TEXT (PDFNet.TextExtractor)${scopePage ? ` · page ${scopePage}` : ""}`
    );
    console.log("═".repeat(70));
    console.log(rawText);
    console.log("\n" + "═".repeat(70));
    console.log(
      `ARM B — APRYSE STRUCTURED KEY→VALUE PAIRS${scopePage ? ` · page ${scopePage}` : ""}`
    );
    console.log("═".repeat(70));
    console.log(structuredContext);
    console.log("\n" + "═".repeat(70));
    console.log(
      `Raw chars: ${rawText.length.toLocaleString()}  |  ` +
        `Structured pairs: ${structuredContext.split("\n").filter(Boolean).length}`
    );
    return;
  }

  if (!fs.existsSync(GOLDEN_PATH)) {
    throw new Error(
      `Golden set not found: ${GOLDEN_PATH}. Run with --dump first, then author it.`
    );
  }
  const golden = JSON.parse(
    fs.readFileSync(GOLDEN_PATH, "utf-8")
  ) as GoldenQuestion[];

  const rows: Array<{
    id: string;
    tier: string;
    aOk: boolean;
    bOk: boolean;
    aAns: string;
    bAns: string;
    expected: string;
    question: string;
  }> = [];

  // Four batched calls total (answer×2 arms, judge×2 arms) to respect the
  // free-tier rate limit. Sequential, with 429 back-off inside withRetry.
  console.log("\nAnswering (Arm A · raw text)…");
  const aAnswers = await answerAll(rawText, golden);
  console.log("Answering (Arm B · Apryse structured)…");
  const bAnswers = await answerAll(structuredContext, golden);

  console.log("Grading Arm A…");
  const aGrades = await judgeAll(
    golden.map((q) => ({
      id: q.id,
      question: q.question,
      expected: q.expected,
      candidate: aAnswers[q.id] ?? "NOT FOUND",
    }))
  );
  console.log("Grading Arm B…\n");
  const bGrades = await judgeAll(
    golden.map((q) => ({
      id: q.id,
      question: q.question,
      expected: q.expected,
      candidate: bAnswers[q.id] ?? "NOT FOUND",
    }))
  );

  for (const q of golden) {
    const aAns = aAnswers[q.id] ?? "NOT FOUND";
    const bAns = bAnswers[q.id] ?? "NOT FOUND";
    const aOk = aGrades[q.id] === true;
    const bOk = bGrades[q.id] === true;
    rows.push({
      id: q.id,
      tier: q.tier,
      aOk,
      bOk,
      aAns,
      bAns,
      expected: q.expected,
      question: q.question,
    });
    console.log(
      `${aOk ? "✓" : "✗"}A ${bOk ? "✓" : "✗"}B  [${q.tier}] ${q.question}`
    );
    if (!aOk || !bOk) {
      console.log(`        expected: ${q.expected}`);
      console.log(`        raw     : ${aAns}`);
      console.log(`        apryse  : ${bAns}`);
    }
  }

  // ── Per-tier and overall accuracy ───────────────────────────────────────────
  const tiers = ["prose", "label-value", "table"] as const;
  console.log("\n" + "─".repeat(70));
  console.log("ACCURACY BY TIER            raw text   apryse structured");
  console.log("─".repeat(70));
  for (const tier of tiers) {
    const t = rows.filter((r) => r.tier === tier);
    if (t.length === 0) continue;
    const a = t.filter((r) => r.aOk).length;
    const b = t.filter((r) => r.bOk).length;
    console.log(
      `${tier.padEnd(24)}  ${`${a}/${t.length}`.padStart(8)}   ${`${b}/${t.length}`.padStart(8)}` +
        `   (${Math.round((100 * a) / t.length)}%  vs  ${Math.round((100 * b) / t.length)}%)`
    );
  }
  const aTot = rows.filter((r) => r.aOk).length;
  const bTot = rows.filter((r) => r.bOk).length;
  console.log("─".repeat(70));
  console.log(
    `${"OVERALL".padEnd(24)}  ${`${aTot}/${rows.length}`.padStart(8)}   ${`${bTot}/${rows.length}`.padStart(8)}` +
      `   (${Math.round((100 * aTot) / rows.length)}%  vs  ${Math.round((100 * bTot) / rows.length)}%)`
  );
  console.log("─".repeat(70) + "\n");
}

main().catch((err) => {
  console.error("\n[measureRagQuality] ERROR:", err.message);
  process.exit(1);
});
