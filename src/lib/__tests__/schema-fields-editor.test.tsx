import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getSectionType } from "@/lib/sections/registry";
import type { TermSectionData } from "@/types/proposal";

/**
 * The end-to-end path for a schema-described block: DECLARED → RENDERED → EDITED → READ BACK.
 *
 * Every part of the last few formatting bugs was individually correct and individually tested, and
 * the feature was still dead, because nothing wrote the value back. So this test does not check
 * that the pieces exist — it pulls the real `onChange` off the real control that the real registry
 * produced, fires it, and asserts the block's data changed and its Preview says so.
 *
 * There is no DOM in this suite (vitest runs in `node`), but none is needed: a control's handler is
 * an ordinary function on an ordinary element, so it can be found and called directly. That is the
 * same wiring a click would exercise.
 */

type AnyElement = ReactElement<Record<string, unknown>>;

/** Every element in a tree, walking through both host elements and function components. */
function walk(node: ReactNode): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!isValidElement(node)) return [];

  const element = node as AnyElement;
  const { type, props } = element;

  if (typeof type === "function") {
    // Render the component with its own props and keep walking. Function components only —
    // nothing here uses classes or hooks, which is exactly why the renderer stays this simple.
    const rendered = (type as (p: unknown) => ReactNode)(props);
    return [element, ...walk(rendered)];
  }

  return [element, ...walk(props.children as ReactNode)];
}

/** The registry's `term` editor as a plain function. Throws loudly if the block ever loses one. */
function termEditor(): (p: unknown) => ReactNode {
  const Editor = getSectionType("term")?.Editor;
  if (typeof Editor !== "function") throw new Error("`term` has no Editor");
  return Editor as (p: unknown) => ReactNode;
}

/** Render the block's Preview to markup — how a reader actually sees the data. */
function previewMarkup(data: TermSectionData): string {
  const Preview = getSectionType("term")?.Preview;
  if (typeof Preview !== "function") throw new Error("`term` has no Preview");
  return renderToStaticMarkup(
    (Preview as (p: unknown) => ReactNode)({ data }) as ReactElement,
  );
}

function controls(data: TermSectionData, onChange: (next: TermSectionData) => void) {
  const Editor = termEditor();

  return walk(Editor({ data, onChange })).filter(
    (element) => element.type === "input" || element.type === "textarea" || element.type === "select",
  );
}

/** The control a given label sits with, addressed the way a person would: by its label text. */
function byLabel(
  data: TermSectionData,
  onChange: (next: TermSectionData) => void,
  label: string,
): AnyElement {
  const Editor = termEditor();

  const labels = walk(Editor({ data, onChange })).filter((element) => element.type === "label");
  const match = labels.find((element) =>
    renderToStaticMarkup(element as ReactElement).includes(label),
  );
  if (!match) throw new Error(`No field labelled "${label}"`);

  const found = walk(match.props.children as ReactNode).find(
    (element) => element.type === "input" || element.type === "textarea",
  );
  if (!found) throw new Error(`Field "${label}" has a label but no control`);
  return found;
}

const BASE: TermSectionData = {
  effectiveDate: "2026-08-05",
  initialTermMonths: 12,
  autoRenew: true,
  renewalTerm: "",
  noticePeriodDays: 60,
  governingLaw: "",
  terminationForCause: "",
};

describe("term — declared, not hand-written", () => {
  it("still has an Editor after declaring only `fields`", () => {
    // `defineSection` synthesises it. If this is undefined the block has no editor at all and the
    // Options rail renders nothing — a silent, total failure.
    expect(getSectionType("term")?.Editor).toBeTypeOf("function");
  });

  it("renders one control per declared field", () => {
    expect(controls(BASE, () => {})).toHaveLength(7);
  });

  it("reserves room for the chevron on every select", () => {
    // `audit:ui`'s SELECT-CHEVRON rule: without `pr-9` the value renders underneath the arrow.
    for (const element of controls(BASE, () => {})) {
      if (element.type !== "select") continue;
      expect(String(element.props.className)).toContain("app-select-chevron");
      expect(String(element.props.className)).toContain("pr-9");
    }
  });

  it("uses container queries, never viewport breakpoints", () => {
    // The rail is ~280–360px wide inside a window that may be 1440px. A `sm:`/`md:`/`lg:` grid
    // keys off the window and puts two columns in a 280px rail.
    const Editor = termEditor();
    const html = walk(Editor({ data: BASE, onChange: () => {} }))
      .map((element) => String(element.props.className ?? ""))
      .join(" ");

    expect(html).toContain("@[26rem]:grid-cols-2");
    expect(html).not.toMatch(/\b(sm|md|lg|xl):/);
  });
});

describe("term — edited, and read back", () => {
  it("writes a text edit to the right key and nothing else", () => {
    const seen: { next?: TermSectionData } = {};
    const control = byLabel(BASE, (value) => (seen.next = value), "Governing law");

    (control.props.onChange as (e: unknown) => void)({ target: { value: "Scotland" } });

    expect(seen.next).toEqual({ ...BASE, governingLaw: "Scotland" });
  });

  it("writes a checkbox as a boolean", () => {
    const seen: { next?: TermSectionData } = {};
    const control = byLabel(BASE, (value) => (seen.next = value), "Auto-renew");

    (control.props.onChange as (e: unknown) => void)({ target: { checked: false } });

    expect(seen.next?.autoRenew).toBe(false);
  });

  it("clearing a number field unsets it instead of saving zero", () => {
    // The bug the old hand-written editor actually had: `Number("")` is `0`, so clearing the
    // notice period silently agreed to zero days' notice in a contract.
    const seen: { next?: TermSectionData } = {};
    const control = byLabel(BASE, (value) => (seen.next = value), "Notice period");

    (control.props.onChange as (e: unknown) => void)({ target: { value: "" } });

    expect(seen.next?.noticePeriodDays).toBeUndefined();
    // And the block's own default is what the reader then sees — not "0 days".
    expect(previewMarkup(seen.next!)).toContain("60 days");
  });

  it("shows an edit in the Preview — the full round trip", () => {
    let data: TermSectionData = BASE;
    const edit = (label: string, value: string) => {
      const control = byLabel(data, (next) => (data = next), label);
      (control.props.onChange as (e: unknown) => void)({ target: { value } });
    };

    edit("Governing law", "England and Wales");
    edit("Initial term", "24");

    const preview = previewMarkup(data);

    expect(preview).toContain("England and Wales");
    expect(preview).toContain("24 months");
  });
});
