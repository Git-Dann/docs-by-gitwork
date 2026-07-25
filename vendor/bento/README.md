# vendor/bento — the source behind Foundry **Deck**

Deck is Foundry's slide editor. It is a **fork of [bento/slides](https://github.com/nyblnet/bento)**
(MIT), vendored here so it's ours to change, wrapped in `DESIGN.md`, and given the
Foundry · Gitwork brand switch.

| | |
|---|---|
| Upstream | `https://github.com/nyblnet/bento` |
| Vendored at | tag/commit **`f871720`** — *Release v1.0.9* (2026-07-25) |
| Licence | MIT © 2026 The Bento authors — see `LICENSE`, `THIRD_PARTY_NOTICES.md` |
| Served at | `/deck` (built shell committed at `public/deck/index.html`) |
| Built by | `npm run deck:build` from the repo root |

## Why it's a separate app and not a Next route

A Bento file **is** the app: the built HTML carries the runtime *and* the document
in one file, and ⌘S rewrites that file in place. There is no server, no database
row, no export step — which is the whole point, and the reason Deck opens in its
own window rather than inside the `/app` shell. Nothing here talks to Foundry's
API, so it also can't leak anything from it.

Only what the slides app needs is vendored: `slides/` (the app), `kernel/` (the
shared save/update/anim/i18n core it imports), and the one build script it calls.
Upstream's site, server, spaces, plugins and docs are not here.

## What we changed

Everything Foundry-specific is **additive** and lives in `slides/src/foundry/`, so
upstream files stay re-syncable. Every edit inside an upstream file is a one-liner
marked `// FOUNDRY:` — `grep -rn "FOUNDRY:" slides/` finds all of them.

| File | Change |
|---|---|
| `slides/src/foundry/brand.ts` | **New.** The brand registry — Foundry and Gitwork: app name, topbar lockup, and the theme a new deck is born with. Renaming the product is one line here. |
| `slides/src/foundry/theme.css` | **New.** The DESIGN.md skin: token swap, the mono `NN // SECTION` widget header (a CSS counter on the props rail), 6px controls / 10px cards / no pills, Gitwork Blue on every interactive state. Both brands, keyed on `:root[data-brand]`. |
| `slides/src/foundry/fontdata.ts` | **New, generated.** Inter · JetBrains Mono · DM Serif Display (latin woff2, base64, OFL) — embedded so a saved deck still makes zero external requests. Regenerate with `npm run fonts:refresh`. |
| `slides/src/foundry/boot.ts` | **New.** Applies the brand, registers the faces, builds the topbar brand switch, and switches off upstream's release-manifest check. |
| `slides/src/foundry/starter.ts` | **New.** Our five-slide starter deck. Upstream's product tour is untouched and still reachable at `?demo=bento`. |
| `slides/src/main.ts` | Imports `foundry/theme.css`; takes app identity from the brand; boots our starter deck. |
| `slides/src/editor/editor.ts` | Topbar wordmark comes from the brand registry; appends the brand switch. |
| `slides/src/fonts.ts` | The four brand faces lead the font picker. |
| `slides/index.html` | Title, favicon and splash repainted to the house palette. |
| `slides/package.json` | Adds `build:foundry` (single-file build → `public/deck/`) and `fonts:refresh`. |

## Working on it

```bash
npm run deck:install    # once — installs the vendored app's own deps
npm run deck:dev        # vite dev server on :5173, hot reload
npm run deck:build      # rebuild public/deck/index.html (commit the result)
```

`public/deck/index.html` is a **build artifact that is committed** — Next serves it
straight from `public/`, so no Docker or CI change was needed to ship Deck. If you
change anything under `vendor/bento`, run `npm run deck:build` and commit the
rebuilt shell in the same commit, or production keeps serving the old one.

Brands: `/deck` opens Foundry, `/deck?brand=gitwork` opens Gitwork, and the topbar
switch flips live (the choice is remembered per browser). Switching re-skins the
editor and re-themes the deck as long as the deck is still on brand defaults —
anything you recoloured yourself is left alone, and ⌘Z undoes a re-theme.

## Re-syncing with upstream

1. `git clone --depth=1 https://github.com/nyblnet/bento /tmp/bento`
2. Copy `slides/` (except `src/foundry/`), `kernel/`, `scripts/postbuild-compress.mjs`,
   `LICENSE` and `THIRD_PARTY_NOTICES.md` over the top.
3. Re-apply the `// FOUNDRY:` one-liners in the table above (they're small and
   deliberately shallow — that's the trade for staying close to upstream).
4. `npm run deck:build`, check `/deck` in both brands, commit the shell.

## Licence obligations

MIT — the notice must travel with copies, and it does: the `NOTICE` block in
`slides/index.html` is carried into every built shell and every saved deck, and
covers reveal.js, Moveable, Selecto, Fraunces and Instrument Sans as well. The
three faces we added are SIL OFL 1.1 and are recorded in `THIRD_PARTY_NOTICES.md`.
Don't strip either block.
