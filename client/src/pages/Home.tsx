import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Copy,
  ExternalLink,
  FileText,
  FileUp,
  Gavel,
  Info,
  Link2,
  Moon,
  MoreHorizontal,
  RotateCcw,
  Scale,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const jurors = [
  {
    id: "literalist",
    name: "The Literalist",
    role: "Traceability",
    accent: "lime",
    icon: Search,
    glyph: "L",
    verdict: "TRUSTED",
    confidence: 94,
    short: "Every key phrase has a matching source trail.",
    long: "The answer stays close to the source language and does not smuggle in unsupported precision. The date, scope, and causal language all survive a phrase-level comparison.",
    evidenceLabel: "MATCH 01",
    evidence: "“The first public release was in 2018”",
    source: "Source 01 · Archive / timeline",
  },
  {
    id: "skeptic",
    name: "The Skeptic",
    role: "Adversarial read",
    accent: "coral",
    icon: CircleHelp,
    glyph: "S",
    verdict: "FLAGGED",
    confidence: 81,
    short: "The causal claim is doing more work than the source allows.",
    long: "The answer is directionally right, but it turns a sequence of events into a causal explanation. That leap is plausible; it is not explicitly established by the evidence provided.",
    evidenceLabel: "DRIFT 01",
    evidence: "“This shift happened because the team wanted…”",
    source: "Source 02 · Interview / transcript",
  },
  {
    id: "expert",
    name: "The Domain Expert",
    role: "Field nuance",
    accent: "blue",
    icon: Scale,
    glyph: "D",
    verdict: "TRUSTED",
    confidence: 76,
    short: "Terminology is accurate; one useful caveat is missing.",
    long: "The domain language is used correctly and the chronology checks out. A specialist would add one caveat about regional adoption, but its absence does not make the answer misleading.",
    evidenceLabel: "NOTE 01",
    evidence: "“Adoption accelerated across research teams”",
    source: "Source 03 · Field notes / 2019",
  },
  {
    id: "context",
    name: "The Context Judge",
    role: "Question fit",
    accent: "violet",
    icon: Target,
    glyph: "C",
    verdict: "TRUSTED",
    confidence: 88,
    short: "It answered the question directly without wandering.",
    long: "The response names the moment, gives a reason, and adds enough context to make the answer useful. The disputed causal phrase is the only material weakness.",
    evidenceLabel: "FIT 01",
    evidence: "Answer covers when, why, and what changed.",
    source: "Question intent · 3 required facets",
  },
];

type Screen = "landing" | "ask" | "room" | "verdict";
type Accent = "lime" | "coral" | "blue" | "violet";

function accentClasses(accent: Accent) {
  return {
    lime: {
      bg: "bg-lime",
      soft: "bg-lime/10",
      text: "text-lime",
      border: "border-lime/30",
      bar: "bg-lime",
      ring: "ring-lime/25",
    },
    coral: {
      bg: "bg-coral",
      soft: "bg-coral/10",
      text: "text-coral",
      border: "border-coral/30",
      bar: "bg-coral",
      ring: "ring-coral/25",
    },
    blue: {
      bg: "bg-sky",
      soft: "bg-sky/10",
      text: "text-sky",
      border: "border-sky/30",
      bar: "bg-sky",
      ring: "ring-sky/25",
    },
    violet: {
      bg: "bg-violet",
      soft: "bg-violet/10",
      text: "text-violet",
      border: "border-violet/30",
      bar: "bg-violet",
      ring: "ring-violet/25",
    },
  }[accent];
}

function StatusPill({ children, tone = "lime" }: { children: React.ReactNode; tone?: Accent }) {
  const styles = accentClasses(tone);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${styles.soft} ${styles.text} ${styles.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${styles.bg}`} />
      {children}
    </span>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function fileLabel(file: File) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "PDF";
  if (file.name.toLowerCase().endsWith(".doc") || file.name.toLowerCase().endsWith(".docx")) return "DOC";
  return "NOTE";
}

function Header({ screen, onReset }: { screen: Screen; onReset: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/8 bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <button onClick={onReset} className="group flex items-center gap-3 text-left" aria-label="Back to landing">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-lime/45 bg-lime/10 text-lime shadow-[0_0_28px_rgba(194,245,84,.13)] transition-transform group-hover:-rotate-6">
            <Gavel size={18} strokeWidth={2.4} />
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-lime" />
          </span>
          <span>
            <span className="block font-display text-[17px] font-semibold tracking-[-0.04em] text-paper">AI JURY</span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-muted">answer tribunal</span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {[
            ["landing", "00", "Home"],
            ["ask", "01", "The Ask"],
            ["room", "02", "Deliberation"],
            ["verdict", "03", "Verdict"],
          ].map(([key, num, label]) => (
            <button
              key={key}
              onClick={() => key === "landing" || key === "ask" ? onReset() : undefined}
              className={`group flex items-center gap-2 rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${screen === key ? "bg-white/8 text-paper" : "text-muted hover:text-paper"}`}
            >
              <span className={screen === key ? "text-lime" : "text-muted/70"}>{num}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-white/8 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
            Live tribunal
          </span>
          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 text-muted transition-colors hover:border-white/20 hover:text-paper" aria-label="Theme settings">
            <Moon size={15} />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 text-muted transition-colors hover:border-white/20 hover:text-paper" aria-label="More options">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

function ProgressRail({ screen }: { screen: Screen }) {
  const steps = [
    { key: "ask", label: "ASK", sub: "Your question" },
    { key: "room", label: "ROOM", sub: "Four jurors" },
    { key: "verdict", label: "VERDICT", sub: "Final read" },
  ];
  return (
    <div className="mb-10 flex items-center gap-2 sm:gap-3">
      {steps.map((step, index) => {
        const active = step.key === screen;
        const done = (screen === "room" && index === 0) || (screen === "verdict" && index < 2);
        return (
          <div key={step.key} className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className={`flex items-center gap-2 ${active || done ? "text-paper" : "text-muted/65"}`}>
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[10px] font-bold ${active ? "border-lime bg-lime text-ink" : done ? "border-lime/45 bg-lime/10 text-lime" : "border-white/12"}`}>
                {done ? <Check size={13} /> : `0${index + 1}`}
              </span>
              <span className="hidden font-mono text-[10px] font-bold tracking-[0.18em] sm:block">{step.label}</span>
            </div>
            {index < steps.length - 1 && <div className={`h-px w-8 sm:w-16 ${done ? "bg-lime/40" : "bg-white/10"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function LandingScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="landing-page">
      <section className="relative flex min-h-[calc(100vh-72px)] items-center overflow-hidden px-5 py-16 sm:px-8 lg:px-12">
        <div className="landing-orbit landing-orbit-one" /><div className="landing-orbit landing-orbit-two" /><div className="landing-grid" />
        <div className="relative mx-auto grid w-full max-w-[1440px] items-center gap-14 lg:grid-cols-[1fr_.9fr]">
          <div className="animate-fade-up">
            <div className="mb-7 flex items-center gap-3"><StatusPill>Evidence over instinct</StatusPill><span className="font-mono text-[10px] uppercase tracking-[.18em] text-muted">A live answer tribunal</span></div>
            <h1 className="font-display text-[clamp(4.5rem,11vw,10.5rem)] font-medium leading-[.82] tracking-[-.095em] text-paper">Answers<br /><span className="text-lime">on trial.</span></h1>
            <p className="mt-9 max-w-xl text-lg leading-8 text-muted sm:text-xl">AI Jury turns one answer into a transparent debate. Four perspectives test the same claim so you can see whether it deserves your trust.</p>
            <Button onClick={onStart} className="mt-10 h-13 rounded-2xl bg-lime px-6 font-mono text-[10px] font-bold uppercase tracking-[.17em] text-ink hover:bg-[#d4ff6f]"><Gavel size={15} /> Enter the jury <ArrowRight size={15} /></Button>
            <div className="mt-12 flex gap-8 font-mono text-[10px] uppercase tracking-[.16em] text-muted/70"><span><strong className="text-lime">04</strong> jurors</span><span><strong className="text-paper">01</strong> answer</span><span><strong className="text-paper">∞</strong> evidence</span></div>
          </div>
          <div className="evidence-visual relative mx-auto h-[430px] w-full max-w-[510px] lg:mr-0">
            <div className="evidence-ring evidence-ring-one" /><div className="evidence-ring evidence-ring-two" /><div className="evidence-core"><Gavel size={30} /><span>AI JURY</span></div>
            <div className="evidence-tag evidence-tag-top"><span className="h-2 w-2 rounded-full bg-lime" /> TRACEABLE <strong>94%</strong></div>
            <div className="evidence-tag evidence-tag-right"><span className="h-2 w-2 rounded-full bg-coral" /> CHALLENGE <strong>01</strong></div>
            <div className="evidence-tag evidence-tag-bottom"><span className="h-2 w-2 rounded-full bg-sky" /> SOURCES <strong>03</strong></div>
            <div className="evidence-line evidence-line-one" /><div className="evidence-line evidence-line-two" /><div className="evidence-line evidence-line-three" />
          </div>
        </div>
        <div className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 lg:flex"><span className="font-mono text-[9px] uppercase tracking-[.2em] text-muted">Scroll to explore</span><span className="scroll-line" /></div>
      </section>
    </main>
  );
}

function AnswerPanel({ onOpenRoom }: { onOpenRoom: () => void }) {
  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusPill>Answer rendered</StatusPill>
          <span className="font-mono text-[10px] text-muted/80">142 words · 3 sources</span>
        </div>
        <span className="font-mono text-[10px] text-muted/60">11:31:08</span>
      </div>
      <article className="relative overflow-hidden rounded-[28px] border border-white/10 bg-panel p-6 shadow-[0_24px_70px_rgba(0,0,0,.22)] sm:p-8">
        <div className="absolute right-0 top-0 h-36 w-36 translate-x-1/3 -translate-y-1/3 rounded-full bg-lime/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Answer / draft-04</p>
          <p className="font-display text-[22px] leading-[1.35] tracking-[-0.025em] text-paper sm:text-[28px]">
            The transformer architecture was introduced in <span className="text-lime">2017</span> with the paper <span className="rounded bg-lime/10 px-1.5 text-lime">“Attention Is All You Need.”</span> It changed machine learning by replacing recurrence with self-attention, allowing models to process sequences in parallel. This shift happened because researchers wanted a more efficient way to handle long-range relationships in language.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/8 pt-5">
            <button className="group inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted transition-colors hover:text-paper">
              <Link2 size={13} className="text-sky" /> 3 source links
              <ExternalLink size={11} className="opacity-50 transition-transform group-hover:translate-x-0.5" />
            </button>
            <span className="text-white/15">•</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">Generated in 4.8s</span>
          </div>
        </div>
      </article>

      <button onClick={onOpenRoom} className="group mt-4 flex w-full items-center justify-between rounded-2xl border border-lime/25 bg-lime/[0.07] px-4 py-4 text-left transition-all hover:border-lime/60 hover:bg-lime/10 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-ink shadow-[0_0_24px_rgba(194,245,84,.22)]">
            <Sparkles size={16} />
          </span>
          <div>
            <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-lime">AI jury verdict</span>
            <span className="mt-1 block text-sm text-paper">A claim is precise, but the reasoning needs a closer read.</span>
          </div>
        </div>
        <ArrowRight size={17} className="text-lime transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  );
}

function AskScreen({ onOpenRoom }: { onOpenRoom: () => void }) {
  const [question, setQuestion] = useState("Why did the transformer architecture change AI?");
  const [submitted, setSubmitted] = useState(true);
  const [documents, setDocuments] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const addDocuments = (incoming: FileList | File[]) => {
    const next = Array.from(incoming).filter((file) => file.type === "application/pdf" || file.type.startsWith("text/") || file.type.includes("document") || file.type.includes("word"));
    setDocuments((current) => [...current, ...next].slice(0, 4));
  };

  const removeDocument = (index: number) => setDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index));

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-16">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-16">
        <section>
          <ProgressRail screen="ask" />
          <div className="mb-10 max-w-3xl">
            <div className="mb-5 flex items-center gap-3">
              <StatusPill>Case 0048</StatusPill>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Evidence-based answers</span>
            </div>
            <h1 className="font-display text-[clamp(3.2rem,7vw,6.8rem)] font-medium leading-[.91] tracking-[-0.07em] text-paper">
              Ask the<br /><span className="text-lime">jury.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-muted sm:text-lg">One answer. Four perspectives. A verdict you can actually inspect.</p>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }} className="mb-10">
            <div className={`rounded-[26px] border bg-panel p-2 shadow-[0_22px_70px_rgba(0,0,0,.18)] transition-all duration-300 ${dragging ? "border-lime bg-lime/[0.06] shadow-[0_0_35px_rgba(194,245,84,.12)]" : "border-white/12 focus-within:border-lime/50"}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addDocuments(event.dataTransfer.files); }}>
              <div className="mb-2 flex items-center justify-between gap-3 px-4 pt-2 sm:px-5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted"><FileText size={13} className="text-lime" /> Case files <span className="text-muted/50">{documents.length}/4</span></div>
                <label className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-muted transition-colors hover:border-lime/50 hover:text-lime"><FileUp size={12} /> Add files<input type="file" accept=".pdf,.txt,.md,.doc,.docx" multiple className="sr-only" onChange={(event) => { if (event.target.files) addDocuments(event.target.files); event.currentTarget.value = ""; }} /></label>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 px-4 py-2 sm:px-5">
                <label htmlFor="question" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Your question</label>
                <textarea id="question" value={question} onChange={(e) => { setQuestion(e.target.value); setSubmitted(false); }} rows={2} className="w-full resize-none border-0 bg-transparent p-0 font-display text-lg leading-7 tracking-[-0.02em] text-paper outline-none placeholder:text-muted/50" placeholder="What should the jury investigate?" />
              </div>
              <Button type="submit" className="h-12 rounded-[18px] bg-lime px-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink hover:bg-[#d4ff6f] sm:w-auto">
                <Send size={14} /> Ask the jury
              </Button>
              </div>
              {documents.length > 0 ? <div className="document-preview-grid px-4 pb-3 pt-2 sm:px-5"><div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.16em] text-muted"><FileText size={12} className="text-lime" /> Attached evidence <span className="text-muted/50">{documents.length} ready for review</span></div><div className="grid gap-2 sm:grid-cols-2">{documents.map((file, index) => <div key={`${file.name}-${index}`} className="document-preview group"><div className="document-thumb"><FileText size={20} /><span>{fileLabel(file)}</span></div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium text-paper">{file.name}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[.1em] text-muted">{formatBytes(file.size)} · <span className="text-lime">Ready</span></p></div><button type="button" onClick={() => removeDocument(index)} className="rounded-full p-1 text-muted transition-colors hover:bg-white/10 hover:text-paper" aria-label={`Remove ${file.name}`}><X size={12} /></button></div>)}</div></div> : <div className="flex items-center gap-2 px-4 pb-2 pt-1 font-mono text-[9px] uppercase tracking-[0.13em] text-muted/60 sm:px-5"><UploadCloud size={12} /> Drop PDFs or notes here to ground the jury</div>}
            </div>
            <div className="mt-3 flex items-center gap-2 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted/65"><Info size={12} className="text-lime" /> The jury cross-examines the answer, not you.</div>
          </form>

          {submitted && <AnswerPanel onOpenRoom={onOpenRoom} />}
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-28 rounded-[28px] border border-white/9 bg-panel/70 p-6">
            <div className="mb-9 flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper">How it works</span>
              <ShieldCheck size={16} className="text-lime" />
            </div>
            <div className="space-y-7">
              {[
                ["01", "Render", "Your answer arrives with a compact verdict chip."],
                ["02", "Cross-examine", "Four jurors independently test the same claim."],
                ["03", "Stamp", "The final verdict shows you exactly what drifted."],
              ].map(([num, title, text], index) => (
                <div key={num} className="relative flex gap-4">
                  {index < 2 && <div className="absolute left-[13px] top-8 h-12 border-l border-dashed border-white/15" />}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-lime/40 bg-lime/10 font-mono text-[10px] text-lime">{num}</span>
                  <div className="pt-0.5"><h3 className="font-display text-lg text-paper">{title}</h3><p className="mt-1 text-[13px] leading-5 text-muted">{text}</p></div>
                </div>
              ))}
            </div>
            <div className="mt-10 rounded-2xl border border-white/8 bg-ink/50 p-4"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Current protocol</p><div className="mt-3 flex items-center justify-between"><span className="text-sm text-paper">Source-match v2.4</span><span className="font-mono text-[10px] text-lime">ONLINE</span></div></div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function JurorCard({ juror, revealed, expanded, onToggle }: { juror: (typeof jurors)[number]; revealed: boolean; expanded: boolean; onToggle: () => void }) {
  const styles = accentClasses(juror.accent as Accent);
  const Icon = juror.icon;
  return (
    <button onClick={onToggle} disabled={!revealed} className={`group w-full text-left transition-all duration-500 ${revealed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}>
      <div className={`juror-card overflow-hidden rounded-[23px] border bg-panel transition-all duration-300 ${expanded ? `${styles.border} shadow-[0_18px_50px_rgba(0,0,0,.22)]` : "border-white/9 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_18px_44px_rgba(0,0,0,.28)]"}`}>
        <div className="flex items-start justify-between gap-3 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`juror-icon relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${styles.soft} ${styles.border} ${styles.text}`}>
              <Icon size={19} strokeWidth={1.8} />
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-panel bg-ink font-mono text-[8px] font-bold text-paper">{juror.glyph}</span>
            </span>
            <div className="min-w-0"><h3 className="truncate font-display text-[17px] tracking-[-0.02em] text-paper">{juror.name}</h3><p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">{juror.role}</p></div>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[9px] font-bold tracking-[0.14em] ${juror.verdict === "FLAGGED" ? "bg-coral/12 text-coral" : "bg-lime/12 text-lime"}`}>{juror.verdict}</span>
        </div>
        <div className="px-5 pb-5">
          <div className="mb-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.15em] text-muted"><span>Confidence</span><span className={styles.text}>{juror.confidence}%</span></div>
          <div className="h-1 overflow-hidden rounded-full bg-white/8"><div className={`h-full rounded-full ${styles.bar} transition-all duration-700`} style={{ width: `${juror.confidence}%` }} /></div>
          <p className="mt-4 min-h-[40px] text-[13px] leading-5 text-paper/75 transition-colors duration-300 group-hover:text-paper">{juror.short}</p>
          <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3 font-mono text-[9px] uppercase tracking-[0.15em] text-muted"><span>{expanded ? "Close reasoning" : "Open reasoning"}</span>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
        </div>
        <div className={`grid transition-[grid-template-rows] duration-300 ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}><div className="min-h-0 overflow-hidden"><div className="border-t border-white/8 bg-ink/40 p-5"><p className="text-[13px] leading-6 text-paper/80">{juror.long}</p><div className={`mt-4 rounded-xl border p-3 ${styles.soft} ${styles.border}`}><div className="flex items-center justify-between"><span className={`font-mono text-[9px] font-bold tracking-[0.16em] ${styles.text}`}>{juror.evidenceLabel}</span><ExternalLink size={12} className="text-muted" /></div><p className="mt-2 font-display text-[15px] leading-5 text-paper">{juror.evidence}</p><p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{juror.source}</p></div></div></div></div>
      </div>
    </button>
  );
}

function RoomScreen({ onVerdict, onBack }: { onVerdict: () => void; onBack: () => void }) {
  const [revealed, setRevealed] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    setRevealed(0);
    const timers = jurors.map((_, index) => setTimeout(() => setRevealed(index + 1), 420 + index * 470));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-14">
      <div className="mb-8 flex items-center justify-between"><button onClick={onBack} className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-paper"><ArrowLeft size={14} /> Back to answer</button><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Session 0048 / live</span></div>
      <ProgressRail screen="room" />
      <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><div className="mb-4 flex items-center gap-3"><span className="h-2 w-2 animate-pulse rounded-full bg-lime shadow-[0_0_15px_rgba(194,245,84,.8)]" /><span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-lime">The deliberation room</span></div><h1 className="font-display text-[clamp(2.9rem,6vw,5.7rem)] leading-[.92] tracking-[-0.07em] text-paper">Four reads.<br /><span className="text-muted">One answer.</span></h1></div>
        <div className="max-w-xs text-right"><p className="text-sm leading-6 text-muted">Each juror sees the same answer and asks a different question of it.</p><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/70">{Math.min(revealed, 4)} / 4 jurors seated</p></div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {jurors.map((juror, index) => <JurorCard key={juror.id} juror={juror} revealed={revealed > index} expanded={expanded === juror.id} onToggle={() => setExpanded(expanded === juror.id ? null : juror.id)} />)}
      </div>

      <div className={`mt-8 flex flex-col items-start justify-between gap-5 rounded-[24px] border border-white/9 bg-panel/60 p-5 transition-all duration-500 sm:flex-row sm:items-center sm:p-6 ${revealed === 4 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-40"}`}>
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime/10 text-lime"><Gavel size={18} /></span><div><p className="font-display text-lg text-paper">The room is ready to rule.</p><p className="mt-1 text-sm text-muted">A majority trusts the answer, with one material challenge.</p></div></div>
        <Button disabled={revealed < 4} onClick={onVerdict} className="h-11 rounded-xl bg-lime px-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink hover:bg-[#d4ff6f] disabled:bg-white/10 disabled:text-muted"><span>Read the verdict</span><ArrowRight size={15} /></Button>
      </div>
    </main>
  );
}

function VerdictScreen({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText("MIXED — The answer is accurate on the date and mechanism, but overstates the reason for the shift."); } catch { /* clipboard can be unavailable in preview */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-14">
      <div className="mb-8 flex items-center justify-between"><button onClick={onBack} className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-paper"><ArrowLeft size={14} /> Return to room</button><div className="flex items-center gap-2"><button onClick={handleCopy} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.15em] text-muted transition-colors hover:text-paper">{copied ? <Check size={12} className="text-lime" /> : <Copy size={12} />} {copied ? "Copied" : "Copy verdict"}</button><button className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:text-paper" aria-label="Share verdict"><Share2 size={13} /></button></div></div>
      <ProgressRail screen="verdict" />
      <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
        <section><div className="mb-6 flex items-center gap-3"><StatusPill tone="coral">Final ruling</StatusPill><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">4 jurors · 3 sources</span></div><div className="relative inline-block"><h1 className="font-display text-[clamp(4.5rem,11vw,10rem)] font-bold leading-[.82] tracking-[-0.1em] text-coral">MIXED</h1><span className="absolute -right-2 top-0 -rotate-6 rounded border border-coral/70 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-coral sm:-right-8">needs context</span></div><p className="mt-10 max-w-xl font-display text-[clamp(1.5rem,3vw,2.4rem)] leading-[1.12] tracking-[-0.04em] text-paper">The answer is right about <span className="text-lime">what changed</span> — but too certain about <span className="text-coral">why.</span></p><div className="mt-9 grid grid-cols-3 gap-2"><div className="rounded-2xl border border-white/8 bg-panel p-4"><span className="block font-mono text-[9px] uppercase tracking-[0.15em] text-muted">Trusted</span><strong className="mt-2 block font-display text-3xl text-lime">03</strong></div><div className="rounded-2xl border border-white/8 bg-panel p-4"><span className="block font-mono text-[9px] uppercase tracking-[0.15em] text-muted">Flagged</span><strong className="mt-2 block font-display text-3xl text-coral">01</strong></div><div className="rounded-2xl border border-white/8 bg-panel p-4"><span className="block font-mono text-[9px] uppercase tracking-[0.15em] text-muted">Sources</span><strong className="mt-2 block font-display text-3xl text-paper">03</strong></div></div></section>
        <section className="self-end"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">The disputed claim</p><p className="mt-1 text-sm text-paper">Where the answer drifted from its evidence</p></div><span className="rounded-full bg-coral/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-coral">1 challenge</span></div><div className="overflow-hidden rounded-[26px] border border-coral/25 bg-panel"><div className="grid md:grid-cols-2"><div className="border-b border-white/8 p-6 md:border-b-0 md:border-r"><div className="mb-5 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.17em] text-coral"><X size={13} /> Answer says</div><p className="font-display text-[21px] leading-[1.28] tracking-[-0.025em] text-paper">“This shift happened because researchers wanted a more efficient way to handle long-range relationships in language.”</p><div className="mt-7 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-coral" /> Unsupported causal leap</div></div><div className="bg-lime/[0.035] p-6"><div className="mb-5 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.17em] text-lime"><Check size={13} /> Source supports</div><p className="font-display text-[21px] leading-[1.28] tracking-[-0.025em] text-paper">“The architecture enabled parallel processing and improved the modeling of long-range dependencies.”</p><div className="mt-7 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-lime" /> Source 02 · Research archive</div></div></div><div className="flex flex-col gap-3 border-t border-white/8 bg-ink/45 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted"><Link2 size={13} className="text-sky" /> View source excerpt <ExternalLink size={11} /></div><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Similarity 68% · threshold 80%</span></div></div></section>
      </div>
      <div className="mt-10 flex flex-col justify-between gap-4 border-t border-white/8 pt-6 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-lime/10 text-lime"><Info size={14} /></div><p className="max-w-xl text-sm leading-6 text-muted">Verdicts are a transparent second read, not a replacement for judgment. The jury shows its work so you can make the call.</p></div><button onClick={onReset} className="inline-flex items-center gap-2 self-start rounded-xl border border-white/12 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-paper transition-colors hover:border-lime/50 hover:text-lime sm:self-auto"><RotateCcw size={14} /> Try another question</button></div>
    </main>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const figmaMode = new URLSearchParams(window.location.search).has("figma");
  const content = useMemo(() => {
    if (screen === "landing") return <LandingScreen onStart={() => setScreen("ask")} />;
    if (screen === "room") return <RoomScreen onVerdict={() => setScreen("verdict")} onBack={() => setScreen("ask")} />;
    if (screen === "verdict") return <VerdictScreen onBack={() => setScreen("room")} onReset={() => setScreen("ask")} />;
    return <AskScreen onOpenRoom={() => setScreen("room")} />;
  }, [screen]);
  return <div className={`min-h-screen overflow-x-hidden bg-ink text-paper ${figmaMode ? "figma-static" : ""}`}><div className="grain" /><Header screen={screen} onReset={() => setScreen("landing")} />{content}<footer className="mx-auto flex max-w-[1440px] items-center justify-between border-t border-white/8 px-5 py-6 sm:px-8 lg:px-12"><span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted/60">AI Jury / beta protocol</span><span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted/60">Built for better answers</span></footer></div>;
}
