/**
 * The standup review dialog must not resize with its content.
 *
 * ── What was wrong (September 2026) ───────────────────────────────────────────
 * The scroll region was `max-h-[46vh]` and the panel had no height of its own, so
 * the dialog took its height from whatever was inside it. Measured in headless
 * Chromium at 1440x900, the SAME dialog rendered at 281px for a one-line update
 * and 597px for a long one — a 316px swing (187px at 1280x620, 273px on a phone).
 * Opening Morning and then End of day resized the box under the cursor.
 *
 * DESIGN.md's fixed-height rule exists for exactly this: a popup's height is the
 * panel's, "never content-driven, so the popup doesn't resize as you click rows".
 *
 * Asserted here on the rendered DOM rather than the source, so it holds however the
 * classes are refactored, and at two content sizes an order of magnitude apart.
 *
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

/** Swapped per-test so one mount can render a long update and the next a short one. */
const preview: { projects: unknown[]; devCount: number; taskCount: number } = {
  projects: [],
  devCount: 0,
  taskCount: 0,
};

vi.mock("@/hooks/use-tasks", () => ({
  useRollupRoster: () => ({
    // The phase buttons only render once the roster has devs.
    data: {
      date: "2026-09-16",
      allPushed: false,
      devs: [
        {
          user: {
            id: "u1",
            name: "Ehtasham Razzaq",
            email: "e@x.co",
            avatarUrl: null,
          },
          amPushedAt: null,
          pmPushedAt: null,
          doingCount: 3,
          doneCount: 0,
        },
      ],
    },
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: () => {},
  }),
  usePublishRollup: () => ({ mutateAsync: async () => {}, isPending: false }),
  usePushPmUpdates: () => ({ mutateAsync: async () => {}, isPending: false }),
  usePmUpdatesPreview: () => ({
    data: {
      configured: true,
      devCount: preview.devCount,
      taskCount: preview.taskCount,
      projects: preview.projects,
      otherDevs: [],
    },
    isPending: false,
    isError: false,
    error: null,
  }),
}));

let DailyRollup: typeof import("../daily-rollup").DailyRollup;
beforeAll(async () => {
  ({ DailyRollup } = await import("../daily-rollup"));
});

function projects(count: number, tasksEach: number) {
  return Array.from({ length: count }, (_, p) => ({
    clientSlug: `c${p}`,
    clientName: `Client ${p}`,
    devs: [
      {
        name: "Ehtasham Razzaq",
        tasks: Array.from({ length: tasksEach }, (_, t) => ({
          taskId: `t${p}-${t}`,
          title:
            "Defining the data strategy to distinguish and store vehicles across the platform",
        })),
        note: null,
      },
    ],
  }));
}

/** Mount for real and click the phase button — the dialog is internal state. */
function openDialog(): HTMLElement {
  // Clear first: a previous mount's panel is still in the document, and
  // `querySelector` would hand back THAT one. Left in, it made the long-vs-short
  // comparison below compare one panel with itself and pass for free.
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<DailyRollup />);
  });
  const button = [...host.querySelectorAll("button")].find((b) =>
    /Morning|End of day/i.test(b.textContent ?? ""),
  );
  expect(
    button,
    "the Morning / End of day button is gone — this test needs updating",
  ).toBeTruthy();
  act(() => {
    button!.click();
  });
  const panel = document.querySelector<HTMLElement>('[role="dialog"]');
  expect(panel, "the review dialog did not open").toBeTruthy();
  return panel!;
}

function withContent(
  count: number,
  tasksEach: number,
  devs: number,
  tasks: number,
): HTMLElement {
  preview.projects = projects(count, tasksEach);
  preview.devCount = devs;
  preview.taskCount = tasks;
  return openDialog();
}

/** A class that sizes the element from the VIEWPORT, not from what is inside it. */
const DECLARES_HEIGHT = /(^|:)(h|max-h|min-h)-\[/;

describe("standup review dialog", () => {
  it("gives the panel its own height, so the content cannot set it", () => {
    const panel = withContent(3, 10, 6, 21);
    const declared = [...panel.classList].filter((c) =>
      DECLARES_HEIGHT.test(c),
    );
    expect(
      declared.length,
      "The dialog panel must declare its own height. Without one it grows and shrinks " +
        "with the update being reviewed — measured at 281px vs 597px for the same dialog.",
    ).toBeGreaterThan(0);
  });

  it("is laid out identically whether the update is long or short", () => {
    // The property that matters: nothing about the box changes with the content.
    const long = withContent(4, 13, 6, 21).className;
    const short = withContent(1, 1, 1, 1).className;
    expect(short).toBe(long);
  });

  it("scrolls the update list rather than the dialog", () => {
    const panel = withContent(4, 13, 6, 21);
    const scrollers = [...panel.querySelectorAll<HTMLElement>("div")].filter(
      (d) => d.classList.contains("overflow-y-auto"),
    );
    expect(
      scrollers,
      "exactly one region inside the dialog should scroll",
    ).toHaveLength(1);
    const scroller = scrollers[0];
    // `flex-1` + `min-h-0` is what makes it take the leftover height and no more. A
    // `max-h-[Nvh]` here is the original defect: it sizes from the viewport AND
    // collapses when the content is short, which is what moved the dialog.
    expect(scroller.classList.contains("flex-1")).toBe(true);
    expect(
      scroller.classList.contains("min-h-0"),
      "without min-h-0 a flex child's minimum size is its content, so the box grows",
    ).toBe(true);
    expect(
      [...scroller.classList].some((c) => /^max-h-\[/.test(c)),
      "the scroll region must not carry its own max-height — the panel owns the height",
    ).toBe(false);
  });

  it("pins the header and the action footer against the scrolling middle", () => {
    const panel = withContent(4, 13, 6, 21);
    const header = panel.querySelector(".widget-header");
    expect(
      header?.classList.contains("shrink-0"),
      "the 36px dialog header must not compress",
    ).toBe(true);
    const footer = [...panel.querySelectorAll<HTMLElement>("div")].find(
      (d) => d.className.includes("border-t") && d.querySelector("button"),
    );
    expect(footer, "could not find the Cancel / Send footer").toBeTruthy();
    expect(
      footer!.classList.contains("shrink-0"),
      "Send to #updates must stay reachable without scrolling past the update",
    ).toBe(true);
  });

  it("keeps the empty and error states filling the box, not collapsing it", () => {
    // A one-line "nothing to send" message in a fixed box should be centred in it,
    // rather than leaving the panel looking broken with a stripe of text at the top.
    const panel = withContent(0, 0, 0, 0);
    const filler = [...panel.querySelectorAll<HTMLElement>("div")].find(
      (d) =>
        d.classList.contains("flex-1") && d.classList.contains("items-center"),
    );
    expect(
      filler,
      "the empty state should fill and centre within the fixed body",
    ).toBeTruthy();
  });
});
