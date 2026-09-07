import { describe, it, expect } from "vitest";
import {
  applyItemPatch,
  computeCompleteness,
  DEFAULT_ITEM_STATUS,
  enabledModulesOf,
  fieldIdSet,
  isLaunchpadItemStatus,
  isLaunchpadStructure,
  isModuleEnabled,
  isResolved,
  outstandingSummary,
  resolveItemStatus,
  toggleableModuleIds,
  trackedDocs,
  trackedItems,
  visibleFields,
  type ItemStateValues,
} from "../structure";
import { safeLaunchpadLink, validateLaunchpadAnswer } from "../field-types";
import type {
  LaunchpadItemState,
  LaunchpadModule,
  LaunchpadStructure,
} from "@/types/launchpad";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function mod(id: string, fields: LaunchpadModule["fields"], alwaysOn = false): LaunchpadModule {
  return { id, title: id, fields, ...(alwaysOn ? { alwaysOn: true } : {}) };
}

function item(id: string, label = id) {
  return { id, type: "checklist_item" as const, label };
}

function structure(): LaunchpadStructure {
  return {
    modules: [
      mod("foundations", [item("brand", "Brand assets"), item("contacts", "Contacts")], true),
      mod("ios", [
        item("apple_account", "Apple Developer account"),
        item("icon", "App icons"),
        { id: "ios_name", type: "short_text", label: "App name" },
        { id: "ios_doc", type: "legal_doc", label: "Privacy policy", docKey: "privacy" as const },
      ]),
      mod("android", [item("play_account", "Play Console account")]),
    ],
  };
}

function state(itemId: string, status: LaunchpadItemState["status"]): LaunchpadItemState {
  return {
    itemId,
    status,
    link: null,
    note: null,
    ownedByClient: null,
    updatedBy: null,
    updatedAt: "2026-08-12T00:00:00.000Z",
  };
}

const values = (over: Partial<ItemStateValues> = {}): ItemStateValues => ({
  status: "NEEDED",
  link: null,
  note: null,
  ownedByClient: null,
  ...over,
});

// ─── Guards ───────────────────────────────────────────────────────────────────

describe("isLaunchpadStructure", () => {
  it("accepts a real structure", () => {
    expect(isLaunchpadStructure(structure())).toBe(true);
  });

  it("accepts an empty module list", () => {
    expect(isLaunchpadStructure({ modules: [] })).toBe(true);
  });

  it("rejects null, arrays and primitives", () => {
    expect(isLaunchpadStructure(null)).toBe(false);
    expect(isLaunchpadStructure([])).toBe(false);
    expect(isLaunchpadStructure("modules")).toBe(false);
    expect(isLaunchpadStructure(7)).toBe(false);
  });

  it("rejects a missing or non-array modules list", () => {
    expect(isLaunchpadStructure({})).toBe(false);
    expect(isLaunchpadStructure({ modules: {} })).toBe(false);
  });

  it("rejects a module with no id or no fields array — the shapes a hand-edited snapshot produces", () => {
    expect(isLaunchpadStructure({ modules: [{ fields: [] }] })).toBe(false);
    expect(isLaunchpadStructure({ modules: [{ id: "a" }] })).toBe(false);
    expect(isLaunchpadStructure({ modules: [{ id: "a", fields: {} }] })).toBe(false);
  });

  it("rejects an onboarding structure, which is the realistic mix-up", () => {
    expect(isLaunchpadStructure({ welcome: {}, steps: [], review: {} })).toBe(false);
  });
});

describe("isLaunchpadItemStatus", () => {
  it("accepts the three statuses and nothing else", () => {
    expect(isLaunchpadItemStatus("NEEDED")).toBe(true);
    expect(isLaunchpadItemStatus("PROVIDED")).toBe(true);
    expect(isLaunchpadItemStatus("NA")).toBe(true);
    expect(isLaunchpadItemStatus("needed")).toBe(false);
    expect(isLaunchpadItemStatus("DONE")).toBe(false);
    expect(isLaunchpadItemStatus(null)).toBe(false);
  });
});

// ─── Module enablement ────────────────────────────────────────────────────────

describe("module enablement", () => {
  const s = structure();

  it("treats an alwaysOn module as enabled even when the list is empty", () => {
    // The state a freshly-assigned kit starts in — it must not be a blank page.
    expect(isModuleEnabled(s.modules[0], [])).toBe(true);
    expect(enabledModulesOf(s, []).map((m) => m.id)).toEqual(["foundations"]);
  });

  it("enables a listed module", () => {
    expect(enabledModulesOf(s, ["ios"]).map((m) => m.id)).toEqual(["foundations", "ios"]);
  });

  it("keeps structure order regardless of the order given", () => {
    expect(enabledModulesOf(s, ["android", "ios"]).map((m) => m.id)).toEqual([
      "foundations",
      "ios",
      "android",
    ]);
  });

  it("excludes alwaysOn modules from the toggleable set", () => {
    expect(toggleableModuleIds(s)).toEqual(["ios", "android"]);
  });
});

// ─── Walkers ──────────────────────────────────────────────────────────────────

describe("walkers", () => {
  const s = structure();

  it("fieldIdSet spans every module, enabled or not", () => {
    expect(fieldIdSet(s).has("play_account")).toBe(true);
  });

  it("visibleFields only covers enabled modules", () => {
    const ids = visibleFields(s, ["ios"], {}).map((f) => f.id);
    expect(ids).toContain("apple_account");
    expect(ids).not.toContain("play_account");
  });

  it("trackedItems returns only checklist items — not text fields or docs", () => {
    const ids = trackedItems(s, ["ios"]).map((f) => f.id);
    expect(ids).toEqual(["brand", "contacts", "apple_account", "icon"]);
  });

  it("trackedDocs returns only legal docs carrying a docKey", () => {
    expect(trackedDocs(s, ["ios"]).map((f) => f.id)).toEqual(["ios_doc"]);
  });

  it("skips a legal_doc with no docKey rather than rendering a broken panel", () => {
    const broken: LaunchpadStructure = {
      modules: [mod("m", [{ id: "d", type: "legal_doc", label: "Doc" }], true)],
    };
    expect(trackedDocs(broken, [])).toEqual([]);
  });

  it("honours showIf, and falls open when the controller is missing", () => {
    const s2: LaunchpadStructure = {
      modules: [
        mod(
          "m",
          [
            { id: "gate", type: "checkbox", label: "Gate" },
            { id: "shown", type: "checklist_item", label: "Shown", showIf: { fieldId: "gate", equals: true } },
            { id: "orphan", type: "checklist_item", label: "Orphan", showIf: { fieldId: "gone", equals: true } },
          ],
          true,
        ),
      ],
    };
    expect(trackedItems(s2, [], { gate: false }).map((f) => f.id)).toEqual(["orphan"]);
    expect(trackedItems(s2, [], { gate: true }).map((f) => f.id)).toEqual(["shown", "orphan"]);
  });
});

// ─── The status machine ───────────────────────────────────────────────────────

describe("resolveItemStatus", () => {
  it("defaults a row-less item to NEEDED", () => {
    // The opposite call from Care's reply state, and deliberately so: the template
    // ASKED for this, so untouched genuinely means outstanding.
    expect(resolveItemStatus(undefined)).toBe("NEEDED");
    expect(resolveItemStatus(null)).toBe("NEEDED");
    expect(DEFAULT_ITEM_STATUS).toBe("NEEDED");
  });

  it("reads a stored status", () => {
    expect(resolveItemStatus(state("x", "PROVIDED"))).toBe("PROVIDED");
  });
});

describe("isResolved", () => {
  it("counts NA as resolved — it is an answer, not a gap", () => {
    expect(isResolved("PROVIDED")).toBe(true);
    expect(isResolved("NA")).toBe(true);
    expect(isResolved("NEEDED")).toBe(false);
  });
});

describe("applyItemPatch", () => {
  it("rule 1: a link arriving on an untouched requirement advances it to PROVIDED", () => {
    const next = applyItemPatch(values(), { link: "https://drive.google.com/x" });
    expect(next.status).toBe("PROVIDED");
    expect(next.link).toBe("https://drive.google.com/x");
  });

  it("rule 1 does not fire on an NA item — only NEEDED auto-advances", () => {
    const next = applyItemPatch(values({ status: "NA" }), { link: "https://x.com/a" });
    expect(next.status).toBe("NA");
  });

  it("rule 2: clearing the link on a PROVIDED item reverts it to NEEDED", () => {
    const next = applyItemPatch(values({ status: "PROVIDED", link: "https://x.com/a" }), { link: "" });
    expect(next.status).toBe("NEEDED");
    expect(next.link).toBeNull();
  });

  it("rule 2 treats whitespace as cleared", () => {
    const next = applyItemPatch(values({ status: "PROVIDED", link: "https://x.com/a" }), { link: "   " });
    expect(next.status).toBe("NEEDED");
    expect(next.link).toBeNull();
  });

  it("rule 3: an explicit status beats both inferences", () => {
    // Provided by other means — access granted in a vault, no link to give.
    const a = applyItemPatch(values(), { status: "PROVIDED" });
    expect(a.status).toBe("PROVIDED");
    expect(a.link).toBeNull();

    // And an explicit status wins even when the link would have inferred otherwise.
    const b = applyItemPatch(values({ status: "PROVIDED", link: "https://x.com/a" }), {
      status: "NA",
      link: "",
    });
    expect(b.status).toBe("NA");
  });

  it("rule 4: marking NA never clears a stored link", () => {
    const next = applyItemPatch(values({ status: "PROVIDED", link: "https://x.com/a" }), {
      status: "NA",
    });
    expect(next.link).toBe("https://x.com/a");
  });

  it("leaves status alone when only a note or owner changes", () => {
    const next = applyItemPatch(values({ status: "PROVIDED", link: "https://x.com/a" }), {
      note: "chased 12 Aug",
      ownedByClient: false,
    });
    expect(next.status).toBe("PROVIDED");
    expect(next.note).toBe("chased 12 Aug");
    expect(next.ownedByClient).toBe(false);
  });

  it("normalises a blank note to null rather than storing an empty string", () => {
    expect(applyItemPatch(values({ note: "old" }), { note: "  " }).note).toBeNull();
  });

  it("every status is reachable from every other — a mis-mark must be undoable", () => {
    const all = ["NEEDED", "PROVIDED", "NA"] as const;
    for (const from of all) {
      for (const to of all) {
        expect(applyItemPatch(values({ status: from }), { status: to }).status).toBe(to);
      }
    }
  });
});

// ─── Completeness ─────────────────────────────────────────────────────────────

describe("computeCompleteness", () => {
  const s = structure();

  it("counts only the enabled modules — a client is never behind on work nobody asked for", () => {
    const c = computeCompleteness(s, [], []);
    expect(c.total).toBe(2); // foundations only
    expect(c.outstanding).toEqual(["Brand assets", "Contacts"]);
  });

  it("grows when a module is switched on", () => {
    const c = computeCompleteness(s, ["ios"], []);
    expect(c.total).toBe(4);
  });

  it("treats a row-less item as NEEDED", () => {
    const c = computeCompleteness(s, [], []);
    expect(c.needed).toBe(2);
    expect(c.percent).toBe(0);
  });

  it("counts NA toward the percentage but not toward provided", () => {
    const c = computeCompleteness(s, [], [state("brand", "NA"), state("contacts", "PROVIDED")]);
    expect(c.provided).toBe(1);
    expect(c.na).toBe(1);
    expect(c.needed).toBe(0);
    expect(c.percent).toBe(100);
  });

  it("rounds a partial figure", () => {
    const c = computeCompleteness(s, ["ios"], [state("brand", "PROVIDED")]);
    expect(c.total).toBe(4);
    expect(c.percent).toBe(25);
  });

  it("reports an empty kit as 100%, not 0% — it owes nothing", () => {
    const empty: LaunchpadStructure = { modules: [mod("m", [], true)] };
    const c = computeCompleteness(empty, [], []);
    expect(c.total).toBe(0);
    expect(c.percent).toBe(100);
    expect(c.outstanding).toEqual([]);
  });

  it("excludes legal docs from the percentage", () => {
    // The kit's ios module holds one legal_doc and one text field; neither counts.
    const c = computeCompleteness(s, ["ios"], []);
    expect(c.total).toBe(4);
  });

  it("ignores a stored row for an item outside the enabled modules", () => {
    const c = computeCompleteness(s, [], [state("play_account", "PROVIDED")]);
    expect(c.total).toBe(2);
    expect(c.provided).toBe(0);
  });

  it("lists outstanding labels in structure order", () => {
    const c = computeCompleteness(s, ["ios", "android"], [state("brand", "PROVIDED")]);
    expect(c.outstanding).toEqual([
      "Contacts",
      "Apple Developer account",
      "App icons",
      "Play Console account",
    ]);
  });
});

describe("outstandingSummary", () => {
  const base = { total: 9, provided: 0, na: 0, needed: 0, percent: 0 };

  it("is null when nothing is outstanding", () => {
    expect(outstandingSummary({ ...base, outstanding: [] })).toBeNull();
  });

  it("joins up to the cap", () => {
    expect(outstandingSummary({ ...base, outstanding: ["a", "b"] })).toBe("a, b");
  });

  it("summarises the tail rather than blowing out a card", () => {
    expect(outstandingSummary({ ...base, outstanding: ["a", "b", "c", "d", "e"] })).toBe(
      "a, b, c +2 more",
    );
  });
});

// ─── Link safety ──────────────────────────────────────────────────────────────

describe("safeLaunchpadLink", () => {
  it("accepts ordinary http(s) links", () => {
    expect(safeLaunchpadLink("https://drive.google.com/x")).toBe("https://drive.google.com/x");
    expect(safeLaunchpadLink("http://example.com")).toBe("http://example.com");
    expect(safeLaunchpadLink("  https://x.com/a  ")).toBe("https://x.com/a");
  });

  it("rejects every non-http(s) scheme — this renders as an <a href>", () => {
    // The item link had NO validation at all on the first cut, so each of these was
    // reachable from a paste. Allow-list, not blocklist.
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(safeLaunchpadLink(bad), bad).toBeNull();
    }
  });

  it("rejects a bare hostname — the commonest thing a client actually types", () => {
    expect(safeLaunchpadLink("acme.com")).toBeNull();
    expect(safeLaunchpadLink("www.acme.com/brand")).toBeNull();
  });

  it("rejects blank, null and over-long values", () => {
    expect(safeLaunchpadLink("")).toBeNull();
    expect(safeLaunchpadLink("   ")).toBeNull();
    expect(safeLaunchpadLink(null)).toBeNull();
    expect(safeLaunchpadLink(undefined)).toBeNull();
    expect(safeLaunchpadLink(`https://x.com/${"a".repeat(2100)}`)).toBeNull();
  });

  it("is the SAME rule the link field type validates with", () => {
    // Two copies of this rule is exactly how the item path ended up accepting
    // `javascript:` while the field path did not.
    const def = { id: "l", type: "link" as const, label: "Link" };
    expect(validateLaunchpadAnswer(def, "javascript:alert(1)").ok).toBe(false);
    expect(validateLaunchpadAnswer(def, "https://x.com/a").value).toBe("https://x.com/a");
    // Blank is allowed through on both paths — it is how a field is cleared.
    expect(validateLaunchpadAnswer(def, "").ok).toBe(true);
  });
});
