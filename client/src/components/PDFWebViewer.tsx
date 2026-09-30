import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Layers, CheckCircle2, GitCompareArrows } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────
interface WVDocument {
  getFileData: (opts?: { flatten?: boolean; xfdfString?: string }) => Promise<ArrayBuffer>;
}

interface KeyValuePair {
  key: string;
  value: string;
  confidence: number;
  pageNumber: number;
  key_rect?: [number, number, number, number] | null;
  value_rect?: [number, number, number, number] | null;
  // Legacy aliases kept for backward compat
  key_bbox?: [number, number, number, number] | null;
  value_bbox?: [number, number, number, number] | null;
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

// ─── Shared WebViewer loader ──────────────────────────────────────────────────
type WVInstance = {
  Core: {
    documentViewer: {
      addEventListener: (event: string, cb: () => void) => void;
      getDocument: () => WVDocument;
    };
    annotationManager: {
      addAnnotations: (annotations: unknown[]) => void;
      drawAnnotationsFromList: (annotations: unknown[]) => void;
      exportAnnotations: () => Promise<string>;
    };
    Annotations: {
      RectangleAnnotation: new () => RectAnnot;
      StickyAnnotation: new () => StickyAnnot;
      Color: new (r: number, g: number, b: number, a?: number) => unknown;
    };
  };
};

interface RectAnnot {
  PageNumber: number;
  X: number; Y: number; Width: number; Height: number;
  FillColor: unknown; StrokeColor: unknown; StrokeThickness: number;
  Opacity: number; Author: string;
  setContents: (s: string) => void;
  NoResize: boolean; NoMove: boolean; ReadOnly: boolean;
}

interface StickyAnnot {
  PageNumber: number; X: number; Y: number;
  Author: string; Icon: string;
  setContents: (s: string) => void;
}

// Read license key from env var — set VITE_APRYSE_LICENSE_KEY in your .env file
const ENV_LICENSE_KEY = import.meta.env.VITE_APRYSE_LICENSE_KEY as string | undefined;

const DEMO_PDF_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663271420096/4Vny8aZvPW3bDSPWHgiJMF/OUTPUT-8ed22c_d467d567.pdf";

// Compact loader for side-by-side comparison panels — hides annotation/shape toolbars
async function loadCompactViewer(
  container: HTMLDivElement,
  url: string,
  licenseKey?: string,
  readOnly = false
): Promise<WVInstance> {
  const mod = await import("@pdftron/webviewer");
  const WebViewer = mod.default;
  return WebViewer(
    {
      path: "/lib/webviewer",
      licenseKey: licenseKey || ENV_LICENSE_KEY || undefined,
      initialDoc: url,
      disabledElements: [
        "toolbarGroup-Annotate",
        "toolbarGroup-Shapes",
        "toolbarGroup-Insert",
        "toolbarGroup-Measure",
        "toolbarGroup-Edit",
        "toolbarGroup-FillAndSign",
        "toolbarGroup-Forms",
        "menuButton",
        "leftPanelButton",
        "searchButton",
        "annotationCommentButton",
        "printButton",
      ],
      isReadOnly: readOnly,
    },
    container
  ) as unknown as Promise<WVInstance>;
}

async function loadWebViewer(
  container: HTMLDivElement,
  licenseKey?: string,
  initialDoc?: string,
  fullAPI = false
): Promise<WVInstance> {
  const mod = await import("@pdftron/webviewer");
  const WebViewer = mod.default;
  return WebViewer(
    {
      path: "/lib/webviewer",
      licenseKey: licenseKey || ENV_LICENSE_KEY || undefined,
      initialDoc: initialDoc || DEMO_PDF_URL,
      fullAPI,
      disabledElements: [
        "toolbarGroup-Annotate",
        "toolbarGroup-Shapes",
        "toolbarGroup-Insert",
        "toolbarGroup-Measure",
        "toolbarGroup-Edit",
        "toolbarGroup-FillAndSign",
        "toolbarGroup-Forms",
        "menuButton",
      ],
      isReadOnly: false,
    },
    container
  ) as unknown as Promise<WVInstance>;
}

// ─── Helper: make a tight rectangle annotation ────────────────────────────────
// The JSON uses coordinateSystem: "originTop" — same as WebViewer's default.
// rect format: [x1, y1, x2, y2] where (x1,y1) is top-left corner.
function makeRect(
  Annotations: WVInstance["Core"]["Annotations"],
  page: number,
  rect: [number, number, number, number],
  fillRgb: [number, number, number],
  strokeRgb: [number, number, number],
  label: string,
  tooltip: string,
  thickness = 1.5
): RectAnnot {
  const [x1, y1, x2, y2] = rect;
  const annot = new Annotations.RectangleAnnotation();
  annot.PageNumber = page;
  annot.X = x1;
  annot.Y = y1;
  annot.Width = Math.max(x2 - x1, 3);
  annot.Height = Math.max(y2 - y1, 3);
  annot.FillColor = new Annotations.Color(...fillRgb, 0.15);
  annot.StrokeColor = new Annotations.Color(...strokeRgb, 0.95);
  annot.StrokeThickness = thickness;
  annot.Opacity = 1;
  annot.Author = label;
  annot.setContents(tooltip);
  annot.NoResize = true;
  annot.NoMove = true;
  annot.ReadOnly = true;
  return annot;
}

// ─── Extraction Highlight Viewer ──────────────────────────────────────────────
// Keys  → tight BLUE borders  (RGB 37,99,235)
// Values → tight RED borders  (RGB 239,24,21)
// Each annotation is placed on the correct page using pair.pageNumber
// Helper to draw annotations onto an already-loaded WebViewer instance
function drawExtractionAnnotations(
  instance: WVInstance,
  pairs: KeyValuePair[]
) {
  const { annotationManager, Annotations } = instance.Core;

  // Blue for KEYS
  const KEY_FILL:   [number,number,number] = [37,  99, 235];
  const KEY_STROKE: [number,number,number] = [37,  99, 235];

  // Red for VALUES
  const VAL_FILL:   [number,number,number] = [239, 24,  21];
  const VAL_STROKE: [number,number,number] = [239, 24,  21];

  const annotations: unknown[] = [];

  const withKeyRect   = pairs.filter((p) => p.key_rect   ?? p.key_bbox);
  const withValueRect = pairs.filter((p) => p.value_rect ?? p.value_bbox);
  console.log(
    `[ExtractionAnnotations] total pairs=${pairs.length} ` +
    `keyRects=${withKeyRect.length} valueRects=${withValueRect.length}`
  );


  pairs.forEach((pair) => {
    const page = pair.pageNumber || 1;
    const conf = Math.round((pair.confidence || 0.999) * 100);

    const kRect = (pair.key_rect ?? pair.key_bbox) as [number,number,number,number] | null | undefined;
    const vRect = (pair.value_rect ?? pair.value_bbox) as [number,number,number,number] | null | undefined;

    if (kRect && kRect[2] > kRect[0] && kRect[3] > kRect[1]) {
      annotations.push(
        makeRect(
          Annotations, page, kRect,
          KEY_FILL, KEY_STROKE,
          "Apryse SDK — Key",
          `KEY: ${pair.key}\nConfidence: ${conf}%`,
          1.5
        )
      );
    }

    if (vRect && vRect[2] > vRect[0] && vRect[3] > vRect[1]) {
      annotations.push(
        makeRect(
          Annotations, page, vRect,
          VAL_FILL, VAL_STROKE,
          "Apryse SDK — Value",
          `VALUE: ${pair.value}\nKey: ${pair.key}`,
          1.5
        )
      );
    }
  });

  if (annotations.length > 0) {
    annotationManager.addAnnotations(annotations);
    annotationManager.drawAnnotationsFromList(annotations);
  }
}

export function ExtractionWebViewer({
  pairs,
  pdfUrl,
  licenseKey = "",
}: {
  pairs: KeyValuePair[];
  /** Object URL (or any URL) for the PDF to display. Falls back to the demo PDF. */
  pdfUrl?: string;
  licenseKey?: string;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<WVInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load — create WebViewer once
  useEffect(() => {
    if (!viewerRef.current || instanceRef.current) return;
    let cancelled = false;

    loadWebViewer(viewerRef.current, licenseKey || ENV_LICENSE_KEY, pdfUrl)
      .then((instance) => {
        if (cancelled) return;
        instanceRef.current = instance;
        const { documentViewer } = instance.Core;

        documentViewer.addEventListener("documentLoaded", () => {
          if (cancelled) return;
          setLoading(false);
          drawExtractionAnnotations(instance, pairs);
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load WebViewer");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When pdfUrl changes (new file uploaded), load the new document and redraw annotations
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !pdfUrl) return;

    setLoading(true);
    const { documentViewer } = instance.Core;

    // loadDocument is available on the documentViewer in WebViewer v8+
    const dv = documentViewer as unknown as {
      loadDocument: (url: string) => void;
      addEventListener: (event: string, cb: () => void) => void;
    };
    dv.loadDocument(pdfUrl);

    const handler = () => {
      setLoading(false);
      drawExtractionAnnotations(instance, pairs);
    };
    dv.addEventListener("documentLoaded", handler);
    // Note: WebViewer's addEventListener is additive; old listeners stay but are idempotent for this use-case
  }, [pdfUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl bg-muted border border-border text-sm text-muted-foreground">
        WebViewer unavailable: {error}
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: "540px" }}>
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10 gap-3">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading PDF viewer…</p>
          <p className="text-xs text-muted-foreground/60">Applying extraction highlights…</p>
        </div>
      )}
      <div ref={viewerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// Color palette for up to 5 insight annotations (matches legend in Home.tsx)
const INSIGHT_PALETTE: Array<{ fill: [number, number, number]; stroke: [number, number, number] }> = [
  { fill: [34, 197, 94],   stroke: [22, 163, 74]  },  // green
  { fill: [239, 24, 21],  stroke: [180, 10, 5]   },  // red
  { fill: [37, 99, 235],  stroke: [29, 78, 216]  },  // blue
  { fill: [245, 158, 11], stroke: [180, 115, 8]  },  // amber
  { fill: [147, 51, 234], stroke: [126, 34, 206] },  // purple
];

// ─── AI Annotation Viewer ─────────────────────────────────────────────────────
// Computes the bounding rect of all extracted pairs whose key matches any of
// the given patterns, padding by 4 pts. Returns null if none match.
function computeInsightRect(
  pairs: KeyValuePair[],
  keyPatterns: string[]
): { page: number; rect: [number, number, number, number] } | null {
  const matches = pairs.filter((p) =>
    keyPatterns.some((pat) => p.key.toLowerCase().includes(pat.toLowerCase()))
  );
  if (!matches.length) return null;

  const rects = matches
    .flatMap((p) => [p.key_rect ?? p.key_bbox, p.value_rect ?? p.value_bbox])
    .filter(Boolean) as [number, number, number, number][];
  if (!rects.length) return null;

  const x1 = Math.min(...rects.map((r) => r[0])) - 4;
  const y1 = Math.min(...rects.map((r) => r[1])) - 4;
  const x2 = Math.max(...rects.map((r) => r[2])) + 4;
  const y2 = Math.max(...rects.map((r) => r[3])) + 4;
  return { page: matches[0].pageNumber || 1, rect: [x1, y1, x2, y2] };
}

export function AIAnnotationWebViewer({
  analysis,
  pdfUrl,
  pairs = [],
  licenseKey = "",
}: {
  analysis: AIAnalysis;
  /** Override the document URL. Defaults to the built-in demo fund sheet. */
  pdfUrl?: string;
  /** Extracted key-value pairs used to position annotations on the actual document. */
  pairs?: KeyValuePair[];
  licenseKey?: string;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerRef.current || instanceRef.current) return;
    let cancelled = false;

    loadWebViewer(viewerRef.current, licenseKey || ENV_LICENSE_KEY, pdfUrl)
      .then((instance) => {
        if (cancelled) return;
        instanceRef.current = instance;
        const { documentViewer, annotationManager, Annotations } = instance.Core;

        documentViewer.addEventListener("documentLoaded", () => {
          if (cancelled) return;
          setLoading(false);

          // Map each LLM insight to a PDF annotation rect derived from its relatedKeys.
          // Falls back to stacked positions on page 1 when no matching pairs are found.
          const insightRegions = (analysis.insights || []).slice(0, 5).map((insight, idx) => {
            const palette = INSIGHT_PALETTE[idx % INSIGHT_PALETTE.length];
            const computed = computeInsightRect(pairs, insight.relatedKeys);
            const fallbackY = 40 + idx * 60;
            return {
              page: computed?.page ?? 1,
              rect: (computed?.rect ?? [30, fallbackY, 560, fallbackY + 45]) as [number, number, number, number],
              label: `AI: ${insight.category}`,
              content: `${insight.category.toUpperCase()}${insight.badge ? ` — ${insight.badge}` : ""}\n\n${insight.headline}\n\n${insight.detail}`,
              fill: palette.fill,
              stroke: palette.stroke,
            };
          });

          const annotations: unknown[] = [];

          insightRegions.forEach(({ page, rect, label, content, fill, stroke }) => {
            // Tight rectangle over the relevant section
            annotations.push(
              makeRect(Annotations, page, rect, fill, stroke, label, content, 2)
            );

            // Sticky note at top-left corner of the region
            const sticky = new Annotations.StickyAnnotation();
            sticky.PageNumber = page;
            sticky.X = rect[0];
            sticky.Y = rect[1];
            sticky.Author = label;
            sticky.Icon = "Comment";
            sticky.setContents(content);
            annotations.push(sticky);
          });

          annotationManager.addAnnotations(annotations);
          annotationManager.drawAnnotationsFromList(annotations);
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load WebViewer");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl bg-muted border border-border text-sm text-muted-foreground">
        WebViewer unavailable: {error}
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: "580px" }}>
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10 gap-3">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading annotated PDF viewer…</p>
          <p className="text-xs text-muted-foreground/60">Applying AI advisory annotations…</p>
        </div>
      )}
      <div ref={viewerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// ─── Filled Form Viewer ───────────────────────────────────────────────────────
// ─── Form Comparison Viewer ───────────────────────────────────────────────────
// Left: browser-native PDF renderer (no WebViewer) — shows the flat original with no fields.
// Right: single WebViewer instance — shows the same PDF with AcroForm fields + values.
// Using <object> for the left panel avoids a 3rd concurrent WebViewer WASM worker.
export function FormCompareWebViewer({
  originalPdfUrl,
  filledPdfUrl,
  licenseKey = "",
}: {
  originalPdfUrl: string;
  filledPdfUrl: string;
  licenseKey?: string;
}) {
  const rightRef = useRef<HTMLDivElement>(null);
  const rightInstanceRef = useRef<unknown>(null);
  const [rightLoading, setRightLoading] = useState(true);

  // Convert data URL → blob URL so <object> doesn't hit data-URI length limits
  const originalBlobUrl = useMemo(() => {
    if (!originalPdfUrl.startsWith("data:")) return originalPdfUrl;
    const base64 = originalPdfUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new File([bytes], "original.pdf", { type: "application/pdf" }));
  }, [originalPdfUrl]);

  useEffect(() => {
    return () => { URL.revokeObjectURL(originalBlobUrl); };
  }, [originalBlobUrl]);

  useEffect(() => {
    if (!rightRef.current || rightInstanceRef.current) return;
    let cancelled = false;
    loadCompactViewer(rightRef.current, filledPdfUrl, licenseKey || ENV_LICENSE_KEY, false)
      .then((inst) => {
        if (cancelled) return;
        rightInstanceRef.current = inst;
        inst.Core.documentViewer.addEventListener("documentLoaded", () => {
          if (cancelled) return;
          setRightLoading(false);
        });
      })
      .catch(() => { if (!cancelled) setRightLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-2 divide-x divide-border rounded-xl overflow-hidden border border-border shadow-sm">
      {/* Left — browser-native PDF viewer: proves there are zero form fields */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/60 border-b border-border">
          <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
          <span className="text-xs font-semibold text-foreground">Before — Flat PDF</span>
          <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground">No fields</Badge>
        </div>
        <object
          data={`${originalBlobUrl}#toolbar=0&view=FitH`}
          type="application/pdf"
          style={{ width: "100%", height: "500px", display: "block" }}
        >
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4 text-center">
            Browser PDF viewer unavailable — try Chrome or Edge.
          </div>
        </object>
      </div>
      {/* Right — WebViewer: shows the PDF with Apryse-created AcroForm fields */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-border">
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-xs font-semibold text-foreground">After — Interactive Form</span>
          <Badge className="ml-auto text-[10px]">AcroForm · Editable</Badge>
        </div>
        <div className="relative" style={{ height: "500px" }}>
          {rightLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10 gap-2">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Loading interactive form…</p>
            </div>
          )}
          <div ref={rightRef} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Filled Form Viewer ───────────────────────────────────────────────────────
// Flattened result panel — menuButton NOT disabled so user downloads via WebViewer's own UI
function FlattenedPdfPanel({ pdfUrl, licenseKey = "" }: { pdfUrl: string; licenseKey?: string }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewerRef.current || instanceRef.current) return;
    let cancelled = false;
    import("@pdftron/webviewer").then((mod) => {
      const WebViewer = mod.default;
      return WebViewer(
        {
          path: "/lib/webviewer",
          licenseKey: licenseKey || ENV_LICENSE_KEY || undefined,
          initialDoc: pdfUrl,
          disabledElements: [
            "toolbarGroup-Annotate",
            "toolbarGroup-Shapes",
            "toolbarGroup-Insert",
            "toolbarGroup-Measure",
            "toolbarGroup-Edit",
            "toolbarGroup-FillAndSign",
            "toolbarGroup-Forms",
            // menuButton kept enabled — download lives in it
          ],
          isReadOnly: true,
        },
        viewerRef.current!
      ) as unknown as Promise<WVInstance>;
    }).then((inst) => {
      if (cancelled) return;
      instanceRef.current = inst;
      inst.Core.documentViewer.addEventListener("documentLoaded", () => {
        if (!cancelled) setLoading(false);
      });
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative" style={{ height: "520px" }}>
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10 gap-2">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Rendering flattened PDF…</p>
        </div>
      )}
      <div ref={viewerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export function FilledFormWebViewer({
  pdfUrl,
  licenseKey = "",
}: {
  pdfUrl: string;
  licenseKey?: string;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<WVInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [flattening, setFlattening] = useState(false);
  const [flattenedUrl, setFlattenedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke blob URL when replaced or on unmount
  useEffect(() => {
    return () => { if (flattenedUrl) URL.revokeObjectURL(flattenedUrl); };
  }, [flattenedUrl]);

  useEffect(() => {
    if (!viewerRef.current || instanceRef.current) return;
    let cancelled = false;

    loadWebViewer(viewerRef.current, licenseKey || ENV_LICENSE_KEY, pdfUrl, true)
      .then((instance) => {
        if (cancelled) return;
        instanceRef.current = instance;
        instance.Core.documentViewer.addEventListener("documentLoaded", () => {
          if (!cancelled) setLoading(false);
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load WebViewer");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFlatten() {
    const instance = instanceRef.current;
    if (!instance || flattenedUrl) return;
    setFlattening(true);
    try {
      const xfdfString = await instance.Core.annotationManager.exportAnnotations();
      const doc = instance.Core.documentViewer.getDocument();
      const data = await doc.getFileData({ flatten: true, xfdfString });
      const file = new File([new Uint8Array(data)], "filled-form-flattened.pdf", { type: "application/pdf" });
      setFlattenedUrl(URL.createObjectURL(file));
    } catch (err) {
      console.error("[FilledFormWebViewer] Flatten failed:", err);
    } finally {
      setFlattening(false);
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl bg-muted border border-border text-sm text-muted-foreground">
        WebViewer unavailable: {error}
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-sm">
      {/* Interactive filled form */}
      <div className="relative" style={{ height: "600px" }}>
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10 gap-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading filled form…</p>
            <p className="text-xs text-muted-foreground/60">Interactive AcroForm fields ready</p>
          </div>
        )}
        <div ref={viewerRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {/* Flatten action bar — hidden once flattened */}
      {!flattenedUrl && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/40">
          <p className="text-xs text-muted-foreground">
            Click any field above to edit. Flatten to burn values into static content.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            disabled={loading || flattening}
            onClick={handleFlatten}
          >
            {flattening ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Layers className="w-3.5 h-3.5" />
            )}
            {flattening ? "Flattening…" : "Flatten PDF"}
          </Button>
        </div>
      )}

      {/* Flattened result — new WebViewer with menu button for native download */}
      {flattenedUrl && (
        <>
          <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border bg-green-500/5">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              Flattened — all field values are now static page content
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              Use the ⋮ menu inside the viewer to download
            </span>
          </div>
          <FlattenedPdfPanel pdfUrl={flattenedUrl} licenseKey={licenseKey} />
        </>
      )}
    </div>
  );
}
