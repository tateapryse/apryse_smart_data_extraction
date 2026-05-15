import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  fundName: string;
  suitability: { rating: string; score: number; headline: string; detail: string };
  volatility: { level: string; headline: string; detail: string };
  longTermPerformance: { headline: string; detail: string };
  feeCaution: { level: string; headline: string; detail: string };
  diversification: { headline: string; detail: string };
  summary: string;
}

// ─── Shared WebViewer loader ──────────────────────────────────────────────────
type WVInstance = {
  Core: {
    documentViewer: {
      addEventListener: (event: string, cb: () => void) => void;
    };
    annotationManager: {
      addAnnotations: (annotations: unknown[]) => void;
      drawAnnotationsFromList: (annotations: unknown[]) => void;
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

async function loadWebViewer(
  container: HTMLDivElement,
  licenseKey?: string,
  initialDoc?: string
): Promise<WVInstance> {
  const mod = await import("@pdftron/webviewer");
  const WebViewer = mod.default;
  return WebViewer(
    {
      path: "/lib/webviewer",
      licenseKey: licenseKey || ENV_LICENSE_KEY || undefined,
      initialDoc: initialDoc || DEMO_PDF_URL,
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

// ─── AI Annotation Viewer ─────────────────────────────────────────────────────
// Each AI insight is annotated as a tight rectangle + sticky note on the
// relevant section of the Contoso Cashew Fund fact sheet.
// Coordinates are from the real extraction JSON (coordinateSystem: originTop).
// Page 1 dimensions: ~575 wide × ~690 tall (PDF points)
export function AIAnnotationWebViewer({
  analysis,
  licenseKey = "",
}: {
  analysis: AIAnalysis;
  licenseKey?: string;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerRef.current || instanceRef.current) return;
    let cancelled = false;

    loadWebViewer(viewerRef.current, licenseKey || ENV_LICENSE_KEY)
      .then((instance) => {
        if (cancelled) return;
        instanceRef.current = instance;
        const { documentViewer, annotationManager, Annotations } = instance.Core;

        documentViewer.addEventListener("documentLoaded", () => {
          if (cancelled) return;
          setLoading(false);

          // Advisory insight regions derived from real extraction coordinates
          // All on Page 1 of the Contoso Cashew Fund fact sheet
          // Coordinates: [x1, y1, x2, y2] in PDF points, originTop
          const insightRegions: Array<{
            page: number;
            rect: [number, number, number, number];
            label: string;
            content: string;
            fill: [number, number, number];
            stroke: [number, number, number];
          }> = [
            {
              // Suitability → Risk Level area (right column, top section)
              // Risk Level key_rect=[375.549, 111.905, 413.223, 122.237]
              // Covers the risk/objective header block
              page: 1,
              rect: [370, 44, 575, 160],
              label: "AI: Suitability",
              content: `SUITABILITY: ${analysis.suitability.rating.toUpperCase()}\n\n${analysis.suitability.headline}\n\n${analysis.suitability.detail}`,
              fill: [34, 197, 94], stroke: [22, 163, 74],
            },
            {
              // Volatility → Risk Statistics section (bottom-left of page 1)
              // Alpha key_rect=[60.58, 484.321], Beta=[146.539, 484.321], StdDev=[288.179, 484.321]
              page: 1,
              rect: [33, 475, 370, 515],
              label: "AI: Volatility",
              content: `VOLATILITY: ${analysis.volatility.level.toUpperCase()}\n\n${analysis.volatility.headline}\n\n${analysis.volatility.detail}`,
              fill: [239, 24, 21], stroke: [180, 10, 5],
            },
            {
              // Long-Term Performance → Performance table (center-left of page 1)
              // YTD key_rect=[93.029, 200.022], performance rows ~y=200-260
              page: 1,
              rect: [33, 192, 370, 260],
              label: "AI: Long-Term Performance",
              content: `LONG-TERM PERFORMANCE\n\n${analysis.longTermPerformance.headline}\n\n${analysis.longTermPerformance.detail}`,
              fill: [37, 99, 235], stroke: [29, 78, 216],
            },
            {
              // Fee Caution → Operating Expenses / Front Load section (right column)
              // Operating Expenses key_rect=[375.799, 342.622], Max Front Load=[375.799, 367.022]
              page: 1,
              rect: [370, 335, 575, 410],
              label: "AI: Fee Caution",
              content: `FEE CAUTION: ${analysis.feeCaution.level.toUpperCase()} FEES\n\n${analysis.feeCaution.headline}\n\n${analysis.feeCaution.detail}`,
              fill: [245, 198, 203], stroke: [239, 24, 21],
            },
            {
              // Diversification → Top Holdings section (bottom-right of page 1)
              // Top Holdings key_rect=[375.549, 566.005] through ~y=670
              page: 1,
              rect: [370, 558, 575, 672],
              label: "AI: Diversification",
              content: `DIVERSIFICATION\n\n${analysis.diversification.headline}\n\n${analysis.diversification.detail}`,
              fill: [147, 51, 234], stroke: [126, 34, 206],
            },
          ];

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
