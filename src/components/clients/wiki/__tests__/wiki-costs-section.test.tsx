/**
 * The zero-users banner, as rendered.
 *
 * A client before launch has no users and a very real monthly bill, and the two
 * mistakes available here are opposite and both bad: printing "£0.00 per user",
 * which reads as free to run, or printing the cost as a negative, which asserts a
 * margin Foundry holds no revenue figure to compute. The page must show the total,
 * say plainly that there is no per-user figure, and claim nothing else.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WikiCostsSection } from "../wiki-costs-section";
import type { CostItem, CostModel } from "@/types/wiki-costs";

function costItem(partial: Partial<CostItem> & Pick<CostItem, "id" | "name" | "kind">): CostItem {
  return {
    vendor: null,
    amountMonthly: null,
    amountAnnual: null,
    unitLabel: null,
    includedUnits: null,
    unitPrice: null,
    unitsPerUser: null,
    tiers: [],
    notes: null,
    orderKey: 0,
    included: true,
    ...partial,
  };
}

/** Two fixed fees and a per-seat line — £73/mo with nobody on it. */
function model(headlineUsers: number): CostModel {
  return {
    enabled: true,
    currency: "GBP",
    headlineUsers,
    notes: null,
    updatedAt: null,
    items: [
      costItem({ id: "h", name: "Hosting", kind: "FLAT", amountMonthly: 48 }),
      costItem({ id: "d", name: "Database", kind: "FLAT", amountMonthly: 25 }),
      costItem({ id: "s", name: "Seats", kind: "PER_USER", amountMonthly: 0.4, orderKey: 1 }),
    ],
  };
}

function render(headlineUsers: number): string {
  return renderToStaticMarkup(
    <WikiCostsSection slug="demo" model={model(headlineUsers)} mode="public" />,
  );
}

function text(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}

describe("zero users", () => {
  const html = render(0);
  const body = text(html);

  it("leads with the real monthly total, not a dash", () => {
    expect(body).toContain("£73.00");
    expect(body).toContain("Cost / month");
  });

  it("says in words that there is no cost per user", () => {
    // Not an em-dash in a 36px serif slot, which reads as broken rather than as
    // undefined — the reader needs the reason, not the absence.
    expect(body).toContain("There is no cost per user yet");
  });

  it("never prints a negative figure", () => {
    // The cost is +£73; it is the MARGIN that is negative, and Foundry holds no
    // revenue to subtract. A minus sign here would be a P&L we cannot back.
    expect(body).not.toMatch(/-\s*£/);
    expect(body).not.toContain("−£");
  });

  it("never prints £0.00 per user, which would read as free to run", () => {
    expect(body).not.toMatch(/£0\.0000?\s*(?:PER USER|Per user)/i);
  });

  it("does not title the panel COST PER USER when it shows none", () => {
    expect(body).not.toContain("COST PER USER");
    expect(body).toContain("COST TO RUN");
  });

  it("shows the fixed-cost floor as the first row of the scale table", () => {
    expect(body).toContain("AS YOU GROW");
    expect(body).toMatch(/0\s*→\s*1,000,000/);
  });

});

describe("the 'from' prefix qualifies a figure, never an absence", () => {
  /**
   * ⚠️ This needs a model that is INCOMPLETE, or the prefix never renders at all and
   * the assertion passes whether or not the guard exists. The first version of this
   * test used the clean model above and was satisfied by both the bug and the fix —
   * §42.10's rule, met again. A driverless metered line is what makes every row a
   * floor, which is the only state in which "from —" can appear.
   */
  const incomplete: CostModel = {
    ...model(0),
    items: [
      costItem({ id: "h", name: "Hosting", kind: "FLAT", amountMonthly: 48 }),
      costItem({ id: "ai", name: "AI", kind: "METERED", amountMonthly: 10, orderKey: 1 }),
    ],
  };
  const body = text(
    renderToStaticMarkup(<WikiCostsSection slug="demo" model={incomplete} mode="public" />),
  );

  it("marks the incomplete totals as a floor", () => {
    // Proves the fixture reaches the branch under test.
    expect(body).toContain("from ");
  });

  it("does not write 'from —' on the zero-users row", () => {
    // A floor qualifies a number. Prefixing an em-dash says nothing at all.
    expect(body).not.toContain("from —");
  });
});

describe("a normal head count still leads with cost per user", () => {
  const body = text(render(5000));

  it("shows the per-user figure and titles the panel for it", () => {
    expect(body).toContain("COST PER USER");
    expect(body).toContain("Per user / month");
  });

  it("does not show the zero-users explanation", () => {
    expect(body).not.toContain("There is no cost per user yet");
  });
});

/**
 * Where the growth control lives.
 *
 * It was its own `04 // AS YOU GROW` card BELOW the options list. That is
 * backwards: the slider decides what the option prices mean, so a reader met the
 * list and only afterwards found the control that changes it. It is now the top
 * of `03`, in two columns.
 *
 * ⚠️ Behavioural, not source-text: the thing that can break silently is the
 * ORDER on the page and the case where card 03 does not render at all.
 */
describe("as-you-grow placement", () => {
  /** Model with an option being priced, so card 03 renders. */
  function withOption(): CostModel {
    const m = model(100);
    return {
      ...m,
      items: [
        ...m.items,
        costItem({
          id: "opt",
          name: "Search add-on",
          kind: "FLAT",
          amountMonthly: 12,
          included: false,
          orderKey: 2,
        }),
      ],
    };
  }

  it("sits ABOVE the options list, not below it", () => {
    const html = renderToStaticMarkup(
      <WikiCostsSection slug="demo" model={withOption()} mode="public" />,
    );
    // ⚠️ Positions in the RAW HTML and anchored on the SLIDER, not on the heading
    // beside it. The first version of this asserted where "As you grow" appeared,
    // which is the label I added in the same change — so deleting `{growthPanel}`
    // left the heading, the assertion, and a card with no control in it. Caught by
    // sabotage. `type="range"` is the one thing only the panel renders.
    const slider = html.indexOf('type="range"');
    const options = html.indexOf("OPTIONS BEING PRICED");
    const list = html.indexOf("Search add-on");
    expect(slider, "the growth slider should render").toBeGreaterThan(-1);
    expect(options, "the options card should render").toBeGreaterThan(-1);
    expect(slider).toBeGreaterThan(options);
    expect(list).toBeGreaterThan(slider);
  });

  it("has no separate 04 card any more", () => {
    const body = text(
      renderToStaticMarkup(<WikiCostsSection slug="demo" model={withOption()} mode="public" />),
    );
    expect(body).not.toContain("04 // ");
  });

  /**
   * ⚠️ Card 03 only renders when there ARE options. Without its own fallback the
   * growth control — the thing the whole page turns on — would simply vanish for
   * a client with nothing being priced.
   */
  it("still renders, in its own card, when nothing is being priced", () => {
    const body = text(renderToStaticMarkup(<WikiCostsSection slug="demo" model={model(100)} mode="public" />));
    expect(body).not.toContain("OPTIONS BEING PRICED");
    expect(body).toContain("AS YOU GROW");
    // Again the SLIDER, not the heading — a card title proves nothing about
    // whether the control inside it rendered.
    const html = renderToStaticMarkup(
      <WikiCostsSection slug="demo" model={model(100)} mode="public" />,
    );
    expect(html).toContain('type="range"');
  });
});
