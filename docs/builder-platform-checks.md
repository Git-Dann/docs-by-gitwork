# Builder-platform checks — sources and reasoning

Backing notes for `src/server/pulse-checks/builder-platforms.ts`. Every claim a check
makes about a platform's behaviour is recorded here so it can be re-verified when a
platform changes — these products ship weekly, and a check encoding last year's
default is worse than no check.

## Scope, and what was already covered

`detectAiBuilder` (`pulse-checks/vibe-code-hygiene.ts`) has identified 12 platforms
for some time: Lovable, Bolt (StackBlitz), v0 (Vercel), Replit, Framer, Webflow, Wix,
Bubble, Softr, Carrd, Glide, Squarespace. Until July 2026 the detected name was used
for **one informational check** and a "still on a preview host" warning, and nothing
else — so a Lovable app and a hand-written repo were judged identically.

**The four highest-value checks for this class of app already existed** in
`vibe-security.ts` and are deliberately not duplicated:

| Existing check | What it does |
|---|---|
| `supabase_rls_enforced` | Reads the Supabase URL + anon key from the bundle, extracts table names from `.from("…")`, then probes `/rest/v1/<table>` with the anon key. Reports FAIL only when a table actually returns rows unauthenticated; distinguishes "empty or protected" as inconclusive. |
| `no_service_role_key_exposed` | `service_role` JWT (decoded via the `role` claim), `sk-…`, `AKIA…`, PEM private keys in HTML + same-origin JS. |
| `firebase_rules_locked` | Probes Firestore rules. |
| `no_public_secret_env` | Secret-looking `NEXT_PUBLIC_*` values. |

That first one is the CVE-2025-48757 class, and it is implemented well — it proves the
exposure with a live read rather than inferring it. This module covers what those
cannot see.

## Per-check sources

### `builder_paid_provider_from_browser` — FAIL

Detects a call to a paid provider's **secret** API from client code. Distinct from
`no_service_role_key_exposed`, which matches key *formats*: finding the call proves a
credential must be reachable client-side even when its format is unrecognised.

Reported for Bolt specifically: generated frontend code calls provider SDKs from
components as though it were server code, and deployed keys are found by scrapers
within hours. The mitigation both Bolt's and Vercel's guidance give is the same — the
key belongs in a server environment variable, never in the frontend `.env`.

- <https://ubserve.com/security-checklists/bolt-new-security-checklist>
- <https://vibe-eval.com/guides/bolt/>

**Deliberate exclusion:** `js.stripe.com` is *meant* to run in the browser with a
`pk_` publishable key. Only `api.stripe.com/v1/` (the secret REST API) is a finding.
Flagging the publishable library would fire on every correctly-built checkout on the
internet. There is a test for this.

### `builder_dev_tooling_in_prod` / `builder_sourcemaps_public` — WARN

`lovable-tagger` is Lovable's component tagger, and `gpteng.co` / `gptengineer.js` is
its editor bridge — both are development-pipeline artefacts, and both are already used
as *fingerprints* by `detectAiBuilder`, which is why finding them in a served
production build is meaningful rather than surprising. Vite's `@react-refresh` and
`/@vite/client` are HMR runtime, stripped by a production build by definition.

Source maps are a genuine disclosure rather than untidiness: they turn "read the
minified bundle" into "read the codebase", including comments and commented-out
endpoints. That matters more than usual for these platforms, because commenting an
endpoint in and out is how environments get switched (see §34.6 — the same pattern in
the Fellas Flutter app).

### `builder_client_side_authorization` — WARN, MEDIUM confidence

v0 generates role-gated UI (an `isAdmin` flag in React context, a role decoded from a
JWT client-side) reliably, and the matching server-side check rarely; the same guidance
notes API routes and Server Actions are exposed HTTP endpoints that anyone can invoke.
Replit Agent output has the same shape — auth middleware and ownership checks have to
be hand-added.

**Why WARN and not FAIL:** finding the client-side gate proves the UI branches on a
role. It does **not** prove the server fails to re-check. Only a server-side probe
could show that, and probing an app's admin routes uninvited is not something a scanner
should do. The check reports the pattern and names what to verify by hand.

**Why scoped to the four prompt builders:** a hosted site builder (Webflow/Wix/
Squarespace/Framer) ships a large vendor runtime where `userRole` is far more likely to
be platform code than the author's authorization logic. Tested both ways.

- <https://ship-safe.co/blog/v0-vercel-security-risks>
- <https://vercel.com/academy/nextjs-foundations/security-review-apis-and-config>
- <https://vibeappscanner.com/replit-security>

### Hosting shape — per platform, deliberately narrow

Narrower than `vibe_ai_builder`'s general preview-host warning: these identify the
*specific* host classes that behave differently from a production deployment.

- **`replit_production_deployment` (FAIL on `*.replit.dev` / `*.repl.co`)** — a Replit
  workspace URL is bound to the editor session: it sleeps when idle, and whatever the
  author last typed is what visitors see. Only a Deployment (`*.replit.app` or a custom
  domain) is durable. Deployments also use a **separate secrets store** from the
  workspace, which is the documented cause of "works in the editor, 500s in
  production" — the check says so, because that is the next thing the reader hits.
- **`v0_preview_host_production` (FAIL on `*.v0.dev`)** — a preview is pinned to one
  generation of the design and carries no uptime expectation.
- **`lovable_preview_host_production` (WARN)** — ties the live site to the editing
  project.
- **`builder_default_deploy_domain` (WARN, Bolt on `*.netlify.app`)** — Bolt's default
  deploy target; works, but not a product address.

Sources: <https://vibe-eval.com/safety/replit/> ·
<https://vibeappscanner.com/guide/deploy-replit-securely> ·
<https://skywork.ai/blog/bolt-new-beginner-guide-build-deploy-web-apps/>

### `lovable_uploads_unoptimised` — WARN

`/lovable-uploads/` serves the file exactly as uploaded: no resizing, no WebP/AVIF, no
per-device variants. A single unresized phone photo is routinely several megabytes and
is the usual reason a Lovable site scores badly on mobile LCP.

### `builder_badge_visible` — WARN

A leftover "Edit with Lovable"-style badge or project link advertises the tool on a
client-facing site, and a project link can expose the build to anyone who follows it.

## Evidence discipline

Every check here is **presence**-based: it fires because something was found in the
served HTML or the client bundle. None asserts absence from a sample, so none needs the
LOW-confidence downgrade the iOS/Flutter families use (§34). Where the real risk is
only provable server-side, the check stays a WARN and says what to verify by hand
rather than inventing a verdict.

### `bubble_data_api_open` — FAIL (live probe)

Bubble's Data API serves every "thing" in the database at `/api/1.1/obj/<type>`, and
**privacy rules are empty by default** — a rule has to be added per data type, and the
Data API can be enabled without one. That is the same failure shape as the Supabase RLS
case, so it is proven the same way: with a live read rather than an inference.

Bubble's own docs are explicit that these features are not on by default, and that an
API call set to `None` / self-handled auth skips Bubble's server-side validation and
privacy rules entirely.

Discipline, mirroring the Supabase probe:
- **Read-only.** GET only, never a write.
- **One row.** `limit=1`, and it **stops at the first exposure** — the finding is "this
  is open", and one row proves it. A readiness scan proves the door is open; it does not
  walk through it. There is a test asserting exactly one request is made.
- **Unreachable ⇒ SKIPPED, never PASS.** The §35 lesson: "we could not look" must not
  render as "it is fine". Tested.
- **A 200 with zero rows is not an exposure** — the type may simply be empty.
- The PASS wording states that only a short list of common type names was probed, so a
  type the scan did not guess could still be open.

- <https://manual.bubble.io/help-guides/security/api-security/data-api-security>
- <https://manual.bubble.io/help-guides/data/the-database/protecting-data-with-privacy-rules>
- <https://vibeappscanner.com/bubble-security>

### `bubble_version_test_exposed` — WARN (live probe)

Bubble serves the development copy of every app at `/version-test` on the same host. It
typically holds test data, weaker or absent privacy rules and half-built workflows —
and privacy rules are **not shared** between live and dev, so checking one says nothing
about the other. Separate check from the Data API because the fix is different.

### `glide_client_side_visibility` — WARN, MEDIUM confidence

Glide's visibility conditions hide rows in the UI *after* the data has reached the
device, so anyone inspecting network traffic can read rows they should not see. Row
owners are the server-side filter. Glide's native permissions are documented as thin
relative to Softr's server-side user groups, which is why this is Glide-specific.

- <https://www.softr.io/softr-vs-glide>

### `webflow_staging_indexable` — WARN

`*.webflow.io` is the staging host. Left indexable it competes with the production site
as duplicate content, splitting ranking signals between two identical hosts. Webflow has
a "disable subdomain indexing" setting; the check passes when the page sends `noindex`.

- <https://www.flow.ninja/blog/webflow-technical-seo-guide>

### `builder_default_deploy_domain` — WARN, all 12 platforms

One check with per-platform wording rather than twelve near-duplicate registry entries.
Platforms whose default host means something *stronger* — a Replit workspace URL, a v0
preview — are excluded via `STRONGER_HOST_FINDING` so a single URL never produces two
findings about itself. Tested in both directions.

## Not yet done

- **Validation against a live site of each platform.** The §34 lesson is that unit
  tests pass while checks are wrong — four scanner bugs there were found only by
  running the family against a real repo. These rules are unit-tested in both
  directions (fires / stays quiet) but have not yet been run against a real deployed
  Lovable, Bolt, v0 and Replit app. **Do that before trusting the output.**
- **The other 8 platforms.** Framer, Webflow, Wix, Bubble, Softr, Carrd, Glide,
  Squarespace get the cross-builder checks (provider calls, dev tooling, source maps,
  badge) but no platform-specific ones. The obvious next items: Wix's crawler-visible
  content vs its rendered content, Webflow's published-HTML form handling, and Bubble's
  privacy-rules model (its equivalent of RLS, with the same "the AI skipped it" risk).
- **Server-side probes** (unauthenticated API routes, Server Actions) — needs a
  decision about what a scanner should be willing to send to someone else's app.
