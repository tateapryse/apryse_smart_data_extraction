import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { extractPDFData, detectAndOcr, extractFromToken } from "./apryseExtraction";
import { detectAndFillForm, flattenAndRemoveOcr } from "./apryseFormRecognition";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Step 2: Extract key-value pairs from uploaded PDF ───────────────────
  extraction: router({
    extractData: publicProcedure
      .input(
        z.object({
          // Base64-encoded PDF content
          pdfBase64: z.string(),
          fileName: z.string().default("InvestmentFactSheet.pdf"),
        })
      )
      .mutation(async ({ input }) => {
        const pdfBuffer = Buffer.from(input.pdfBase64, "base64");
        const result = await extractPDFData(pdfBuffer, input.fileName);
        return result;
      }),

    // Phase 1 of the two-phase flow: detect scanned pages and OCR if needed.
    detectAndOcr: publicProcedure
      .input(
        z.object({
          pdfBase64: z.string(),
          fileName: z.string().default("InvestmentFactSheet.pdf"),
        })
      )
      .mutation(async ({ input }) => {
        const pdfBuffer = Buffer.from(input.pdfBase64, "base64");
        return detectAndOcr(pdfBuffer, input.fileName);
      }),

    // Phase 2 of the two-phase flow: extract key-value data from the OCR'd copy.
    extractFromToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        return extractFromToken(input.token);
      }),
  }),

  // ─── Step 3: Analyze extracted JSON with LLM ─────────────────────────────
  analysis: router({
    analyzeWithAI: publicProcedure
      .input(
        z.object({
          extractedData: z.record(z.string(), z.unknown()),
        })
      )
      .mutation(async ({ input }) => {
        const systemPrompt = `You are an expert document analyst. You analyze any type of document's extracted key-value data and produce clear, actionable insights. Always respond with valid JSON matching the exact schema requested. Be specific and data-driven, referencing actual values from the extracted data.`;

        // Build a clean summary of the real extraction data for the LLM
        // The extractedData follows the Apryse generic key-value JSON schema
        const pages = (input.extractedData.pages as Array<{
          properties: { pageNumber: number };
          keyValueElements: Array<{
            confidence: number;
            key_text: string;
            value_text: string;
          }>;
        }>) || [];

        const flatPairs = pages.flatMap(p =>
          (p.keyValueElements || [])
            .filter(e => e.key_text && e.value_text)
            .map(e => `${e.key_text}: ${e.value_text} (conf: ${Math.round(e.confidence * 100)}%)`)
        );

        const extractionSummary = flatPairs.join("\n");

        const userPrompt = `Analyze the following key-value pairs extracted from a document and produce up to 5 key insights. Choose insight categories appropriate to what the document actually contains — do NOT force fund-specific categories if the document is not a fund fact sheet.

For each insight, list the exact key names from the extraction data that are most relevant to it — these will be used to visually annotate the document.

Extracted data:
${extractionSummary}

Return a JSON object with EXACTLY these fields:
{
  "documentTitle": "Concise name or title for this document (infer from the data)",
  "insights": [
    {
      "category": "Short category label (2-4 words)",
      "headline": "One-line insight verdict",
      "detail": "2-3 sentences explaining this insight, citing specific values from the data",
      "badge": "Short label shown as a badge (e.g. 'High Risk', 'Low Fees', 'Moderate') — use empty string if not applicable",
      "relatedKeys": ["exact key name from the extraction data"]
    }
  ],
  "summary": "50-70 word executive summary covering the document's main findings and key takeaway."
}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "document_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  documentTitle: { type: "string" },
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string" },
                        headline: { type: "string" },
                        detail: { type: "string" },
                        badge: { type: "string" },
                        relatedKeys: { type: "array", items: { type: "string" } },
                      },
                      required: ["category", "headline", "detail", "badge", "relatedKeys"],
                      additionalProperties: false,
                    },
                  },
                  summary: { type: "string" },
                },
                required: ["documentTitle", "insights", "summary"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("No response from AI analysis");
        }

        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        return parsed as {
          documentTitle: string;
          insights: Array<{
            category: string;
            headline: string;
            detail: string;
            badge: string;
            relatedKeys: string[];
          }>;
          summary: string;
        };
      }),
  }),

  // ─── Form Recognition & Auto-fill ────────────────────────────────────────
  // Uses e_Form DataExtractionEngine to detect form fields on the flat IBanking
  // PDF, creates interactive AcroForm widgets, and fills them with demo data.
  formRecognition: router({
    detectAndFill: publicProcedure
      .input(z.object({ pdfBase64: z.string().optional() }))
      .mutation(async ({ input }) => {
        return detectAndFillForm(input.pdfBase64);
      }),
    flattenAndStrip: publicProcedure
      .input(z.object({ filledPdfBase64: z.string() }))
      .mutation(async ({ input }) => {
        return flattenAndRemoveOcr(input.filledPdfBase64);
      }),
  }),
});

export type AppRouter = typeof appRouter;
