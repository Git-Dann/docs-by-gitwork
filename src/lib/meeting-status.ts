import type { ScribeMeeting } from "@/lib/api";

/**
 * A meeting's notes state, in words someone can act on. A bare red "ERROR" read as Foundry being
 * broken, when it means Scribe found the call but couldn't read its notes (Wedge, Nov 2026).
 */
export function meetingStatusChip(status: ScribeMeeting["status"]): { label: string; cls: string; title: string; working?: boolean } {
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
        label: "Couldn't read",
        cls: "bg-amber-50 text-amber-700",
        title: "Scribe found the call but couldn't read or summarise its notes. Retry fetches them again.",
      };
    default:
      return { label: "No notes", cls: "bg-[var(--surface-1)] text-[var(--text-3)]", title: "No Gemini notes were saved for this call." };
  }
}
