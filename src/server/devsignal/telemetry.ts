/**
 * Process telemetry for the coding challenge. We score HOW a candidate works,
 * not just the artefact (Gitwork champions AI — paste/AI use is expected and NOT
 * penalised). These signals are captured for transparency + human review, and a
 * light "process" sub-score rewards iteration and running tests.
 */

export type TelemetryEventType = "keystroke" | "paste" | "run" | "focus" | "blur" | "edit";

export interface TelemetryEvent {
  /** ms since challenge start. */
  t: number;
  type: TelemetryEventType;
  /** Chars typed/pasted for keystroke/paste/edit events. */
  size?: number;
}

export interface TelemetrySummary {
  totalMs: number;
  keystrokes: number;
  typedChars: number;
  pasteCount: number;
  pastedChars: number;
  largestPasteChars: number;
  runCount: number;
  focusLossCount: number;
  timeToFirstEditMs: number | null;
  /** pastedChars / (typedChars + pastedChars), 0..1. Informational, not a penalty. */
  pasteRatio: number;
}

export function summarizeTelemetry(events: TelemetryEvent[]): TelemetrySummary {
  let keystrokes = 0;
  let typedChars = 0;
  let pasteCount = 0;
  let pastedChars = 0;
  let largestPasteChars = 0;
  let runCount = 0;
  let focusLossCount = 0;
  let timeToFirstEditMs: number | null = null;
  let totalMs = 0;

  for (const e of events) {
    if (e.t > totalMs) totalMs = e.t;
    if ((e.type === "keystroke" || e.type === "paste" || e.type === "edit") && timeToFirstEditMs === null) {
      timeToFirstEditMs = e.t;
    }
    switch (e.type) {
      case "keystroke":
        keystrokes += 1;
        typedChars += e.size ?? 1;
        break;
      case "edit":
        typedChars += e.size ?? 0;
        break;
      case "paste":
        pasteCount += 1;
        pastedChars += e.size ?? 0;
        if ((e.size ?? 0) > largestPasteChars) largestPasteChars = e.size ?? 0;
        break;
      case "run":
        runCount += 1;
        break;
      case "blur":
        focusLossCount += 1;
        break;
      default:
        break;
    }
  }

  const totalChars = typedChars + pastedChars;
  const pasteRatio = totalChars > 0 ? Math.round((pastedChars / totalChars) * 100) / 100 : 0;

  return {
    totalMs,
    keystrokes,
    typedChars,
    pasteCount,
    pastedChars,
    largestPasteChars,
    runCount,
    focusLossCount,
    timeToFirstEditMs,
    pasteRatio,
  };
}
