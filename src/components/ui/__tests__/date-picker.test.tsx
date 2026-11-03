// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatePicker, DateRangePicker, type DateRange } from "@/components/ui/date-picker";
import { Modal } from "@/components/ui/modal";
import { todayISO } from "@/lib/calendar-date";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  process.env.TZ = ORIGINAL_TZ;
});

function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(node));
  return el;
}

function Controlled(props: { initial?: string; onChange?: (v: string) => void } & Partial<Parameters<typeof DatePicker>[0]>) {
  const { initial = "", onChange, ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <DatePicker
      aria-label="Due date"
      {...rest}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const trigger = () => document.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']")!;
const panel = () => document.querySelector<HTMLElement>("[role='dialog'][aria-label^='Choose']");
/** EasyUI keys a day as `y-m-d` without zero padding. */
const key = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}-${m}-${d}`;
};
const day = (iso: string) => document.querySelector<HTMLButtonElement>(`button[data-date="${key(iso)}"]`)!;
const button = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === text);

/** Wait (bounded) for a condition — the popover's spring, exit animation and 160ms close beat are timed. */
async function waitFor(cond: () => boolean, ms = 2000) {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 16));
    });
  }
}
const closed = () => waitFor(() => panel() === null);

async function open() {
  await act(async () => {
    trigger().click();
  });
  await waitFor(() => panel() !== null);
}

async function press(k: string, opts: KeyboardEventInit = {}) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }),
    );
  });
}

async function click(el: HTMLElement) {
  await act(async () => el.click());
}

describe("DatePicker (EasyUI calendar, Foundry contract)", () => {
  it("shows the value as a date, and the placeholder when empty", () => {
    mount(<Controlled initial="2026-11-03" />);
    expect(trigger().textContent).toBe("3 Nov 2026");
    act(() => root!.unmount());
    mount(<Controlled />);
    expect(trigger().textContent).toBe("Select date");
  });

  it("opens portalled, on the selected day, with focus on it", async () => {
    const host = mount(<Controlled initial="2026-11-03" />);
    await open();
    expect(panel()).not.toBeNull();
    // Portalled out of the field's own box, so a scroller or `.widget-card` can't clip it.
    expect(host.contains(panel())).toBe(false);
    expect(document.activeElement).toBe(day("2026-11-03"));
    expect(day("2026-11-03").closest("[role='gridcell']")!.getAttribute("aria-selected")).toBe("true");
    expect(document.body.textContent).toContain("November 2026");
  });

  it("weeks start on Monday", async () => {
    mount(<Controlled initial="2026-11-03" />);
    await open();
    // 1 Nov 2026 is a Sunday: six blank cells before it in a Monday-first week.
    const firstRow = document.querySelector("[role='grid'] [role='row']")!;
    const cells = Array.from(firstRow.querySelectorAll("[role='gridcell']"));
    expect(cells.slice(0, 6).every((c) => c.textContent === "")).toBe(true);
    expect(cells[6].textContent).toBe("1");
  });

  it("clicking a day returns YYYY-MM-DD and closes", async () => {
    const onChange = vi.fn();
    mount(<Controlled initial="2026-11-03" onChange={onChange} />);
    await open();
    await click(day("2026-11-17"));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-17");
    await closed();
    expect(panel()).toBeNull();
    expect(trigger().textContent).toBe("17 Nov 2026");
  });

  it("keyboard: arrows and PageUp/PageDown move focus; activating picks", async () => {
    const onChange = vi.fn();
    mount(<Controlled initial="2026-11-03" onChange={onChange} />);
    await open();
    await press("ArrowRight");
    expect(document.activeElement).toBe(day("2026-11-04"));
    await press("ArrowDown");
    expect(document.activeElement).toBe(day("2026-11-11"));
    await press("PageDown");
    await waitFor(() => document.activeElement === day("2026-12-11"));
    expect(document.activeElement).toBe(day("2026-12-11"));
    await press("PageUp", { shiftKey: true });
    await waitFor(() => document.activeElement === day("2025-12-11"));
    expect(document.activeElement).toBe(day("2025-12-11"));
    // Enter / Space on a <button> is a click in every browser; jsdom doesn't synthesise it.
    await click(document.activeElement as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith("2025-12-11");
    await closed();
  });

  it("min / max: out-of-range days can't be picked or reached", async () => {
    const onChange = vi.fn();
    mount(<Controlled initial="2026-11-10" min="2026-11-10" max="2026-11-20" onChange={onChange} />);
    await open();
    expect(day("2026-11-09").getAttribute("aria-disabled")).toBe("true");
    expect(day("2026-11-21").getAttribute("aria-disabled")).toBe("true");
    expect(day("2026-11-15").getAttribute("aria-disabled")).toBeNull();
    await press("ArrowLeft");
    expect(document.activeElement).toBe(day("2026-11-10"));
    await press("PageDown");
    expect(document.activeElement).toBe(day("2026-11-20"));
    expect(document.querySelector<HTMLButtonElement>("button[aria-label='Previous month']")!.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("button[aria-label='Next month']")!.disabled).toBe(true);
    await click(day("2026-11-09"));
    await click(day("2026-11-21"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Today picks today; Clear empties it — and a required field has no Clear", async () => {
    const onChange = vi.fn();
    mount(<Controlled initial="2026-11-03" onChange={onChange} />);
    await open();
    await click(button("Today")!);
    expect(onChange).toHaveBeenLastCalledWith(todayISO());
    await closed();
    await open();
    await click(button("Clear")!);
    expect(onChange).toHaveBeenLastCalledWith("");
    await closed();
    expect(trigger().textContent).toBe("Select date");

    act(() => root!.unmount());
    mount(<Controlled initial="2026-11-03" required />);
    await open();
    expect(button("Clear")).toBeUndefined();
  });

  it("Escape closes the calendar but NOT the dialog it sits in", async () => {
    const onClose = vi.fn();
    mount(
      <Modal open onClose={onClose} title="New task">
        <Controlled initial="2026-11-03" />
      </Modal>,
    );
    await open();
    await press("Escape");
    await closed();
    expect(panel()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger());
    // With the calendar shut, Escape belongs to the dialog again.
    await press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape that reaches `document` directly still closes only the calendar", async () => {
    // In the real app React's root IS `document` (Next hydrates it), so a React handler
    // can't stop the dialog's own `document` listener. Dispatching on `document` models that
    // path: only a window-capture listener gets there first.
    const onClose = vi.fn();
    mount(
      <Modal open onClose={onClose} title="New task">
        <Controlled initial="2026-11-03" />
      </Modal>,
    );
    await open();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await closed();
    expect(panel()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("an invalid incoming value reads as empty, as the native input does", () => {
    mount(<Controlled initial="2026-11-03T10:00:00Z" />);
    expect(trigger().textContent).toBe("Select date");
  });

  it("required + name: a hidden mirror blocks an empty form and submits the value", () => {
    mount(<Controlled initial="" required name="due" />);
    const mirror = document.querySelector<HTMLInputElement>("input[data-date-picker-mirror]")!;
    expect(mirror.required).toBe(true);
    expect(mirror.name).toBe("due");
    expect(mirror.value).toBe("");
    expect(trigger().getAttribute("aria-required")).toBe("true");
  });

  it("timezone: stepping across the night the clocks go back moves exactly one day, and saves it", async () => {
    for (const tz of ["Europe/London", "America/Los_Angeles", "Pacific/Auckland"]) {
      process.env.TZ = tz;
      const onChange = vi.fn();
      mount(<Controlled initial="2026-10-24" onChange={onChange} />);
      expect(trigger().textContent).toBe("24 Oct 2026");
      await open();
      await press("ArrowRight");
      expect(document.activeElement).toBe(day("2026-10-25"));
      await press("ArrowRight");
      expect(document.activeElement).toBe(day("2026-10-26"));
      await click(document.activeElement as HTMLElement);
      expect(onChange).toHaveBeenLastCalledWith("2026-10-26");
      act(() => root!.unmount());
      root = null;
      document.body.innerHTML = "";
    }
  });
});

describe("DateRangePicker", () => {
  function ControlledRange({ onChange }: { onChange?: (v: DateRange) => void }) {
    const [value, setValue] = useState<DateRange>({ start: "2026-11-03", end: "2026-11-05" });
    return (
      <DateRangePicker
        aria-label="Away dates"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  it("shows the range, and commits only after the second pick", async () => {
    const onChange = vi.fn();
    mount(<ControlledRange onChange={onChange} />);
    expect(trigger().textContent).toBe("3 Nov 2026 – 5 Nov 2026");
    await open();
    await click(day("2026-11-10"));
    expect(onChange).not.toHaveBeenCalled();
    expect(panel()).not.toBeNull();
    await click(day("2026-11-20"));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-11-10", end: "2026-11-20" });
    await closed();
    expect(trigger().textContent).toBe("10 Nov 2026 – 20 Nov 2026");
  });

  it("an earlier second pick restarts the range from there (EasyUI's rule)", async () => {
    const onChange = vi.fn();
    mount(<ControlledRange onChange={onChange} />);
    await open();
    await click(day("2026-11-20"));
    await click(day("2026-11-10"));
    expect(onChange).not.toHaveBeenCalled();
    await click(day("2026-11-12"));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-11-10", end: "2026-11-12" });
  });

  it("closing half-way leaves the range as it was", async () => {
    const onChange = vi.fn();
    mount(<ControlledRange onChange={onChange} />);
    await open();
    await click(day("2026-11-20"));
    await press("Escape");
    await closed();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger().textContent).toBe("3 Nov 2026 – 5 Nov 2026");
  });

  it("marks the days between the ends as selected", async () => {
    mount(<ControlledRange />);
    await open();
    const selected = (iso: string) => day(iso).closest("[role='gridcell']")!.getAttribute("aria-selected");
    expect(selected("2026-11-03")).toBe("true");
    expect(selected("2026-11-04")).toBe("true");
    expect(selected("2026-11-05")).toBe("true");
    expect(selected("2026-11-06")).toBe("false");
  });
});
