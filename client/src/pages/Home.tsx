import { useState, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { WhyApryseSection } from "@/components/WhyApryseSection";
import { DemoContextIntro } from "@/components/DemoContextIntro";
import { FormRecognitionFlow } from "@/components/FormRecognitionFlow";
import { ExtractionWebViewer, AIAnnotationWebViewer } from "@/components/PDFWebViewer";
import { BeforeAfterTokenVisual } from "@/components/BeforeAfterTokenVisual";
import { MeasuredTokenBenchmark, type LiveTokenData } from "@/components/MeasuredTokenBenchmark";
import { LocalModelSection } from "@/components/LocalModelSection";
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
  ScanText,
  ArrowRight,
  Download,
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
  ocrPdfBase64?: string;
  ocr?: {
    applied: boolean;
    available: boolean;
    charsBefore: number;
    charsAfter: number;
    pageCount: number;
    timeMs: number;
  };
}

interface AIAnalysis {
  documentTitle: string;
  insights: Array<{
    category: string;
    headline: string;
    detail: string;
    badge: string;
    relatedKeys: string[];
  }>;
  summary: string;
}

function getInsightIcon(category: string): React.ElementType {
  const c = category.toLowerCase();
  if (c.includes("risk") || c.includes("suitability") || c.includes("security") || c.includes("compliance")) return Shield;
  if (c.includes("performance") || c.includes("return") || c.includes("growth") || c.includes("trend")) return TrendingUp;
  if (c.includes("fee") || c.includes("cost") || c.includes("expense") || c.includes("price") || c.includes("rate")) return DollarSign;
  if (c.includes("diversif") || c.includes("allocation") || c.includes("portfolio") || c.includes("holding")) return PieChart;
  if (c.includes("volatility") || c.includes("stat") || c.includes("metric") || c.includes("ratio") || c.includes("volume")) return BarChart3;
  return Sparkles;
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

// ─── Demo stage model (shared by sidebar + mobile progress bar) ──────────────
const DEMO_STAGES: Array<{ n: number; label: string; hint: string; icon: React.ElementType }> = [
  { n: 1, label: "Upload Document", hint: "Drop a PDF", icon: Upload },
  { n: 2, label: "Detect & OCR", hint: "Scan? OCR if needed", icon: ScanText },
  { n: 3, label: "Extract Key-Value", hint: "Structured JSON", icon: FileSearch },
  { n: 4, label: "AI Analysis", hint: "Interpret the data", icon: Sparkles },
  { n: 5, label: "Advisory Insights", hint: "Annotated results", icon: BarChart3 },
];

// ─── Sticky progress sidebar — always shows the audience the current stage ────
function StageSidebar({ currentStage }: { currentStage: number }) {
  return (
    <nav aria-label="Demo progress" className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-2">
        Demo Progress
      </p>
      {DEMO_STAGES.map((s, i) => {
        const done = currentStage > s.n;
        const active = currentStage === s.n;
        const Icon = s.icon;
        return (
          <div key={s.n} className="relative">
            {i < DEMO_STAGES.length - 1 && (
              <span
                className={`absolute left-[26px] top-[42px] h-[calc(100%-26px)] w-0.5 ${
                  done ? "bg-primary" : "bg-border"
                }`}
              />
            )}
            <div
              className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-all duration-300 ${
                active ? "bg-primary/10 border border-primary/30" : "border border-transparent"
              }`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                    ? "bg-primary/20 text-primary border-2 border-primary animate-pulse"
                    : "bg-muted text-muted-foreground border-2 border-border"
                }`}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold leading-tight truncate ${
                    active ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-[11px] text-muted-foreground/70 leading-tight">
                  {done ? "Done" : active ? "In progress…" : s.hint}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ─── Compact horizontal progress for small screens ───────────────────────────
function MobileStageBar({ currentStage }: { currentStage: number }) {
  const active = DEMO_STAGES.find((s) => s.n === currentStage);
  return (
    <div className="lg:hidden sticky top-[57px] z-[5] -mx-4 mb-2 px-4 py-2.5 bg-background/95 backdrop-blur border-b border-border/60">
      <div className="flex items-center gap-1.5 mb-1.5">
        {DEMO_STAGES.map((s) => {
          const done = currentStage > s.n;
          const isActive = currentStage === s.n;
          return (
            <div
              key={s.n}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                done ? "bg-primary" : isActive ? "bg-primary/50" : "bg-muted"
              }`}
            />
          );
        })}
      </div>
      <p className="text-xs font-medium text-foreground">
        <span className="text-primary">Step {currentStage}/5</span>
        {active ? ` · ${active.label}` : ""}
      </p>
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
  const [demoMode, setDemoMode] = useState<"extract" | "form">("extract");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [showAnnotatedPDF, setShowAnnotatedPDF] = useState(false);
  const [ocrInfo, setOcrInfo] = useState<NonNullable<ExtractionResult["ocr"]> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 2 — extract key-value data from the OCR'd copy (token-based).
  const extractMutation = trpc.extraction.extractFromToken.useMutation({
    onSuccess: (data) => {
      const result = data as ExtractionResult;
      if (!result.success) {
        toast.error(`Extraction failed: ${result.errorMessage ?? "Unknown error"}`, {
          duration: 8000,
        });
        return;
      }
      setExtractionResult(result);
      if (result.ocr) setOcrInfo(result.ocr);
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

  // Phase 1 — detect scanned pages and OCR if needed, then chain into extraction.
  const ocrMutation = trpc.extraction.detectAndOcr.useMutation({
    onSuccess: (data) => {
      if (!data.success || !data.token) {
        toast.error(`Scan check failed: ${data.errorMessage ?? "Unknown error"}`, {
          duration: 8000,
        });
        return;
      }
      if (data.ocr) setOcrInfo(data.ocr);
      if (data.ocr?.applied) {
        toast.success(
          `Scanned document detected — OCR recovered ${data.ocr.charsAfter.toLocaleString()} chars`
        );
      }
      extractMutation.mutate({ token: data.token });
    },
    onError: (err) => {
      toast.error(`Scan check failed: ${err.message}`);
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

      setOcrInfo(null);
      setExtractionResult(null);
      setAiAnalysis(null);
      setShowPDFViewer(false);
      setShowAnnotatedPDF(false);

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        // Phase 1: detect scanned pages + OCR. onSuccess chains into extraction.
        ocrMutation.mutate({ pdfBase64: base64, fileName: file.name });
      };
      reader.readAsDataURL(file);
    },
    [ocrMutation]
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
  const isOcring = ocrMutation.isPending;
  const isExtracting = extractMutation.isPending;
  const isAnalyzing = analyzeMutation.isPending;

  const step1Done = !!uploadedFile && !isOcring;
  const ocrDone = !!ocrInfo;              // detect / OCR phase finished
  const extractDone = !!extractionResult; // extraction finished
  const analysisDone = !!aiAnalysis;

  // Single source of truth for the progress sidebar's highlighted stage.
  const currentStage = aiAnalysis
    ? 5
    : isAnalyzing
    ? 4
    : extractionResult
    ? 3
    : isExtracting
    ? 3
    : uploadedFile || isOcring
    ? 2
    : 1;

  // ── OCR step numbers ────────────────────────────────────────────────────────
  // Real per-file counts come back from the server on the extraction result.
  // Before a file is processed we show a representative sample (a 5-page scan).
  const ocr = ocrInfo;
  const ocrIsLive = !!ocr;
  const ocrBefore = ocr ? ocr.charsBefore : 0;
  const ocrAfter = ocr ? ocr.charsAfter : 0;
  const ocrApplied = ocr ? ocr.applied : true;
  const ocrSeconds = ocr ? (ocr.timeMs / 1000).toFixed(1) : "27";
  const ocrPages = ocr ? ocr.pageCount : 5;

  // ── Token benchmark live data — built from real extraction output ──────────
  const tokenLiveData = useMemo((): LiveTokenData | undefined => {
    if (!extractionResult || !ocrInfo || !uploadedFile) return undefined;
    const pages = (extractionResult.data.pages as Array<{
      keyValueElements?: Array<{ key_text: string; value_text: string; confidence: number }>;
    }>) || [];
    const flatPairs = pages.flatMap(p =>
      (p.keyValueElements || [])
        .filter(e => e.key_text && e.value_text)
        .map(e => `${e.key_text}: ${e.value_text} (conf: ${Math.round(e.confidence * 100)}%)`)
    );
    return {
      rawChars: ocrInfo.applied ? ocrInfo.charsAfter : ocrInfo.charsBefore,
      structPayloadChars: flatPairs.join("\n").length,
      pageCount: ocrInfo.pageCount,
      kvPairs: flatPairs.length,
      fileName: uploadedFile.name,
      fileSizeKb: Math.round(uploadedFile.size / 102.4) / 10,
    };
  }, [extractionResult, ocrInfo, uploadedFile]);

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
                Act 1 — Apryse Document Intelligence
              </h1>
              <p className="text-xs text-white/60 mt-0.5">
                Powered by Apryse Server SDK · Banking Document Automation
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
            From document to{" "}
            <span className="text-red-gradient">assessment-ready data</span>
            <br />in five steps
          </h2>
          <p className="reader-prose-secondary leading-relaxed">
            Upload any document — payslip, bank statement, amendment or contract. Apryse's Server SDK
            automatically extracts every key-value pair with exact coordinates — no templates, no manual
            rekeying. Then let AI turn raw data into structured assessment insights, annotated directly onto the PDF.
          </p>
        </div>
      </section>
      {/* ── 2-Slide Context: set the stage before the live demo ───────── */}
      <DemoContextIntro />

      {/* ── Demo mode tab switcher ──────────────────────────────────────── */}
      <div className="container">
        <div className="inline-flex rounded-xl border border-border/60 bg-muted/40 p-1 gap-1">
          <button
            onClick={() => setDemoMode("extract")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              demoMode === "extract"
                ? "bg-card border border-border shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileSearch className="w-4 h-4" />
            Document Intelligence
          </button>
          <button
            onClick={() => setDemoMode("form")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              demoMode === "form"
                ? "bg-card border border-border shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ScanText className="w-4 h-4" />
            Form Recognition &amp; Auto-fill
          </button>
        </div>
      </div>

      {/* ── Form Recognition path ────────────────────────────────────────── */}
      {demoMode === "form" && (
        <div className="container pb-16">
          <div className="rounded-2xl border border-border/50 bg-card p-6">
            <FormRecognitionFlow />
          </div>
        </div>
      )}

      {/* ── Steps ──────────────────────────────────────────────────────────── */}
      {demoMode === "extract" && (
      <div className="container pb-16">
        <div className="flex gap-6 items-start">
          {/* Sticky progress sidebar — always visible to the audience */}
          <aside className="hidden lg:block w-56 shrink-0 sticky top-20 self-start">
            <StageSidebar currentStage={currentStage} />
          </aside>

          <main className="flex-1 min-w-0 space-y-6">
            {/* Mobile progress bar */}
            <MobileStageBar currentStage={currentStage} />

        {/* ── STEP 1: Upload PDF ─────────────────────────────────────────── */}
        <section
          className={`bg-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            !uploadedFile || isOcring || isExtracting ? "border-primary/40 step-active" : "border-border/50"
          }`}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <StepBadge number={1} active={!uploadedFile} done={step1Done} />
              <div>
                <h3 className="text-base font-semibold text-foreground">Upload Document</h3>
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
                  : isOcring || isExtracting
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
              {isOcring || isExtracting ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">
                      {isOcring
                        ? "Step 2 · Checking text layer & running OCR if scanned…"
                        : "Step 3 · Extracting key-value data…"}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {isOcring
                        ? `OCRModule.processPDF("${uploadedFile?.name}")`
                        : `DataExtractionModule.extractData("${uploadedFile?.name}", "output.json", e_generic_key_value)`}
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
                      Drop your document here
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
                DataExtractionModule.extractData(<span className="text-yellow-300">"LoanApplication.pdf"</span>,{" "}
                <span className="text-yellow-300">"output.json"</span>,{" "}
                DataExtractionModule.DataExtractionEngine.<span className="text-red-400">e_generic_key_value</span>);
              </code>
            </div>
          </div>
        </section>

        {/* ── STEP 2: OCR — make scanned pages machine-readable ─────────── */}
        <section
          className={`bg-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            isOcring ? "border-primary/40 step-active" : "border-border/50"
          } ${!uploadedFile ? "opacity-60" : ""}`}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <StepBadge number={2} active={isOcring} done={ocrDone} />
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">
                  Auto-Detect Scanned Pages → OCR Only If Needed
                </h3>
                <p className="text-sm text-muted-foreground">
                  Before extraction, Apryse reads the PDF's text layer. Image-only scans have{" "}
                  <span className="font-medium text-foreground">no text</span>, so OCR runs automatically to
                  add one. Digital PDFs already have text, so OCR is skipped — no wasted time.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs shrink-0 hidden sm:inline-flex">
                Deep-learning OCR
              </Badge>
            </div>

            {/* Detection status — shows the detect → decide → OCR decision for this file */}
            <div
              className={`mb-4 rounded-xl border p-4 ${
                !ocrIsLive
                  ? "border-border/50 bg-muted/40"
                  : ocrApplied
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-blue-500/30 bg-blue-500/5"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {!ocrIsLive ? (
                    <FileSearch className="w-5 h-5 text-muted-foreground" />
                  ) : ocrApplied ? (
                    <ScanText className="w-5 h-5 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-blue-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {!ocrIsLive
                        ? "Step 1 — read text layer · Step 2 — decide · Step 3 — OCR if scanned"
                        : ocrApplied
                        ? "Scanned document detected — OCR applied automatically"
                        : "Digital PDF detected — OCR skipped automatically"}
                    </span>
                    {ocrIsLive && (
                      <Badge
                        variant={ocrApplied ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {ocrApplied ? "OCR ran" : "not needed"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {!ocrIsLive
                      ? "On every upload, Apryse checks the PDF's text layer first. Empty layer → it's a scan → OCR runs before extraction. Text already present → OCR is skipped. Upload a document to see the decision for your file."
                      : ocrApplied
                      ? `Apryse read only ${ocrBefore.toLocaleString()} characters in this ${ocrPages}-page file's text layer — that's a scan. OCR ran automatically and recovered ${ocrAfter.toLocaleString()} characters before extraction.`
                      : `Apryse found ${ocrBefore.toLocaleString()} characters already in this ${ocrPages}-page file's text layer, so it's a digital PDF. OCR was skipped and extraction ran directly.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Before / After OCR proof */}
            <div className="rounded-xl bg-muted/40 border border-border/50 p-4">
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                {/* Before OCR */}
                <div className="flex-1 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-semibold text-foreground">
                      {ocrIsLive ? "Your document · before OCR" : "Scanned page · before OCR"}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-red-400">
                    {ocrBefore.toLocaleString()} chars
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ocrBefore === 0
                      ? "A plain text extractor reads nothing — the page is just pixels."
                      : "Text the raw PDF exposes to a plain extractor before OCR."}
                  </p>
                </div>

                {/* Arrow */}
                <div className="flex sm:flex-col items-center justify-center text-primary shrink-0">
                  <ArrowRight className="w-6 h-6 hidden sm:block" />
                  <ScanText className="w-6 h-6 sm:hidden" />
                </div>

                {/* After OCR */}
                <div className="flex-1 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-semibold text-foreground">
                      After OCRModule.processPDF
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-green-400">
                    {ocrIsLive ? ocrAfter.toLocaleString() : "—"} {ocrIsLive ? "chars" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {!ocrIsLive
                      ? "Waiting for OCR to complete…"
                      : ocrApplied
                      ? "A searchable text layer is burned in — extraction can now read every word."
                      : "This PDF already had a text layer — OCR wasn't needed."}
                  </p>
                  {ocrIsLive && ocrApplied && extractionResult?.ocrPdfBase64 && (
                    <button
                      className="mt-2 text-[11px] text-green-400 underline underline-offset-2 hover:text-green-300 transition-colors"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = `data:application/pdf;base64,${extractionResult.ocrPdfBase64}`;
                        a.download = `${uploadedFile?.name.replace(/\.pdf$/i, "") ?? "document"}-ocr.pdf`;
                        a.click();
                      }}
                    >
                      Download OCR'd PDF
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-3">
                {ocrIsLive
                  ? ocrApplied
                    ? `Measured on your ${ocrPages}-page document · English · Apryse deep-learning OCR engine (~${ocrSeconds}s).`
                    : `Measured on your ${ocrPages}-page document · text layer already present, so OCR was skipped.`
                  : "Sample: 5-page scanned statement · English · Apryse deep-learning OCR engine (~27s). Upload a document to see your own numbers."}
              </p>
            </div>

            {/* SDK code snippet */}
            <div className="mt-4 rounded-lg bg-slate-900 border border-slate-700 p-3">
              <p className="text-xs text-slate-400 mb-1.5 font-medium">Apryse Server SDK — detect, then OCR only if needed:</p>
              <code className="text-xs text-green-400 font-mono leading-relaxed block whitespace-pre-wrap">
                <span className="text-slate-500">{"// 1. Read the existing text layer"}</span>{"\n"}
                <span className="text-slate-500">const</span> chars = TextExtractor.<span className="text-yellow-300">getText</span>(doc).length;{"\n"}
                <span className="text-slate-500">{"// 2. Empty layer → it's a scan → OCR before extraction"}</span>{"\n"}
                <span className="text-purple-400">if</span> (chars &lt; threshold) {"{"}{"\n"}
                {"  "}<span className="text-slate-500">const</span> opts = <span className="text-slate-500">await</span> OCRModule.<span className="text-yellow-300">createOCROptions</span>();{"\n"}
                {"  "}opts.<span className="text-yellow-300">addLang</span>(<span className="text-yellow-300">"eng"</span>);{"\n"}
                {"  "}<span className="text-slate-500">await</span> OCRModule.<span className="text-red-400">processPDF</span>(doc, opts);{"\n"}
                {"}"}
              </code>
            </div>
          </div>
        </section>

        {/* ── STEP 3: Extracted JSON + PDF Viewer ────────────────────────── */}
        <section
          className={`bg-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            extractionResult && !aiAnalysis ? "border-primary/40 step-active" : "border-border/50"
          } ${!extractionResult && !isExtracting ? "opacity-60" : ""}`}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <StepBadge number={3} active={isExtracting} done={extractDone} />
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-7 px-2 text-xs"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(extractionResult.data, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = uploadedFile ? `${uploadedFile.name.replace(/\.pdf$/i, "")}-extraction.json` : "extraction-output.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download JSON
                  </Button>
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

        {/* ── TOKEN BENCHMARK (after Step 3, hidden until extraction done) ─── */}
        {extractDone && (
          <section className="bg-card rounded-2xl border border-border/50 overflow-hidden animate-fade-in-up">
            <MeasuredTokenBenchmark liveData={tokenLiveData} />
          </section>
        )}

        {/* ── MODEL FLEXIBILITY (Apryse JSON → local model) ────────────────── */}
        {extractDone && (
          <section className="bg-card rounded-2xl border border-border/50 overflow-hidden animate-fade-in-up">
            <LocalModelSection />
          </section>
        )}

        {/* ── STEP 4: Analyze with AI ────────────────────────────────────── */}
        <section
          className={`bg-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            extractionResult && !aiAnalysis && !isAnalyzing ? "border-primary/40 step-active" : "border-border/50"
          } ${!extractionResult ? "opacity-60" : ""}`}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <StepBadge number={4} active={!!extractionResult && !aiAnalysis} done={analysisDone} />
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">Analyze with AI</h3>
                <p className="text-sm text-muted-foreground">
                  LLM interprets extracted data into structured assessment insights
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
                    AI will analyze the extracted data and annotate key insights directly onto the PDF
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
                  Generating document insights from extracted data…
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

        {/* ── STEP 5: AI Advisory Insights + Annotated PDF ──────────────── */}
        <section
          className={`bg-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            aiAnalysis ? "border-primary/40 step-active" : "border-border/50"
          } ${!aiAnalysis && !isAnalyzing ? "opacity-60" : ""}`}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <StepBadge number={5} active={isAnalyzing} done={analysisDone} />
              <div>
                <h3 className="text-base font-semibold text-foreground">AI Advisory Insights</h3>
                <p className="text-sm text-muted-foreground">
                  Structured analysis ready for lending assessors — annotated onto the PDF
                </p>
              </div>
              {aiAnalysis && (
                <Badge className="ml-auto shrink-0 bg-primary/20 text-primary border-primary/30 text-xs">
                  {aiAnalysis.documentTitle}
                </Badge>
              )}
            </div>

            {isAnalyzing ? (
              <InsightSkeleton />
            ) : aiAnalysis ? (
              <div className="space-y-5 animate-fade-in-up">
                {/* Insights grid — dynamic, one card per LLM-chosen category */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiAnalysis.insights.map((insight, idx) => {
                    const isLastOdd = idx === aiAnalysis.insights.length - 1 && aiAnalysis.insights.length % 2 !== 0;
                    return (
                      <div key={idx} className={isLastOdd ? "md:col-span-2" : ""} style={{ animationDelay: `${idx * 80}ms` }}>
                        <InsightCard
                          icon={getInsightIcon(insight.category)}
                          title={insight.category}
                          headline={insight.headline}
                          detail={insight.detail}
                          badge={insight.badge || undefined}
                          badgeVariant="outline"
                          delay={idx * 80}
                        />
                      </div>
                    );
                  })}
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

                {/* ── Why this analysis was token-efficient ─────────────── */}
                <div className="rounded-xl border border-green-400/40 bg-green-50/50 p-4 animate-fade-in-up" style={{ animationDelay: "440ms" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-4 h-4 text-green-700 shrink-0" />
                    <p className="text-sm font-medium text-foreground">Why this analysis was token-efficient</p>
                  </div>
                  {tokenLiveData ? (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Apryse extracted{" "}
                      <span className="text-foreground font-medium">{tokenLiveData.kvPairs} structured key-value pairs</span>{" "}
                      (~{Math.round(tokenLiveData.structPayloadChars / 2.5).toLocaleString()} tokens) instead of sending the{" "}
                      <span className="text-foreground font-medium">whole document as ~{Math.round(tokenLiveData.rawChars / 4).toLocaleString()} raw text tokens</span>.
                      See the full token breakdown above ↑
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Apryse extracted 31 structured key-value pairs (~551 tokens) — instead of sending ~2,146 raw text tokens. That's a 74.3% reduction, verified against Gemini's countTokens endpoint.
                    </p>
                  )}
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

                  {/* Annotation legend — mirrors the INSIGHT_PALETTE order in PDFWebViewer */}
                  {showAnnotatedPDF && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {["bg-green-400", "bg-red-400", "bg-blue-400", "bg-amber-400", "bg-purple-400"].slice(0, aiAnalysis.insights.length).map((color, idx) => (
                        <span key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={`w-2.5 h-2.5 rounded-sm ${color} opacity-80`} />
                          {aiAnalysis.insights[idx].category}
                        </span>
                      ))}
                    </div>
                  )}

                  {showAnnotatedPDF && (
                    <div className="animate-fade-in-up">
                      <AIAnnotationWebViewer analysis={aiAnalysis} pdfUrl={uploadedFileUrl ?? undefined} pairs={extractedPairs} />
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
                      setOcrInfo(null);
                      setExtractionResult(null);
                      setAiAnalysis(null);
                      setShowPDFViewer(false);
                      setShowAnnotatedPDF(false);
                      ocrMutation.reset();
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
        </div>
      </div>
      )}

      {/* ── Why Apryse / Lending Fulfillment Context ──────────────────────── */}
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
