// @vitest-environment jsdom
/**
 * A release that finished weeks ago starts folded on the Timeline, which hid a search match
 * ("Big Wedge Handicap Calculation" for "handicap"). Searching opens every release.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WikiBoardTimeline } from "@/components/clients/wiki/wiki-board-timeline";
import type { WikiBoardCard, WikiBoardRelease } from "@/types/wiki-board";

const RELEASE: WikiBoardRelease = {
  id: "r1",
  label: "v1.0.10 · Q2: Bag Management",
  startDate: "2026-06-30T00:00:00.000Z",
  endDate: "2026-07-21T00:00:00.000Z",
  cards: 1,
  done: 1,
};
const CARD = {
  id: "c1",
  title: "Big Wedge Handicap Calculation (App)",
  itemType: "feature",
  status: "DONE",
  laneKey: "DONE",
  orderKey: 1,
  release: { id: "r1", label: RELEASE.label },
  dueDate: null,
  signOff: null,
  isCard: true,
} as unknown as WikiBoardCard;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

const render = (searching: boolean) =>
  act(() =>
    root.render(
      <WikiBoardTimeline cards={[CARD]} releases={[RELEASE]} readOnly={() => false} onOpen={() => undefined} searching={searching} />,
    ),
  );
const shows = () => Array.from(host.querySelectorAll("button")).some((b) => b.textContent?.includes("Big Wedge Handicap Calculation"));

describe("searching the Timeline", () => {
  it("opens a release that starts folded, so the match shows", () => {
    // Completed releases are hidden by default; tick Show completed first.
    render(false);
    act(() => (host.querySelector("[data-timeline-show-completed]") as HTMLInputElement).click());
    expect(shows()).toBe(false);
    render(true);
    expect(shows()).toBe(true);
  });
});
