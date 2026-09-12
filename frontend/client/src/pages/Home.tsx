import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
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
  Loader2,
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
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AskResponse,
  checkBackendHealth,
  HealthResponse,
  JuryUnavailableResponse,
  JurorResult,
  SourceChunk,
  uploadDocument,
  askQuestion,
  ApiError,
} from "@/lib/api";

type Screen = "landing" | "ask" | "room" | "verdict";
type Accent = "lime" | "coral" | "blue" | "violet";

interface JurorVisualMeta {
  id: string;
  name: string;
  role: string;
  accent: Accent;
  icon: typeof Search;
  glyph: string;
}

const JUROR_METAS: Record<string, JurorVisualMeta> = {
  Literalist: {
    id: "literalist",
    name: "The Literalist",
    role: "Traceability",
    accent: "lime",
    icon: Search,
    glyph: "L",
  },
  Skeptic: {
    id: "skeptic",
    name: "The Skeptic",
    role: "Adversarial read",
    accent: "coral",
    icon: CircleHelp,
    glyph: "S",
  },
  "Domain Expert": {
    id: "expert",
    name: "The Domain Expert",
    role: "Field nuance",
    accent: "blue",
    icon: Scale,
    glyph: "D",
  },
  "Context Judge": {
    id: "context",
    name: "The Context Judge",
    role: "Question fit",
    accent: "violet",
    icon: Target,
    glyph: "C",
  },
};

interface MappedJuror {
  id: string;
  name: string;
  role: string;
  accent: Accent;
  icon: typeof Search;
  glyph: string;
  verdict: "TRUSTED" | "FLAGGED" | "UNCERTAIN";
  confidence: number;
  short: string;
  long: string;
  evidenceLabel: string;
  evidence: string;
  source: string;
  disputedClaim: string | null;
  evidenceChunkId: string | null;
}

function mapJuror(juror: JurorResult, index: number, sources: SourceChunk[]): MappedJuror {
  const meta = JUROR_METAS[juror.name] || {
    id: `juror-${index}`,
    name: juror.name,
    role: "Independent Juror",
    accent: (index % 2 === 0 ? "blue" : "lime") as Accent,
    icon: Scale,
    glyph: juror.name.charAt(0) || "J",
  };

  const verdict =
    juror.verdict === "trust"
      ? "TRUSTED"
      : juror.verdict === "flag"
      ? "FLAGGED"
      : "UNCERTAIN";

  const reasoningFirstSentence = juror.reasoning
    ? juror.reasoning.split(". ")[0].trim() + (juror.reasoning.includes(". ") ? "." : "")
    : "Evaluated against document evidence.";

  const short = reasoningFirstSentence.length > 90
    ? reasoningFirstSentence.slice(0, 87) + "..."
    : reasoningFirstSentence;

  const matchingChunk = juror.evidenceChunkId
    ? sources.find((s) => s.id === juror.evidenceChunkId)
    : undefined;

  const evidenceText = juror.disputedClaim
    ? `“${juror.disputedClaim}”`
    : matchingChunk
    ? `“${matchingChunk.text.slice(0, 140)}${matchingChunk.text.length > 140 ? "..." : ""}”`
    : `“${juror.reasoning}”`;

  const sourceText = juror.evidenceChunkId
    ? `Source chunk · ${juror.evidenceChunkId}`
    : "Document evidence";

  const evidenceLabel =
    verdict === "FLAGGED" ? `DRIFT 0${index + 1}` : `MATCH 0${index + 1}`;

  return {
    ...meta,
    verdict,
    confidence: juror.confidence ?? 80,
    short,
    long: juror.reasoning,
    evidenceLabel,
    evidence: evidenceText,
    source: sourceText,
    disputedClaim: juror.disputedClaim,
    evidenceChunkId: juror.evidenceChunkId,
  };
}

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

function fileLabel(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "DOC";
  return "TXT";
}

function Header({
  screen,
  health,
  onReset,
}: {
  screen: Screen;
  health: HealthResponse | null;
  onReset: () => void;
}) {
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
              onClick={() => (key === "landing" || key === "ask" ? onReset() : undefined)}
              className={`group flex items-center gap-2 rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                screen === key ? "bg-white/8 text-paper" : "text-muted hover:text-paper"
              }`}
            >
              <span className={screen === key ? "text-lime" : "text-muted/70"}>{num}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {health ? (
            health.evaluationMode === "MOCK" ? (
              <span
                className="hidden items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-300 sm:flex"
                title="Evaluation using deterministic offline mock rules (MOCK_ANTHROPIC=true)"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                Mock mode
              </span>
            ) : (
              <span
                className="hidden items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-lime sm:flex"
                title="Live Anthropic Claude LLM jurors active"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
                Live Claude
              </span>
            )
          ) : (
            <span className="hidden items-center gap-2 rounded-full border border-white/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-muted/50" />
              Connecting...
            </span>
          )}
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
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[10px] font-bold ${
                  active ? "border-lime bg-lime text-ink" : done ? "border-lime/45 bg-lime/10 text-lime" : "border-white/12"
                }`}
              >
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
            <div className="mt-12 flex gap-8 font-mono text-[10px] uppercase tracking-[.16em] text-muted/70"><span><strong className="text-lime">04</strong> jurors</span><span><strong className="text-paper">01</strong> answer</span><span><strong className="text-paper">&#8734;</strong> evidence</span></div>
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

function AnswerPanel({
  askResponse,
  onOpenRoom,
}: {
  askResponse: AskResponse;
  onOpenRoom: () => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const wordCount = useMemo(() => {
    return askResponse.answer.trim().split(/\s+/).filter(Boolean).length;
  }, [askResponse.answer]);

  const verdictTone: Accent =
    askResponse.overallVerdict === "TRUSTED"
      ? "lime"
      : askResponse.overallVerdict === "FLAGGED"
      ? "coral"
      : "coral";

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusPill tone={verdictTone}>Verdict: {askResponse.overallVerdict}</StatusPill>
          <span className="font-mono text-[10px] text-muted/80">
            {wordCount} words · {askResponse.sources.length} source{askResponse.sources.length === 1 ? "" : "s"}
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted/60">
          Mode: {askResponse.evaluationMode}
        </span>
      </div>

      <article className="relative overflow-hidden rounded-[28px] border border-white/10 bg-panel p-6 shadow-[0_24px_70px_rgba(0,0,0,.22)] sm:p-8">
        <div className="absolute right-0 top-0 h-36 w-36 translate-x-1/3 -translate-y-1/3 rounded-full bg-lime/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Document Grounded Answer</p>
          <p className="font-display text-[22px] leading-[1.35] tracking-[-0.025em] text-paper sm:text-[28px]">
            {askResponse.answer}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/8 pt-5">
            <button
              onClick={() => setShowSources((prev) => !prev)}
              className="group inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted transition-colors hover:text-paper"
            >
              <Link2 size={13} className="text-sky" /> {askResponse.sources.length} source{askResponse.sources.length === 1 ? "" : "s"}
              <ChevronDown
                size={12}
                className={`transition-transform ${showSources ? "rotate-180" : ""}`}
              />
            </button>
            <span className="text-white/15">•</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
              {askResponse.jurorsEvaluated} of {askResponse.expectedJurors} Jurors Evaluated
            </span>
          </div>

          {showSources && (
            <div className="mt-4 space-y-2 border-t border-white/8 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Retrieved Evidence Chunks</p>
              {askResponse.sources.map((src, i) => (
                <div key={src.id || i} className="rounded-xl border border-white/6 bg-ink/40 p-3 text-xs leading-5 text-paper/85">
                  <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-lime">
                    {src.id || `CHUNK ${i + 1}`}
                  </span>
                  {src.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </article>

      <button
        onClick={onOpenRoom}
        className="group mt-4 flex w-full items-center justify-between rounded-2xl border border-lime/25 bg-lime/[0.07] px-4 py-4 text-left transition-all hover:border-lime/60 hover:bg-lime/10 sm:px-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-ink shadow-[0_0_24px_rgba(194,245,84,.22)]">
            <Sparkles size={16} />
          </span>
          <div>
            <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
              AI Jury Deliberation Room
            </span>
            <span className="mt-1 block text-sm text-paper">{askResponse.summaryReason}</span>
          </div>
        </div>
        <ArrowRight size={17} className="text-lime transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  );
}

interface AttachedDoc {
  file: File;
  documentId: string;
  fileName: string;
  chunkCount: number;
}

function AskScreen({
  document,
  setDocument,
  isUploading,
  onUploadFile,
  question,
  setQuestion,
  isAsking,
  onAskQuestion,
  askResponse,
  juryUnavailableData,
  onOpenRoom,
}: {
  document: AttachedDoc | null;
  setDocument: (doc: AttachedDoc | null) => void;
  isUploading: boolean;
  onUploadFile: (file: File) => Promise<void>;
  question: string;
  setQuestion: (q: string) => void;
  isAsking: boolean;
  onAskQuestion: () => Promise<void>;
  askResponse: AskResponse | null;
  juryUnavailableData: JuryUnavailableResponse | null;
  onOpenRoom: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handleFileDrop = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    onUploadFile(file);
  };

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-16">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-16">
        <section>
          <ProgressRail screen="ask" />
          <div className="mb-10 max-w-3xl">
            <div className="mb-5 flex items-center gap-3">
              <StatusPill>Document Mode</StatusPill>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Evidence-based answer tribunal</span>
            </div>
            <h1 className="font-display text-[clamp(3.2rem,7vw,6.8rem)] font-medium leading-[.91] tracking-[-0.07em] text-paper">
              Ask the<br /><span className="text-lime">jury.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-muted sm:text-lg">
              One document. Four independent perspectives. A transparent verdict you can inspect.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onAskQuestion();
            }}
            className="mb-10"
          >
            <div
              className={`rounded-[26px] border bg-panel p-2 shadow-[0_22px_70px_rgba(0,0,0,.18)] transition-all duration-300 ${
                dragging ? "border-lime bg-lime/[0.06] shadow-[0_0_35px_rgba(194,245,84,.12)]" : "border-white/12 focus-within:border-lime/50"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleFileDrop(event.dataTransfer.files);
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-3 px-4 pt-2 sm:px-5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  <FileText size={13} className="text-lime" /> Attached Evidence
                  <span className="text-muted/50">{document ? "1 file loaded" : "0 loaded"}</span>
                </div>
                <label className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-muted transition-colors hover:border-lime/50 hover:text-lime">
                  {isUploading ? <Loader2 size={12} className="animate-spin text-lime" /> : <FileUp size={12} />}
                  {isUploading ? "Uploading..." : document ? "Replace file" : "Add file"}
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    disabled={isUploading || isAsking}
                    className="sr-only"
                    onChange={(event) => {
                      if (event.target.files) handleFileDrop(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 px-4 py-2 sm:px-5">
                  <label htmlFor="question" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                    Your question
                  </label>
                  <textarea
                    id="question"
                    value={question}
                    disabled={isAsking}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={2}
                    className="w-full resize-none border-0 bg-transparent p-0 font-display text-lg leading-7 tracking-[-0.02em] text-paper outline-none placeholder:text-muted/50"
                    placeholder="What should the jury cross-examine against your document?"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isAsking || isUploading || !document || question.trim().length < 3}
                  className="h-12 rounded-[18px] bg-lime px-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink hover:bg-[#d4ff6f] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-muted sm:w-auto"
                >
                  {isAsking ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Deliberating...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Ask the jury
                    </>
                  )}
                </Button>
              </div>

              {isUploading ? (
                <div className="flex items-center gap-2 px-4 pb-3 pt-2 text-lime font-mono text-[10px] uppercase tracking-[.14em]">
                  <Loader2 size={13} className="animate-spin" />
                  Extracting text and chunking document...
                </div>
              ) : document ? (
                <div className="document-preview-grid px-4 pb-3 pt-2 sm:px-5">
                  <div className="document-preview group">
                    <div className="document-thumb">
                      <FileText size={20} />
                      <span>{fileLabel(document.fileName)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-paper">{document.fileName}</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[.1em] text-muted">
                        {formatBytes(document.file.size)} · <span className="text-lime">Ready · {document.chunkCount} chunks</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isAsking}
                      onClick={() => setDocument(null)}
                      className="rounded-full p-1 text-muted transition-colors hover:bg-white/10 hover:text-paper"
                      aria-label="Remove document"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 pb-2 pt-1 font-mono text-[9px] uppercase tracking-[0.13em] text-muted/60 sm:px-5">
                  <UploadCloud size={12} /> Drop PDF, DOCX, or TXT here to ground the jury
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted/65">
              <Info size={12} className="text-lime" /> The jury cross-examines the answer strictly against document evidence.
            </div>
          </form>

          {juryUnavailableData && (
            <div className="mb-6 rounded-[22px] border border-coral/30 bg-coral/10 p-6 animate-fade-up">
              <div className="flex items-center gap-2 text-coral mb-2">
                <AlertTriangle size={18} />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
                  HTTP 503 · Jury Unavailable
                </span>
              </div>
              <p className="text-sm font-semibold text-paper">{juryUnavailableData.message}</p>
              <p className="mt-1 text-xs text-muted font-mono">{juryUnavailableData.summaryReason}</p>
            </div>
          )}

          {askResponse && !isAsking && (
            <AnswerPanel askResponse={askResponse} onOpenRoom={onOpenRoom} />
          )}
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-28 rounded-[28px] border border-white/9 bg-panel/70 p-6">
            <div className="mb-9 flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper">How it works</span>
              <ShieldCheck size={16} className="text-lime" />
            </div>
            <div className="space-y-7">
              {[
                ["01", "Ground", "Upload your document. It is parsed into indexed evidence chunks."],
                ["02", "Cross-examine", "Four independent jurors evaluate the generated answer in parallel."],
                ["03", "Stamp", "The final verdict exposes omissions, contradictions, or overclaims."],
              ].map(([num, title, text], index) => (
                <div key={num} className="relative flex gap-4">
                  {index < 2 && <div className="absolute left-[13px] top-8 h-12 border-l border-dashed border-white/15" />}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-lime/40 bg-lime/10 font-mono text-[10px] text-lime">
                    {num}
                  </span>
                  <div className="pt-0.5">
                    <h3 className="font-display text-lg text-paper">{title}</h3>
                    <p className="mt-1 text-[13px] leading-5 text-muted">{text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-10 rounded-2xl border border-white/8 bg-ink/50 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Current protocol</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-paper">Document-Grounding v2.4</span>
                <span className="font-mono text-[10px] text-lime">ONLINE</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function JurorCard({
  juror,
  revealed,
  expanded,
  onToggle,
}: {
  juror: MappedJuror;
  revealed: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const styles = accentClasses(juror.accent);
  const Icon = juror.icon;

  return (
    <button
      onClick={onToggle}
      disabled={!revealed}
      className={`group w-full text-left transition-all duration-500 ${
        revealed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <div
        className={`juror-card overflow-hidden rounded-[23px] border bg-panel transition-all duration-300 ${
          expanded
            ? `${styles.border} shadow-[0_18px_50px_rgba(0,0,0,.22)]`
            : "border-white/9 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_18px_44px_rgba(0,0,0,.28)]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`juror-icon relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${styles.soft} ${styles.border} ${styles.text}`}>
              <Icon size={19} strokeWidth={1.8} />
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-panel bg-ink font-mono text-[8px] font-bold text-paper">
                {juror.glyph}
              </span>
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-display text-[17px] tracking-[-0.02em] text-paper">{juror.name}</h3>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">{juror.role}</p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 font-mono text-[9px] font-bold tracking-[0.14em] ${
              juror.verdict === "FLAGGED"
                ? "bg-coral/12 text-coral"
                : juror.verdict === "TRUSTED"
                ? "bg-lime/12 text-lime"
                : "bg-white/10 text-muted"
            }`}
          >
            {juror.verdict}
          </span>
        </div>

        <div className="px-5 pb-5">
          <div className="mb-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.15em] text-muted">
            <span>Confidence</span>
            <span className={styles.text}>{juror.confidence}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/8">
            <div
              className={`h-full rounded-full ${styles.bar} transition-all duration-700`}
              style={{ width: `${juror.confidence}%` }}
            />
          </div>
          <p className="mt-4 min-h-[40px] text-[13px] leading-5 text-paper/75 transition-colors duration-300 group-hover:text-paper">
            {juror.short}
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3 font-mono text-[9px] uppercase tracking-[0.15em] text-muted">
            <span>{expanded ? "Close reasoning" : "Open reasoning"}</span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        <div
          className={`grid transition-[grid-template-rows] duration-300 ${
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-t border-white/8 bg-ink/40 p-5">
              <p className="text-[13px] leading-6 text-paper/80">{juror.long}</p>
              <div className={`mt-4 rounded-xl border p-3 ${styles.soft} ${styles.border}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-[9px] font-bold tracking-[0.16em] ${styles.text}`}>
                    {juror.evidenceLabel}
                  </span>
                  <ExternalLink size={12} className="text-muted" />
                </div>
                <p className="mt-2 font-display text-[15px] leading-5 text-paper">{juror.evidence}</p>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{juror.source}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function RoomScreen({
  askResponse,
  onVerdict,
  onBack,
}: {
  askResponse: AskResponse;
  onVerdict: () => void;
  onBack: () => void;
}) {
  const [revealed, setRevealed] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const mappedJurors = useMemo(() => {
    return askResponse.jurors.map((j, i) => mapJuror(j, i, askResponse.sources));
  }, [askResponse]);

  useEffect(() => {
    setRevealed(0);
    const timers = mappedJurors.map((_, index) =>
      setTimeout(() => setRevealed(index + 1), 320 + index * 380)
    );
    return () => timers.forEach(clearTimeout);
  }, [mappedJurors]);

  const allRevealed = revealed >= mappedJurors.length;

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-14">
      <div className="mb-8 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-paper"
        >
          <ArrowLeft size={14} /> Back to answer
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Jury Status: {askResponse.juryStatus}
        </span>
      </div>

      <ProgressRail screen="room" />

      <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-2 w-2 animate-pulse rounded-full bg-lime shadow-[0_0_15px_rgba(194,245,84,.8)]" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-lime">
              The deliberation room
            </span>
            {askResponse.juryStatus === "PARTIAL_JURY" && (
              <StatusPill tone="coral">PARTIAL JURY ({askResponse.availableJurors}/{askResponse.expectedJurors})</StatusPill>
            )}
          </div>
          <h1 className="font-display text-[clamp(2.9rem,6vw,5.7rem)] leading-[.92] tracking-[-0.07em] text-paper">
            {mappedJurors.length} reads.<br />
            <span className="text-muted">One answer.</span>
          </h1>
        </div>
        <div className="max-w-xs text-right">
          <p className="text-sm leading-6 text-muted">
            Each juror evaluates the answer independently against document evidence.
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/70">
            {Math.min(revealed, mappedJurors.length)} / {mappedJurors.length} jurors seated
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {mappedJurors.map((juror, index) => (
          <JurorCard
            key={juror.id}
            juror={juror}
            revealed={revealed > index}
            expanded={expanded === juror.id}
            onToggle={() => setExpanded(expanded === juror.id ? null : juror.id)}
          />
        ))}
      </div>

      <div
        className={`mt-8 flex flex-col items-start justify-between gap-5 rounded-[24px] border border-white/9 bg-panel/60 p-5 transition-all duration-500 sm:flex-row sm:items-center sm:p-6 ${
          allRevealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-40"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime/10 text-lime">
            <Gavel size={18} />
          </span>
          <div>
            <p className="font-display text-lg text-paper">
              {askResponse.overallVerdict === "TRUSTED"
                ? "The jury reached a consensus to trust."
                : askResponse.overallVerdict === "FLAGGED"
                ? "The jury flagged concerns about this answer."
                : "The jury reached a mixed or divided verdict."}
            </p>
            <p className="mt-1 text-sm text-muted">{askResponse.summaryReason}</p>
          </div>
        </div>
        <Button
          disabled={!allRevealed}
          onClick={onVerdict}
          className="h-11 rounded-xl bg-lime px-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink hover:bg-[#d4ff6f] disabled:bg-white/10 disabled:text-muted"
        >
          <span>Read the verdict</span>
          <ArrowRight size={15} />
        </Button>
      </div>
    </main>
  );
}

function VerdictScreen({
  askResponse,
  onBack,
  onReset,
}: {
  askResponse: AskResponse;
  onBack: () => void;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const trustCount = useMemo(() => {
    return askResponse.jurors.filter((j) => j.verdict === "trust").length;
  }, [askResponse]);

  const flagCount = useMemo(() => {
    return askResponse.jurors.filter((j) => j.verdict === "flag").length;
  }, [askResponse]);

  const firstFlagged = useMemo(() => {
    return askResponse.jurors.find((j) => j.verdict === "flag");
  }, [askResponse]);

  const handleCopy = async () => {
    const textToCopy = `${askResponse.overallVerdict} — ${askResponse.summaryReason}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      /* fallback if clipboard API unavailable */
    }
    setCopied(true);
    toast.success("Verdict copied to clipboard.");
    setTimeout(() => setCopied(false), 1800);
  };

  const isTrusted = askResponse.overallVerdict === "TRUSTED";
  const isFlagged = askResponse.overallVerdict === "FLAGGED";
  const tone: Accent = isTrusted ? "lime" : "coral";

  const citedSource = firstFlagged?.evidenceChunkId
    ? askResponse.sources.find((s) => s.id === firstFlagged.evidenceChunkId)
    : askResponse.sources[0];

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-14">
      <div className="mb-8 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-paper"
        >
          <ArrowLeft size={14} /> Return to room
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.15em] text-muted transition-colors hover:text-paper"
          >
            {copied ? <Check size={12} className="text-lime" /> : <Copy size={12} />}{" "}
            {copied ? "Copied" : "Copy verdict"}
          </button>
          <button
            onClick={handleCopy}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:text-paper"
            aria-label="Share verdict"
          >
            <Share2 size={13} />
          </button>
        </div>
      </div>

      <ProgressRail screen="verdict" />

      <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
        <section>
          <div className="mb-6 flex items-center gap-3">
            <StatusPill tone={tone}>Final ruling</StatusPill>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              {askResponse.jurorsEvaluated} jurors · {askResponse.sources.length} sources · {askResponse.evaluationMode}
            </span>
          </div>
          <div className="relative inline-block">
            <h1
              className={`font-display text-[clamp(4.5rem,11vw,10rem)] font-bold leading-[.82] tracking-[-0.1em] ${
                isTrusted ? "text-lime" : isFlagged ? "text-coral" : "text-amber-300"
              }`}
            >
              {askResponse.overallVerdict}
            </h1>
            <span
              className={`absolute -right-2 top-0 -rotate-6 rounded border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em] sm:-right-8 ${
                isTrusted
                  ? "border-lime/70 text-lime"
                  : isFlagged
                  ? "border-coral/70 text-coral"
                  : "border-amber-300/70 text-amber-300"
              }`}
            >
              {isTrusted ? "verified" : isFlagged ? "disputed" : "needs context"}
            </span>
          </div>

          <p className="mt-10 max-w-xl font-display text-[clamp(1.5rem,3vw,2.4rem)] leading-[1.12] tracking-[-0.04em] text-paper">
            {askResponse.summaryReason}
          </p>

          <div className="mt-9 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/8 bg-panel p-4">
              <span className="block font-mono text-[9px] uppercase tracking-[0.15em] text-muted">Trusted</span>
              <strong className="mt-2 block font-display text-3xl text-lime">
                {trustCount < 10 ? `0${trustCount}` : trustCount}
              </strong>
            </div>
            <div className="rounded-2xl border border-white/8 bg-panel p-4">
              <span className="block font-mono text-[9px] uppercase tracking-[0.15em] text-muted">Flagged</span>
              <strong className="mt-2 block font-display text-3xl text-coral">
                {flagCount < 10 ? `0${flagCount}` : flagCount}
              </strong>
            </div>
            <div className="rounded-2xl border border-white/8 bg-panel p-4">
              <span className="block font-mono text-[9px] uppercase tracking-[0.15em] text-muted">Sources</span>
              <strong className="mt-2 block font-display text-3xl text-paper">
                {askResponse.sources.length < 10
                  ? `0${askResponse.sources.length}`
                  : askResponse.sources.length}
              </strong>
            </div>
          </div>
        </section>

        <section className="self-end">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                {firstFlagged ? "The disputed claim" : "Evidence verification"}
              </p>
              <p className="mt-1 text-sm text-paper">
                {firstFlagged
                  ? `Flagged by ${firstFlagged.name}`
                  : "All claims verified against document evidence"}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em] ${
                firstFlagged ? "bg-coral/10 text-coral" : "bg-lime/10 text-lime"
              }`}
            >
              {firstFlagged ? "1 challenge" : "consensus"}
            </span>
          </div>

          <div
            className={`overflow-hidden rounded-[26px] border bg-panel ${
              firstFlagged ? "border-coral/25" : "border-lime/25"
            }`}
          >
            <div className="grid md:grid-cols-2">
              <div className="border-b border-white/8 p-6 md:border-b-0 md:border-r">
                <div
                  className={`mb-5 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.17em] ${
                    firstFlagged ? "text-coral" : "text-lime"
                  }`}
                >
                  {firstFlagged ? <X size={13} /> : <Check size={13} />} Answer statement
                </div>
                <p className="font-display text-[21px] leading-[1.28] tracking-[-0.025em] text-paper">
                  {firstFlagged?.disputedClaim
                    ? `“${firstFlagged.disputedClaim}”`
                    : `“${askResponse.answer.slice(0, 160)}${askResponse.answer.length > 160 ? "..." : ""}”`}
                </p>
                <div className="mt-7 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      firstFlagged ? "bg-coral" : "bg-lime"
                    }`}
                  />
                  {firstFlagged ? firstFlagged.reasoning.slice(0, 50) + "..." : "Supported by document"}
                </div>
              </div>

              <div className="bg-lime/[0.035] p-6">
                <div className="mb-5 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.17em] text-lime">
                  <Check size={13} /> Source evidence
                </div>
                <p className="font-display text-[21px] leading-[1.28] tracking-[-0.025em] text-paper">
                  {citedSource
                    ? `“${citedSource.text.slice(0, 160)}${citedSource.text.length > 160 ? "..." : ""}”`
                    : "“No conflicting statements found in uploaded document.”"}
                </p>
                <div className="mt-7 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                  {citedSource?.id ? `Source chunk · ${citedSource.id}` : "Uploaded document"}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/8 bg-ink/45 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                <Link2 size={13} className="text-sky" /> Protocol: Document Mode · {askResponse.evaluationMode}
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                {askResponse.jurorsEvaluated} of {askResponse.expectedJurors} Jurors Complete
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-10 flex flex-col justify-between gap-4 border-t border-white/8 pt-6 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-lime/10 text-lime">
            <Info size={14} />
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted">
            Verdicts are an evidence-grounded second read, not a replacement for judgment. The jury shows its work so you can make the call.
          </p>
        </div>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-white/12 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-paper transition-colors hover:border-lime/50 hover:text-lime sm:self-auto"
        >
          <RotateCcw size={14} /> Ask another question
        </button>
      </div>
    </main>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Application state
  const [document, setDocument] = useState<AttachedDoc | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [askResponse, setAskResponse] = useState<AskResponse | null>(null);
  const [juryUnavailableData, setJuryUnavailableData] = useState<JuryUnavailableResponse | null>(null);

  // Check health on mount
  useEffect(() => {
    checkBackendHealth()
      .then((res) => setHealth(res))
      .catch((err) => {
        console.warn("Backend health check failed:", err.message);
      });
  }, []);

  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    setJuryUnavailableData(null);
    try {
      const res = await uploadDocument(file);
      setDocument({
        file,
        documentId: res.documentId,
        fileName: res.fileName,
        chunkCount: res.chunkCount,
      });
      toast.success(`Document uploaded: ${res.fileName} (${res.chunkCount} chunks)`);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!document) {
      toast.error("Please upload a document before asking the jury.");
      return;
    }
    if (question.trim().length < 3) {
      toast.error("Please enter a question with at least 3 characters.");
      return;
    }

    setIsAsking(true);
    setJuryUnavailableData(null);

    try {
      const res = await askQuestion(document.documentId, question);
      setAskResponse(res);
      toast.success(`Verdict reached: ${res.overallVerdict}`);
    } catch (err: any) {
      if (err instanceof ApiError && err.code === "JURY_UNAVAILABLE" && err.juryData) {
        setJuryUnavailableData(err.juryData);
        toast.error("Jury unavailable: all jurors failed.");
      } else {
        toast.error(err.message || "Failed to get answer from jury.");
      }
    } finally {
      setIsAsking(false);
    }
  };

  const content = useMemo(() => {
    if (screen === "landing") {
      return <LandingScreen onStart={() => setScreen("ask")} />;
    }
    if (screen === "room" && askResponse) {
      return (
        <RoomScreen
          askResponse={askResponse}
          onVerdict={() => setScreen("verdict")}
          onBack={() => setScreen("ask")}
        />
      );
    }
    if (screen === "verdict" && askResponse) {
      return (
        <VerdictScreen
          askResponse={askResponse}
          onBack={() => setScreen("room")}
          onReset={() => {
            setQuestion("");
            setAskResponse(null);
            setScreen("ask");
          }}
        />
      );
    }
    return (
      <AskScreen
        document={document}
        setDocument={setDocument}
        isUploading={isUploading}
        onUploadFile={handleUploadFile}
        question={question}
        setQuestion={setQuestion}
        isAsking={isAsking}
        onAskQuestion={handleAskQuestion}
        askResponse={askResponse}
        juryUnavailableData={juryUnavailableData}
        onOpenRoom={() => setScreen("room")}
      />
    );
  }, [
    screen,
    document,
    isUploading,
    question,
    isAsking,
    askResponse,
    juryUnavailableData,
  ]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-ink text-paper">
      <div className="grain" />
      <Header
        screen={screen}
        health={health}
        onReset={() => {
          setScreen("landing");
        }}
      />
      {content}
      <footer className="mx-auto flex max-w-[1440px] items-center justify-between border-t border-white/8 px-5 py-6 sm:px-8 lg:px-12">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted/60">
          AI Jury / Document Protocol
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted/60">
          Evidence-grounded answer verification
        </span>
      </footer>
    </div>
  );
}
