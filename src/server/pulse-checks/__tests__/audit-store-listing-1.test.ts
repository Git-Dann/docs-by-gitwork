import { describe, expect, it } from "vitest";
import { privacyPolicyOwner, type StoreListing } from "@/server/pulse-checks/store-listing";

function listing(overrides: Partial<StoreListing>): StoreListing {
  return {
    store: "chrome_web_store",
    name: null,
    developer: null,
    genre: null,
    subtitle: null,
    description: null,
    shortDescription: null,
    rating: null,
    screenshots: { total: 0, byDevice: {} },
    hasPreviewVideo: false,
    ageRating: null,
    privacyPolicyUrl: null,
    privacyDeclaration: { declared: false, lines: [] },
    dataDeletable: null,
    hasInAppPurchases: null,
    copyright: null,
    bundleId: null,
    ...overrides,
  };
}

describe("store_privacy_policy_owner — policies on shared code hosts", () => {
  it("matches a policy hosted in the publisher's own GitHub account (uBlock Origin Lite, observed 2026-10)", () => {
    const result = privacyPolicyOwner(listing({
      name: "uBlock Origin Lite",
      developer: "Raymond Hill (gorhill)",
      privacyPolicyUrl: "https://github.com/gorhill/uBlock/wiki/Privacy-policy",
    }));
    expect(result).toEqual({ matches: true, host: "github.com" });
  });

  it("still flags a GitHub-hosted policy that lives under someone else's account", () => {
    const result = privacyPolicyOwner(listing({
      store: "app_store",
      name: "Beyond Nutrition UK",
      developer: "BEYOND NUTRITION UK LTD",
      privacyPolicyUrl: "https://github.com/trainerize/legal/blob/main/privacy.md",
    }));
    expect(result).toEqual({ matches: false, host: "github.com" });
  });

  it("leaves non-code-host vendor domains flagged (trainerize.com for Beyond Nutrition UK)", () => {
    const result = privacyPolicyOwner(listing({
      store: "app_store",
      name: "Beyond Nutrition UK",
      developer: "BEYOND NUTRITION UK LTD",
      privacyPolicyUrl: "https://www.trainerize.com/privacy",
    }));
    expect(result).toEqual({ matches: false, host: "trainerize.com" });
  });

  it("does not use path segments on ordinary domains", () => {
    const result = privacyPolicyOwner(listing({
      store: "app_store",
      name: "Beyond Nutrition UK",
      developer: "BEYOND NUTRITION UK LTD",
      privacyPolicyUrl: "https://www.trainerize.com/beyondnutrition/privacy",
    }));
    expect(result?.matches).toBe(false);
  });

  it("keeps matching a publisher's own domain (WhatsApp)", () => {
    const result = privacyPolicyOwner(listing({
      store: "app_store",
      name: "WhatsApp Messenger",
      developer: "WhatsApp Inc.",
      privacyPolicyUrl: "https://www.whatsapp.com/legal/privacy-policy",
    }));
    expect(result).toEqual({ matches: true, host: "whatsapp.com" });
  });

  it("does not let the code host's own name match a token across the host/owner join", () => {
    const result = privacyPolicyOwner(listing({
      name: "Comet Notes",
      developer: "Comet Labs",
      privacyPolicyUrl: "https://github.com/et-cetera/privacy",
    }));
    expect(result?.matches).toBe(false);
  });

  it("falls back to the host for a bare code-host URL with no owner segment", () => {
    const result = privacyPolicyOwner(listing({
      name: "GitHub Mobile",
      developer: "GitHub",
      privacyPolicyUrl: "https://github.com/",
    }));
    expect(result).toEqual({ matches: true, host: "github.com" });
  });
});
