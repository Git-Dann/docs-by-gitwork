// Shared display of the 6 MCP tools — rendered on both the admin and the
// per-user panels so each audience sees exactly what Claude can do before
// they enable / connect. Source of truth lives next to the tool registry
// (src/server/mcp/handler.ts); duplicate copy here is intentional — these
// strings are user-facing prose, not API metadata.

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
];

export function McpToolsCatalog({ variant }: { variant: "admin" | "user" }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-2)]">
        {variant === "admin"
          ? "When enabled, every connected user can use these tools — each call is bound by that user's existing Foundry permissions, so Claude can't exceed what the user can do signed in."
          : "Once Claude is connected, try asking it to do any of these. Every call runs as you and respects your existing permissions."}
      </p>
      <ul className="divide-y divide-[var(--border-1)] rounded-md border border-[var(--border-1)]">
        {TOOLS.map((tool) => (
          <li key={tool.name} className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <code className="font-mono text-xs text-[var(--text-1)]">{tool.name}</code>
            </div>
            <p className="mt-1 text-sm text-[var(--text-2)]">{tool.blurb}</p>
            {variant === "user" && tool.examples.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {tool.examples.map((ex) => (
                  <li
                    key={ex}
                    className="text-[12px] italic text-[var(--text-3)] before:mr-1 before:content-['›']"
                  >
                    “{ex}”
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
