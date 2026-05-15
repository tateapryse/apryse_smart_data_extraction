import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { WhyApryseSection } from "@/components/WhyApryseSection";
import { ExtractionWebViewer, AIAnnotationWebViewer } from "@/components/PDFWebViewer";
import { BeforeAfterTokenVisual } from "@/components/BeforeAfterTokenVisual";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  PieChart,
  FileSearch,
  Loader2,
  Info,
  Shield,
  BarChart3,
  Eye,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface KeyValuePair {
  key: string;
  value: string;
  confidence: number;
  pageNumber: number;
  key_rect?: [number, number, number, number];
  value_rect?: [number, number, number, number];
  /** Legacy single bbox — kept for backward compat */
  bbox?: [number, number, number, number];
  key_bbox?: [number, number, number, number];
  value_bbox?: [number, number, number, number];
}

interface ExtractionResult {
  success: boolean;
  data: Record<string, unknown>;
  usedMock: boolean;
  extractionTime: number;
  errorMessage?: string;
}

interface AIAnalysis {
  fundName: string;
  suitability: { rating: string; score: number; headline: string; detail: string };
  volatility: { level: string; headline: string; detail: string };
  longTermPerformance: { headline: string; detail: string };
  feeCaution: { level: string; headline: string; detail: string };
  diversification: { headline: string; detail: string };
  summary: string;
}

// ─── Step Indicator ──────────────────────────────────────────────────────────
function StepBadge({
  number,
  active,
  done,
}: {
  number: number;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all duration-300 ${
        done
          ? "bg-primary text-primary-foreground"
          : active
          ? "bg-primary/20 text-primary border-2 border-primary"
          : "bg-muted text-muted-foreground border-2 border-border"
      }`}
    >
      {done ? <CheckCircle2 className="w-4 h-4" /> : number}
    </div>
  );
}

// ─── JSON Viewer ─────────────────────────────────────────────────────────────
function JSONViewer({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  // Support the real Apryse JSON schema: pages[].keyValueElements[].{key_text, value_text, confidence}
  const pages = (data.pages as Array<{
    properties: { pageNumber: number };
    keyValueElements: Array<{ key_text: string; value_text: string; confidence: number }>;
  }>) || [];

  const allPairs = pages.flatMap(p =>
    (p.keyValueElements || []).map(e => ({
      key: e.key_text,
      value: e.value_text,
      confidence: e.confidence,
      pageNumber: p.properties?.pageNumber ?? 1,
    }))
  );

  // Show only pairs that have both key and value for the preview cards
  const meaningfulPairs = allPairs.filter(p => p.key && p.value);
  const previewPairs = meaningfulPairs.slice(0, 12);

  const meta = data._meta as Record<string, unknown> | undefined;

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* Compact summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {previewPairs.map((pair, i) => (
          <div
            key={i}
            className="bg-muted/50 rounded-lg p-3 border border-border/50"
          >
            <p className="text-xs text-muted-foreground truncate mb-0.5">{pair.key}</p>
            <p className="text-sm font-semibold text-foreground truncate">{pair.value}</p>
            <div className="flex items-center gap-1 mt-1">
              <div className="h-1 rounded-full bg-primary/30 flex-1">
                <div
                  className="h-1 rounded-full bg-primary transition-all"
                  style={{ width: `${(pair.confidence || 0.9) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {Math.round((pair.confidence || 0.9) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <FileSearch className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground/60">({allPairs.length} total elements across {pages.length} pages)</span>
        </span>
        {!!meta?.engine && (
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-primary" />
            Engine: <code className="text-primary text-xs">{String(meta.engine)}</code>
          </span>
        )}
      </div>

      {/* Expand / Collapse toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Collapse full JSON
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Expand full JSON output
          </>
        )}
      </button>

      {expanded && (
        <div className="animate-fade-in-up">
          <pre className="json-viewer bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-green-400 overflow-auto max-h-80 leading-relaxed font-mono">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── AI Insight Card ─────────────────────────────────────────────────────────
function InsightCard({
  icon: Icon,
  title,
  headline,
  detail,
  badge,
  badgeVariant,
  className,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  headline: string;
  detail: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`bg-card rounded-xl p-5 border border-border/50 ${className || ""} animate-fade-in-up`}
      style={{ animationDelay: `${delay || 0}ms` }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        </div>
        {badge && (
          <Badge variant={badgeVariant || "secondary"} className="text-xs shrink-0">
            {badge}
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium text-foreground/90 mb-2">{headline}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">{detail}</p>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function InsightSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-card rounded-xl p-5 border border-border/50">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg animate-shimmer" />
            <div className="h-4 w-24 rounded animate-shimmer" />
          </div>
          <div className="h-4 w-full rounded animate-shimmer mb-2" />
          <div className="h-3 w-5/6 rounded animate-shimmer mb-1" />
          <div className="h-3 w-4/6 rounded animate-shimmer" />
        </div>
      ))}
      <div className="bg-card rounded-xl p-5 border border-border/50 md:col-span-2">
        <div className="h-4 w-32 rounded animate-shimmer mb-3" />
        <div className="h-3 w-full rounded animate-shimmer mb-1" />
        <div className="h-3 w-5/6 rounded animate-shimmer mb-1" />
        <div className="h-3 w-4/6 rounded animate-shimmer" />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [showAnnotatedPDF, setShowAnnotatedPDF] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractMutation = trpc.extraction.extractData.useMutation({
    onSuccess: (data) => {
      const result = data as ExtractionResult;
      if (!result.success) {
        // Real SDK error — surface the actual message so the user can act on it
        toast.error(`Extraction failed: ${result.errorMessage ?? "Unknown error"}`, {
          duration: 8000,
        });
        return;
      }
      setExtractionResult(result);
      setShowPDFViewer(false);
      if (result.usedMock) {
        toast.info("Demo mode (USE_MOCK_DATA=true): showing pre-extracted sample output.", {
          duration: 5000,
        });
      } else {
        toast.success("Data extracted successfully using Apryse Server SDK");
      }
    },
    onError: (err) => {
      toast.error(`Extraction failed: ${err.message}`);
    },
  });

  const analyzeMutation = trpc.analysis.analyzeWithAI.useMutation({
    onSuccess: (data) => {
      setAiAnalysis(data as AIAnalysis);
      setShowAnnotatedPDF(false);
      toast.success("AI analysis complete");
    },
    onError: (err) => {
      toast.error(`Analysis failed: ${err.message}`);
    },
  });

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.includes("pdf")) {
        toast.error("Please upload a PDF file");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error("File size must be under 20MB");
        return;
      }
      setUploadedFile(file);

      // Create a stable object URL pointing at the user's file for the PDF viewer.
      // Revoke the previous one first to avoid memory leaks.
      setUploadedFileUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });

      setExtractionResult(null);
      setAiAnalysis(null);
      setShowPDFViewer(false);
      setShowAnnotatedPDF(false);

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        extractMutation.mutate({ pdfBase64: base64, fileName: file.name });
      };
      reader.readAsDataURL(file);
    },
    [extractMutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleAnalyze = () => {
    if (!extractionResult?.data) return;
    analyzeMutation.mutate({ extractedData: extractionResult.data });
  };

  // ── Step states ────────────────────────────────────────────────────────────
  const step1Done = !!uploadedFile && !extractMutation.isPending;
  const step2Done = !!extractionResult;
  const step3Done = !!aiAnalysis;

  const isExtracting = extractMutation.isPending;
  const isAnalyzing = analyzeMutation.isPending;

  // ── Get pairs for WebViewer ────────────────────────────────────────────────
  // Support TWO schemas coming from the server:
  //
  //  A) Normalized flat schema (mock data + normalized real output):
  //     el.key_text, el.value_text, el.key_rect, el.value_rect
  //
  //  B) Raw Apryse SDK schema (in case real data arrives un-normalized):
  //     el.key.words[].content → key text,  el.key.rect → key bbox
  //     el.words[].content     → value text, el.rect     → value bbox
  const extractedPairs: KeyValuePair[] = extractionResult
    ? (
        (extractionResult.data.pages as Array<{
          properties: { pageNumber: number };
          keyValueElements: Array<Record<string, unknown>>;
        }>) || []
      ).flatMap((p) =>
        (p.keyValueElements || []).map((e) => {
          // ── Schema A: flat/normalised ──
          const keyText   = (e.key_text   as string)  ?? "";
          const valueText = (e.value_text as string)  ?? "";
          const keyRect   = (e.key_rect   as [number,number,number,number] | null) ?? null;
          const valueRect = (e.value_rect as [number,number,number,number] | null) ?? null;

          // ── Schema B: raw Apryse SDK ──
          const rawKey   = e.key   as { rect?: number[]; words?: Array<{ content: string }> } | undefined;
          const rawWords = e.words as Array<{ content: string }> | undefined;
          const rawRect  = e.rect  as number[] | undefined;

          const resolvedKeyText   = keyText   || (rawKey?.words  || []).map((w) => w.content).join(" ");
          const resolvedValueText = valueText || (rawWords        || []).map((w) => w.content).join(" ");
          const resolvedKeyRect   = (keyRect  ?? (rawKey?.rect   ? rawKey.rect   as [number,number,number,number] : null));
          const resolvedValueRect = (valueRect ?? (rawRect        ? rawRect       as [number,number,number,number] : null));

          return {
            key:        resolvedKeyText,
            value:      resolvedValueText,
            confidence: (e.confidence as number) ?? 0.999,
            pageNumber: p.properties?.pageNumber ?? 1,
            key_rect:   resolvedKeyRect ?? undefined,
            value_rect: resolvedValueRect ?? undefined,
          };
        })
      )
    : [];

  // ── Color helpers ──────────────────────────────────────────────────────────
  const getSuitabilityColor = (rating: string) => {
    if (rating === "Conservative") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (rating === "Moderate") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  const getFeeColor = (level: string) => {
    if (level === "Low") return "secondary";
    if (level === "Moderate") return "outline";
    return "destructive";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-border sticky top-0 z-10" style={{ background: "oklch(0.55 0.24 27)" }}>
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
              <FileSearch className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-none">
                Apryse Investment Intelligence
              </h1>
              <p className="text-xs text-white/60 mt-0.5">
                Powered by Apryse Server SDK · Singapore Private Banking
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-white/70">Live Demo</span>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="container pt-10 pb-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-primary tracking-widest uppercase mb-3">
            90-Second Executive Demo
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-3">
            From PDF to{" "}
            <span className="text-red-gradient">AI Advisory</span>
            <br />in four steps
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Upload any investment fact sheet. Apryse's Server SDK automatically extracts
            every key-value pair with exact coordinates — no templates, no manual mapping.
            Then let AI turn raw data into actionable client insights, annotated directly onto the PDF.
          </p>
        </div>
      </section>

      {/* ── Steps ──────────────────────────────────────────────────────────── */}
      <main className="container pb-16 space-y-6">

        {/* ── STEP 1: Upload PDF ─────────────────────────────────────────── */}
        <section
          className={`bg-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            !uploadedFile || isExtracting ? "border-primary/40 step-active" : "border-border/50"
          }`}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <StepBadge number={1} active={!uploadedFile} done={step1Done} />
              <div>
                <h3 className="text-base font-semibold text-foreground">Upload Investment Fact Sheet</h3>
                <p className="text-sm text-muted-foreground">
                  Drop any PDF — Apryse SDK handles the rest
                </p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? "border-primary bg-primary/10 scale-[1.01]"
                  : isExtracting
                  ? "border-primary/40 bg-primary/5"
                  : uploadedFile
                  ? "border-green-500/40 bg-green-500/5"
                  : "border-border/60 hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              {isExtracting ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">Extracting data…</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      DataExtractionModule.extractData("{uploadedFile?.name}", "output.json", e_generic_key_value)
                    </p>
                  </div>
                </div>
              ) : uploadedFile ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{uploadedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(uploadedFile.size / 1024).toFixed(1)} KB · Click to replace
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">
                      Drop your investment fact sheet here
                    </p>
                    <p className="text-xs text-muted-foreground">PDF files up to 20MB · or click to browse</p>
                  </div>
                </div>
              )}
            </div>

            {/* SDK code snippet */}
            <div className="mt-4 rounded-lg bg-slate-900 border border-slate-700 p-3">
              <p className="text-xs text-slate-400 mb-1.5 font-medium">Apryse Server SDK call:</p>
              <code className="text-xs text-green-400 font-mono leading-relaxed">
                DataExtractionModule.extractData(<span className="text-yellow-300">"InvestmentFactSheet.pdf"</span>,{" "}
                <span className="text-yellow-300">"output.json"</span>,{" "}
                DataExtractionModule.DataExtractionEngine.<span className="text-red-400">e_generic_key_value</span>);
              </code>
            </div>
          </div>
        </section>

        {/* ── STEP 2: Extracted JSON + PDF Viewer ────────────────────────── */}
        <section
          className={`bg-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            extractionResult && !aiAnalysis ? "border-primary/40 step-active" : "border-border/50"
          } ${!extractionResult && !isExtracting ? "opacity-60" : ""}`}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <StepBadge number={2} active={isExtracting} done={step2Done} />
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">Extracted Key-Value Data</h3>
                <p className="text-sm text-muted-foreground">
                  Direct JSON output from Apryse SDK — with exact bounding box coordinates
                </p>
              </div>
              {extractionResult && (
                <div className="flex items-center gap-2 shrink-0">
                  {extractionResult.usedMock && (
                    <Badge variant="outline" className="text-xs border-yellow-500/40 text-yellow-400">
                      Demo data
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {extractionResult.extractionTime}ms
                  </Badge>
                </div>
              )}
            </div>

            {isExtracting ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-muted/50 rounded-lg p-3 h-20 animate-shimmer" />
                ))}
              </div>
            ) : extractionResult ? (
              <div className="space-y-5">
                {/* JSON summary cards */}
                <JSONViewer data={extractionResult.data} />

                {/* Before / After token comparison visual */}
                <BeforeAfterTokenVisual />

                {/* WebViewer toggle button */}
                <div className="border-t border-border/40 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        View Extraction Highlights on PDF
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Hover any annotation to see the extracted key or value — blue = keys, red = values
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPDFViewer(v => !v)}
                      className="shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      {showPDFViewer ? "Hide PDF" : "View in PDF"}
                    </Button>
                  </div>

                  {/* Color legend — Keys=red, Values=blue */}
                  {showPDFViewer && (
                    <div className="mb-3 flex flex-wrap gap-3">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <span className="w-3 h-3 rounded-sm bg-blue-500 opacity-80" />
                        Keys (extracted field names)
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <span className="w-3 h-3 rounded-sm bg-red-500 opacity-80" />
                        Values (extracted data)
                      </span>
                    </div>
                  )}

                  {showPDFViewer && (
                    <div className="animate-fade-in-up">
                      <ExtractionWebViewer
                        pairs={extractedPairs}
                        pdfUrl={uploadedFileUrl ?? undefined}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <FileSearch className="w-5 h-5 mr-2 opacity-50" />
                Awaiting PDF upload…
              </div>
            )}
          </div>
        </section>

        {/* ── STEP 3: Analyze with AI ────────────────────────────────────── */}
        <section
          className={`bg-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            extractionResult && !aiAnalysis && !isAnalyzing ? "border-primary/40 step-active" : "border-border/50"
          } ${!extractionResult ? "opacity-60" : ""}`}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <StepBadge number={3} active={!!extractionResult && !aiAnalysis} done={step3Done} />
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">Analyze with AI</h3>
                <p className="text-sm text-muted-foreground">
                  LLM interprets extracted data into structured advisory insights
                </p>
              </div>
            </div>

            {extractionResult && !aiAnalysis && !isAnalyzing && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-1">
                    Ready to analyze{" "}
                    <span className="text-primary">
                      {String((extractionResult.data.metadata as Record<string, unknown>)?.source_file || "the extracted data")}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    AI will assess suitability, volatility, performance, fees, and diversification — then annotate the PDF
                  </p>
                </div>
                <Button
                  onClick={handleAnalyze}
                  className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                  size="lg"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyze with AI
                </Button>
              </div>
            )}

            {isAnalyzing && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                </div>
                <p className="text-sm font-medium text-foreground">Analyzing with AI…</p>
                <p className="text-xs text-muted-foreground">
                  Generating suitability, volatility, performance, fee, and diversification insights
                </p>
              </div>
            )}

            {!extractionResult && !isAnalyzing && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                <Sparkles className="w-4 h-4 opacity-50" />
                Complete extraction first to unlock AI analysis
              </div>
            )}
          </div>
        </section>

        {/* ── STEP 4: AI Advisory Insights + Annotated PDF ──────────────── */}
        <section
          className={`bg-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            aiAnalysis ? "border-primary/40 step-active" : "border-border/50"
          } ${!aiAnalysis && !isAnalyzing ? "opacity-60" : ""}`}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <StepBadge number={4} active={isAnalyzing} done={step3Done} />
              <div>
                <h3 className="text-base font-semibold text-foreground">AI Advisory Insights</h3>
                <p className="text-sm text-muted-foreground">
                  Structured analysis ready for relationship managers — annotated onto the PDF
                </p>
              </div>
              {aiAnalysis && (
                <Badge className="ml-auto shrink-0 bg-primary/20 text-primary border-primary/30 text-xs">
                  {aiAnalysis.fundName}
                </Badge>
              )}
            </div>

            {isAnalyzing ? (
              <InsightSkeleton />
            ) : aiAnalysis ? (
              <div className="space-y-5 animate-fade-in-up">
                {/* Insights grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InsightCard
                    icon={Shield}
                    title="Suitability"
                    headline={aiAnalysis.suitability.headline}
                    detail={aiAnalysis.suitability.detail}
                    badge={aiAnalysis.suitability.rating}
                    className={`insight-suitability ${getSuitabilityColor(aiAnalysis.suitability.rating)}`}
                    delay={0}
                  />
                  <InsightCard
                    icon={BarChart3}
                    title="Volatility"
                    headline={aiAnalysis.volatility.headline}
                    detail={aiAnalysis.volatility.detail}
                    badge={aiAnalysis.volatility.level}
                    badgeVariant={
                      aiAnalysis.volatility.level === "Low"
                        ? "secondary"
                        : aiAnalysis.volatility.level === "High" || aiAnalysis.volatility.level === "Very High"
                        ? "destructive"
                        : "outline"
                    }
                    className="insight-volatility"
                    delay={80}
                  />
                  <InsightCard
                    icon={TrendingUp}
                    title="Long-Term Performance"
                    headline={aiAnalysis.longTermPerformance.headline}
                    detail={aiAnalysis.longTermPerformance.detail}
                    className="insight-performance"
                    delay={160}
                  />
                  <InsightCard
                    icon={DollarSign}
                    title="Fee Caution"
                    headline={aiAnalysis.feeCaution.headline}
                    detail={aiAnalysis.feeCaution.detail}
                    badge={`${aiAnalysis.feeCaution.level} fees`}
                    badgeVariant={getFeeColor(aiAnalysis.feeCaution.level) as "default" | "secondary" | "destructive" | "outline"}
                    className="insight-fees"
                    delay={240}
                  />
                  <div className="md:col-span-2 animate-fade-in-up" style={{ animationDelay: "320ms" }}>
                    <InsightCard
                      icon={PieChart}
                      title="Diversification"
                      headline={aiAnalysis.diversification.headline}
                      detail={aiAnalysis.diversification.detail}
                      className="insight-diversification"
                    />
                  </div>
                </div>

                {/* Executive summary — Azalea tint, NO black */}
                <div
                  className="rounded-xl p-5 border animate-fade-in-up"
                  style={{
                    animationDelay: "400ms",
                    background: "linear-gradient(135deg, oklch(0.96 0.020 15), oklch(0.93 0.030 15))",
                    borderColor: "oklch(0.88 0.06 15)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h4 className="text-sm font-semibold text-primary">Executive Summary</h4>
                    <Badge variant="outline" className="ml-auto text-xs border-primary/30 text-primary">
                      50–70 words
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{aiAnalysis.summary}</p>
                </div>

                {/* ── Annotated PDF Viewer ──────────────────────────────── */}
                <div className="border-t border-border/40 pt-5 animate-fade-in-up" style={{ animationDelay: "480ms" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        AI Insights Annotated on PDF
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Each advisory insight is placed as a comment directly on the relevant section of the document
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAnnotatedPDF(v => !v)}
                      className="shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      {showAnnotatedPDF ? "Hide PDF" : "View Annotated PDF"}
                    </Button>
                  </div>

                  {/* Annotation legend */}
                  {showAnnotatedPDF && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {[
                        { label: "Suitability", color: "bg-green-400" },
                        { label: "Volatility", color: "bg-orange-400" },
                        { label: "Long-Term Performance", color: "bg-blue-400" },
                        { label: "Fee Caution", color: "bg-red-400" },
                        { label: "Diversification", color: "bg-purple-400" },
                      ].map(({ label, color }) => (
                        <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={`w-2.5 h-2.5 rounded-sm ${color} opacity-80`} />
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {showAnnotatedPDF && (
                    <div className="animate-fade-in-up">
                      <AIAnnotationWebViewer analysis={aiAnalysis} />
                    </div>
                  )}
                </div>

                {/* Reset button */}
                <div className="flex justify-end pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUploadedFile(null);
                      setUploadedFileUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
                      setExtractionResult(null);
                      setAiAnalysis(null);
                      setShowPDFViewer(false);
                      setShowAnnotatedPDF(false);
                      extractMutation.reset();
                      analyzeMutation.reset();
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Start new analysis
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
                <AlertTriangle className="w-4 h-4 opacity-50" />
                AI insights will appear here after analysis
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ── Why Apryse / OCBC Indonesia Context ──────────────────────── */}
      <div className="container pb-12">
        <WhyApryseSection />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/50 py-6">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            Powered by{" "}
            <a
              href="https://apryse.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Apryse Server SDK
            </a>{" "}
            · DataExtractionModule IDP · WebViewer · Singapore Private Banking Demo
          </p>
          <p className="text-muted-foreground/60">
            For demonstration purposes only. Not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
