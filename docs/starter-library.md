# Gitwork Starter Library — ownership runbook

The Starters catalog links out to third-party repos. So we don't depend on anyone else keeping
their repo online, we mirror the permissively-licensed sources into a **Gitwork-owned monorepo**,
`Git-Dann/starter-library` — one folder per starter, each keeping its upstream LICENSE.

## Licence triage (why some are mirrored and some aren't)

- **Mirrored (MIT / Apache-2.0):** humanizer, skills-library, launch-kit, design-system, sites,
  taste, planner, flow, agents, security, marketing, testing, analytics, mobile (×2), ship-it (×3).
  Redistribution is permitted with the notice retained — the script keeps each `LICENSE`.
- **Excluded (rewrite Gitwork-native instead):** projects-index & web-starter (no licence = all
  rights reserved), product (CC BY-NC-SA — non-commercial), vibe-security (GPL-3.0 — copyleft).
  These stay link-only in the app until rewritten.
- **No upstream:** devops (authored in-house), integrations (official marketplace).

Full source-of-truth: [`scripts/starters/mirror-manifest.json`](../scripts/starters/mirror-manifest.json).

## One-time setup

1. Create an **empty** repo `Git-Dann/starter-library` on GitHub (no README).
2. Clone it next to this repo:
   ```bash
   git clone https://github.com/Git-Dann/starter-library.git ../starter-library
   ```

## Populate / refresh

From the `docs-by-gitwork` root:

```bash
# Preview the plan (writes nothing):
node scripts/mirror-starters.mjs --dry-run

# Clone + assemble into the checkout:
node scripts/mirror-starters.mjs --dest ../starter-library
```

The script shallow-clones each source, pins its commit SHA, strips `.git`, verifies a `LICENSE`
is present (aborts if not), writes a per-folder `SOURCE.md`, and generates top-level
`manifest.json`, `NOTICES.md` and `README.md`. It's idempotent — re-running refreshes every folder
to the latest upstream commit (bump the pins whenever you want a fresh snapshot).

Then review and publish:

```bash
cd ../starter-library
git add -A && git commit -m "Mirror starter sources ($(date +%F))" && git push
```

## After the repo is live

Repoint the app's "View & use" links from the upstream repos to our copies — update `SOURCE_URLS`
in [`src/server/starters-catalog.ts`](../src/server/starters-catalog.ts) to
`https://github.com/Git-Dann/starter-library/tree/main/<slug>` for each mirrored starter. The 3
licence-blocked starters stay linked upstream (link-only is fine) until their Gitwork-native
rewrites land; devops/integrations remain button-less.

## Requirements

`git` and Node on PATH. No npm dependencies. Needs outbound access to github.com and push rights to
`Git-Dann/starter-library`.
