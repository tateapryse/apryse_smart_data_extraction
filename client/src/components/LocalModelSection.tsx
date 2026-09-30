import {
  FileText,
  Braces,
  Cpu,
  ArrowRight,
  ShieldCheck,
  Coins,
  Boxes,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Conceptual value story: because Apryse emits clean JSON, analysis doesn't
// have to run on a frontier multimodal LLM — a local/open-source text model
// (e.g. a HuggingFace summarizer or classifier) can consume the JSON directly.
export function LocalModelSection() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-primary" />
          </div>
          <h3 className="text-base font-medium text-foreground">
            You may not need a frontier LLM at all
          </h3>
          <Badge
            variant="outline"
            className="ml-auto text-xs border-primary/40 text-primary bg-primary/5"
          >
            No external API call
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Most open-source summarization &amp; classification models can't read PDFs or images —
          but they can read Apryse's JSON. That lets the analysis run on a model you host yourself.
        </p>
      </div>

      {/* Flow visual: PDF → Apryse JSON → local model */}
      <div className="px-6 py-6">
        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          <div className="flex-1 rounded-xl border border-border bg-muted/30 p-4 flex flex-col items-center text-center gap-2">
            <FileText className="w-6 h-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Unstructured PDF</span>
            <span className="text-xs text-muted-foreground">
              Scanned or digital — unreadable to a text-only model
            </span>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 sm:rotate-0" />
          </div>

          <div className="flex-1 rounded-xl border border-green-400/50 bg-green-50 p-4 flex flex-col items-center text-center gap-2">
            <Braces className="w-6 h-6 text-green-700" />
            <span className="text-sm font-medium text-green-700">Apryse structured JSON</span>
            <span className="text-xs text-muted-foreground">
              Clean key-value fields any text model can consume
            </span>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 sm:rotate-0" />
          </div>

          <div className="flex-1 rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col items-center text-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            <span className="text-sm font-medium text-primary">Local / open-source model</span>
            <span className="text-xs text-muted-foreground">
              A HuggingFace summarizer or classifier, running on your own infra
            </span>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-green-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Data stays private</p>
              <p className="text-xs text-muted-foreground">
                Nothing leaves your environment — no third-party LLM ever sees the document.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-start gap-2.5">
            <Coins className="w-4 h-4 text-green-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">No per-token bill</p>
              <p className="text-xs text-muted-foreground">
                Skip metered API pricing entirely — the marginal cost per document approaches zero.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-start gap-2.5">
            <Boxes className="w-4 h-4 text-green-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Lower barrier to entry</p>
              <p className="text-xs text-muted-foreground">
                Unlock small models that were never built to parse PDFs or handle vision.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
          Apryse does the hard part — turning messy documents into clean, structured data. Once the
          information is JSON, the choice of model is yours: a frontier LLM for rich reasoning, or a
          lightweight local model for private, low-cost classification and summarization.
        </p>
      </div>
    </div>
  );
}
