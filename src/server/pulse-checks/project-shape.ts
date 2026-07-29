// ─────────────────────────────────────────────────────────────────────────────
// PROJECT SHAPE DETECTION — the non-mobile half of repo classification.
//
// WHY THIS EXISTS. `detectNativePlatform` answers "is this iOS / Android /
// Flutter / React Native?" from the file tree alone, and that is enough for
// mobile because each of those shapes has an unmistakable root artefact
// (pubspec.yaml, an .xcodeproj, a Gradle manifest).
//
// The remaining dropdown entries cannot be told apart that way. An Electron app,
// a React Native app, a CLI tool and an ordinary web service ALL look like
// "a directory with a package.json". The discriminator is the package.json's
// CONTENTS — its dependencies and its `bin` field — so shape detection needs one
// small file read that platform detection does not.
//
// Everything here is PURE. The single file read is done by the caller
// (native-repo.ts) and handed in as text.
// ─────────────────────────────────────────────────────────────────────────────

import { anyPath } from "./native-mobile";

/**
 * Repo shapes that have a dedicated check family, beyond the mobile ones.
 *
 * Deliberately NOT an extension of NativePlatform: that type is threaded through
 * the mobile applicability maps and the skip lists, and widening it would make
 * every `isNativeMobile` call site a place where a desktop repo could silently
 * acquire mobile semantics.
 */
export type ProjectShape = "electron" | "tauri" | "cli" | null;

/** A parsed package.json, with only the fields shape detection and the CLI family read. */
export interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  main?: string;
  module?: string;
  types?: string;
  license?: string;
  description?: string;
  bin?: string | Record<string, string>;
  files?: string[];
  engines?: Record<string, string>;
  exports?: unknown;
  repository?: unknown;
  publishConfig?: Record<string, unknown>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Parse package.json defensively — a malformed manifest must not throw a scan. */
export function parsePackageManifest(text: string | null | undefined): PackageManifest | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as PackageManifest;
  } catch {
    return null;
  }
}

/** Every declared dependency, across all four dependency fields. */
export function allDependencies(pkg: PackageManifest | null): Record<string, string> {
  if (!pkg) return {};
  return {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  };
}

export function hasDependency(pkg: PackageManifest | null, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(allDependencies(pkg), name);
}

/** True when any declared dependency name matches the pattern. */
export function anyDependency(pkg: PackageManifest | null, re: RegExp): boolean {
  return Object.keys(allDependencies(pkg)).some((d) => re.test(d));
}

/**
 * Frameworks that make a package.json a WEB app rather than a CLI, even when it
 * also declares a `bin`. Nearly every framework ships a dev-server binary, so
 * `bin` alone would classify Next.js and Vite apps as CLI tools.
 */
const WEB_APP_FRAMEWORKS = /^(next|nuxt|@remix-run\/|@angular\/core|@sveltejs\/kit|gatsby|astro|@nestjs\/core|express|fastify|koa|@hapi\/hapi)/;

/**
 * Identify the non-mobile project shape.
 *
 * ORDER IS LOAD-BEARING, for the same reason it is in detectNativePlatform:
 *
 *   • Tauri first. A Tauri app's frontend is an ordinary web project, so its
 *     package.json frequently declares Vite/React and nothing that says "desktop".
 *     `src-tauri/tauri.conf.json` is the only reliable marker, and it is definitive.
 *
 *   • Electron before CLI. `electron-builder` and `electron-forge` both install a
 *     `bin`, so an Electron app tested for CLI-ness first would be misfiled and
 *     graded on npm-publishing hygiene it has no use for.
 *
 *   • CLI last, and only when nothing else claimed the repo — a `bin` entry is the
 *     weakest signal of the three, and it is present in a great many projects that
 *     are not primarily command-line tools.
 */
export function detectProjectShape(paths: string[], packageJson: string | null): ProjectShape {
  // Tauri — the Rust sidecar directory and its config are unambiguous.
  if (anyPath(paths, /(^|\/)src-tauri\/tauri\.conf\.json$/i)) return "tauri";
  if (anyPath(paths, /(^|\/)src-tauri\/Cargo\.toml$/i)) return "tauri";

  const pkg = parsePackageManifest(packageJson);

  // Electron — the dependency, or one of the two packagers, or a main-process file
  // sitting beside a package.json.
  const electronDep =
    hasDependency(pkg, "electron") ||
    anyDependency(pkg, /^(electron-builder|@electron-forge\/|electron-updater|electron-vite|@electron\/)/);
  const electronConfig =
    anyPath(paths, /(^|\/)electron-builder\.(ya?ml|json|js|ts|cjs)$/i) ||
    anyPath(paths, /(^|\/)forge\.config\.(js|ts|cjs|mjs)$/i) ||
    anyPath(paths, /(^|\/)electron\.vite\.config\.(js|ts|cjs|mjs)$/i);
  if (electronDep || electronConfig) return "electron";

  // CLI — a `bin` entry, on a package that is not a web application. `private: true`
  // rules it out too: a private package is never published, so the publishing
  // hygiene the CLI family grades cannot apply to it.
  if (pkg && pkg.bin && pkg.private !== true) {
    const isWebApp = anyDependency(pkg, WEB_APP_FRAMEWORKS);
    if (!isWebApp) return "cli";
  }

  return null;
}

/** Human-readable stack labels for a detected shape, for the report's tech stack. */
export function shapeTechStack(shape: ProjectShape, pkg: PackageManifest | null, paths: string[]): string[] {
  const stack: string[] = [];
  if (shape === "electron") {
    stack.push("Electron", "Desktop");
    if (hasDependency(pkg, "electron-builder")) stack.push("electron-builder");
    if (anyDependency(pkg, /^@electron-forge\//)) stack.push("Electron Forge");
    if (hasDependency(pkg, "electron-updater")) stack.push("electron-updater");
  } else if (shape === "tauri") {
    stack.push("Tauri", "Desktop", "Rust");
    if (anyPath(paths, /(^|\/)src-tauri\/capabilities\//i)) stack.push("Tauri v2");
  } else if (shape === "cli") {
    stack.push("CLI", "npm package");
  }

  if (shape === "electron" || shape === "cli") {
    if (anyDependency(pkg, /^typescript$/)) stack.push("TypeScript");
  }
  return [...new Set(stack)];
}

/**
 * Generic repo checks that cannot apply to a CLI / library package.
 *
 * Same two kinds as the mobile lists and nothing else: a toolchain artefact the
 * shape has no equivalent of, or a concern the CLI family measures properly.
 * Notably `has_tests` and `has_linter` are NOT here — a Node CLI keeps both in
 * exactly the places the generic checks look.
 */
export const CLI_INAPPLICABLE_CHECKS: ReadonlyMap<string, string> = new Map([
  ["has_e2e_tests", "A CLI has no browser surface — Playwright/Cypress do not apply."],
  ["has_orm_config", "A CLI tool is not a database-backed service."],
  ["has_migrations", "Database migrations belong to a service, not a command-line tool."],
  ["has_infra_code", "A CLI is distributed through a package registry, not deployed infrastructure."],
  ["has_openapi_spec", "A CLI exposes a command surface, not an HTTP API."],
  ["dockerfile_present", "A CLI ships as a published package; a container image is optional, not expected."],
  ["aeo_repo_llms_txt", "llms.txt is a web-discoverability artefact — not applicable to a CLI package."],
]);

/**
 * Generic repo checks that cannot apply to a DESKTOP app (Electron or Tauri).
 *
 * A desktop app is closer to a web project than a native mobile one — it really
 * does have a package.json, an ESLint config and a tsconfig — so this list is
 * deliberately much shorter than NATIVE_INAPPLICABLE_CHECKS. Only the
 * server-shaped and web-discoverability checks come out.
 */
export const DESKTOP_INAPPLICABLE_CHECKS: ReadonlyMap<string, string> = new Map([
  ["has_orm_config", "A desktop client is not a database-backed service."],
  ["has_migrations", "Database migrations belong to the backend, not the desktop app repo."],
  ["has_infra_code", "A desktop app ships as a signed installer, not deployed infrastructure."],
  ["has_openapi_spec", "An API spec belongs to the backend this app consumes, not the app repo."],
  ["dockerfile_present", "A desktop app ships as a signed installer, not a container image."],
  ["aeo_repo_llms_txt", "llms.txt is a web-discoverability artefact — not applicable to a desktop app repo."],
]);

/** The applicability map for a shape, or null when every generic check still applies. */
export function shapeSkipReason(checkKey: string, shape: ProjectShape): string | undefined {
  if (shape === "cli") return CLI_INAPPLICABLE_CHECKS.get(checkKey);
  if (shape === "electron" || shape === "tauri") return DESKTOP_INAPPLICABLE_CHECKS.get(checkKey);
  return undefined;
}

/**
 * Rewrite generic checks that cannot apply to this shape as SKIPPED, exactly as
 * applyNativeApplicability does for mobile. SKIPPED is excluded from both sides of
 * the score ratio, so this stops a CLI being marked down for having no Dockerfile
 * without hiding anything — the reason is shown in the report.
 */
export function applyShapeApplicability<T extends { checkKey: string; status: string; detail?: string }>(
  checks: T[],
  shape: ProjectShape,
): T[] {
  if (shape === null) return checks;
  return checks.map((check) => {
    const reason = shapeSkipReason(check.checkKey, shape);
    return reason ? { ...check, status: "SKIPPED", detail: reason } : check;
  });
}
