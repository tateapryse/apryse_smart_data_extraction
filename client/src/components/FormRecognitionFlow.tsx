import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ScanText,
  Sparkles,
  CheckCircle2,
  FileText,
  Loader2,
  Eye,
  Type,
  SquareCheck,
  CircleDot,
  PenLine,
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  AlertTriangle,
  Upload,
  GitCompareArrows,
  Eraser,
  Download,
} from "lucide-react";
import { FilledFormWebViewer, FormCompareWebViewer } from "@/components/PDFWebViewer";

// ─── Demo customer profile shown in the UI ───────────────────────────────────
const DEMO_PROFILE = [
  { icon: User, label: "Name", value: "Somchai Wattana" },
  { icon: CreditCard, label: "Customer ID", value: "BBL-0098765432" },
  { icon: MapPin, label: "Branch", value: "Silom Branch" },
  { icon: Phone, label: "Mobile", value: "081-234-5678" },
  { icon: Mail, label: "Email", value: "somchai.w@gmail.com" },
  { icon: MapPin, label: "Address", value: "123/45 Soi Silom 19, Si Lom, Bang Rak, Bangkok 10500" },
  { icon: CreditCard, label: "Primary Acc.", value: "123-4-56789-0 → 234-5-67890-1" },
  { icon: CreditCard, label: "Deposit Acc.", value: "345-6-78901-2, 456-7-89012-3" },
  { icon: CreditCard, label: "Credit Card", value: "4000-0012-3456-7890" },
  { icon: User, label: "3rd Party", value: "Malee Wattana · Bangkok Hospital" },
  { icon: Calendar, label: "Date", value: "05/08/2026" },
];

const FIELD_TYPE_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  formTextField: { label: "Text Field", icon: Type, color: "text-blue-500" },
  formCheckBox: { label: "Checkbox", icon: SquareCheck, color: "text-green-500" },
  formRadioButton: { label: "Radio Button", icon: CircleDot, color: "text-orange-500" },
  formDigitalSignature: { label: "Signature", icon: PenLine, color: "text-purple-500" },
};

type FlowStage = "idle" | "running" | "done" | "error";

export function FormRecognitionFlow() {
  const [stage, setStage] = useState<FlowStage>("idle");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ReturnType<
    typeof trpc.formRecognition.detectAndFill.useMutation
  >["data"]>(undefined);
  const [strippedPdf, setStrippedPdf] = useState<string | undefined>(undefined);
  const [isStripping, setIsStripping] = useState(false);
  const [viewerLaunched, setViewerLaunched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stripMutation = trpc.formRecognition.flattenAndStrip.useMutation({
    onSuccess: (data) => {
      setIsStripping(false);
      if (!data.success) {
        toast.error(data.errorMessage ?? "OCR removal failed");
        return;
      }
      setStrippedPdf(data.strippedPdfBase64);
      toast.success("Text layer removed — PDF is now image-only.");
    },
    onError: (err) => {
      setIsStripping(false);
      toast.error(err.message);
    },
  });

  const mutation = trpc.formRecognition.detectAndFill.useMutation({
    onSuccess: (data) => {
      if (!data.success) {
        setStage("error");
        toast.error(data.errorMessage ?? "Form recognition failed");
        return;
      }
      setResult(data);
      setStage("done");
    },
    onError: (err) => {
      setStage("error");
      toast.error(err.message);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setUploadedFile(file);
    } else if (file) {
      toast.error("Please select a PDF file");
    }
  }

  function handleDownloadStripped() {
    if (!strippedPdf) return;
    const a = document.createElement("a");
    a.href = `data:application/pdf;base64,${strippedPdf}`;
    a.download = "filled-form-no-ocr.pdf";
    a.click();
  }

  async function handleStart(useDefault: boolean) {
    setStage("running");
    setStrippedPdf(undefined);
    setViewerLaunched(false);
    if (useDefault) {
      mutation.mutate({});
      return;
    }
    if (!uploadedFile) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      mutation.mutate({ pdfBase64: base64 });
    };
    reader.readAsDataURL(uploadedFile);
  }

  const filledPdfUrl = result?.filledPdfBase64
    ? `data:application/pdf;base64,${result.filledPdfBase64}`
    : undefined;

  // Empty interactive form (fields present, no values) used in the compare panel right side
  const emptyFormUrl = result?.emptyFormPdfBase64
    ? `data:application/pdf;base64,${result.emptyFormPdfBase64}`
    : filledPdfUrl;

  const originalPdfUrl = result?.originalPdfBase64
    ? `data:application/pdf;base64,${result.originalPdfBase64}`
    : undefined;

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { n: 1, label: "Load Form", done: stage !== "idle" },
          { n: 2, label: "Detect Fields", done: stage === "done" || stage === "error", active: stage === "running" },
          { n: 3, label: "Auto-fill", done: stage === "done", active: stage === "running" },
          { n: 4, label: "Compare", done: false, active: stage === "done" },
          { n: 5, label: "Filled Form", done: false, active: stage === "done" },
          { n: 6, label: "Simulate Scan", done: !!strippedPdf, active: isStripping },
        ].map((s, i, arr) => (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
                s.done
                  ? "bg-primary text-primary-foreground"
                  : s.active
                  ? "bg-primary/20 text-primary border-2 border-primary animate-pulse"
                  : "bg-muted text-muted-foreground border-2 border-border"
              }`}
            >
              {s.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.n}
            </div>
            <span
              className={`text-sm font-medium ${
                s.done ? "text-foreground" : s.active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
            {i < arr.length - 1 && <span className="text-border mx-1">›</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Source form */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground mb-1">Select a form PDF</p>
            <p className="text-xs text-muted-foreground mb-4">
              Upload any flat (non-interactive) PDF form, or use the bundled demo form.
              Apryse <code className="mx-1 px-1 py-0.5 rounded bg-muted text-[11px]">e_Form</code>
              will visually detect all field positions and types, create AcroForm fields, and fill them.
            </p>

            {stage === "idle" && (
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Upload custom form */}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/40 bg-muted/30 hover:bg-primary/5 px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-all duration-200 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    {uploadedFile ? (
                      <span className="font-medium text-foreground truncate max-w-[180px]">
                        {uploadedFile.name}
                      </span>
                    ) : (
                      "Upload your own form PDF"
                    )}
                  </button>
                  {uploadedFile && (
                    <Button
                      onClick={() => handleStart(false)}
                      size="sm"
                      className="w-full mt-2 gap-2"
                    >
                      <ScanText className="w-4 h-4" />
                      Detect &amp; Fill Uploaded Form
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-center text-xs text-muted-foreground sm:self-stretch">
                  or
                </div>

                {/* Use pre-loaded demo form */}
                <div className="flex-1">
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 mb-2">
                    <p className="text-xs font-medium text-foreground">IBanking Amendment Form</p>
                    <p className="text-[11px] text-muted-foreground">3 pages · A4 · 0 existing fields</p>
                  </div>
                  <Button
                    onClick={() => handleStart(true)}
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                  >
                    <ScanText className="w-4 h-4" />
                    Use Demo Form
                  </Button>
                </div>
              </div>
            )}

            {stage === "running" && (
              <div className="flex items-center gap-2 text-sm text-primary">
                <Loader2 className="w-4 h-4 animate-spin" />
                Running e_Form field detection + AcroForm creation + auto-fill…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step 2+3: Results */}
      {stage === "done" && result && (
        <>
          {/* Field detection stats */}
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <ScanText className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                e_Form Detection Results
              </span>
              <Badge variant="secondary" className="ml-auto text-xs">
                {result.detectionTimeMs}ms
              </Badge>
            </div>

            {/* Type breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {(
                [
                  ["formTextField", result.stats.text],
                  ["formCheckBox", result.stats.checkbox],
                  ["formRadioButton", result.stats.radio],
                  ["formDigitalSignature", result.stats.signature],
                ] as [string, number][]
              ).map(([type, count]) => {
                const meta = FIELD_TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <div
                    key={type}
                    className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center"
                  >
                    <Icon className={`w-5 h-5 mx-auto mb-1 ${meta.color}`} />
                    <p className="text-lg font-bold text-foreground">{count}</p>
                    <p className="text-[11px] text-muted-foreground">{meta.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{result.stats.total} form elements</span>{" "}
              detected visually using{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-[11px]">
                DataExtractionModule.e_Form
              </code>{" "}
              — no AcroForm metadata existed in the source PDF.
            </div>
          </div>

          {/* Auto-fill summary */}
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Auto-fill Summary</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                {result.fillTimeMs}ms
              </Badge>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Customer profile used */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Demo Customer Profile
                </p>
                <div className="space-y-1.5">
                  {DEMO_PROFILE.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-start gap-2 text-xs">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
                      <span className="text-foreground font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fill stats */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Fields Populated
                </p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Text fields filled</span>
                    <span className="font-semibold text-foreground">
                      {result.filledFieldNames.filter((n) => n.startsWith("text_")).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Checkboxes checked</span>
                    <span className="font-semibold text-foreground">
                      {result.filledFieldNames.filter((n) => n.startsWith("check_")).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-t border-border/60 pt-1 mt-1">
                    <span className="text-muted-foreground font-medium">Total filled</span>
                    <span className="font-bold text-primary">
                      {result.filledFieldNames.length} / {result.stats.text + result.stats.checkbox}
                    </span>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
                  Fields created with{" "}
                  <code className="px-0.5 rounded bg-muted text-[10px]">TextWidget</code>,{" "}
                  <code className="px-0.5 rounded bg-muted text-[10px]">CheckBoxWidget</code>,{" "}
                  <code className="px-0.5 rounded bg-muted text-[10px]">RadioButtonGroup</code>.
                  Values set via{" "}
                  <code className="px-0.5 rounded bg-muted text-[10px]">setText</code> /{" "}
                  <code className="px-0.5 rounded bg-muted text-[10px]">setChecked</code>.
                  Rendered with{" "}
                  <code className="px-0.5 rounded bg-muted text-[10px]">refreshFieldAppearances</code>.
                </div>
              </div>
            </div>
          </div>

          {/* Step 4: Before/After comparison */}
          {originalPdfUrl && filledPdfUrl && (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border/60">
                <GitCompareArrows className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Before vs. After — Flat PDF → Interactive Form
                </span>
                <Badge variant="secondary" className="ml-auto text-xs">Side-by-side</Badge>
              </div>
              <FormCompareWebViewer
                originalPdfUrl={originalPdfUrl}
                filledPdfUrl={emptyFormUrl!}
              />
            </div>
          )}

          {/* Step 5: WebViewer — lazy: don't mount until user clicks to avoid WASM contention */}
          {filledPdfUrl && (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border/60">
                <Eye className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Filled Interactive Form — Apryse WebViewer
                </span>
                <Badge className="ml-auto text-xs">AcroForm · PDF</Badge>
              </div>
              {viewerLaunched ? (
                <FilledFormWebViewer pdfUrl={filledPdfUrl} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-10 bg-muted/20">
                  <p className="text-xs text-muted-foreground text-center max-w-xs">
                    Interactive WebViewer loads with full AcroForm support.<br />
                    Launch it after the comparison above has loaded.
                  </p>
                  <Button size="sm" className="gap-2" onClick={() => setViewerLaunched(true)}>
                    <Eye className="w-4 h-4" />
                    Launch Interactive WebViewer
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Rasterize to scan-like PDF */}
          {filledPdfUrl && (
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Eraser className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Simulate Scanned Document</p>
                  <p className="text-xs text-muted-foreground">
                    Flattens form fields, then rasterizes each page to 150 DPI pixels —
                    producing a pure-image PDF that looks and behaves like a scanned document.
                  </p>
                </div>
                {strippedPdf && (
                  <Badge variant="secondary" className="shrink-0 text-xs">Done</Badge>
                )}
              </div>

              {!strippedPdf && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={isStripping}
                  onClick={() => {
                    if (!result?.filledPdfBase64) return;
                    setIsStripping(true);
                    stripMutation.mutate({ filledPdfBase64: result.filledPdfBase64 });
                  }}
                >
                  {isStripping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eraser className="w-4 h-4" />
                  )}
                  {isStripping ? "Rasterizing pages…" : "Simulate Scan (Rasterize PDF)"}
                </Button>
              )}

              {strippedPdf && (
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
                    Each page was rendered at 150 DPI and saved as a pixel image.
                    The PDF now looks like a <span className="font-semibold text-foreground">scanned document</span> —
                    no selectable text, no hidden data layer.
                  </div>
                  <Button size="sm" className="gap-2 self-start" onClick={handleDownloadStripped}>
                    <Download className="w-4 h-4" />
                    Download Scanned PDF
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Error state */}
      {stage === "error" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive mb-1">Form recognition failed</p>
            <p className="text-xs text-muted-foreground">
              {mutation.error?.message ?? "Unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={() => {
                setStage("idle");
                setResult(undefined);
                setUploadedFile(null);
                setStrippedPdf(undefined);
                setViewerLaunched(false);
              }}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
