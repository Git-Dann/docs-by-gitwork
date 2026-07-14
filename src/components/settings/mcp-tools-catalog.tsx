// Shared display of the MCP tools — rendered on both the admin and the
// per-user panels so each audience sees exactly what Claude can do before
// they enable / connect. Source of truth lives next to the tool registry
// (src/server/mcp/handler.ts); duplicate copy here is intentional — these
// strings are user-facing prose, not API metadata. Keep this list in step
// with TOOLS in handler.ts (the mcp-smoke test guards the count there).

"use client";

type Tool = {
  name: string;
  blurb: string;
  examples: string[];
};

const TOOLS: Tool[] = [
  {
    name: "list_clients",
    blurb:
      "List the clients you can see in Portal. Honors your existing client scoping — Developers only see clients they're assigned to.",
    examples: ["What clients do I have in Foundry?", "Show me clients matching 'Big'."],
  },
  {
    name: "create_client",
    blurb: "Add a new client. Requires the 'Manage clients' permission.",
    examples: ["Add a new client called 'Speakify', website speakify.com."],
  },
  {
    name: "get_client",
    blurb:
      "Open one client's profile — contact, website, active devs, links, and counts. Financials show only if you can see them; never returns bank or credentials.",
    examples: ["Give me the rundown on Big Wedge.", "Who's working on Speakify and what's the drive link?"],
  },
  {
    name: "list_conversations",
    blurb:
      "List a Care client's support conversations (subject, customer, status, priority, sentiment). Requires the 'Manage Care' permission.",
    examples: ["What's open in Care for Fellas?", "Show me urgent conversations for Big Wedge."],
  },
  {
    name: "list_tasks",
    blurb: "List tasks. Filter by client, status, or assignee.",
    examples: [
      "What's on Speakify's board?",
      "Show me all tasks in DOING status.",
      "What tasks are assigned to Harry?",
    ],
  },
  {
    name: "create_task",
    blurb:
      "Create a task on a client's board. Defaults to BACKLOG / MEDIUM priority. Resolves client by slug, name, or cuid.",
    examples: [
      "Create a task on Big Wedge: 'review onboarding copy', priority high.",
      "Add a TODO to Speakify called 'audit the analytics pipeline'.",
    ],
  },
  {
    name: "update_task",
    blurb:
      "Update any field of an existing task — status, priority, assignees, due date, etc. Respects client scoping.",
    examples: [
      "Mark task abc123 as done.",
      "Bump the priority of the onboarding-copy task to HIGH.",
    ],
  },
  {
    name: "list_members",
    blurb:
      "List Gitwork workspace members. Useful for finding the user id Claude needs when assigning tasks.",
    examples: ["Who's in the workspace?", "Find Harry's user id."],
  },
  {
    name: "whoami",
    blurb:
      "Tells Claude which Foundry account it's acting as, your role, and what you're allowed to do. Handy so 'assign it to me' just works.",
    examples: ["Who am I in Foundry?", "What can I do here?"],
  },
  {
    name: "get_task",
    blurb:
      "Open one task in full — description, acceptance criteria, subtasks, and the comment thread.",
    examples: ["Show me the full detail of that onboarding task.", "What are the acceptance criteria on task abc123?"],
  },
  {
    name: "comment_task",
    blurb:
      "Add a note or comment to a task's thread (you can @mention teammates).",
    examples: ["Comment on task abc123: 'blocked on design sign-off'.", "Leave a note on the analytics task @Harry to review."],
  },
  {
    name: "find_meetings",
    blurb:
      "Search Scribe meeting notes for a client. Returns titles, dates, AI summary, decisions, and action items.",
    examples: [
      "What did we agree with Speakify last week?",
      "Show me decisions from the Big Wedge kickoff call.",
      "Search After Desk meetings for 'onboarding'.",
    ],
  },
  {
    name: "create_document",
    blurb:
      "Create a new document (proposal, SOW, SLA, NDA, etc.) as DRAFT with default sections. Requires the 'Manage documents' permission.",
    examples: [
      "Create a new proposal called 'Speakify Phase 2' for Speakify.",
      "Start an SOW titled 'Big Wedge analytics revamp' for Big Wedge.",
    ],
  },
  {
    name: "update_document",
    blurb:
      "Fill in or edit a document's content — title, status, summary, and section bodies. Requires the 'Manage documents' permission.",
    examples: [
      "Draft the scope and pricing sections of that Speakify proposal.",
      "Mark the Big Wedge SOW as SENT.",
    ],
  },
  {
    name: "list_documents",
    blurb:
      "List documents (proposals, SOWs, contracts, …). Filter by client, type, status, or search. Only shows the document types your role can see.",
    examples: [
      "What proposals are out for Speakify?",
      "Show me every document in DRAFT.",
    ],
  },
  {
    name: "pulse_scan",
    blurb:
      "Run a Pulse production-readiness + security scan on a URL and get a compact verdict — health score, confirmed issues, security/TLS/accessibility grades, and top fixes. Requires the 'Manage Pulse' permission.",
    examples: [
      "Run a Pulse scan on https://speakify.com and summarise the risks.",
      "Is app.bigwedge.golf ready to ship? Scan it for EU + UK.",
    ],
  },
  {
    name: "pulse_scan_result",
    blurb:
      "Fetch the verdict for an existing Pulse scan by its id — handy to pull an in-app scan's findings into a chat.",
    examples: ["Summarise Pulse scan clx123 for me."],
  },
  {
    name: "list_pulse_scans",
    blurb:
      "List recent Pulse scans (score, status, date), optionally for one client. Requires the 'Manage Pulse' permission.",
    examples: ["What Pulse scans have we run for Big Wedge?", "Show me the latest scans and their scores."],
  },
];

export function McpToolsCatalog({ variant }: { variant: "admin" | "user" }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-2)]">
        {variant === "admin"
          ? "When enabled, every connected user can use these tools — each call is bound by that user's existing Foundry permissions, so Claude can't exceed what the user can do signed in."
          : "Once Claude is connected, try asking it to do any of these. Every call runs as you and respects your existing permissions."}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {TOOLS.map((tool) => (
          <div
            key={tool.name}
            className="rounded-md border border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-3"
          >
            <code className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-1)]">
              {tool.name}
            </code>
            <p className="mt-1.5 text-sm leading-snug text-[var(--text-2)]">{tool.blurb}</p>
            {variant === "user" && tool.examples.length > 0 ? (
              <ul className="mt-2 space-y-0.5 border-t border-[var(--border-1)] pt-2">
                {tool.examples.map((ex) => (
                  <li
                    key={ex}
                    className="text-[12px] italic leading-snug text-[var(--text-3)] before:mr-1 before:content-['›']"
                  >
                    “{ex}”
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
