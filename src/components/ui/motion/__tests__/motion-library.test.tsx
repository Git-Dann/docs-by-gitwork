// @vitest-environment jsdom
/**
 * The motion library (docs/motion.md): the Lottie recolour never touches the shared parsed
 * file, the count-up curve lands exactly on its value, and every decorative piece is hidden
 * from assistive tech unless it's given words.
 */
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { hexToLottieColor, recolorLottie } from "../lottie";
import { countUpValue, easeOutCubic } from "../use-count-up";
import { Spinner } from "../spinner";
import { StatusDot } from "../status-dot";
import { LoadingState } from "../loading-state";
import { Skeleton, SkeletonCards } from "../skeleton";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(el: React.ReactElement): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => createRoot(host).render(el));
  return host;
}

type Node = Record<string, unknown>;
function fills(data: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(data)) data.forEach((d) => fills(d, out));
  else if (data && typeof data === "object") {
    const o = data as Node;
    if (o.ty === "fl" || o.ty === "st") out.push(o);
    Object.values(o).forEach((v) => fills(v, out));
  }
  return out;
}

describe("Lottie recolour", () => {
  const bat = JSON.parse(readFileSync("public/motion/bat.json", "utf8"));

  it("reads #RRGGBB and refuses anything else", () => {
    expect(hexToLottieColor("#2B2550")).toEqual([0x2b / 255, 0x25 / 255, 0x50 / 255, 1]);
    expect(hexToLottieColor("2b2550")).not.toBeNull();
    for (const bad of ["#fff", "red", "#12345", "var(--x)", ""]) expect(hexToLottieColor(bad)).toBeNull();
  });

  it("replaces every static fill in the bat, and leaves the cached original alone", () => {
    const before = JSON.stringify(bat);
    const out = recolorLottie(bat, "#2B2550");
    const recoloured = fills(out);
    expect(recoloured.length).toBeGreaterThan(0);
    for (const f of recoloured) expect((f.c as { k: number[] }).k).toEqual(hexToLottieColor("#2B2550"));
    expect(JSON.stringify(bat)).toBe(before);
  });

  it("leaves an animated colour (a = 1) for the file to play", () => {
    const data = { layers: [{ shapes: [{ ty: "fl", c: { a: 1, k: [{ t: 0, s: [1, 0, 0, 1] }] } }] }] };
    expect(recolorLottie(data, "#000000")).toEqual(data);
  });

  it("returns the file untouched for a colour it can't read", () => {
    expect(recolorLottie(bat, "orange")).toBe(bat);
  });
});

describe("count up", () => {
  it("eases out, clamped to 0..1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it("starts at the origin, ends exactly on the target, and never overshoots", () => {
    expect(countUpValue(0, 87, 0, 900)).toBe(0);
    expect(countUpValue(0, 87, 900, 900)).toBe(87);
    expect(countUpValue(0, 87, 5000, 900)).toBe(87);
    for (let t = 0; t <= 900; t += 50) expect(countUpValue(0, 87, t, 900)).toBeLessThanOrEqual(87);
    expect(countUpValue(87, 64, 450, 900)).toBeGreaterThanOrEqual(64);
    expect(countUpValue(10, 20, 100, 0)).toBe(20);
  });
});

describe("accessibility", () => {
  it("a bare spinner is decoration; a labelled one is a status", async () => {
    const quiet = await render(<Spinner />);
    expect(quiet.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    const loud = await render(<Spinner label="Saving" />);
    expect(loud.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("Saving");
  });

  it("a status dot with a label is named; without one it's hidden", async () => {
    const named = await render(<StatusDot tone="danger" motion="ping" label="Monitor alerting" />);
    expect(named.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Monitor alerting");
    expect(named.querySelector(".animate-ping")).not.toBeNull();
    const hidden = await render(<StatusDot tone="warning" motion="pulse" />);
    expect(hidden.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(hidden.firstElementChild?.className).toContain("animate-pulse");
  });

  it("a loading state is read out once, with its words", async () => {
    const host = await render(<LoadingState label="Loading checks…" />);
    const status = host.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toBe("Loading checks…");
  });

  it("a skeleton keeps its own radius when given one, and the default otherwise", async () => {
    const plain = await render(<Skeleton className="h-4" />);
    expect(plain.firstElementChild?.className).toContain("rounded-[6px]");
    for (const r of ["rounded", "rounded-full", "rounded-[10px]", "h-3 rounded-sm"]) {
      const own = await render(<Skeleton className={r} />);
      expect(own.firstElementChild?.className).not.toContain("rounded-[6px]");
    }
    // A class that merely contains the word is not a radius.
    const lookalike = await render(<Skeleton className="h-4 not-rounded-thing" />);
    expect(lookalike.firstElementChild?.className).toContain("rounded-[6px]");
  });

  it("skeletons are hidden from assistive tech", async () => {
    const one = await render(<Skeleton className="h-4" />);
    expect(one.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    const grid = await render(<SkeletonCards count={4} />);
    expect(grid.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(grid.firstElementChild?.children).toHaveLength(4);
  });
});
