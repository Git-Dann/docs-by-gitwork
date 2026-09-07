import { describe, it, expect } from "vitest";
import {
  DEFAULT_LAUNCHPAD_TEMPLATE_SLUG,
  getDefaultLaunchpadStructure,
} from "../default-template";
import { isLaunchpadStructure, allFields, toggleableModuleIds } from "../structure";
import { LAUNCHPAD_FIELD_TYPE_REGISTRY, hasOwnTable } from "../field-types";
import { isLaunchpadDocKey, legalDocFields } from "../legal/render";
import { isPrefillKey, PREFILL_KEYS } from "../prefill";
import type { LaunchpadFieldDef } from "@/types/launchpad";

const structure = getDefaultLaunchpadStructure();
const fields = allFields(structure);
const checklist = fields.filter((f) => f.type === "checklist_item");

describe("the default Launchpad structure", () => {
  it("is a valid structure", () => {
    expect(isLaunchpadStructure(structure)).toBe(true);
    expect(DEFAULT_LAUNCHPAD_TEMPLATE_SLUG).toBe("gitwork-launchpad-default");
  });

  it("ships the six agreed modules, in order", () => {
    expect(structure.modules.map((m) => m.id)).toEqual([
      "foundations",
      "website",
      "payments",
      "ios",
      "android",
      "compliance",
    ]);
  });

  it("makes Foundations always-on and everything else toggleable", () => {
    expect(structure.modules[0].alwaysOn).toBe(true);
    expect(toggleableModuleIds(structure)).toEqual([
      "website",
      "payments",
      "ios",
      "android",
      "compliance",
    ]);
  });

  it("gives every module a title and a blurb", () => {
    for (const m of structure.modules) {
      expect(m.title.length, m.id).toBeGreaterThan(2);
      expect(m.blurb?.length ?? 0, `${m.id} has no blurb`).toBeGreaterThan(20);
    }
  });
});

describe("field ids", () => {
  it("are unique across the WHOLE structure, not just per module", () => {
    // The id is simultaneously the answer key, the LaunchpadItem.itemId (unique per
    // kit) and the React key. A collision across two modules would make two
    // requirements share one status row and silently move together.
    const ids = fields.map((f) => f.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("are non-empty and free of whitespace", () => {
    for (const f of fields) {
      expect(f.id.length, JSON.stringify(f)).toBeGreaterThan(0);
      expect(f.id, f.id).not.toMatch(/\s/);
    }
  });
});

describe("every requirement is actionable", () => {
  it("carries a why/how helper — a checklist of bare nouns makes the client guess", () => {
    // This is the house rule the whole feature turns on. A requirement with no
    // helper is the back-and-forth Launchpad exists to remove.
    for (const f of checklist) {
      expect(f.helper?.length ?? 0, `"${f.label}" has no helper`).toBeGreaterThan(20);
    }
  });

  it("gives every field a helper, not only the checklist items", () => {
    for (const f of fields) {
      if (f.type === "static") continue;
      expect(f.helper?.length ?? 0, `"${f.label}" (${f.type}) has no helper`).toBeGreaterThan(10);
    }
  });

  it("gives every field a label", () => {
    for (const f of fields) {
      if (f.type === "static") continue;
      expect(f.label.length, f.id).toBeGreaterThan(1);
    }
  });
});

describe("account ownership", () => {
  /** The accounts that must be in the client's name. Each is here because owning it
   *  ourselves creates a real problem the day the client wants to leave. */
  const CLIENT_OWNED = [
    "apple_developer_account",
    "play_console_account",
    "merchant_account",
    "domain_and_dns",
    "hosting_registrar_access",
    "analytics_account",
    "cms_credentials",
  ];

  it.each(CLIENT_OWNED)("%s defaults to client-owned", (id) => {
    const field = fields.find((f) => f.id === id);
    expect(field, `${id} is missing from the template`).toBeDefined();
    expect(field?.ownedByClient).toBe(true);
  });

  it("never leaves an account item's ownership undefined", () => {
    // An undefined default renders as "unassigned", which is how an App Store
    // account quietly ends up in Gitwork's name.
    const accountish = checklist.filter((f) => /account|access|credential|key/i.test(f.label));
    for (const f of accountish) {
      expect(f.ownedByClient, `"${f.label}" has no ownership default`).toBe(true);
    }
  });
});

describe("legal docs", () => {
  const docs = fields.filter((f) => f.type === "legal_doc");

  it("ships all three generators", () => {
    expect(docs.map((d) => d.docKey)).toEqual(["cookie", "terms", "privacy"]);
  });

  it("points every legal_doc at a real generator", () => {
    for (const d of docs) {
      expect(isLaunchpadDocKey(d.docKey), `${d.id} → ${d.docKey}`).toBe(true);
      expect(legalDocFields(d.docKey!).length).toBeGreaterThan(3);
    }
  });

  it("puts them in the Website module, where a client goes looking for them", () => {
    const website = structure.modules.find((m) => m.id === "website")!;
    expect(website.fields.filter((f) => f.type === "legal_doc")).toHaveLength(3);
  });
});

describe("prefill keys", () => {
  it("only names keys in the allow-list", () => {
    // A key outside it silently prefills nothing, so a typo would look like a bug
    // in the client's data rather than in the template.
    for (const f of fields) {
      if (!f.prefillKey) continue;
      expect(isPrefillKey(f.prefillKey), `${f.id} → ${f.prefillKey}`).toBe(true);
    }
  });

  it("is also true of every legal-doc question", () => {
    for (const key of ["cookie", "terms", "privacy"] as const) {
      for (const field of legalDocFields(key)) {
        if (!field.prefillKey) continue;
        expect(isPrefillKey(field.prefillKey), `${key}.${field.id} → ${field.prefillKey}`).toBe(true);
      }
    }
  });

  it("never offers a key that would expose bank or credential data", () => {
    // The allow-list is the security boundary — this asserts what is NOT in it.
    for (const forbidden of ["bankAccount", "accountNumber", "sortCode", "notes", "id"]) {
      expect(PREFILL_KEYS as readonly string[]).not.toContain(forbidden);
    }
  });

  it("never puts a prefillKey on a field type that has no flat answer", () => {
    // A checklist item or a doc has no single value to prefill INTO.
    for (const f of fields) {
      if (f.prefillKey) expect(hasOwnTable(f.type), f.id).toBe(false);
    }
  });
});

describe("field types used", () => {
  it("only uses types the registry knows", () => {
    for (const f of fields) {
      expect(LAUNCHPAD_FIELD_TYPE_REGISTRY[f.type], `${f.id}: ${f.type}`).toBeDefined();
    }
  });

  it("never uses bank_details — that is onboarding's job", () => {
    // Launchpad points the client at their provider; it must never become a second
    // place bank details are collected.
    expect(fields.some((f) => f.type === "bank_details")).toBe(false);
  });

  it("gives every select at least two options", () => {
    for (const f of fields) {
      if (f.type === "select") {
        expect(f.options?.length, f.id).toBeGreaterThan(1);
      }
    }
  });
});

describe("the store-submission requirements are covered", () => {
  // Each of these blocks an App Store or Play submission outright, so a template
  // missing one costs a review cycle — the thing the iOS/Android modules exist for.
  const REQUIRED_IDS: Array<[string, string]> = [
    ["ios_app_icon", "App Store rejects a build with no 1024px icon"],
    ["ios_screenshots", "App Store rejects a submission with no screenshots"],
    ["ios_privacy_answers", "privacy nutrition labels are mandatory"],
    ["ios_support_url", "a support URL is a hard requirement"],
    ["android_feature_graphic", "Play will not publish without one"],
    ["android_data_safety", "the data-safety form is mandatory"],
    ["android_privacy_url", "Play rejects a placeholder privacy URL"],
  ];

  it.each(REQUIRED_IDS)("covers %s (%s)", (id) => {
    expect(fields.some((f: LaunchpadFieldDef) => f.id === id)).toBe(true);
  });
});
