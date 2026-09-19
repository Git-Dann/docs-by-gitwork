/**
 * The recipient picker's panel must escape the dialog's scrolling body.
 *
 * ── Why this needs a test ─────────────────────────────────────────────────────
 * The compose dialog's body is `overflow-y-auto`, and `overflow-y: auto` forces
 * `overflow-x` to `auto` too — so that element is a clipping box on BOTH axes. An
 * absolutely-positioned panel inside it (the shape `task-filter-bar.tsx` uses, which is
 * correct on a page) would be cut off, and the cut is invisible to `audit:ui` (no class
 * is misused) and reports no page overflow (the scroller absorbs it). It is the same
 * trap recorded for `.widget-card` in docs/mobile-playbook.md.
 *
 * Headless UI's `anchor` prop is what avoids it: the panel is portalled to the document
 * body. That is a behaviour of a dependency, so it is worth asserting rather than
 * assuming — an upgrade or a refactor to a plain `absolute` panel would reintroduce a
 * clipped control silently.
 *
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

const MEMBERS = [
  { userId: "u1", name: "Sian Woolridge", email: "sian@gitwork.co.uk" },
  { userId: "u2", name: "Harry Brown", email: "harry@gitwork.co.uk" },
  { userId: "u3", name: "Umer Fayyaz", email: "umer@gitwork.co.uk" },
];

const idle = { isLoading: false, isPending: false, isError: false, error: null };
// Both list hooks are infinite queries, so the shape is pages-of-messages, not messages.
const emptyPages = { data: { pages: [{ messages: [] }] }, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => {}, ...idle };
vi.mock("@/hooks/use-messages", () => ({
  useMyMessages: () => emptyPages,
  useSentMessages: () => emptyPages,
  useMarkMessageRead: () => ({ mutate: () => {}, isPending: false }),
  useMarkMessageUnread: () => ({ mutate: () => {}, isPending: false }),
  useDismissMessage: () => ({ mutate: () => {}, isPending: false }),
  useDeleteMessage: () => ({ mutate: () => {}, isPending: false }),
  useMarkAllMessagesRead: () => ({ mutate: () => {}, isPending: false }),
  useSendMessage: () => ({ mutateAsync: async () => {}, isPending: false }),
}));
vi.mock("@/hooks/use-proposals", () => ({
  useTeamMembers: () => ({ data: { members: MEMBERS }, ...idle }),
}));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ isAdminOrAbove: true }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u2" } } }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

let MessagesWorkspace: typeof import("../messages-workspace").MessagesWorkspace;
beforeAll(async () => {
  ({ MessagesWorkspace } = await import("../messages-workspace"));
});

function click(label: RegExp) {
  const btn = [...document.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""));
  expect(btn, `no button matching ${label}`).toBeTruthy();
  act(() => btn!.click());
}

/** Mount the workspace, open the compose dialog, open the picker. */
function openPicker() {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host).render(<MessagesWorkspace />));
  click(/New message/);
  click(/Choose people/);
}

describe("recipient picker", () => {
  it("replaces the per-person chips with ONE control", () => {
    document.body.innerHTML = "";
    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => createRoot(host).render(<MessagesWorkspace />));
    click(/New message/);
    // Before the dropdown, every teammate had a button in the dialog body. Now the
    // roster is not rendered at all until the field is opened.
    const names = [...document.querySelectorAll("button")].filter((b) =>
      MEMBERS.some((m) => b.textContent?.includes(m.name)),
    );
    expect(
      names,
      "the roster should be behind the field, not laid out as a chip per person",
    ).toHaveLength(0);
  });

  it("puts the panel OUTSIDE the dialog's scrolling body", () => {
    openPicker();
    const filter = document.querySelector("input[aria-label='Filter people']");
    expect(filter, "the picker did not open").toBeTruthy();

    // Walk up from the panel: it must not sit inside anything that clips.
    let clipper: Element | null = null;
    for (let n = filter!.parentElement; n; n = n.parentElement) {
      if (/overflow-(y-)?auto|overflow-hidden/.test(n.className?.toString() ?? "")) {
        // Its own bounded list is fine — that is the panel's internal scroller.
        if (n.className.toString().includes("max-h-[min(300px,45vh)]")) continue;
        clipper = n;
        break;
      }
    }
    expect(
      clipper?.className ?? null,
      "The panel is inside a clipping ancestor, so it will be cut off. It must be " +
        "anchored/portalled — see the header comment.",
    ).toBeNull();
  });

  it("names the signed-in user as themselves", () => {
    openPicker();
    const text = document.body.textContent ?? "";
    // Sending to yourself first is how you check the wording and the phone it lands on.
    expect(text).toContain("Harry Brown (you)");
    expect(text).toContain("Sian Woolridge");
    expect(text).not.toContain("Sian Woolridge (you)");
  });

  it("offers a filter and a select-all, so 29 people stay workable", () => {
    openPicker();
    expect(document.querySelector("input[aria-label='Filter people']")).toBeTruthy();
    const selectAll = [...document.querySelectorAll("button")].find((b) =>
      /Select all/.test(b.textContent ?? ""),
    );
    expect(selectAll).toBeTruthy();
  });

  it("keeps the filter box at 16px so iOS does not zoom on focus", () => {
    openPicker();
    const filter = document.querySelector<HTMLInputElement>("input[aria-label='Filter people']");
    // jsdom has no cascade, so assert the declared class rather than a computed size.
    expect(filter!.className).toMatch(/text-\[16px\]/);
  });
});
