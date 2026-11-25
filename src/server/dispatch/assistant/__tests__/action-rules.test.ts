import { describe, expect, it } from "vitest";
import { assigneesForNewTask, mayAnnotateTask, mayChangeTask } from "@/lib/dispatch/actions";
import { chatTimeline } from "../timeline";

describe("what Dispatch may change", () => {
  it("only the asker's own tasks or nobody's, and only on this client", () => {
    expect(mayChangeTask({ clientId: "c1", assigneeIds: [] }, "me", "c1")).toBeNull();
    expect(mayChangeTask({ clientId: "c1", assigneeIds: ["me", "ali"] }, "me", "c1")).toBeNull();
    expect(mayChangeTask({ clientId: "c1", assigneeIds: ["ali"] }, "me", "c1")).toMatch(/someone else/);
    expect(mayChangeTask({ clientId: "c2", assigneeIds: [] }, "me", "c1")).toMatch(/isn't on this client/);
  });

  it("comments and flags work on anyone's task, but only on this client", () => {
    expect(mayAnnotateTask({ clientId: "c1" }, "c1")).toBeNull();
    expect(mayAnnotateTask({ clientId: "c2" }, "c1")).not.toBeNull();
  });

  it("a new task is the asker's or nobody's, never someone else's", () => {
    expect(assigneesForNewTask(true, "me")).toEqual(["me"]);
    expect(assigneesForNewTask(false, "me")).toEqual([]);
  });
});

describe("chatTimeline", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 10, 25, 9, 0, s));
  it("shows questions, answers and proposals, and hides tool traffic and the context block", () => {
    const items = chatTimeline(
      [
        { role: "user", content: [{ type: "text", text: "<chat_context>x</chat_context>" }, { type: "text", text: "What's due?" }], createdAt: at(1) },
        { role: "assistant", content: [{ type: "thinking", thinking: "" }, { type: "tool_use", id: "t", name: "my_work", input: {} }], createdAt: at(2) },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "…" }], createdAt: at(3) },
        { role: "assistant", content: [{ type: "text", text: "Two things." }], createdAt: at(5) },
      ],
      [{ id: "a1", kind: "create_tasks", payload: { card: { title: "Create 1 task", lines: ["Fix login"] } }, status: "pending", result: null, createdAt: at(4) }],
    );
    expect(items.map((i) => i.type)).toEqual(["question", "action", "answer"]);
    expect(items[0]).toMatchObject({ text: "What's due?" });
    expect(items[1]).toMatchObject({ title: "Create 1 task", lines: ["Fix login"], status: "pending" });
  });
});
