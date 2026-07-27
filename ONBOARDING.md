# Building in Foundry — handover

**For: Syed & Harry.** Welcome. This is the short version — everything here is enforced by
tooling, so following it is faster than not.

Foundry is Gitwork's agency platform: a public marketing page at `/` and the internal app at
`/app` (proposals, clients, dev hiring, AI project validation, support). Next.js 15 · React 19 ·
TypeScript · Tailwind v4 · Prisma · Postgres.

---

## 1. Before you change anything — read these four

Non-negotiable, and there is **no exemption for a small change**. "It's a one-liner", "it's just
copy", "it's only a class name" — most of the defects in this codebase's history arrived in exactly
those disguises.

| File | What it governs |
|---|---|
| `CLAUDE.md` | Project guide, conventions, module map, and the full change history |
| `DESIGN.md` | The design system — tokens, type, components, spacing, radius |
| `docs/build-checklist.md` | The quality gate: `npm run verify` and what it checks |
| `docs/mobile-playbook.md` | **Mandatory** for any layout / responsive / spacing work |

You don't have to memorise them — a session-start hook prints the rules into every Claude Code
session in this repo, so you'll see them whether you want to or not.

## 2. Name your chat

Every Gitwork chat/session is titled `<Name> {{Tag}}`, tag verbatim with the braces:

- `{{Product}}` — Pulse · Care · Docs · Code · Studio · Portal
- `{{Feat}}` — Deck · Starters · Wiki · DevSignal · Dispatch · RoundUp · Demo · On Your Desk ·
  Settings · MCP · Calendar · Dashboard · Handbooks · Analytics · Notifications
- `{{Agent}}` — Curator · Foreman

e.g. `Care {{Product}}`, `On Your Desk {{Feat}}`, `Foreman {{Agent}}`.

It's `{{Feat}}` — never `{{Feature}}`. One workstream per chat. This is how Dan tracks and
monitors work across the team, so an untagged chat is effectively invisible. Full spec:
`CLAUDE.md` §32.

## 3. The loop for every change

**`main` is production.** Anything that lands on `main` — merged *or* committed directly —
auto-deploys to the Fasthosts VPS in about 6 minutes. There is **no staging environment and there
are no branch preview URLs**. (Vercel still comments on PRs; ignore it, it's a vestigial
integration that deploys nowhere real.)

Two accepted paths:

```bash
# Features and anything non-trivial → branch + PR
git checkout -b feature/your-thing
npm run verify                 # tsc + lint + tests + audit:ui — no database needed
# open a PR → CI runs the exact same thing → squash-merge

# Small fixes → straight to main, with a Conventional Commit message
npm run verify                 # ← do NOT skip this; nothing else will catch you
git commit -m "fix: …" && git push
```

⚠️ **If you commit directly to `main`, `npm run verify` is the only gate there is.** CI does run on
a push to `main`, but it runs *in parallel* with the deploy — so a failing check does not stop your
change reaching production, it just tells you afterwards. On the PR path CI reports before you
merge, which is why anything you're not certain about should go through a PR.

Report what `verify` actually printed. Never call something verified that you didn't run.

## 4. Five traps that have actually bitten people here

1. **Never run `npm run build`** against a real `DATABASE_URL` — it does a `prisma db push` and
   will mutate the database. Use `npx next build`.
2. **Don't hand-roll form fields.** Use `app-input` / `app-select` / `app-textarea` from
   `globals.css`. A bare `<select>` gets the native OS chevron with no reserved padding, so long
   values render *underneath the arrow*. This has shipped three separate times; `npm run audit:ui`
   now catches it.
3. **The mobile breakpoint is `lg` (1024px), not `md`.** "Mobile" here means phones *and* portrait
   tablets. Check base (<640), the 640–1023 band, and `lg+`.
4. **Never hardcode a model id.** Resolve via `resolveAiConfig(workspace)`; fallbacks live only in
   `DEFAULT_MODELS` (`src/server/ai-provider.ts`). We pay per token, so prefer `completeText()` —
   it handles prompt caching, the cheap Haiku tier, and cost tracking for you.
5. **Tables scroll, they don't reflow.** Wrap wide ones in `overflow-x-auto`. Note
   `overflow-hidden` is *not* a scroller — it clips the content away where nobody can reach it.

## 5. Verifying honestly

Every `/app` page is behind Google OAuth and there's no staging, so **you cannot screenshot the
gated screens** to check your own work. Two consequences:

- If a change only got a typecheck and a careful read, **say exactly that.** Then hand over a
  precise capture list: the page, 2–3 viewports, the specific elements to look at.
- Public pages *can* be driven headlessly — `/`, `/pulse-overview`, `/api-docs`, `/context`,
  `/login`, `/embed/*`, and the tokenised `/docs/`, `/timeline/`, `/report/` pages. Run
  `npm run audit:clipping <url>` against them. It needs `npm i --no-save playwright-core` plus a
  Chromium; in a Claude Code web session one is already installed, locally you may need
  `npx playwright install chromium`.

Both audits have a `--self-test`. Run it before trusting a clean report:

```bash
npm run audit:ui -- --self-test
npm run audit:clipping -- --self-test
```

## 6. Finding your way around

- `src/app/(app)/app/**` — the internal app routes · `src/components/**` — UI by module
- `src/server/{domain}.ts` — business logic, one file per domain; agents in `{domain}-agents/`
- `src/hooks/**` — React Query hooks · `src/lib/api.ts` — fetch helpers
- `prisma/schema.prisma` — the schema (70+ models)
- `CLAUDE.md` §4 has the sidebar-label → route → server-module map. **One thing to internalise:** a
  module is known by up to three different names. Four of them also have a legacy route that still
  resolves — use the canonical one in anything new:

  | Sidebar | Canonical route | Legacy route | Server module |
  |---|---|---|---|
  | Portal | `/app/portal` | `/app/clients` | `clients` |
  | Care | `/app/care` | `/app/support` | `support` |
  | Code | `/app/code` | `/app/codeclear` | `codeclear` |
  | Docs | `/app/docs` | `/app/proposals` → redirects | `proposals` |

  `src/middleware.ts` (`MODULE_PATHS`) is the source of truth for which is canonical.

**Schema changes:** the deploy runs `prisma db push` *without* `--accept-data-loss`, and Prisma's
safety check is all-or-nothing per push — so if your diff drops anything, **the whole sync is
skipped including the additive parts**, and the live DB silently never gets your new column. Read
`CLAUDE.md` §2 before touching `schema.prisma`.

## 7. When in doubt

Ask Dan (dan@gitwork.co.uk). Two things worth asking about rather than guessing: anything that
changes the database schema, and anything that changes shared CSS in `globals.css` or a shared
primitive (`widget-card`, `widget-header`, `app-table`, `<Modal>`) — a change there is never local,
so grep every caller first.
