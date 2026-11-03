import { describe, expect, it } from "vitest";
import {
  addCustomItem,
  carryCustomItems,
  CUSTOM_FALLBACK_MODULE_ID,
  customItemsOf,
  isCustomItem,
  newCustomItemId,
  removeCustomItem,
  updateCustomItem,
} from "@/lib/launchpad/custom-items";
import { getDefaultLaunchpadStructure } from "@/lib/launchpad/default-template";
import { allFields, fieldsById } from "@/lib/launchpad/structure";
import { launchpadStructureSchema } from "@/server/validators";
import type { LaunchpadStructure } from "@/types/launchpad";

const base = (): LaunchpadStructure => getDefaultLaunchpadStructure();

function withCustom(): LaunchpadStructure {
  const s = addCustomItem(
    base(),
    "website",
    { label: "PI certificate", helper: "Your insurer sends it.", ownedByClient: true },
    "custom-abc",
  );
  if (!s) throw new Error("fixture");
  return s;
}

describe("per-client requirements — add / edit / remove", () => {
  it("adds a custom checklist item to the named module only", () => {
    const s = withCustom();
    const field = fieldsById(s).get("custom-abc");
    expect(field).toMatchObject({
      type: "checklist_item",
      label: "PI certificate",
      helper: "Your insurer sends it.",
      ownedByClient: true,
      custom: true,
    });
    expect(s.modules.find((m) => m.id === "website")!.fields.at(-1)!.id).toBe("custom-abc");
    // Nothing else moved.
    expect(allFields(s)).toHaveLength(allFields(base()).length + 1);
  });

  it("does not mutate the structure it was given", () => {
    const original = base();
    const before = JSON.stringify(original);
    addCustomItem(original, "website", { label: "X" }, "custom-x");
    expect(JSON.stringify(original)).toBe(before);
  });

  it("refuses an unknown module, an empty label, a non-custom id or a duplicate id", () => {
    expect(addCustomItem(base(), "nope", { label: "X" }, "custom-1")).toBeNull();
    expect(addCustomItem(base(), "website", { label: "   " }, "custom-1")).toBeNull();
    expect(addCustomItem(base(), "website", { label: "X" }, "brand_assets")).toBeNull();
    expect(addCustomItem(withCustom(), "website", { label: "X" }, "custom-abc")).toBeNull();
  });

  it("edits only a custom item — a template item is never edited per client", () => {
    const s = withCustom();
    const edited = updateCustomItem(s, "custom-abc", { label: "Insurance cert", helper: null });
    expect(fieldsById(edited!).get("custom-abc")).toMatchObject({
      label: "Insurance cert",
      ownedByClient: true,
      custom: true,
    });
    expect(fieldsById(edited!).get("custom-abc")!.helper).toBeUndefined();
    expect(updateCustomItem(s, "brand_assets", { label: "Hacked" })).toBeNull();
  });

  it("removes only a custom item, and only from the snapshot", () => {
    const s = withCustom();
    const removed = removeCustomItem(s, "custom-abc");
    expect(fieldsById(removed!).has("custom-abc")).toBe(false);
    expect(allFields(removed!)).toHaveLength(allFields(base()).length);
    expect(removeCustomItem(s, "brand_assets")).toBeNull();
  });

  it("a field is custom only with BOTH the flag and the prefix", () => {
    expect(isCustomItem({ id: "custom-1", type: "checklist_item", custom: true })).toBe(true);
    expect(isCustomItem({ id: "custom-1", type: "checklist_item" })).toBe(false);
    expect(isCustomItem({ id: "brand_assets", type: "checklist_item", custom: true })).toBe(false);
    expect(isCustomItem({ id: "custom-1", type: "short_text", custom: true })).toBe(false);
  });

  it("mints ids that never collide with a template id", () => {
    const s = base();
    const id = newCustomItemId(s);
    expect(id.startsWith("custom-")).toBe(true);
    expect(fieldsById(s).has(id)).toBe(false);
    expect(id.length).toBeLessThanOrEqual(64);
  });
});

describe("a template can never mint or edit a custom item", () => {
  it("the template schema strips `custom`, so a saved template carries no custom flag", () => {
    const s = withCustom();
    const parsed = launchpadStructureSchema.parse(s) as LaunchpadStructure;
    expect(customItemsOf(parsed)).toHaveLength(0);
  });
});

describe("re-assigning a template carries custom items across", () => {
  it("keeps a custom item in the module of the same id", () => {
    const carried = carryCustomItems(withCustom(), base());
    expect(fieldsById(carried).get("custom-abc")).toMatchObject({ label: "PI certificate" });
    expect(carried.modules.find((m) => m.id === "website")!.fields.some((f) => f.id === "custom-abc")).toBe(
      true,
    );
  });

  it("falls back to the always-on module when the new template lacks the module", () => {
    const next: LaunchpadStructure = {
      modules: base().modules.filter((m) => m.id !== "website"),
    };
    const carried = carryCustomItems(withCustom(), next);
    const home = carried.modules.find((m) => m.fields.some((f) => f.id === "custom-abc"))!;
    expect(home.alwaysOn).toBe(true);
  });

  it("creates a module when the new structure has none", () => {
    const carried = carryCustomItems(withCustom(), { modules: [] });
    expect(carried.modules).toHaveLength(1);
    expect(carried.modules[0].id).toBe(CUSTOM_FALLBACK_MODULE_ID);
  });

  it("never duplicates, and carries nothing from a structure with no custom items", () => {
    const already = withCustom();
    expect(allFields(carryCustomItems(withCustom(), already))).toHaveLength(allFields(already).length);
    expect(carryCustomItems(base(), base())).toEqual(base());
    expect(carryCustomItems(null, base())).toEqual(base());
  });
});
