// @vitest-environment node
import { describe, expect, it } from "vitest";
import { auditLicences, copyleftKind, licenceCheck, projectCopyleft } from "../licences";
import type { LockedPackage } from "../dependencies";

describe("copyleftKind", () => {
  it("classifies SPDX expressions", () => {
    expect(copyleftKind("MIT")).toBeNull();
    expect(copyleftKind("AGPL-3.0-only")).toBe("network");
    expect(copyleftKind("SSPL-1.0")).toBe("network");
    expect(copyleftKind("GPL-3.0-or-later")).toBe("strong");
    // Weak copyleft is not flagged; \bGPL must not match inside LGPL or AGPL.
    expect(copyleftKind("LGPL-2.1")).toBeNull();
    expect(copyleftKind("MPL-2.0")).toBeNull();
    // A permissive option means the project can choose it.
    expect(copyleftKind("MIT OR GPL-3.0")).toBeNull();
    expect(copyleftKind("(GPL-2.0 OR AGPL-3.0)")).toBe("network");
    // AND: every part applies.
    expect(copyleftKind("MIT AND GPL-2.0")).toBe("strong");
    // An exception exists to lift the obligation.
    expect(copyleftKind("GPL-2.0-only WITH Classpath-exception-2.0")).toBeNull();
  });
});

describe("projectCopyleft", () => {
  it("reads the project's own licence", () => {
    expect(projectCopyleft("                    GNU AFFERO GENERAL PUBLIC LICENSE\n Version 3", null)).toBe("network");
    expect(projectCopyleft("GNU GENERAL PUBLIC LICENSE Version 2", null)).toBe("strong");
    expect(projectCopyleft("GNU LESSER GENERAL PUBLIC LICENSE", null)).toBeNull();
    expect(projectCopyleft("MIT License", "MIT")).toBeNull();
    expect(projectCopyleft(null, "GPL-3.0")).toBe("strong");
  });
});

const pkg = (name: string, direct: boolean | null = true): LockedPackage => ({ ecosystem: "npm", name, version: "1.0.0", direct });
/** A fake deps.dev answering from a table; anything missing is a 404. */
const depsDev = (table: Record<string, string[] | "non-standard">) =>
  (async (url: string | URL) => {
    const name = decodeURIComponent(String(url).split("/packages/")[1].split("/versions/")[0]);
    const l = table[name];
    if (!l) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ licenses: l === "non-standard" ? ["non-standard"] : l }), { status: 200 });
  }) as typeof fetch;

describe("auditLicences + licenceCheck", () => {
  const none = { licenceText: null, manifestLicence: null };

  it("warns on AGPL in a proprietary project, naming the library", async () => {
    const a = await auditLicences([pkg("react"), pkg("ghostscript-js")], none, depsDev({ react: ["MIT"], "ghostscript-js": ["AGPL-3.0-only"] }));
    const c = licenceCheck(a);
    expect(c.status).toBe("WARN");
    expect(c.severity).toBe("HIGH");
    expect(c.detail).toContain("ghostscript-js 1.0.0 (AGPL-3.0-only)");
  });

  it("only looks up declared libraries, not transitive ones", async () => {
    const a = await auditLicences([pkg("react"), pkg("deep-gpl", false)], none, depsDev({ react: ["MIT"], "deep-gpl": ["GPL-3.0"] }));
    expect(a.direct).toBe(1);
    expect(licenceCheck(a).status).toBe("PASS");
  });

  it("a GPL project may use GPL libraries", async () => {
    const a = await auditLicences([pkg("gpl-lib")], { licenceText: "GNU GENERAL PUBLIC LICENSE", manifestLicence: null }, depsDev({ "gpl-lib": ["GPL-2.0"] }));
    expect(licenceCheck(a).status).toBe("PASS");
  });

  it("unknown licences are not clean: too few known is INCONCLUSIVE", async () => {
    const a = await auditLicences([pkg("a"), pkg("b"), pkg("c")], none, depsDev({ a: ["MIT"], b: "non-standard" }));
    expect(a.known).toBe(1);
    expect(licenceCheck(a).status).toBe("INCONCLUSIVE");
  });

  it("no declared libraries, or no audit, is INCONCLUSIVE", async () => {
    expect(licenceCheck(await auditLicences([pkg("x", null)], none, depsDev({})))).toMatchObject({ status: "INCONCLUSIVE" });
    expect(licenceCheck(null).status).toBe("INCONCLUSIVE");
  });
});
