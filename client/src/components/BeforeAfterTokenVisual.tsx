import { X, CheckCircle2, FileText, Braces, ArrowRight, AlertTriangle, Zap, Shield } from "lucide-react";

// ─── Before / After Token Comparison Visual ───────────────────────────────────
// Shows the old way (raw PDF → LLM) vs new way (Apryse SDK → clean JSON → LLM)
export function BeforeAfterTokenVisual() {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 bg-muted/60 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Why structured extraction matters before sending to an LLM
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">

        {/* ── BEFORE: Raw PDF → LLM ─────────────────────────────────────── */}
        <div className="p-5 bg-red-50/60">
          {/* Label */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
              <X className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </div>
            <span className="text-sm font-medium text-primary">Before: Raw PDF to LLM</span>
          </div>

          {/* Flow diagram */}
          <div className="flex items-center gap-2 mb-4">
            {/* PDF blob */}
            <div className="flex-1 rounded-lg border-2 border-primary/40 bg-white p-3 text-center">
              <FileText className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-xs font-medium text-foreground">Raw PDF</p>
              <p className="text-xs text-muted-foreground">~10,000 tokens</p>
            </div>
            <ArrowRight className="w-4 h-4 text-primary shrink-0" />
            {/* LLM */}
            <div className="flex-1 rounded-lg border-2 border-primary/40 bg-white p-3 text-center">
              <Zap className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-xs font-medium text-foreground">LLM</p>
              <p className="text-xs text-muted-foreground">Gemini 2.5 Flash</p>
            </div>
          </div>

          {/* What gets sent — noisy content illustration */}
          <div className="rounded-lg bg-white border border-primary/20 p-3 mb-3 font-mono text-xs leading-relaxed overflow-hidden relative" style={{ maxHeight: "130px" }}>
            <div className="text-muted-foreground/50 select-none space-y-0.5">
              <p>WESTAC BANK · EVERYDAY TRANSACTION ACCOUNT</p>
              <p className="text-muted-foreground/30">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p>
              <p>                    ACCOUNT STATEMENT</p>
              <p className="text-muted-foreground/30">                    ─────────────────</p>
              <p>Account Holder:  Jordan A. Michaels</p>
              <p className="text-muted-foreground/30">Page 1 of 6   |   Statement period 01–31 Mar 2025</p>
              <p className="text-muted-foreground/30">© 2025 Westac Bank. This statement is confidential.</p>
              <p>Account Number:  •••• •••• 4821</p>
              <p className="text-muted-foreground/30">   [Bank logo]    [BSB 032-118]</p>
              <p>Closing Balance:  $14,207.63</p>
              <p className="text-muted-foreground/30">─────────────────────────────────────────────────</p>
            </div>
            {/* Fade out overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
          </div>

          {/* Problem callouts */}
          <div className="space-y-1.5">
            {[
              "Headers, footers & whitespace consume tokens",
              "Multi-column layout causes semantic drift",
              "Branding & decorative text adds noise",
              "Risk of hallucinations from split tokens",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>

          {/* Cost pill */}
          <div className="mt-3 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-primary font-medium">5,000 docs × 10K tokens</span>
            <span className="text-sm font-medium text-primary">$15.00 / run</span>
          </div>
        </div>

        {/* ── AFTER: Apryse SDK → Clean JSON → LLM ─────────────────────── */}
        <div className="p-5 bg-green-50/40">
          {/* Label */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </div>
            <span className="text-sm font-medium text-green-700">After: Apryse SDK → Structured JSON</span>
          </div>

          {/* Flow diagram */}
          <div className="flex items-center gap-1.5 mb-4">
            {/* PDF */}
            <div className="flex-1 rounded-lg border-2 border-green-400/50 bg-white p-2.5 text-center">
              <FileText className="w-4 h-4 text-green-600 mx-auto mb-1" />
              <p className="text-xs font-medium text-foreground">Raw PDF</p>
              <p className="text-xs text-muted-foreground">~10K tokens</p>
            </div>
            <ArrowRight className="w-3 h-3 text-green-600 shrink-0" />
            {/* Apryse */}
            <div className="flex-1 rounded-lg border-2 border-green-500/60 bg-green-50 p-2.5 text-center">
              <Shield className="w-4 h-4 text-green-700 mx-auto mb-1" />
              <p className="text-xs font-medium text-green-800">Apryse SDK</p>
              <p className="text-xs text-green-600">On-premise</p>
            </div>
            <ArrowRight className="w-3 h-3 text-green-600 shrink-0" />
            {/* JSON */}
            <div className="flex-1 rounded-lg border-2 border-green-400/50 bg-white p-2.5 text-center">
              <Braces className="w-4 h-4 text-green-600 mx-auto mb-1" />
              <p className="text-xs font-medium text-foreground">Clean JSON</p>
              <p className="text-xs text-muted-foreground">~2K tokens</p>
            </div>
            <ArrowRight className="w-3 h-3 text-green-600 shrink-0" />
            {/* LLM */}
            <div className="flex-1 rounded-lg border-2 border-green-400/50 bg-white p-2.5 text-center">
              <Zap className="w-4 h-4 text-green-600 mx-auto mb-1" />
              <p className="text-xs font-medium text-foreground">LLM</p>
              <p className="text-xs text-muted-foreground">Gemini 2.5 Flash</p>
            </div>
          </div>

          {/* What gets sent — clean JSON illustration */}
          <div className="rounded-lg bg-white border border-green-300/50 p-3 mb-3 font-mono text-xs leading-relaxed overflow-hidden relative" style={{ maxHeight: "130px" }}>
            <pre className="text-green-800 space-y-0">{`{
  "account_holder": "Jordan A. Michaels",
  "account_number": "**** **** 4821",
  "bsb": "032-118",
  "statement_period": "01–31 Mar 2025",
  "closing_balance": "$14,207.63",
  "total_credits": "$8,450.00",
  "total_debits": "$6,120.44",
  "regular_income": "$3,250.00 / fortnight"
}`}</pre>
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent" />
          </div>

          {/* Benefits */}
          <div className="space-y-1.5">
            {[
              "Only analytical content reaches the model",
              "No semantic drift from multi-column layouts",
              "Exact coordinates for every extracted field",
              "On-premise: data never leaves your firewall",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>

          {/* Cost pill */}
          <div className="mt-3 rounded-lg bg-green-600/10 border border-green-500/30 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-green-700 font-medium">5,000 docs × ~2K tokens</span>
            <div className="text-right">
              <span className="text-sm font-medium text-green-700">$3.00 / run</span>
              <span className="ml-2 text-xs font-medium text-green-600 bg-green-100 px-1.5 py-0.5 rounded">−80%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom savings bar */}
      <div className="px-5 py-3 bg-muted/40 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          At scale: up to <strong className="font-medium text-foreground">80% token reduction</strong> on well-structured documents (10,000 → ~2,000 tokens per doc).
          Fixed SDK licensing replaces variable per-page cloud fees.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Saving / run</p>
            <p className="text-sm font-medium text-green-700">~$12.00</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Token reduction</p>
            <p className="text-sm font-medium text-primary">up to 90%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
