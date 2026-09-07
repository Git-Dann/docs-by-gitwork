# Pulse CI/CD gate — exit on the release decision

`scripts/pulse-gate.mjs` runs a Pulse scan via the authenticated agent endpoint and **exits
non-zero** when a build shouldn't ship. This is the literal "prompt → production" gate: every
deploy gets validated.

It exits on the **release decision**, not on a score. The decision comes from the same
deterministic policy engine the report renders (`src/server/pulse-checks/release-decision.ts`),
so the pipeline and the human looking at the scan are reading one answer. No AI output reaches
it — a release decision made from generated prose is a guess with a confident voice.

## The four decisions

| Decision | Means | Default exit |
|---|---|---|
| `READY` | Nothing blocking, coverage above the policy floor. | 0 |
| `CONDITIONAL` | Ships with reservations — debt to schedule, not a blocker. | 0 (`--strict` → 4) |
| `BLOCKED` | A confirmed, non-negotiable control is failing. | **1** |
| `INCONCLUSIVE` | Pulse did not see enough of the product to judge it. | **3** |

⚠️ **`INCONCLUSIVE` is not a pass, and this is the state worth understanding.** A scan that
verified 42% of what a policy expects and found nothing wrong has *found nothing*. Absence of
evidence is the most common way an assurance tool overstates itself, so the gate fails on it by
default. `--allow-inconclusive` exists for teams that consciously accept shipping unverified —
it does not make the scan better, it makes the risk explicit.

The precedence is `BLOCKED > INCONCLUSIVE > CONDITIONAL > READY`. A confirmed blocker outranks
thin coverage because it is knowledge, not the absence of it: if Pulse proved an exposed `.env`,
it does not matter that it also failed to reach PageSpeed — the answer is already no.

## Policies

`--policy <id>` picks the bar. Each is versioned, and the verdict records which one judged it.

| id | For | Coverage floor | Health floor | Required collectors |
|---|---|---|---|---|
| `launch-ready` (default) | Putting something in front of real users | 70% | 60 | url-checks |
| `saas-production` | Multi-tenant software — adds auth/roles/AI-safety to the blocking set | 80% | 70 | url-checks |
| `handover` | Giving a build to the client who will own it | 85% | 65 | url-checks, github-checks, code-agent |

`handover` requires source access on purpose: handing over a product whose repository was never
read is the one thing that policy exists to prevent.

## Local / manual

```bash
export PULSE_API_URL="https://foundry.gitwork.co.uk"
export PULSE_API_KEY="<workspace API key>"
node scripts/pulse-gate.mjs --url https://staging.example.com --policy saas-production
```

Flags: `--url` (required) · `--policy <id>` · `--strict` (also fail on CONDITIONAL) ·
`--allow-inconclusive` · `--min-score <0-100>` (extra floor on top of the decision) ·
`--no-fail-on-confirmed` (defer entirely to the decision, rather than failing on any confirmed
issue) · `--markets EU,US-CA` · `--json`.

Every flag can only make the gate **stricter**. None of them can turn a `BLOCKED` or an
`INCONCLUSIVE` into a pass — a CI flag should not be able to overrule the evidence.

Exit codes: `0` pass · `1` BLOCKED · `2` harness error (bad config, unreachable API) · `3`
INCONCLUSIVE · `4` an extra floor not met. Any non-zero fails the build; they are distinct so a
pipeline can branch (e.g. open a ticket on 1, re-run with a repo on 3).

## GitHub Actions

Add `PULSE_API_URL` + `PULSE_API_KEY` as repo secrets, then a workflow that runs after your
preview/staging deploy:

```yaml
name: Pulse gate
on:
  deployment_status:
jobs:
  pulse:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: Pulse production-readiness gate
        env:
          PULSE_API_URL: ${{ secrets.PULSE_API_URL }}
          PULSE_API_KEY: ${{ secrets.PULSE_API_KEY }}
        run: node scripts/pulse-gate.mjs --url "${{ github.event.deployment_status.environment_url }}" --policy launch-ready
```

The endpoint is auth-gated (Pulse stays internal) — the API key grants the same access as the
in-app Pulse scanner.

## Other CI

It's just a Node script hitting one HTTPS endpoint — works anywhere (GitLab CI, CircleCI, a
post-deploy hook). Set the two env vars and run it with the deployed URL.

## Reading the decision yourself

`POST /api/agents/pulse-scan` returns `verdict.gate`, which carries the decision, the policy that
made it (`id@version`), the metrics it used, and three reason arrays — `blocking`, `conditional`
and `unverified`. Every reason has a stable `code` so it can be matched without parsing prose,
and `checkKeys` so it is traceable back to the controls it rests on.

`unverified` is populated whatever the decision, including on a `READY` — a pass that quietly
omits what it could not check is exactly the overstatement this is built to avoid.
