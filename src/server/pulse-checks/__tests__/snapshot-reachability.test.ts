import { describe, it, expect } from "vitest";
import { readsRepoContents, selectFilesToRead, type SnapshotShape } from "../native-repo";

// ─────────────────────────────────────────────────────────────────────────────
// SNAPSHOT REACHABILITY — can each family actually SEE anything?
//
// WHY THIS EXISTS. Every check family in this directory is unit-tested against a
// hand-built RepoSnapshot. Those tests prove the checks are correct given evidence;
// none of them proves the evidence is ever collected. Twice now that gap has hidden
// a whole family being dead in production:
//
//   • §37.1 — the browser-extension family: buildSnapshot returned before fetching
//     any file contents for a non-mobile repo, so isChromeExtension (which reads
//     snapshot.files) could never match. All 12 checks were unreachable from the
//     day they shipped.
//   • The same early return, left in place for `shape === "none"` after
//     web-repo-source and code-cleanliness started needing contents. 26 checks
//     receiving an empty map on the commonest repo shape of all.
//
// Both were invisible to the family tests and to the type checker. These assertions
// are deliberately about PLUMBING, not about check logic.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_SHAPES: SnapshotShape[] = [
  "ios",
  "android",
  "flutter",
  "react-native",
  "electron",
  "tauri",
  "cli",
  "chrome-extension",
  "none",
];

describe("snapshot reachability", () => {
  it("every shape reads repo contents — none is short-circuited to a file listing", () => {
    for (const shape of ALL_SHAPES) {
      expect(readsRepoContents(shape), `${shape} must reach round 1`).toBe(true);
    }
  });

  it("a plain web repo selects the config files its families grade", () => {
    const entries = [
      { path: ".gitignore", size: 200 },
      { path: ".github/workflows/ci.yml", size: 1200 },
      { path: "openapi.yaml", size: 1800 },
      { path: "infra/main.tf", size: 1600 },
      { path: "k8s/deployment.yaml", size: 1400 },
      { path: "slo.yaml", size: 700 },
      { path: "tsconfig.json", size: 650 },
      { path: "docs/ADR-001.md", size: 900 },
      { path: "locales/fr.json", size: 1100 },
      { path: "package.json", size: 800 },
      { path: "README.md", size: 3000 },
      { path: "src/index.ts", size: 4000 },
      { path: "supabase/migrations/0001_init.sql", size: 900 },
    ];
    const { config, source } = selectFilesToRead(entries, "none");

    // Each of these backs a specific check that silently passed while unreachable.
    expect(config, ".gitignore CONTENTS back the web-source env check").toContain(".gitignore");
    expect(config, "workflow files back the whole CI/CD family").toContain(".github/workflows/ci.yml");
    expect(config, "API contract checks need the OpenAPI contents").toContain("openapi.yaml");
    expect(config, "IaC controls need Terraform contents").toContain("infra/main.tf");
    expect(config, "runtime controls need orchestration manifests").toContain("k8s/deployment.yaml");
    expect(config, "observability controls need versioned SLOs").toContain("slo.yaml");
    expect(config, "vibe controls need compiler configuration").toContain("tsconfig.json");
    expect(config, "business controls need decision records").toContain("docs/ADR-001.md");
    expect(config, "global controls need translation catalogues").toContain("locales/fr.json");
    expect(config, "SQL migrations back the repo-side RLS check").toContain("supabase/migrations/0001_init.sql");
    expect(source, "web source backs the injection + cleanliness families").toContain("src/index.ts");
  });

  it("selects source for every shape, so no family is handed an empty sample", () => {
    const entries = [
      { path: "app/Main.swift", size: 900 },
      { path: "app/Main.kt", size: 900 },
      { path: "lib/main.dart", size: 900 },
      { path: "src/main.ts", size: 900 },
      { path: "src/main.rs", size: 900 },
      { path: "app/views.py", size: 900 },
    ];
    for (const shape of ALL_SHAPES) {
      const { source } = selectFilesToRead(entries, shape);
      expect(source.length, `${shape} selected no source files`).toBeGreaterThan(0);
    }
  });

  it("workflow files are selected for every shape, not just web repos", () => {
    // The CI family is shape-agnostic: a Swift app's pipeline can be compromised
    // exactly as easily as a Django one's, and the workflow lives in the same place.
    const entries = [
      { path: ".github/workflows/release.yml", size: 1500 },
      { path: "app/Main.swift", size: 900 },
    ];
    for (const shape of ALL_SHAPES) {
      const { config } = selectFilesToRead(entries, shape);
      expect(config, `${shape} did not select workflow files`).toContain(".github/workflows/release.yml");
    }
  });
});
