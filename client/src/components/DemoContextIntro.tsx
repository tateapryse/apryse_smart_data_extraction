import {
  FileStack,
  Sparkles,
  Bot,
  Workflow,
  Eye,
  Lock,
  ScanText,
  ArrowDown,
  CheckCircle2,
} from "lucide-react";

// ─── 2-Slide Context Intro ────────────────────────────────────────────────────
// A lightweight "deck" drilled into the page: Slide 01 sets the problem context,
// Slide 02 builds confidence in Apryse — then hands straight off to the live demo.

const BEFORE_GEN_AI = [
  "PDF generation",
  "Rendering and viewing",
  "Compliance and governance",
  "Signing",
  "Archiving",
];

const WITH_AI = [
  "Extract structured data from thousands of documents",
  "Identify tables, sections, signatures, and entities",
  "Feed document content into an LLM",
  "Automate downstream business processes",
  "Build RAG and agentic workflows on top of documents",
];

const APRYSE_FOCUS = [
  {
    icon: Eye,
    title: "Flow A — The customer's side",
    detail:
      "A flat PDF is a picture of a form. Form Field Identification reads the page the way a human does — sees the boxes, lines, and checkboxes — and generates a fillable, interactive form automatically. No form designer. No manual authoring.",
  },
  {
    icon: ScanText,
    title: "Flow B — The bank's side",
    detail:
      "The customer flattens and submits. Fields are gone — data is now ink on a page. Key-value extraction gets it back out: no template, no rules, no manual tagging. Structured JSON with bounding boxes for every value.",
  },
  {
    icon: Lock,
    title: "Fully offline, inside your own environment",
    detail:
      "No cloud API. No document leaves this machine. Everything runs as an SDK on your infrastructure — the deployment model built for regulated environments.",
  },
];

function SlideFrame({
  number,
  eyebrow,
  title,
  titleAccent,
  intro,
  accent,
  children,
}: {
  number: string;
  eyebrow: string;
  title: string;
  titleAccent: string;
  intro: string;
  accent: "muted" | "primary";
  children: React.ReactNode;
}) {
  const isPrimary = accent === "primary";
  return (
    <div
      className={`relative rounded-2xl border overflow-hidden ${
        isPrimary ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-card"
      }`}
    >
      {/* Slide number watermark */}
      <span className="pointer-events-none absolute top-4 right-5 text-5xl font-black tabular-nums text-primary/10 select-none">
        {number}
      </span>

      <div className="p-6 sm:p-7">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-primary tabular-nums">{number}</span>
          <span className="h-px w-6 bg-primary/40" />
          <span className="text-xs font-semibold text-primary tracking-widest uppercase">
            {eyebrow}
          </span>
        </div>

        <h3 className="reader-serif text-xl sm:text-2xl font-bold text-foreground leading-tight mb-2">
          {title} <span className="text-red-gradient">{titleAccent}</span>
        </h3>
        <p className="reader-serif text-[0.9375rem] text-muted-foreground leading-relaxed mb-5 max-w-md">{intro}</p>

        {children}
      </div>
    </div>
  );
}

function BulletList({ items, tone }: { items: string[]; tone: "muted" | "primary" }) {
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-2.5">
          <div className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center ${tone === "primary" ? "bg-primary/15" : "bg-muted"}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
          </div>
          <p className="reader-serif text-[0.875rem] text-foreground leading-relaxed">{item}</p>
        </div>
      ))}
    </div>
  );
}

export function DemoContextIntro() {
  return (
    <section className="container pb-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SlideFrame
          number="01"
          eyebrow="The Strategy"
          title="AI readiness changes the document"
          titleAccent="conversation"
          intro="Before GenAI, document strategy for banks was about five things: generating PDFs, rendering them, compliance, signing, archiving. A solved problem. But with AI, your board is asking completely different questions."
          accent="muted"
        >
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileStack className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-primary tracking-wide uppercase">Before GenAI</p>
              </div>
              <BulletList items={BEFORE_GEN_AI} tone="muted" />
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-primary tracking-wide uppercase">With AI</p>
              </div>
              <BulletList items={WITH_AI} tone="primary" />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.045] p-4">
            <div className="flex items-start gap-3">
              <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="reader-serif text-sm font-semibold text-foreground leading-snug">
                  The narrative becomes: how do we extract and maximise value from documents throughout their lifecycle?
                </p>
                <p className="reader-serif text-[0.8125rem] text-muted-foreground leading-relaxed mt-1">
                  Your archive is either AI-ready data — or a filing cabinet you pay rent on. The difference is whether a machine can read it.
                </p>
              </div>
            </div>
          </div>
        </SlideFrame>
        <SlideFrame
          number="02"
          eyebrow="The Problem"
          title="Can your documents feed AI,"
          titleAccent="safely?"
          intro="Act 1 proves it — live, with one real Thai banking form. Two flows: first we play the customer filling and flattening the form. Then we play the bank receiving it, and getting the data back out."
          accent="primary"
        >
          <div className="space-y-3">
            {APRYSE_FOCUS.map((point) => (
              <div key={point.title} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-4">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <point.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="reader-serif text-sm font-semibold text-foreground leading-snug">{point.title}</p>
                  <p className="reader-serif text-[0.8125rem] text-muted-foreground leading-relaxed mt-0.5">{point.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Workflow className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="reader-serif text-sm font-semibold text-foreground leading-snug">
                  Trapped, and freed
                </p>
                <p className="reader-serif text-[0.8125rem] text-muted-foreground leading-relaxed mt-1">
                  The data went into the document as a customer's answers — got trapped by flattening — and Smart Data Extraction got it back out, as AI-ready data, offline, with no template. That is the whole AI-readiness problem, and its solution.
                </p>
              </div>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Hand-off to the live demo */}
      <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ArrowDown className="w-4 h-4 text-primary animate-bounce" />
          Now see that strategy become a live document workflow
        </div>
        <div className="hidden sm:block h-4 w-px bg-border" />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {["Upload", "Extract", "Structure", "Analyze", "Annotate"].map((label, i) => (
            <span key={label} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary/70" />
              {label}
              {i < 4 && <span className="ml-1 text-primary/30">›</span>}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
