import { useState, useMemo } from "react";
import {
  Shield,
  Zap,
  Lock,
  Server,
  Cloud,
  CheckCircle2,
  XCircle,
  DollarSign,
  FileText,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

// ─── Token Cost Calculator ────────────────────────────────────────────────────
// Source: Gemini 2.5 Flash pricing (the model this demo runs) —
//         $0.30/1M input tokens (text), $2.50/1M output tokens.
function CostCalculator() {
  const [docCount, setDocCount] = useState(5000);
  const [tokensPerDoc, setTokensPerDoc] = useState(10000);
  const [reductionPct, setReductionPct] = useState(30);

  const INPUT_RATE = 0.3; // $ per 1M input tokens (Gemini 2.5 Flash, text)

  const rawCost = useMemo(
    () => (docCount * tokensPerDoc * INPUT_RATE) / 1_000_000,
    [docCount, tokensPerDoc]
  );

  const reducedTokens = useMemo(
    () => tokensPerDoc * (1 - reductionPct / 100),
    [tokensPerDoc, reductionPct]
  );

  const optimisedCost = useMemo(
    () => (docCount * reducedTokens * INPUT_RATE) / 1_000_000,
    [docCount, reducedTokens]
  );

  const savings = rawCost - optimisedCost;
  const savingsPct = rawCost > 0 ? (savings / rawCost) * 100 : 0;

  const fmt = (n: number) =>
    n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
          </div>
          <h3 className="text-base font-medium text-foreground">Live Token Cost Calculator</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Adjust your pipeline parameters to see the real cost impact of structured extraction.
        </p>
      </div>

      {/* Controls */}
      <div className="px-6 py-5 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Doc count */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Documents per run</label>
              <span className="text-sm font-medium text-primary tabular-nums">
                {docCount.toLocaleString()}
              </span>
            </div>
            <Slider min={100} max={50000} step={100} value={[docCount]}
              onValueChange={([v]) => setDocCount(v)} className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>100</span><span>50,000</span>
            </div>
          </div>

          {/* Tokens per doc */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Avg tokens / doc</label>
              <span className="text-sm font-medium text-primary tabular-nums">
                {tokensPerDoc.toLocaleString()}
              </span>
            </div>
            <Slider min={1000} max={50000} step={500} value={[tokensPerDoc]}
              onValueChange={([v]) => setTokensPerDoc(v)} className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1K</span><span>50K</span>
            </div>
          </div>

          {/* Reduction % */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Token reduction</label>
              <span className="text-sm font-medium text-green-600 tabular-nums">{reductionPct}%</span>
            </div>
            <Slider min={10} max={80} step={5} value={[reductionPct]}
              onValueChange={([v]) => setReductionPct(v)} className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10% (min)</span><span>80% (structured)</span>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted/50 border border-border p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Raw PDF cost</p>
            <p className="text-2xl font-medium text-foreground tabular-nums">{fmt(rawCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">per run</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
            <p className="text-xs text-primary mb-1">Apryse-optimised</p>
            <p className="text-2xl font-medium text-primary tabular-nums">{fmt(optimisedCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">per run</p>
          </div>
          <div className="rounded-xl bg-green-50 border border-green-300/60 p-4 text-center">
            <p className="text-xs text-green-700 mb-1">You save</p>
            <p className="text-2xl font-medium text-green-700 tabular-nums">{fmt(savings)}</p>
            <p className="text-xs text-green-600 mt-1">{savingsPct.toFixed(0)}% per run</p>
          </div>
        </div>

        {/* Rate footnote */}
        <p className="text-xs text-muted-foreground text-center">
          Based on Gemini 2.5 Flash input rate: $0.30 / 1M text tokens — the model this demo runs.
          Output rate: $2.50 / 1M tokens. Structured extraction cuts the input payload the LLM must read.
        </p>
      </div>
    </div>
  );
}

// ─── Pipeline Comparison Table ────────────────────────────────────────────────
function PipelineComparison() {
  const rows = [
    {
      dimension: "Token payload",
      raw: "Full document (headers, footers, whitespace, layout artifacts)",
      apryse: "Clean labeled JSON — only analytical content",
    },
    {
      dimension: "Avg tokens per doc",
      raw: "~10,000 tokens",
      apryse: "~1,000–7,000 tokens (30–80% reduction)",
    },
    {
      dimension: "Hallucination risk",
      raw: "High — split tokens from multi-column layouts",
      apryse: "Minimal — structured key-value pairs with coordinates",
    },
    {
      dimension: "Data transmission",
      raw: "5,000 transmissions over public internet",
      apryse: "Zero external transmission — on-premise SDK",
    },
    {
      dimension: "Regulatory compliance",
      raw: "Complex — data leaves perimeter",
      apryse: "Simple — full data residency, air-gap compatible",
    },
    {
      dimension: "Cost model",
      raw: "Variable per-page cloud fees + token costs",
      apryse: "Fixed SDK licensing — no per-page surprises",
    },
    {
      dimension: "Extraction accuracy",
      raw: "Semantic drift from layout ambiguity",
      apryse: "Exact coordinates + confidence scores per field",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
          </div>
          <h3 className="text-base font-medium text-foreground">
            Pipeline Comparison: Raw PDF vs Apryse-Structured
          </h3>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide w-1/4">
                Dimension
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-primary uppercase tracking-wide w-3/8">
                Raw PDF → LLM
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-green-700 uppercase tracking-wide w-3/8">
                Apryse SDK → LLM
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-border/40 transition-colors hover:bg-muted/20 ${
                  i % 2 === 0 ? "" : "bg-muted/10"
                }`}
              >
                <td className="px-6 py-3.5 font-medium text-foreground/80 text-xs">{row.dimension}</td>
                <td className="px-4 py-3.5 text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-3.5 h-3.5 text-primary/70 shrink-0 mt-0.5" />
                    <span className="text-xs leading-relaxed">{row.raw}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                    <span className="text-xs leading-relaxed text-foreground/90">{row.apryse}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Security Card ────────────────────────────────────────────────────────────
function SecurityCard({
  icon: Icon,
  title,
  description,
  tags,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  tags: string[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 rounded-full border border-primary/25 text-primary bg-primary/8"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Stat Callout ─────────────────────────────────────────────────────────────
function StatCallout({
  value,
  label,
  sub,
  color = "primary",
}: {
  value: string;
  label: string;
  sub?: string;
  color?: "primary" | "green" | "red";
}) {
  const colorMap = {
    primary: "text-primary",
    green: "text-green-700",
    red: "text-primary",   // use crimson for "red" — no separate red needed
  };
  const bgMap = {
    primary: "bg-primary/8 border-primary/25",
    green: "bg-green-50 border-green-300/60",
    red: "bg-secondary/50 border-secondary",
  };
  return (
    <div className={`text-center p-5 rounded-xl border ${bgMap[color]}`}>
      <p className={`text-3xl font-medium tabular-nums ${colorMap[color]}`}>{value}</p>
      <p className="text-sm font-medium text-foreground mt-1">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export function WhyApryseSection() {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <section className="mt-8 space-y-6">
      {/* Section header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 max-w-8 bg-primary/40" />
            <span className="text-xs font-medium text-primary tracking-widest uppercase">
              For Banking Operations · Strategic Context
            </span>
          </div>
          <h2 className="text-2xl font-medium text-foreground">
            Why structured extraction is a{" "}
            <span className="text-red-gradient">fiscal necessity</span>
          </h2>
          <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
            Passing raw PDFs directly to an LLM means paying for headers, footers, whitespace, and
            layout artifacts — tokens that carry zero analytical value. At Gemini 2.5 Pro rates
            ($1.25 / 1M input tokens), that overhead adds up fast at scale. The Apryse Data
            Extraction SDK solves this before the document ever reaches your model — converting PDFs
            into clean, labeled, context-aware JSON so your RAG pipeline only ingests content that
            actually matters. No semantic drift from multi-column layouts. No hallucinations from
            split tokens.
          </p>
        </div>
      </div>

      {/* Key stats — Azalea / Crimson palette, no black */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCallout
          value="$0.30"
          label="per 1M input tokens"
          sub="Gemini 2.5 Flash (text)"
          color="primary"
        />
        <StatCallout
          value="$2.50"
          label="per 1M output tokens"
          sub="Gemini 2.5 Flash generation"
          color="red"
        />
        <StatCallout
          value="~30%"
          label="token reduction"
          sub="Headers, footers, whitespace stripped"
          color="green"
        />
        <StatCallout
          value="~80%"
          label="max reduction"
          sub="Well-structured documents"
          color="green"
        />
      </div>

      {/* The math callout — Azalea tint background, NO black */}
      <div className="rounded-2xl p-6 border border-secondary bg-secondary/30">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-primary">
            The Math: 5,000 Documents
          </h3>
          <Badge variant="outline" className="ml-auto text-xs border-primary/30 text-primary">
            At Gemini 2.5 Flash rates ($0.30 / 1M input tokens)
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="space-y-1.5 rounded-xl bg-white/70 border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Raw pipeline
            </p>
            <p className="text-foreground text-xs leading-relaxed">
              5,000 docs × 10,000 tokens × $0.30 / 1M
            </p>
            <p className="text-2xl font-medium text-foreground">$15.00</p>
            <p className="text-xs text-muted-foreground">per run</p>
          </div>
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-1.5">
              <ArrowRight className="w-5 h-5 text-primary" />
              <span className="text-xs text-primary font-medium text-center">
                Apryse strips ~30%
              </span>
              <span className="text-xs text-muted-foreground text-center">
                headers, branding,
                <br />structural whitespace
              </span>
            </div>
          </div>
          <div className="space-y-1.5 rounded-xl bg-white/70 border border-primary/25 p-4">
            <p className="text-xs font-medium text-primary uppercase tracking-wide">
              Apryse-optimised
            </p>
            <p className="text-foreground text-xs leading-relaxed">
              5,000 docs × 7,000 tokens × $0.30 / 1M
            </p>
            <p className="text-2xl font-medium text-primary">$10.50</p>
            <p className="text-xs text-green-700 font-medium">
              Save $4.50 per run · ~30% reduction
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">At scale, two more savings kick in:</span>{" "}
            First, up to 80% token payload reduction on well-structured documents (10,000 tokens → ~2,000 tokens per doc),
            which cuts the input bill to ~$3.00 per run at the same rate.
            Second, no per-page cloud fees — Apryse SDK runs on-premise with fixed licensing,
            before factoring in reduced re-queries from cleaner formatting.
          </p>
        </div>
      </div>

      {/* Interactive calculator */}
      <CostCalculator />

      {/* Toggle for deeper content */}
      <button
        onClick={() => setShowDetails(v => !v)}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium w-full justify-center py-2"
      >
        {showDetails ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Hide security &amp; compliance details
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Show security, compliance &amp; pipeline comparison
          </>
        )}
      </button>

      {showDetails && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Security section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-4 h-4 text-primary" />
              <h3 className="text-base font-medium text-foreground">
                Security &amp; Compliance Case
              </h3>
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                Regulated industries
              </Badge>
            </div>

            <div className="rounded-xl p-4 border border-secondary bg-secondary/40 mb-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                A cloud-based extraction service processes 5,000 documents through{" "}
                <span className="text-foreground font-medium">5,000 individual transmissions</span>{" "}
                over the public internet. An on-premise SDK keeps every file inside your firewall —
                critical for your regulatory obligations and the privacy of customer banking data.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SecurityCard
                icon={Shield}
                title="Data Residency"
                description="Every document stays within your private cloud or on-premise environment. No data leaves the perimeter — ever."
                tags={["Air-gap compatible", "Private cloud", "Zero egress"]}
              />
              <SecurityCard
                icon={Server}
                title="Simplified Audits"
                description="On-premise processing means simpler GDPR, HIPAA, and SOC 2 audits. Full control over data lineage and access logs."
                tags={["GDPR", "HIPAA", "SOC 2", "APRA aligned"]}
              />
              <SecurityCard
                icon={Lock}
                title="Fixed Cost Model"
                description="Replace variable per-page cloud fees with predictable fixed SDK licensing. No surprise invoices at month-end."
                tags={["Fixed licensing", "No per-page fees", "Budget certainty"]}
              />
            </div>
          </div>

          {/* Cloud vs On-premise visual */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Cloud className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-medium text-primary">Cloud extraction service</h4>
              </div>
              <ul className="space-y-2">
                {[
                  "5,000 docs → 5,000 internet transmissions",
                  "Variable per-page pricing",
                  "Data leaves your perimeter",
                  "Complex compliance audit trail",
                  "Latency on large batches",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <XCircle className="w-3.5 h-3.5 text-primary/70 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-green-300/60 bg-green-50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-green-700" />
                <h4 className="text-sm font-medium text-green-700">Apryse on-premise SDK</h4>
              </div>
              <ul className="space-y-2">
                {[
                  "All processing stays inside your firewall",
                  "Fixed SDK licensing — no surprises",
                  "Full data residency & air-gap support",
                  "Simple, clean compliance audit trail",
                  "Batch processing at wire speed",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-foreground/80">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Pipeline comparison table */}
          <PipelineComparison />

          {/* Strategic closing statement — deep wine, NOT black */}
          <div
            className="rounded-2xl p-6 border"
            style={{
              background: "linear-gradient(135deg, oklch(0.28 0.10 22), oklch(0.22 0.09 22))",
              borderColor: "oklch(0.35 0.12 22)",
            }}
          >
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-white mb-2">
                  Strategic Recommendation for Banking Document Automation
                </h4>
                <p className="text-sm text-white/80 leading-relaxed">
                  For long-term fiscal sustainability and the effective and secure deployment of AI at
                  scale, localised data extraction is a strategic necessity — not an optimisation.
                  Transitioning to a structured pipeline ensures your document assets are not just
                  digitised, but are truly{" "}
                  <span className="text-secondary font-medium">AI-ready, secure, and cost-optimised</span>.
                  The Apryse Server SDK delivers clean, labeled, context-aware JSON so your RAG
                  pipeline only ingests content that actually matters — eliminating semantic drift
                  from multi-column layouts and hallucinations from split tokens.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
