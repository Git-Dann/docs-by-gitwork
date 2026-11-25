/**
 * Dispatch on the demo pages: canned answers streamed the way the real route streams them, so
 * the panel's layout, streaming, sources and confirm cards can be checked without a database
 * or an API key. No model is called.
 */

interface DemoEvent {
  event: string;
  data: unknown;
}

function answerFor(question: string): DemoEvent[] {
  const q = question.toLowerCase();
  const status = (text: string): DemoEvent => ({ event: "status", data: { text } });
  const words = (text: string): DemoEvent[] => text.match(/\S+\s*/g)!.map((w) => ({ event: "text", data: { delta: w } }));
  if (q.includes("feedback")) {
    return [
      status("Searching tasks"),
      ...words(
        "I checked the 3 points against the board.\n\n- **Login loop on iOS 17**: already fixed in #A1B2C3, shipped in v1.4.0. Worth telling the client.\n- **Export to CSV**: new. Suggested owner: Priya (she did the last export work).\n- **Slow search**: same as #D4E5F6, still in progress. I've proposed a comment linking the report.\n\nConfirm below and I'll create the new task and add the comment.",
      ),
      { event: "action", data: { id: "demo-a1", kind: "create_tasks", title: "Create 1 task on Northwind Studio", lines: ["Add CSV export to reports · unassigned (suggested: Priya)"] } },
      { event: "action", data: { id: "demo-a2", kind: "comment", title: "Comment on #D4E5F6 Search paging", lines: ["Client reported slow search again on 25 Nov."] } },
      { event: "sources", data: [{ kind: "task", id: "t1", label: "#A1B2C3", href: "/demo/tasks" }, { kind: "task", id: "t2", label: "#D4E5F6", href: "/demo/tasks" }] },
    ];
  }
  return [
    status("Looking at your tasks"),
    status("Checking where the project stands"),
    ...words(
      "Here's your week on Northwind Studio.\n\n- **Harden webhook retry handling** is in progress, due Friday. It's flagged: check with the client how long a retry may take.\n- **Migrate image uploads to R2** is next, due Monday.\n- **Saved searches** has been in progress for 8 days, so it may be stuck. Worth a quick check-in.\n\nI couldn't see any due dates on 3 of your tasks, so I can't say whether those are on time.",
    ),
    { event: "sources", data: [{ kind: "overview", id: "c1", label: "Northwind Studio board", href: "/demo/tasks" }, { kind: "slack", id: "s1", label: "#northwind-internal" }] },
  ];
}

/** A Response streaming canned server-sent events for one question. */
export function demoDispatchStream(body: string | null | undefined): Response {
  let question = "";
  try {
    question = String((JSON.parse(body ?? "{}") as { question?: string }).question ?? "");
  } catch {
    /* ignore */
  }
  const events: DemoEvent[] = [{ event: "conversation", data: { id: "demo-conversation" } }, ...answerFor(question), { event: "done", data: {} }];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
        await new Promise((r) => setTimeout(r, e.event === "text" ? 18 : 350));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

/** The other Dispatch routes on the demo. */
export function resolveDemoDispatch(pathname: string): unknown | undefined {
  if (pathname === "/api/dispatch/conversations") return { available: true, conversations: [] };
  if (pathname.startsWith("/api/dispatch/actions/")) return { status: "done", message: "Done. (Demo: nothing was changed.)" };
  return undefined;
}
