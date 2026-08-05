import { describe, expect, it } from "vitest";
import {
  applyFieldChange,
  fieldControlValue,
  type SectionField,
} from "@/lib/sections/field-schema";

/**
 * The coercion behind schema-described editors.
 *
 * This is the single point where a control's raw string becomes block data, so a mistake here is
 * a mistake in every block that declares fields at once. That is the whole risk of the generic
 * renderer and the reason this file is thorough.
 */

interface Data {
  name?: string;
  months?: number;
  notice?: number;
  autoRenew?: boolean;
  law?: string;
}

const text: SectionField<Data> = { kind: "text", key: "name", label: "Name" };
const months: SectionField<Data> = { kind: "number", key: "months", label: "Months", min: 1, max: 60 };
const notice: SectionField<Data> = { kind: "number", key: "notice", label: "Notice" };
const check: SectionField<Data> = { kind: "checkbox", key: "autoRenew", label: "Auto-renew" };
const select: SectionField<Data> = {
  kind: "select",
  key: "law",
  label: "Law",
  options: [{ value: "EW", label: "England and Wales" }],
};

describe("applyFieldChange — text", () => {
  it("stores the value verbatim", () => {
    expect(applyFieldChange<Data>({}, text, "Acme Ltd")).toEqual({ name: "Acme Ltd" });
  });

  it("does NOT trim, so a space between words survives", () => {
    // Trimming on every keystroke stops you typing "Acme Ltd" — you press space and it vanishes.
    expect(applyFieldChange<Data>({}, text, "Acme ")).toEqual({ name: "Acme " });
  });

  it("allows clearing to empty", () => {
    expect(applyFieldChange<Data>({ name: "Acme" }, text, "")).toEqual({ name: "" });
  });

  it("leaves other keys untouched", () => {
    expect(applyFieldChange<Data>({ months: 12, name: "Old" }, text, "New")).toEqual({
      months: 12,
      name: "New",
    });
  });
});

describe("applyFieldChange — number", () => {
  it("parses a number", () => {
    expect(applyFieldChange<Data>({}, notice, "60")).toEqual({ notice: 60 });
  });

  it("clears to UNDEFINED, not zero", () => {
    // The important one. Clearing "Notice period" must not silently mean "zero days' notice";
    // it means unset, and the block's own default applies on render.
    expect(applyFieldChange<Data>({ notice: 60 }, notice, "")).toEqual({ notice: undefined });
    expect(applyFieldChange<Data>({ notice: 60 }, notice, "   ")).toEqual({ notice: undefined });
  });

  it("IGNORES an unparseable value rather than saving NaN", () => {
    // NaN serialises to null through JSON and would quietly wipe the field on the next save.
    expect(applyFieldChange<Data>({ notice: 60 }, notice, "abc")).toEqual({ notice: 60 });
  });

  it("clamps to the declared range", () => {
    expect(applyFieldChange<Data>({}, months, "0")).toEqual({ months: 1 });
    expect(applyFieldChange<Data>({}, months, "999")).toEqual({ months: 60 });
    expect(applyFieldChange<Data>({}, months, "24")).toEqual({ months: 24 });
  });

  it("accepts a negative number where no minimum is declared", () => {
    expect(applyFieldChange<Data>({}, notice, "-5")).toEqual({ notice: -5 });
  });

  it("accepts a decimal", () => {
    expect(applyFieldChange<Data>({}, notice, "1.5")).toEqual({ notice: 1.5 });
  });
});

describe("applyFieldChange — checkbox", () => {
  it("stores a real boolean, never a string", () => {
    // A `"false"` string is truthy, so getting this wrong inverts the control in the worst
    // possible way: it looks right until someone unticks it.
    expect(applyFieldChange<Data>({}, check, true)).toEqual({ autoRenew: true });
    expect(applyFieldChange<Data>({ autoRenew: true }, check, false)).toEqual({ autoRenew: false });
  });
});

describe("fieldControlValue", () => {
  it("never returns undefined, which would make the input uncontrolled", () => {
    // React switches to uncontrolled and warns, and the field then silently stops tracking state.
    for (const field of [text, notice, select] as Array<SectionField<Data>>) {
      expect(fieldControlValue<Data>({}, field), field.key).toBe("");
    }
  });

  it("returns false for an absent checkbox", () => {
    expect(fieldControlValue<Data>({}, check)).toBe(false);
  });

  it("stringifies a number for the control", () => {
    expect(fieldControlValue<Data>({ notice: 60 }, notice)).toBe("60");
  });

  it("renders zero as \"0\", not as empty", () => {
    // `0` is falsy — a naive `value || ""` shows an empty box for a real, saved zero.
    expect(fieldControlValue<Data>({ notice: 0 }, notice)).toBe("0");
  });

  it("treats null like absent", () => {
    expect(fieldControlValue<Data>({ name: null } as unknown as Data, text)).toBe("");
  });
});

describe("round trip", () => {
  it("what the control shows is what the data holds", () => {
    let data: Data = {};
    data = applyFieldChange<Data>(data, text, "Acme Ltd");
    data = applyFieldChange<Data>(data, notice, "30");
    data = applyFieldChange<Data>(data, check, true);

    expect(fieldControlValue<Data>(data, text)).toBe("Acme Ltd");
    expect(fieldControlValue<Data>(data, notice)).toBe("30");
    expect(fieldControlValue<Data>(data, check)).toBe(true);
  });
});
