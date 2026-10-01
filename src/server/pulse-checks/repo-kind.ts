// ─────────────────────────────────────────────────────────────────────────────
// REPO KIND — what a repository with no native / desktop / extension / CLI shape is.
//
// native-repo.ts resolves the shapes it has a check family for and returns "none" for
// everything else, which lumped a Next.js storefront, an Express API and a utility
// library together. effectivePlatformForRepoShape then fell back to the dropdown, so the
// same Next.js repo (vercel/commerce) scanned as "iOS app" ran as IOS_APP and lost every
// web-source check — measured in scripts/pulse-platform-matrix.ts. Detection has to
// decide what a repository IS; the dropdown only says what the user expected.
//
// Pure: takes the snapshot's paths and the files it already read. No I/O.
// ─────────────────────────────────────────────────────────────────────────────

export type GenericRepoKind = "web" | "backend" | "none";

/** Front-end frameworks: a dependency on any of these means the repo renders a UI. */
const WEB_DEPENDENCIES = [
  "next", "react-dom", "vue", "nuxt", "svelte", "@sveltejs/kit", "astro", "@remix-run/react",
  "@angular/core", "solid-js", "preact", "gatsby", "vite", "@builder.io/qwik", "ember-source",
];

/** Server frameworks: a dependency on any of these means the repo serves requests. */
const BACKEND_DEPENDENCIES = [
  "express", "fastify", "koa", "@nestjs/core", "@hapi/hapi", "hono", "restify", "@adonisjs/core",
  "apollo-server", "@apollo/server", "graphql-yoga", "elysia", "sails",
];

/**
 * Non-JS server stacks, recognised from FRAMEWORK entry files only.
 *
 * ⚠️ Not go.mod / Cargo.toml / pom.xml / main.py. Those name a language, not a server —
 * Go and Rust CLIs and Python libraries carry them too — and calling such a repo a
 * backend would put backend checks in front of a project that is not one. Anything
 * uncertain stays "none" and gets the generic repository checks.
 */
const BACKEND_PATHS = [
  /(^|\/)manage\.py$/,          // Django
  /(^|\/)config\/routes\.rb$/,  // Rails
  /(^|\/)artisan$/,             // Laravel
  /(^|\/)(wsgi|asgi)\.py$/,     // any WSGI/ASGI app
];

function dependencies(packageJson: string | undefined): Set<string> {
  if (!packageJson) return new Set();
  try {
    const parsed = JSON.parse(packageJson) as Record<string, unknown>;
    const names = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      const block = parsed[field];
      if (block && typeof block === "object") for (const name of Object.keys(block)) names.add(name);
    }
    return names;
  } catch {
    return new Set();
  }
}

/**
 * Classify a repository that matched no specific shape.
 *
 * Web wins over backend: a full-stack app (Next.js with API routes) is a web app that
 * also has a server, and its web-source AND backend checks both apply — the web shape
 * admits both surfaces (see check-relevance.ts).
 */
export function classifyGenericRepo(paths: readonly string[], files: ReadonlyMap<string, string>): GenericRepoKind {
  const deps = dependencies(files.get("package.json"));
  if (WEB_DEPENDENCIES.some((name) => deps.has(name))) return "web";
  if (paths.some((path) => /(^|\/)(index|app)\.html$/i.test(path) && !path.includes("node_modules"))) return "web";
  if (BACKEND_DEPENDENCIES.some((name) => deps.has(name))) return "backend";
  if (paths.some((path) => BACKEND_PATHS.some((pattern) => pattern.test(path)))) return "backend";
  return "none";
}
