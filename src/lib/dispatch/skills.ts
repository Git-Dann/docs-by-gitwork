/**
 * Dispatch's quick actions: the dev team's requests (Nov 2026) as one-click prompts.
 *
 * They are ordinary questions sent as the person's message, never added to the system prompt,
 * so the cached prefix stays the same for everyone. Which ones show depends on where Dispatch
 * was opened: anywhere, a client, or a task.
 */

export type SkillContext = "client" | "task";

/** How the panel groups them under "More": finding out, writing something, checking work. */
export type SkillGroup = "plan" | "write" | "check";

export const SKILL_GROUP_LABELS: Record<SkillGroup, string> = { plan: "Find out", write: "Write", check: "Check" };

export interface DispatchSkill {
  id: string;
  label: string;
  /** Where it's offered. A client skill also shows on a task (a task is in a client). */
  context: SkillContext;
  group: SkillGroup;
  /** The question sent. Ends with ":" when the person adds something (pasted feedback). */
  prompt: string;
  /** True when it needs something pasted after it; the panel puts it in the box instead of sending. */
  needsInput?: boolean;
  /** Who asked for it (the team's list), for the record. */
  requestedBy?: string;
}

export const DISPATCH_SKILLS: readonly DispatchSkill[] = [
  { id: "this-week", label: "My tasks this week", context: "client", group: "plan", prompt: "What are my tasks on this client this week?", requestedBy: "Tahir" },
  { id: "next-week", label: "Next week", context: "client", group: "plan", prompt: "What's on my plate for this client next week?", requestedBy: "Tahir" },
  { id: "flagged", label: "Flagged", context: "client", group: "plan", prompt: "Which tasks on this client are flagged for follow-up, and why?", requestedBy: "Tahir" },
  { id: "standup", label: "Draft my stand-up", context: "client", group: "write", prompt: "Draft my stand-up for this client from my tasks and the team's Slack channel: done, doing, blockers. Mention anything I've had in progress for too long.", requestedBy: "Ehtasham" },
  { id: "changed", label: "What's changed this week?", context: "client", group: "plan", prompt: "What's changed on this client in the last 7 days? Tasks, meetings, Slack." },
  { id: "pre-call", label: "Pre-call summary", context: "client", group: "plan", prompt: "I've got a call with the client soon. Summarise what we committed to last time, what's ready to demo, and the open questions or blockers that need their input.", requestedBy: "Shahbaz" },
  { id: "feedback", label: "Turn feedback into tickets", context: "client", group: "write", prompt: "Here's client feedback. Check each point against existing tasks (duplicates, or already done), suggest who should pick each up by platform, and propose tickets for the new ones:\n\n", needsInput: true, requestedBy: "Nasir" },
  { id: "reply", label: "Help me reply to the client", context: "client", group: "write", prompt: "Help me write a plain-English reply to the client about this:\n\n", needsInput: true },
  // Dan, 25 Nov 2026: the team wanted "a better, less techy way of explaining something".
  // Anywhere (not just on a task): paste the technical thing, get words for the client.
  {
    id: "plain-words",
    label: "Explain it simply",
    context: "client",
    group: "write",
    prompt:
      "Explain this in plain, non-technical English, the way I could say it to the client or anyone who isn't a developer. Keep what matters (what happened, what it means for them, what happens next) and drop the jargon:\n\n",
    needsInput: true,
    requestedBy: "Dan",
  },
  { id: "release-notes", label: "Release notes", context: "client", group: "write", prompt: "Write client-friendly release notes for the latest release: what's new, what's fixed. Plain English.", requestedBy: "Fahad" },
  // Added 25 Nov 2026 (requests 17 and 18 on the team's list): both read the code or the Figma
  // design, so they are answered by the stronger model (src/lib/dispatch/model.ts).
  {
    id: "design-vs-build",
    label: "Design vs build",
    context: "client",
    group: "check",
    prompt:
      "Compare the Figma design with what's been built and list what's built, what's missing and what's different. Look at the Figma frames first; for a website, screenshot the page; for an app, I'll attach screenshots. The screen to check: ",
    needsInput: true,
    requestedBy: "Nasir",
  },
  {
    id: "docs-from-code",
    label: "Write docs from the code",
    context: "client",
    group: "write",
    prompt:
      "Write developer documentation for this client from its code, the wiki and the documents. Read the code first and say which files you used. What I need (for example a setup guide, API docs, the database explained, or a handover): ",
    needsInput: true,
    requestedBy: "Sibghat",
  },
  { id: "explain", label: "Explain in plain English", context: "task", group: "plan", prompt: "Explain this task in plain English: what it is, why it matters, and where it's up to." },
  { id: "subtasks", label: "Break into subtasks", context: "task", group: "plan", prompt: "Break this task into subtasks with acceptance criteria, dependencies, rough estimates and platforms. Flag missing information and questions to ask the client.", requestedBy: "Abdullah" },
  { id: "pr", label: "Write the PR description", context: "task", group: "write", prompt: "Write a pull request description for this task: summary, what changed, how to test, and anything reviewers should know.", requestedBy: "Umer" },
  { id: "tests", label: "Test cases", context: "task", group: "check", prompt: "Write test cases for this task: positive, negative and edge cases, with expected behaviour, using what was discussed in meetings and Slack.", requestedBy: "Arquam, Billal" },
  { id: "bug-report", label: "Draft a bug report", context: "task", group: "write", prompt: "Help me write a clear bug report for this task: steps to reproduce, expected and actual behaviour.", requestedBy: "Arquam" },
  // Added 25 Nov 2026 (requests 12 and 16): read the code or the Figma design first.
  {
    id: "impact",
    label: "Impact analysis",
    context: "task",
    group: "check",
    prompt:
      "Do an impact analysis for this task. Search and read the client's code first, then list the files, dependencies, APIs and features it touches, a suggested approach, and the areas most likely to break so we know what to retest.",
    requestedBy: "Fahad",
  },
  {
    id: "figma-tests",
    label: "Test scenarios from Figma",
    context: "task",
    group: "check",
    prompt:
      "Write test scenarios for this task from its requirements and the Figma design: positive, negative and edge cases, each with the expected result. Look at the relevant Figma frames first, and say which ones you used.",
    requestedBy: "Billal",
  },
];

/** The follow-up under every answer: the same thing again, less technical. */
export const SIMPLER_PROMPT = "Say that again more simply: plain words, no technical terms, as I'd explain it to the client.";

export function skillsFor(context: SkillContext): DispatchSkill[] {
  return DISPATCH_SKILLS.filter((s) => (context === "task" ? true : s.context === "client"));
}
