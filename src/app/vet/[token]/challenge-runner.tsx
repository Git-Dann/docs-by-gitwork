"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicChallengeDTO } from "@/types/devsignal";

interface TelemetryEvent {
  t: number;
  type: "keystroke" | "paste" | "run" | "focus" | "blur" | "edit";
  size?: number;
}

interface TestResult {
  name: string;
  hidden: boolean;
  passed: boolean;
  message?: string;
}

/**
 * Candidate coding challenge. Code runs in a sandboxed Web Worker IN THE
 * CANDIDATE'S BROWSER — never on Foundry infra. Process telemetry (keystrokes,
 * pastes, test runs, focus loss) is captured for transparency; AI/paste use is
 * expected and not penalised. On submit, the browser reports results + telemetry
 * and the server re-derives the score.
 */

// Sandboxed worker: defines the candidate's function, runs each test, compares
// via an order-stable canonical stringify. No network, no DOM access.
const WORKER_SRC = `
function canon(v){
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  var keys = Object.keys(v).sort();
  return '{' + keys.map(function(k){ return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
}
self.onmessage = function(e){
  var code = e.data.code, fnName = e.data.functionName, tests = e.data.tests || [];
  var fn;
  try { fn = (new Function(code + '\\n; return typeof ' + fnName + " === 'function' ? " + fnName + ' : undefined;'))(); }
  catch (err) { self.postMessage({ error: 'Compile error: ' + String(err) }); return; }
  if (typeof fn !== 'function') { self.postMessage({ error: 'Function ' + fnName + ' is not defined.' }); return; }
  var results = tests.map(function(t){
    try {
      var out = fn.apply(null, t.args);
      return { name: t.name, hidden: !!t.hidden, passed: canon(out) === canon(t.expected) };
    } catch (err) {
      return { name: t.name, hidden: !!t.hidden, passed: false, message: String(err) };
    }
  });
  self.postMessage({ results: results });
};
`;

export function ChallengeRunner({
  token,
  challenge,
  onDone,
}: {
  token: string;
  challenge: PublicChallengeDTO;
  onDone: () => void;
}) {
  const [code, setCode] = useState(challenge.starterCode);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(challenge.timeLimitSec);

  const telemetry = useRef<TelemetryEvent[]>([]);
  const startedAt = useRef<number>(Date.now());
  const gutterRef = useRef<HTMLDivElement>(null);

  const record = (type: TelemetryEvent["type"], size?: number) => {
    telemetry.current.push({ t: Date.now() - startedAt.current, type, size });
  };

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const timeLabel = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [secondsLeft]);

  const runTests = () => {
    record("run");
    setRunning(true);
    setError(null);
    let worker: Worker | null = null;
    const timeout = setTimeout(() => {
      worker?.terminate();
      setRunning(false);
      setError("Your code took too long to run (possible infinite loop). Check and try again.");
    }, 5000);

    try {
      const blob = new Blob([WORKER_SRC], { type: "application/javascript" });
      worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = (e: MessageEvent) => {
        clearTimeout(timeout);
        worker?.terminate();
        setRunning(false);
        if (e.data.error) {
          setError(e.data.error);
          setResults(null);
        } else {
          setResults(e.data.results as TestResult[]);
        }
      };
      worker.postMessage({ code, functionName: challenge.functionName, tests: challenge.tests });
    } catch (err) {
      clearTimeout(timeout);
      setRunning(false);
      setError(err instanceof Error ? err.message : "Could not start the runner.");
    }
  };

  const submit = async () => {
    setSubmitting(true);
    const testsPassed = results?.filter((r) => r.passed).length ?? 0;
    const timeTakenSec = Math.round((Date.now() - startedAt.current) / 1000);
    try {
      const res = await fetch(`/api/vet/${token}/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.id,
          code,
          testsPassed,
          testsTotal: challenge.testCount,
          timeTakenSec,
          telemetry: telemetry.current,
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      onDone();
    } catch {
      setError("Could not submit. Please try again.");
      setSubmitting(false);
    }
  };

  const passedCount = results?.filter((r) => r.passed).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wider text-[#6B6B6B]">
          {challenge.difficulty} · {challenge.language} · {challenge.testCount} tests
        </span>
        <span className="font-mono text-sm text-[#46464C]">⏱ {timeLabel}</span>
      </div>

      <div className="rounded-lg border border-[rgba(12,12,24,0.1)] bg-white p-4">
        <h3 className="mb-2 text-lg font-semibold text-[#1A1A1E]">{challenge.title}</h3>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#46464C]">
          {challenge.promptMarkdown}
        </pre>
        <div className="mt-3 space-y-1">
          {challenge.tests
            .filter((t) => !t.hidden)
            .map((t) => (
              <div key={t.name} className="font-mono text-xs text-[#6B6B6B]">
                {challenge.functionName}({JSON.stringify(t.args).slice(1, -1)}) → {JSON.stringify(t.expected)}
              </div>
            ))}
          {challenge.tests.some((t) => t.hidden) && (
            <div className="font-mono text-xs text-[#9a978f]">
              + {challenge.tests.filter((t) => t.hidden).length} hidden tests
            </div>
          )}
        </div>
      </div>

      <div className="flex h-72 overflow-hidden rounded-lg border border-[rgba(255,255,255,0.12)] bg-[#0C0C18] font-mono text-sm focus-within:border-[#6B52FF]">
        <div
          ref={gutterRef}
          aria-hidden
          className="select-none overflow-hidden bg-white/[0.03] px-2.5 py-4 text-right text-[#6B6B6B]"
        >
          {Array.from({ length: code.split("\n").length }, (_, i) => (
            <div key={i} className="leading-6">{i + 1}</div>
          ))}
        </div>
        <textarea
          value={code}
          spellCheck={false}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onChange={(e) => {
            setCode(e.target.value);
            record("edit", Math.abs(e.target.value.length - code.length));
          }}
          onKeyDown={(e) => {
            if (e.key.length === 1) record("keystroke", 1);
            if (e.key === "Tab") {
              e.preventDefault();
              const ta = e.currentTarget;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;
              const nextValue = code.slice(0, start) + "  " + code.slice(end);
              setCode(nextValue);
              record("edit", 2);
              requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + 2;
              });
            }
          }}
          onPaste={(e) => record("paste", e.clipboardData.getData("text").length)}
          onFocus={() => record("focus")}
          onBlur={() => record("blur")}
          className="flex-1 resize-none bg-transparent p-4 leading-6 text-neutral-100 focus:outline-none"
        />
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {results && (
        <div className="rounded-lg border border-[rgba(12,12,24,0.1)] bg-white p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-wider text-[#6B6B6B]">
            {passedCount}/{results.length} passing
          </p>
          <div className="space-y-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={r.passed ? "text-[#3f8f5b]" : "text-[#d14343]"}>{r.passed ? "✓" : "✗"}</span>
                <span className="text-[#46464C]">{r.hidden ? `Hidden test ${i + 1}` : r.name}</span>
                {r.message && <span className="font-mono text-xs text-[#9a978f]">{r.message}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={runTests}
          disabled={running}
          className="rounded-md border border-[rgba(12,12,24,0.16)] bg-white px-4 py-2 text-sm font-medium text-[#46464C] hover:bg-[#FBFAF7] disabled:opacity-50"
        >
          {running ? "Running…" : "Run tests"}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || results === null}
          className="rounded-md bg-[#6B52FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a43e6] disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit solution"}
        </button>
        <span className="text-xs text-[#9a978f]">Run your tests before submitting.</span>
      </div>
    </div>
  );
}
