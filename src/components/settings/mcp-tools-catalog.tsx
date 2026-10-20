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
    blurb:
      "Add a new client with any of its fields — contact, full address, legal/company, links, retainer, and lead fields. Set status to LEAD for a prospect. Requires 'Manage clients'.",
    examples: [
      "Add a new client 'Speakify', website speakify.com, based in Rochdale.",
      "Create a lead 'Acme Co', source LinkedIn, est. value £20k.",
    ],
  },
  {
    name: "update_client",
    blurb:
      "Edit any of a client's fields — name, contact, address, legal/company, links, retainer, lead detail. Only what you pass changes. Requires 'Manage clients'.",
    examples: [
      "Set Speakify's address to 818 Manchester Road, Rochdale, OL11 3AW.",
      "Update Big Wedge's primary contact email and retainer to 5 days.",
    ],
  },
  {
    name: "set_client_status",
    blurb:
      "Move a client through its lifecycle — current (ACTIVE), lead, pending, paused (INACTIVE), or archived. Converts leads, parks clients, brings them back. Requires 'Manage clients'.",
    examples: [
      "Convert the Acme lead to an active client.",
      "Pause Speakify until September with a note.",
    ],
  },
  {
    name: "add_platform",
    blurb:
      "Add a platform to a client's Platforms block (hosting, CMS, repo, tools). Credentials stay UI-only. Requires 'Manage clients'.",
    examples: ["Add a WordPress platform for Big Wedge at bigwedge.golf."],
  },
  {
    name: "list_platforms",
    blurb: "List a client's platforms (name, type, URLs, whether creds are on file — never the secrets).",
    examples: ["What platforms does Speakify have?"],
  },
  {
    name: "add_design",
    blurb:
      "Add a design link to a client's Designs card (Figma file, mockup, moodboard) — distinct from Platforms. Requires 'Manage clients'.",
    examples: ["Add the Figma link to Speakify's designs.", "Save the Big Wedge brand kit to Designs."],
  },
  {
    name: "list_course_requests",
    blurb:
      "List a client's course requests — the golf courses their users have asked for, with status and how many people asked.",
    examples: ["What courses have Big Wedge's players asked for?", "Which course requests are still New?"],
  },
  {
    name: "create_course_request",
    blurb: "File a course request against a client. Requires 'Manage clients'.",
    examples: ["Add Wentworth to Big Wedge's course requests."],
  },
  {
    name: "get_running_costs",
    blurb:
      "What a client's app costs to RUN and the cost per end user — totals, the 0 → 1,000,000 growth curve, anything priced as an option, and the figures the model cannot establish. Not Docs costing: this is what the client pays monthly to keep it up.",
    examples: [
      "What does Speakify's app cost to run per user?",
      "What would Big Wedge cost at 50,000 users?",
      "What does it cost before launch, with no users?",
    ],
  },
  {
    name: "set_cost_line",
    blurb:
      "Add or update one line in a client's running-cost model — flat fee, per-seat, metered usage or plan bands. Set it as an OPTION to price something without counting it, which is how you compare providers. Requires 'Manage clients'.",
    examples: [
      "Add Supabase at £25/mo to Speakify's running costs.",
      "Price Claude Haiku and Sonnet as options for Speakify at 40k tokens per user.",
      "Move the Haiku option into the total.",
    ],
  },
  {
    name: "delete_cost_line",
    blurb: "Remove a line from a client's running-cost model. Requires 'Manage clients'.",
    examples: ["Drop the old Mailgun line from Speakify's costs."],
  },
  {
    name: "set_running_costs_settings",
    blurb:
      "Set the currency, the head count the cost-per-user banner is worked out at (0 is valid — pre-launch), the note shown to the client, or switch the section on/off. Requires 'Manage clients'.",
    examples: [
      "Work Speakify's costs out at 25,000 users.",
      "Set Big Wedge's running costs to 0 users so we can see the pre-launch burn.",
    ],
  },
  {
    name: "list_comparisons",
    blurb:
      "List a client's wiki comparison tables — plan tables (Free vs Premium vs Pro) or the product against competitors — with their columns and row counts.",
    examples: ["What comparison tables does Northwind have?"],
  },
  {
    name: "get_comparison",
    blurb: "Read one comparison table in full — every feature row and what each column includes.",
    examples: ["Show me what's in each of Speakify's plans."],
  },
  {
    name: "create_comparison",
    blurb:
      "Create a comparison table on a client's wiki — up to 45 columns, features as rows, group headings, a featured column, and cells as yes / no / partial / a short value like '10 GB'. Requires 'Manage clients'.",
    examples: [
      "Make a Free vs Premium vs Pro table for Speakify's v2 release.",
      "Compare Big Wedge against Golfshot, 18Birdies and Hole19 on these features.",
    ],
  },
  {
    name: "update_comparison",
    blurb:
      "Rename a comparison table, change its description, or replace its columns or rows wholesale (columns that keep their title keep their cells). Requires 'Manage clients'.",
    examples: ["Rename Speakify's plan table to 'What's in v2.1'."],
  },
  {
    name: "add_comparison_columns",
    blurb: "Add columns to a comparison table — a new plan, release or competitor. Up to 45 in total. Requires 'Manage clients'.",
    examples: ["Add Strava as a column to Northwind's competitor table."],
  },
  {
    name: "rename_comparison_column",
    blurb:
      "Rename a column, set its subtitle (e.g. a price), or feature it as the recommended plan or the client's own product. Requires 'Manage clients'.",
    examples: ["Feature the Premium column and give it the subtitle £6.99/mo."],
  },
  {
    name: "remove_comparison_column",
    blurb: "Remove a column, and every cell under it, from a comparison table. Requires 'Manage clients'.",
    examples: ["Drop Competitor B from the table."],
  },
  {
    name: "add_comparison_rows",
    blurb:
      "Add features or group headings to a comparison table, with what each column includes. Requires 'Manage clients'.",
    examples: ["Add 'Offline mode' — yes on Pro, partial on Premium, no on Free."],
  },
  {
    name: "set_comparison_cells",
    blurb:
      "Set many cells at once — yes, no, partial, blank, or a short value like '£9/mo'. All-or-nothing: one unknown row or column refuses the batch. Requires 'Manage clients'.",
    examples: ["Mark Apple Watch support as yes for Northwind and Peloton, no for the rest."],
  },
  {
    name: "delete_comparison",
    blurb: "Delete a comparison table from a client's wiki. Requires 'Manage clients'.",
    examples: ["Delete the old v1 plans table from Speakify's wiki."],
  },
  {
    name: "list_sheets",
    blurb:
      "List a client's wiki Sheets — the spreadsheets the client edits in their wiki — with columns, row counts, how many rows are on the dev board or done, and what the client may do.",
    examples: ["What sheets does Northwind have?"],
  },
  {
    name: "get_sheet",
    blurb:
      "Read one sheet in full — every row's cells by column title, plus where each row's task has got to on the board (derived live).",
    examples: ["Show me Northwind's Content to build sheet and what's done."],
  },
  {
    name: "create_sheet",
    blurb:
      "Create a sheet on a client's wiki — typed columns (text, long text, number, date, dropdown, checkbox, link, person), optional rows, and what the client may do (edit, add rows, send to the board). Up to 40 columns and 2,000 rows. Requires 'Manage clients'.",
    examples: ["Make a 'Content to build' sheet for Speakify with Item, Type, Priority and Link columns."],
  },
  {
    name: "update_sheet",
    blurb:
      "Rename a sheet, change its description or title column, or change whether the client can edit, add rows or send rows to the board. Requires 'Manage clients'.",
    examples: ["Let Northwind send rows from their content sheet to the board."],
  },
  {
    name: "add_sheet_columns",
    blurb: "Add typed columns to a sheet. Requires 'Manage clients'.",
    examples: ["Add a 'Wanted by' date column to Speakify's sheet."],
  },
  {
    name: "update_sheet_column",
    blurb:
      "Rename, retype, change the options of, lock for the client, or move a column — existing values are converted, and any that can't be are reported. Requires 'Manage clients'.",
    examples: ["Make Priority a dropdown of Low, Medium, High."],
  },
  {
    name: "remove_sheet_column",
    blurb: "Remove a column from a sheet. Requires 'Manage clients'.",
    examples: ["Drop the old Notes column."],
  },
  {
    name: "add_sheet_rows",
    blurb: "Add rows to a sheet, cells by column title. All-or-nothing. Requires 'Manage clients'.",
    examples: ["Add these five pages to Northwind's content sheet."],
  },
  {
    name: "update_sheet_rows",
    blurb:
      "Change cells in many rows at once — rows by id or by their title cell, only the named cells change. All-or-nothing. Requires 'Manage clients'.",
    examples: ["Set the pricing page's priority to High and tick Copy ready."],
  },
  {
    name: "delete_sheet_rows",
    blurb: "Remove rows from a sheet (they can be restored), or restore removed ones. Requires 'Manage clients'.",
    examples: ["Remove the old homepage test row."],
  },
  {
    name: "send_sheet_rows_to_board",
    blurb:
      "Turn sheet rows into tasks on the client's dev board, optionally in a category; the sheet then shows each task's progress. Safe to repeat — a row already on the board isn't sent twice. Requires 'Manage clients'.",
    examples: ["Send the three High-priority rows on Northwind's sheet to the board under Website."],
  },
  {
    name: "delete_sheet",
    blurb: "Delete a sheet and all its rows from a client's wiki. Requires 'Manage clients'.",
    examples: ["Delete the old launch checklist sheet."],
  },
  {
    name: "enable_wiki_section",
    blurb:
      "Switch one of a client's optional wiki sections on or off — comparisons, sheets, charts, running costs, estimates, delivery, support, RoundUp, meetings, platforms, metrics. Content is kept when off. Requires 'Manage clients'.",
    examples: ["Turn on the Comparisons section for Speakify.", "Hide Running costs on Big Wedge's wiki."],
  },
  {
    name: "list_wiki",
    blurb:
      "Overview of a client's wiki — which pages exist, which of the 11 page types are still empty, and section counts (changelog, monitors, docs, requests, team).",
    examples: ["What's on Big Wedge's wiki?", "Which wiki pages does Speakify still need?"],
  },
  {
    name: "get_wiki_page",
    blurb:
      "Read the full content of one wiki page (runbook, architecture, API docs, app-store listing, etc.).",
    examples: ["Show me Big Wedge's runbook.", "Read Speakify's architecture page."],
  },
  {
    name: "upsert_wiki_page",
    blurb:
      "Create or update ANY of the 11 wiki page types (IA guide, dev/API guide, API docs, architecture, runbook, data model, app-store iOS/Android/Firestick, system status, custom). Requires 'Manage clients'.",
    examples: [
      "Write a runbook for Big Wedge covering deploys and rollbacks.",
      "Draft Speakify's iOS App Store listing page.",
    ],
  },
  {
    name: "delete_wiki_page",
    blurb:
      "Remove a wiki page and hide its sidebar section until re-added. Requires 'Manage clients'.",
    examples: ["Delete the data-model page from Big Wedge's wiki."],
  },
  {
    name: "add_monitor",
    blurb:
      "Add an uptime monitor (HTTP or TCP) to a client wiki's Monitors section; runs an immediate probe. Requires 'Manage clients'.",
    examples: ["Monitor bigwedge.golf every 5 minutes.", "Add a TCP monitor for Speakify's API on port 443."],
  },
  {
    name: "list_monitors",
    blurb: "List a client wiki's uptime monitors — status, latency, and uptime % (24h/7d/30d).",
    examples: ["Is Big Wedge up?", "Show me Speakify's monitor uptime this week."],
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
