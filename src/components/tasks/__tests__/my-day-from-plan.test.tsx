/**
 * My Day offers planned work nobody has picked up, and picking it up assigns + starts it.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { MyDayDTO, TaskDTO } from "@/types/tasks";

const ME = "user-me";
const updates: unknown[] = [];

const planned = (id: string, title: string): TaskDTO =>
  ({
    id,
    title,
    client: { id: "c1", name: "Fellas Loaded", slug: "fellas" },
    assignees: [],
    featureBlock: { id: "new", name: "New Work" },
    status: "TODO",
    priority: "MEDIUM",
    dueDate: null,
    label: null,
    description: null,
  }) as unknown as TaskDTO;

const DAY: MyDayDTO = {
  date: "2026-10-16T00:00:00.000Z",
  isMonday: false,
  update: { id: "u", workDate: "2026-10-16", amPushedAt: null, pmPushedAt: null, weekPlan: null, note: null },
  suggestedWeekPlan: "",
  doing: [],
  done: [],
  upcoming: [],
  fromPlan: [1, 2, 3, 4, 5, 6].map((i) => planned(`p${i}`, `Planned task ${i}`)),
  fromPlanTotal: 40,
};

vi.mock("@/hooks/use-tasks", () => ({
  useMyDay: () => ({ data: DAY, isPending: false }),
  usePushDailyUpdate: () => ({ isPending: false, mutateAsync: async () => ({}) }),
  useDeleteStandupUpdate: () => ({ isPending: false, mutate: () => {} }),
  useUpdateTask: () => ({
    isPending: false,
    mutateAsync: async (input: unknown) => {
      updates.push(input);
      return {};
    },
  }),
}));
vi.mock("@/hooks/use-account", () => ({ useAccount: () => ({ data: { id: ME } }) }));
// The quick add is covered by the form's own tests; keep this one about the list.
vi.mock("@/components/tasks/plan-quick-add", () => ({ PlanQuickAdd: () => null }));

import { MyDay } from "../my-day";

let root: Root;
let host: HTMLDivElement;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  updates.length = 0;
});

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MyDay />));
}
const buttons = (label: RegExp) => [...host.querySelectorAll("button")].filter((b) => label.test(b.textContent ?? ""));

describe("My Day — From the plan", () => {
  it("lists planned work with its category, counting the full total", async () => {
    await mount();
    expect(host.textContent).toContain("From the plan");
    expect(host.textContent).toContain("40");
    expect(host.textContent).toContain("Fellas Loaded · New Work");
  });

  it("shows four, then all on request", async () => {
    await mount();
    expect(buttons(/Pick up/)).toHaveLength(4);
    await act(async () => buttons(/^Show all 6 of 40$/)[0].click());
    expect(buttons(/Pick up/)).toHaveLength(6);
  });

  it("⚠️ Pick up assigns it to me and moves it to Doing", async () => {
    await mount();
    await act(async () => buttons(/Pick up/)[0].click());
    expect(updates).toEqual([{ id: "p1", input: { status: "DOING", assigneeIds: [ME] } }]);
  });
});
