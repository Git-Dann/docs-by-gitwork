import type { ScribeMeeting } from "@/lib/api";

/**
 * A meeting's notes state, in words someone can act on. ERROR is only ever set after the notes
 * were read and stored (src/server/meetings.ts summariseMeeting): it means the AI summary failed,
 * not that Drive couldn't be read, so it says "Summary failed" and gives the stored reason.
 * (It said "Couldn't read" until Nov 2026, which sent people looking at Drive.)
 */
export function meetingStatusChip(
  status: ScribeMeeting["status"],
  reason?: string | null,
): { label: string; cls: string; title: string; working?: boolean } {
  switch (status) {
    case "SUMMARISED":
      return { label: "Ready", cls: "bg-emerald-50 text-emerald-700", title: "Notes are summarised and ready to read." };
    case "TRANSCRIBED":
      return { label: "Summarising", cls: "bg-amber-50 text-amber-700", title: "Notes found; the summary is being written.", working: true };
    case "AWAITING_TRANSCRIPT":
      return {
        label: "Not ready yet",
        cls: "bg-[var(--surface-1)] text-[var(--text-3)]",
        title: "Google Meet hasn't saved the notes yet. They usually appear a few minutes after the call.",
      };
    case "ERROR":
      return {
        label: "Summary failed",
        cls: "bg-amber-50 text-amber-700",
        title: `${reason?.trim() || "The notes were read, but the AI summary couldn't be written."} Retry summarises the saved notes again; Scribe also retries on its own.`,
      };
    default:
      return { label: "No notes", cls: "bg-[var(--surface-1)] text-[var(--text-3)]", title: "No Gemini notes were saved for this call." };
  }
}
