import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTAKE_CATEGORIES,
  MAX_CATEGORY_LABEL,
  MAX_INTAKE_CATEGORIES,
  displayCategory,
  parseIntakeCategories,
  resolveIntakeCategories,
  slugifyCategory,
  typeForCategory,
  usesDefaultCategories,
  validateIntakeCategories,
  type IntakeCategory,
} from "@/lib/wiki-intake-categories";

const CUSTOM: IntakeCategory[] = [
  { id: "bug", label: "Bug", mapsTo: "BUG" },
  { id: "content-tweak", label: "Content tweak", mapsTo: "TASK" },
  { id: "quick-design-fix-v1", label: "Quick Design fix (V1)", mapsTo: "DESIGN" },
];

describe("parseIntakeCategories", () => {
  it("returns null for anything that isn't a usable list, so callers fall back to defaults", () => {
    expect(parseIntakeCategories(null)).toBeNull();
    expect(parseIntakeCategories(undefined)).toBeNull();
    expect(parseIntakeCategories({})).toBeNull();
    expect(parseIntakeCategories([])).toBeNull();
    expect(parseIntakeCategories("Bug,Design")).toBeNull();
  });

  it("keeps well-formed rows and drops malformed ones rather than trusting the Json column", () => {
    const parsed = parseIntakeCategories([
      { id: "bug", label: "Bug", mapsTo: "BUG" },
      { id: "x", label: "No type" },
      { id: "y", label: "Bad type", mapsTo: "NONSENSE" },
      { label: "No id", mapsTo: "BUG" },
      { id: "  ", label: "Blank id", mapsTo: "BUG" },
      { id: "ok", label: "   ", mapsTo: "BUG" },
      "not an object",
      { id: "design", label: "Design polish", mapsTo: "DESIGN" },
    ]);
    expect(parsed).toEqual([
      { id: "bug", label: "Bug", mapsTo: "BUG" },
      { id: "design", label: "Design polish", mapsTo: "DESIGN" },
    ]);
  });

  it("drops duplicate ids, keeping the first", () => {
    const parsed = parseIntakeCategories([
      { id: "bug", label: "Bug", mapsTo: "BUG" },
      { id: "bug", label: "Bug again", mapsTo: "DESIGN" },
    ]);
    expect(parsed).toEqual([{ id: "bug", label: "Bug", mapsTo: "BUG" }]);
  });

  it("caps the list length", () => {
    const many = Array.from({ length: MAX_INTAKE_CATEGORIES + 5 }, (_, i) => ({
      id: `c${i}`,
      label: `Category ${i}`,
      mapsTo: "TASK" as const,
    }));
    expect(parseIntakeCategories(many)).toHaveLength(MAX_INTAKE_CATEGORIES);
  });
});

describe("resolveIntakeCategories / usesDefaultCategories", () => {
  it("falls back to the built-in four when nothing is configured", () => {
    expect(resolveIntakeCategories(null)).toEqual(DEFAULT_INTAKE_CATEGORIES);
    expect(usesDefaultCategories(null)).toBe(true);
    expect(DEFAULT_INTAKE_CATEGORIES.map((c) => c.mapsTo)).toEqual([
      "BUG",
      "FEEDBACK",
      "TASK",
      "DESIGN",
    ]);
  });

  it("uses the custom list when there is one", () => {
    expect(resolveIntakeCategories(CUSTOM)).toEqual(CUSTOM);
    expect(usesDefaultCategories(CUSTOM)).toBe(false);
  });

  it("default ids are the type names, so switching to custom can't orphan old requests", () => {
    for (const c of DEFAULT_INTAKE_CATEGORIES) expect(c.id).toBe(c.mapsTo);
  });
});

describe("validateIntakeCategories", () => {
  it("accepts a good list and derives ids from labels when absent", () => {
    const result = validateIntakeCategories([
      { label: "Quick Tech fix (V1)", mapsTo: "TASK" },
      { label: "Design to be polished V1.1", mapsTo: "DESIGN" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.categories[0].id).toBe("quick-tech-fix-v1");
    expect(result.categories[1].id).toBe("design-to-be-polished-v1-1");
  });

  it("rejects a blank name rather than silently dropping the row", () => {
    const result = validateIntakeCategories([{ label: "   ", mapsTo: "BUG" }]);
    expect(result).toEqual({ ok: false, error: "Every category needs a name." });
  });

  it("rejects an unknown type", () => {
    const result = validateIntakeCategories([{ label: "Something", mapsTo: "EPIC" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Something");
  });

  it("rejects duplicate names — a client couldn't tell them apart", () => {
    const result = validateIntakeCategories([
      { label: "Content tweak", mapsTo: "TASK" },
      { label: "content TWEAK", mapsTo: "DESIGN" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Duplicate");
  });

  it("rejects an over-long name and an over-long list", () => {
    expect(validateIntakeCategories([{ label: "x".repeat(MAX_CATEGORY_LABEL + 1), mapsTo: "BUG" }]).ok).toBe(false);
    const many = Array.from({ length: MAX_INTAKE_CATEGORIES + 1 }, (_, i) => ({
      label: `Category ${i}`,
      mapsTo: "TASK" as const,
    }));
    expect(validateIntakeCategories(many).ok).toBe(false);
  });

  it("accepts an empty list — that's how you clear back to the defaults", () => {
    const result = validateIntakeCategories([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.categories).toEqual([]);
  });
});

describe("typeForCategory", () => {
  it("derives the type from the category, never from the caller", () => {
    expect(typeForCategory(CUSTOM, "quick-design-fix-v1")).toEqual({
      type: "DESIGN",
      categoryId: "quick-design-fix-v1",
      categoryLabel: "Quick Design fix (V1)",
    });
  });

  it("falls back cleanly for an unknown or missing id", () => {
    expect(typeForCategory(CUSTOM, "nope")).toEqual({
      type: "FEEDBACK",
      categoryId: null,
      categoryLabel: null,
    });
    expect(typeForCategory(CUSTOM, null).categoryId).toBeNull();
  });

  it("honours an explicit fallback type", () => {
    expect(typeForCategory(CUSTOM, null, "BUG").type).toBe("BUG");
  });
});

describe("displayCategory", () => {
  it("prefers the live label, so a rename reaches requests already raised", () => {
    const renamed: IntakeCategory[] = [
      { id: "content-tweak", label: "Copy change", mapsTo: "TASK" },
    ];
    const shown = displayCategory(renamed, {
      categoryId: "content-tweak",
      categoryLabel: "Content tweak",
      type: "TASK",
    });
    expect(shown).toBe("Copy change");
  });

  it("falls back to the snapshot when the category was deleted", () => {
    const shown = displayCategory([], {
      categoryId: "content-tweak",
      categoryLabel: "Content tweak",
      type: "TASK",
    });
    expect(shown).toBe("Content tweak");
  });

  it("falls back to the underlying type when there is no category at all", () => {
    expect(displayCategory([], { categoryId: null, categoryLabel: null, type: "DESIGN" })).toBe("Design");
    expect(displayCategory([], { categoryId: null, categoryLabel: null, type: "TASK" })).toBe("Request");
  });
});

describe("slugifyCategory", () => {
  it("produces a readable, stable ascii id", () => {
    expect(slugifyCategory("Quick Design fix (V1)")).toBe("quick-design-fix-v1");
    expect(slugifyCategory("Feature → 1.1")).toBe("feature-1-1");
  });

  it("never returns an empty id", () => {
    expect(slugifyCategory("→→→")).toBe("category");
    expect(slugifyCategory("")).toBe("category");
  });
});
