/**
 * Dispatch's quick actions: the dev team's requests (Nov 2026) as one-click prompts.
 *
 * They are ordinary questions sent as the person's message, never added to the system prompt,
 * so the cached prefix stays the same for everyone. Which ones show depends on where Dispatch
 * was opened: anywhere, a client, or a task.
 */

export type SkillContext = "client" | "task";

export interface DispatchSkill {
  id: string;
  label: string;
  /** Where it's offered. A client skill also shows on a task (a task is in a client). */
  context: SkillContext;
  /** The question sent. Ends with ":" when the person adds something (pasted feedback). */
  prompt: string;
  /** True when it needs something pasted after it; the panel puts it in the box instead of sending. */
  needsInput?: boolean;
  /** Who asked for it (the team's list), for the record. */
  requestedBy?: string;
}

export const DISPATCH_SKILLS: readonly DispatchSkill[] = [
  { id: "this-week", label: "My tasks this week", context: "client", prompt: "What are my tasks on this client this week?", requestedBy: "Tahir" },
  { id: "next-week", label: "Next week", context: "client", prompt: "What's on my plate for this client next week?", requestedBy: "Tahir" },
  { id: "flagged", label: "Flagged", context: "client", prompt: "Which tasks on this client are flagged for follow-up, and why?", requestedBy: "Tahir" },
  { id: "standup", label: "Draft my stand-up", context: "client", prompt: "Draft my stand-up for this client from my tasks and the team's Slack channel: done, doing, blockers. Mention anything I've had in progress for too long.", requestedBy: "Ehtasham" },
  { id: "changed", label: "What's changed this week?", context: "client", prompt: "What's changed on this client in the last 7 days? Tasks, meetings, Slack." },
  { id: "pre-call", label: "Pre-call summary", context: "client", prompt: "I've got a call with the client soon. Summarise what we committed to last time, what's ready to demo, and the open questions or blockers that need their input.", requestedBy: "Shahbaz" },
  { id: "feedback", label: "Turn feedback into tickets", context: "client", prompt: "Here's client feedback. Check each point against existing tasks (duplicates, or already done), suggest who should pick each up by platform, and propose tickets for the new ones:\n\n", needsInput: true, requestedBy: "Nasir" },
  { id: "reply", label: "Help me reply to the client", context: "client", prompt: "Help me write a plain-English reply to the client about this:\n\n", needsInput: true },
  { id: "release-notes", label: "Release notes", context: "client", prompt: "Write client-friendly release notes for the latest release: what's new, what's fixed. Plain English.", requestedBy: "Fahad" },
  { id: "explain", label: "Explain in plain English", context: "task", prompt: "Explain this task in plain English: what it is, why it matters, and where it's up to." },
  { id: "subtasks", label: "Break into subtasks", context: "task", prompt: "Break this task into subtasks with acceptance criteria, dependencies, rough estimates and platforms. Flag missing information and questions to ask the client.", requestedBy: "Abdullah" },
  { id: "pr", label: "Write the PR description", context: "task", prompt: "Write a pull request description for this task: summary, what changed, how to test, and anything reviewers should know.", requestedBy: "Umer" },
  { id: "tests", label: "Test cases", context: "task", prompt: "Write test cases for this task: positive, negative and edge cases, with expected behaviour, using what was discussed in meetings and Slack.", requestedBy: "Arquam, Billal" },
  { id: "bug-report", label: "Draft a bug report", context: "task", prompt: "Help me write a clear bug report for this task: steps to reproduce, expected and actual behaviour.", requestedBy: "Arquam" },
];

export function skillsFor(context: SkillContext): DispatchSkill[] {
  return DISPATCH_SKILLS.filter((s) => (context === "task" ? true : s.context === "client"));
}
