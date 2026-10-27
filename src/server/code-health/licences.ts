import { CATEGORIES } from "@/server/pulse-checks/categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { LockedPackage } from "./dependencies";

/**
 * Licence review of the libraries a project declares itself.
 *
 * The lockfile audit already knows every pinned (ecosystem, name, version). The licence of
 * each DIRECT dependency is looked up in deps.dev (Google's Open Source Insights, free, no
 * key), which reports SPDX expressions per version. Transitive dependencies are not looked
 * up: they would be thousands of calls, and a strong-copyleft library almost always enters
 * a project as something someone chose.
 *
 * What is flagged, and why it is a WARN and never a FAIL:
 *  - network copyleft (AGPL, SSPL): obligations reach users who only use the software over
 *    a network, so a web service is affected;
 *  - strong copyleft (GPL): obligations apply when the software is DISTRIBUTED (an app, a
 *    desktop build, a published package), not when it only runs on your own server.
 * Pulse cannot tell how the software is distributed or whether there is a commercial licence,
 * so the finding is "needs a licence review", never "you are in breach".
 *
 * Weak copyleft (LGPL, MPL, EPL) is not flagged. A dual licence ("MIT OR GPL-3.0") is not
 * flagged, because the project may pick the permissive option. A project that is itself
 * GPL or AGPL may use those libraries, so they are not flagged for it.
 */

const DEPS_DEV = "https://api.deps.dev/v3/systems";
export const MAX_LICENCE_LOOKUPS = 300;
const CONCURRENCY = 10;
const TIMEOUT_MS = 6_000;
/** Below this share of direct dependencies with a known licence, the answer is not established. */
export const MIN_LICENCE_COVERAGE = 0.8;

const SYSTEM: Partial<Record<LockedPackage["ecosystem"], string>> = {
  npm: "npm",
  PyPI: "pypi",
  Go: "go",
  "crates.io": "cargo",
  Maven: "maven",
  NuGet: "nuget",
  RubyGems: "rubygems",
};

export type CopyleftKind = "network" | "strong";

/** Classify one SPDX expression. Null = permissive, weak copyleft, or a permissive option exists. */
export function copyleftKind(expression: string): CopyleftKind | null {
  const options = expression.split(/\s+OR\s+/i);
  let worst: CopyleftKind | null = null;
  for (const option of options) {
    // AND means every part applies, so the strictest part decides this option.
    const parts = option.replace(/[()]/g, " ").split(/\s+AND\s+/i);
    let kind: CopyleftKind | null = null;
    for (const p of parts) {
      if (/\b(AGPL|SSPL)\b/i.test(p)) kind = "network";
      // \bGPL does not match inside LGPL or AGPL (no word boundary between the letters).
      // A "WITH ... exception" (Classpath, GCC runtime) exists to remove the obligation.
      else if (/\bGPL\b/i.test(p) && !/\bWITH\b/i.test(p) && kind !== "network") kind = "strong";
    }
    if (kind === null) return null; // a permissive option exists
    worst = worst === "network" || kind === "network" ? "network" : "strong";
  }
  return worst;
}

/** The project's own licence family, from its LICENSE text or manifest. */
export function projectCopyleft(licenceText: string | null, manifestLicence: string | null): CopyleftKind | null {
  if (manifestLicence) {
    const k = copyleftKind(manifestLicence);
    if (k) return k;
  }
  if (!licenceText) return null;
  const head = licenceText.slice(0, 2000);
  if (/GNU AFFERO GENERAL PUBLIC LICENSE|Server Side Public License/i.test(head)) return "network";
  if (/GNU GENERAL PUBLIC LICENSE/i.test(head) && !/LESSER|LIBRARY/i.test(head)) return "strong";
  return null;
}

export interface LicenceFinding {
  ecosystem: string;
  name: string;
  version: string;
  licence: string;
  kind: CopyleftKind;
}

export interface LicenceAudit {
  status: "checked" | "unavailable";
  reason: string | null;
  /** Direct dependencies considered. */
  direct: number;
  /** With a known SPDX licence. */
  known: number;
  findings: LicenceFinding[];
  project: CopyleftKind | null;
}

async function lookup(pkg: LockedPackage, fetchImpl: typeof fetch): Promise<string[] | null> {
  const system = SYSTEM[pkg.ecosystem];
  if (!system) return null;
  const url = `${DEPS_DEV}/${system}/packages/${encodeURIComponent(pkg.name)}/versions/${encodeURIComponent(pkg.version)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { "User-Agent": "Gitwork-Pulse/1.0" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { licenses?: unknown };
    const list = Array.isArray(data.licenses) ? data.licenses.filter((l): l is string => typeof l === "string") : [];
    // "non-standard" is deps.dev saying it could not map the licence to SPDX: unknown, not clean.
    const usable = list.filter((l) => l && !/^non-standard$/i.test(l));
    return usable.length > 0 ? usable : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function auditLicences(
  packages: LockedPackage[],
  project: { licenceText: string | null; manifestLicence: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<LicenceAudit> {
  const direct = packages.filter((p) => p.direct === true).slice(0, MAX_LICENCE_LOOKUPS);
  const projectKind = projectCopyleft(project.licenceText, project.manifestLicence);
  if (direct.length === 0) {
    return { status: "unavailable", reason: "The lockfiles do not say which libraries the project declares itself.", direct: 0, known: 0, findings: [], project: projectKind };
  }
  const results: (string[] | null)[] = new Array(direct.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, direct.length) }, async () => {
    while (next < direct.length) {
      const i = next++;
      results[i] = await lookup(direct[i], fetchImpl);
    }
  }));
  const findings: LicenceFinding[] = [];
  let known = 0;
  direct.forEach((p, i) => {
    const licences = results[i];
    if (!licences) return;
    known++;
    // Several entries mean several licences apply (deps.dev lists each file's licence).
    const expression = licences.join(" AND ");
    const kind = copyleftKind(expression);
    if (!kind) return;
    // A copyleft project may use libraries under the same family.
    if (projectKind === "network" || (projectKind === "strong" && kind === "strong")) return;
    findings.push({ ecosystem: p.ecosystem, name: p.name, version: p.version, licence: expression, kind });
  });
  return { status: "checked", reason: null, direct: direct.length, known, findings, project: projectKind };
}

const KEY = "dependency_copyleft_licences";
const LABEL = "Declared libraries carry no strong-copyleft licence";

/** The check, from a licence audit (or null when it did not run). Pure. */
export function licenceCheck(audit: LicenceAudit | null): PulseScanCheckInput {
  const base = { category: CATEGORIES.LEGAL, checkKey: KEY, label: LABEL } as const;
  if (!audit || audit.status !== "checked") {
    return {
      ...base,
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail: `Licences were not checked: ${audit?.reason ?? "the library audit did not run."} Nothing is claimed about them either way.`,
    };
  }
  const network = audit.findings.filter((f) => f.kind === "network");
  const strong = audit.findings.filter((f) => f.kind === "strong");
  const list = (fs: LicenceFinding[]) => fs.slice(0, 5).map((f) => `${f.name} ${f.version} (${f.licence})`).join(", ");
  if (network.length > 0 || strong.length > 0) {
    const parts: string[] = [];
    if (network.length > 0) {
      parts.push(
        `${list(network)} ${network.length === 1 ? "is" : "are"} under a network copyleft licence: if people use the software over a network, as with any web service, ` +
          "you may have to offer them its source code.",
      );
    }
    if (strong.length > 0) {
      parts.push(
        `${list(strong)} ${strong.length === 1 ? "is" : "are"} GPL-licensed: distributing the software (an app, a desktop build or a published package) may require releasing it under the GPL. ` +
          "A service that only runs on your own servers is generally not affected.",
      );
    }
    return {
      ...base,
      status: "WARN",
      severity: network.length > 0 ? "HIGH" : "MEDIUM",
      confidence: "MEDIUM",
      confidenceReason: "Licences come from deps.dev; how the software is distributed, and any commercial licence, are not visible to a scan.",
      evidenceStrength: "VERIFIED",
      detail: `${parts.join(" ")} Get these reviewed before launch, or swap them for a permissively licensed library or buy a commercial licence.`,
      evidence: JSON.stringify(audit.findings.slice(0, 10)),
    };
  }
  const coverage = audit.known / audit.direct;
  if (coverage < MIN_LICENCE_COVERAGE) {
    return {
      ...base,
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail:
        `Only ${audit.known} of ${audit.direct} declared libraries have a licence deps.dev could identify, and none of those is strong copyleft. ` +
        "The rest are not known (an unsupported ecosystem, or a licence that does not map to a standard identifier).",
    };
  }
  return {
    ...base,
    status: "PASS",
    confidence: "MEDIUM",
    confidenceReason: "Direct dependencies only; libraries pulled in by them are not looked up.",
    evidenceStrength: "VERIFIED",
    detail:
      `${audit.known} of ${audit.direct} declared libraries have a known licence, and none is GPL, AGPL or SSPL` +
      `${audit.known < audit.direct ? ` (${audit.direct - audit.known} could not be identified)` : ""}. Libraries pulled in by these are not checked.`,
  };
}
