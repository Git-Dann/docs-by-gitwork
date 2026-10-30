"use client";

/**
 * The motion library, live (Settings → Labs). One entry per shared piece of motion: what it is
 * for, a working example, and the import. The written version is docs/motion.md; this is the
 * place to see each one move before you use it.
 *
 * Same popup shape as the badge studio: the catalogue on the left, the inspector on the right,
 * the import pinned at the foot so it's always in view.
 */

import { useState, type ReactNode } from "react";
import { ArrowPathIcon, CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AnimatedFileUpload } from "@/components/ui/easyui/animated-file-upload";
import { Spinner } from "@/components/ui/motion/spinner";
import { LoadingState } from "@/components/ui/motion/loading-state";
import { Skeleton, SkeletonCards, SkeletonRows } from "@/components/ui/motion/skeleton";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { FadeIn } from "@/components/ui/motion/fade-in";
import { useCountUp } from "@/components/ui/motion/use-count-up";
import { Lottie } from "@/components/ui/motion/lottie";
import { cn } from "@/lib/format";

interface MotionEntry {
  id: string;
  name: string;
  group: "Loading" | "Status" | "Entrances" | "Numbers" | "Feedback" | "Illustration";
  blurb: string;
  use: string;
  snippet: string;
  demo: () => ReactNode;
}

function Replay({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="app-button app-button-secondary app-button-sm">
      <ArrowPathIcon className="mr-1.5 h-3.5 w-3.5" />
      Replay
    </button>
  );
}

function FadeDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className="space-y-3">
      <FadeIn key={run} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
        <p className="text-[13px] text-[var(--text-2)]">Step two of the onboarding form.</p>
      </FadeIn>
      <Replay onClick={() => setRun((n) => n + 1)} />
    </div>
  );
}

function SheetDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className="space-y-3">
      <div className="relative h-40 overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]">
        <div key={`b${run}`} className="motion-backdrop-in absolute inset-0 bg-black/20" />
        <div key={`p${run}`} className="motion-sheet-right absolute inset-y-0 right-0 w-1/2 border-l border-[var(--border-2)] bg-[var(--surface-0)] p-3">
          <p className="widget-data-label text-[var(--text-4)]">Task</p>
          <Skeleton className="mt-2 h-3 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      </div>
      <Replay onClick={() => setRun((n) => n + 1)} />
    </div>
  );
}

function CountDemo() {
  const [target, setTarget] = useState<number>(87);
  const value = useCountUp(target);
  return (
    <div className="flex items-end gap-4">
      <p className="font-display text-[44px] leading-none tracking-[-0.02em] text-[var(--text-1)]">{value}</p>
      <Replay onClick={() => setTarget((t) => (t === 87 ? 64 : 87))} />
    </div>
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => toast.success("Saved", "The profile was updated.")}>Success</Button>
      <Button variant="secondary" size="sm" onClick={() => toast.error("Couldn't save", "Check the connection and try again.")}>Error</Button>
      <Button variant="secondary" size="sm" onClick={() => toast.undo("Request archived", () => undefined)}>Undo</Button>
    </div>
  );
}

function ButtonDemo() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="primary"
      size="sm"
      loading={busy}
      onClick={() => {
        setBusy(true);
        window.setTimeout(() => setBusy(false), 1600);
      }}
    >
      Save
    </Button>
  );
}

/** Pretends to upload: progress ticks to 100 and nothing leaves the browser. */
function fakeUpload(_file: unknown, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let p = 0;
    const t = window.setInterval(() => {
      p = Math.min(100, p + 12 + Math.random() * 18);
      onProgress(Math.round(p));
      if (p >= 100) {
        window.clearInterval(t);
        resolve();
      }
    }, 160);
  });
}

const ENTRIES: MotionEntry[] = [
  {
    id: "spinner",
    name: "Spinner",
    group: "Loading",
    blurb: "A ring with one edge missing. Every spinner in Foundry, including Button's, is this one.",
    use: "Something is happening right now and will finish soon: a save, a fetch on click.",
    snippet: `import { Spinner } from "@/components/ui/motion/spinner";\n\n<Spinner size="sm" tone="brand" />`,
    demo: () => (
      <div className="flex items-center gap-5">
        <Spinner size="xs" tone="muted" />
        <Spinner size="sm" tone="muted" />
        <Spinner size="md" tone="brand" />
        <Spinner size="lg" tone="brand" />
        <span className="inline-flex rounded-[6px] bg-[var(--brand-700)] p-2 text-white"><Spinner size="md" /></span>
      </div>
    ),
  },
  {
    id: "button-loading",
    name: "Button loading",
    group: "Loading",
    blurb: "Pass loading to a Button: it disables itself and swaps its icon for the spinner.",
    use: "Any button that starts a request. Never hand-roll a spinner inside a Button.",
    snippet: `<Button variant="primary" loading={save.isPending}>Save</Button>`,
    demo: () => <ButtonDemo />,
  },
  {
    id: "loading-state",
    name: "Loading state",
    group: "Loading",
    blurb: "The spinner and a line saying what's loading. A polite status, so it's read out once.",
    use: "A panel waiting on data whose shape you can't sensibly draw as a skeleton.",
    snippet: `import { LoadingState } from "@/components/ui/motion/loading-state";\n\n<LoadingState label="Loading checks…" variant="block" />`,
    demo: () => (
      <div className="space-y-3">
        <LoadingState label="Loading checks…" />
        <div className="rounded-[10px] border border-[var(--border-2)]"><LoadingState label="Loading the team…" variant="block" /></div>
      </div>
    ),
  },
  {
    id: "skeleton",
    name: "Skeletons",
    group: "Loading",
    blurb: "Grey shapes that hold a section's place, so the page doesn't jump when data lands.",
    use: "Lists, cards and widgets whose shape you know. Pick the preset nearest the real thing.",
    snippet: `import { Skeleton, SkeletonWidget, SkeletonBlock, SkeletonCards, SkeletonRows } from "@/components/ui/motion/skeleton";\n\n<SkeletonRows count={3} avatar />`,
    demo: () => (
      <div className="space-y-4">
        <SkeletonRows count={2} avatar />
        <SkeletonCards count={2} className="sm:grid-cols-2 lg:grid-cols-2" />
      </div>
    ),
  },
  {
    id: "status-dot",
    name: "Status dot",
    group: "Status",
    blurb: "A coloured dot. Pulse means working on it; ping means look at this, so keep pings rare.",
    use: "Beside a status word: a scan running, a monitor alerting, a study generating.",
    snippet: `import { StatusDot } from "@/components/ui/motion/status-dot";\n\n<StatusDot tone="warning" motion="pulse" size="xs" />`,
    demo: () => (
      <div className="flex flex-wrap items-center gap-5 text-[13px] text-[var(--text-3)]">
        <span className="inline-flex items-center gap-2"><StatusDot tone="success" /> Watching</span>
        <span className="inline-flex items-center gap-2"><StatusDot tone="info" motion="pulse" /> Running</span>
        <span className="inline-flex items-center gap-2"><StatusDot tone="warning" motion="pulse" /> Generating</span>
        <span className="inline-flex items-center gap-2"><StatusDot tone="danger" motion="ping" /> Alerting</span>
      </div>
    ),
  },
  {
    id: "fade-in",
    name: "Fade in",
    group: "Entrances",
    blurb: "Fades in and rises a few pixels. Key it on what changes to play it again.",
    use: "A wizard step, a tab's content, a result that has just arrived.",
    snippet: `import { FadeIn } from "@/components/ui/motion/fade-in";\n\n<FadeIn key={step}>…</FadeIn>`,
    demo: () => <FadeDemo />,
  },
  {
    id: "sheet",
    name: "Sheet entrance",
    group: "Entrances",
    blurb: "The backdrop fades and the panel slides in from its edge: from the right, or up on a phone.",
    use: "Side drawers and bottom sheets. Two classes, no component.",
    snippet: `{/* on the drawer's own backdrop and panel */}\n<div className="motion-backdrop-in …" />\n<aside className="motion-sheet-right …" />\n{/* a bottom sheet: motion-sheet-up */}`,
    demo: () => <SheetDemo />,
  },
  {
    id: "count-up",
    name: "Count up",
    group: "Numbers",
    blurb: "Counts a number up to its value, quick at first then settling. Reduced motion shows it at once.",
    use: "A score or a total that has just arrived. Not for figures already on screen.",
    snippet: `import { useCountUp } from "@/components/ui/motion/use-count-up";\n\nconst shown = useCountUp(score);`,
    demo: () => <CountDemo />,
  },
  {
    id: "toast",
    name: "Toasts",
    group: "Feedback",
    blurb: "Slide in at the corner, then go. Undo keeps the action reversible for a few seconds.",
    use: "Confirming something you just did. Never for something you have to read.",
    snippet: `import { useToast } from "@/components/ui/toast";\n\nconst toast = useToast();\ntoast.success("Saved");\ntoast.undo("Archived", () => restore());`,
    demo: () => <ToastDemo />,
  },
  {
    id: "file-upload",
    name: "Animated file upload",
    group: "Feedback",
    blurb: "Drop zone with per-file progress rows. This one pretends: nothing leaves your browser.",
    use: "Uploading files people will watch: HR documents, attachments.",
    snippet: `import { AnimatedFileUpload, uploadWithProgress } from "@/components/ui/easyui/animated-file-upload";\n\n<AnimatedFileUpload uploadHandler={(f, onProgress) => …} />`,
    demo: () => <AnimatedFileUpload variant="compact" multiple uploadHandler={fakeUpload} removeCompletedAfterMs={4000} />,
  },
  {
    id: "lottie",
    name: "Lottie",
    group: "Illustration",
    blurb: "Plays a Lottie file from public/motion. Paused off-screen, still when motion is reduced.",
    use: "Illustration with real motion in it. Recolour with color to sit on any ground.",
    snippet: `import { Lottie } from "@/components/ui/motion/lottie";\n\n<Lottie src="/motion/bat.json" color="#2B2550" className="h-16 w-16" />`,
    demo: () => (
      <div className="flex items-center gap-4 rounded-[10px] bg-[#0A0918] p-4">
        <Lottie src="/motion/bat.json" color="#2B2550" className="halloween-bat-glow h-20 w-20" />
        <Lottie src="/motion/bat.json" color="#B8B3D8" speed={1.3} className="h-14 w-14" />
        <p className="font-mono text-[11px] leading-relaxed text-[#B8B3D8]">bat.json, recoloured twice</p>
      </div>
    ),
  },
  {
    id: "spider",
    name: "Halloween spider",
    group: "Illustration",
    blurb: "Peeks from the top-right corner, dips on hover, drops on its thread when clicked.",
    use: "Halloween only, desktop only, in the header band's gutter. See halloween-spider.tsx.",
    snippet: `{/* Mounted by AppShell while the Halloween theme is on. */}\n<HalloweenSpiderSlot />`,
    demo: () => (
      <div className="flex items-start gap-4 rounded-[10px] bg-[#0A0918] p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/motion/spider.webp" alt="" width={30} height={62} className="block" />
        <p className="font-mono text-[11px] leading-relaxed text-[#B8B3D8]">
          Turn on the pumpkin theme and look top-right.
        </p>
      </div>
    ),
  },
];

const GROUPS = ["Loading", "Status", "Entrances", "Numbers", "Feedback", "Illustration"] as const;

export function MotionLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [id, setId] = useState(ENTRIES[0].id);
  const [copied, setCopied] = useState(false);
  const entry = ENTRIES.find((e) => e.id === id) ?? ENTRIES[0];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(entry.snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the snippet is still on screen to select */
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Motion library" panelClassName="w-full max-w-4xl">
      <div className="grid h-[min(78vh,680px)] grid-cols-1 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:divide-x sm:divide-[var(--border-2)]">
        <div className="max-h-44 overflow-y-auto border-b border-[var(--border-2)] p-2 [scrollbar-gutter:stable] sm:max-h-none sm:border-b-0">
          {GROUPS.map((group) => (
            <div key={group} className="mb-2">
              <p className="widget-data-label px-2 py-2 text-[var(--text-4)]">{group}</p>
              <ul className="space-y-0.5">
                {ENTRIES.filter((e) => e.group === group).map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setId(e.id);
                        setCopied(false);
                      }}
                      aria-current={e.id === entry.id ? "true" : undefined}
                      className={cn(
                        "flex w-full rounded-md border px-2 py-2 text-left text-[13px] font-medium transition-colors",
                        e.id === entry.id
                          ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
                          : "border-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                      )}
                    >
                      {e.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* `min-h-0`: without it the column grows to its content and pushes the pinned import out. */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 [scrollbar-gutter:stable]">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="widget-data-label text-[var(--text-4)]">{entry.group}</span>
              <h3 className="text-[15px] font-semibold text-[var(--text-1)]">{entry.name}</h3>
            </div>
            <p className="pt-1.5 text-[13px] leading-relaxed text-[var(--text-3)]">{entry.blurb}</p>
            <p className="pt-1.5 font-mono text-[11px] leading-relaxed text-[var(--text-4)]">Use for: {entry.use}</p>
            {/* Keyed so switching entries remounts the example and replays its entrance. */}
            <div key={entry.id} className="mt-4 rounded-[10px] border border-dashed border-[var(--border-2)] p-4">
              {entry.demo()}
            </div>
          </div>
          <div className="shrink-0 border-t border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3">
            <div className="flex items-start gap-2">
              <pre className="max-h-28 min-w-0 flex-1 overflow-auto rounded-md border border-[var(--border-2)] bg-[var(--surface-1)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--text-2)]">
                {entry.snippet}
              </pre>
              <button type="button" onClick={copy} className="app-button app-button-secondary app-button-sm shrink-0">
                {copied ? <CheckIcon className="mr-1.5 h-3.5 w-3.5 text-[var(--success-500)]" /> : <ClipboardDocumentIcon className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
