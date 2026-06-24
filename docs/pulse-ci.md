# Pulse CI/CD gate — block deploys on confirmed issues

`scripts/pulse-gate.mjs` runs a Pulse scan via the authenticated agent endpoint and **exits
non-zero** when a build shouldn't ship — a CONFIRMED issue (e.g. Supabase RLS off, a security
header missing, exposed secret) or a health score below your threshold. This is the literal
"prompt → production" gate: every deploy gets validated.

## Local / manual

```bash
export PULSE_API_URL="https://foundry.gitwork.co.uk"
export PULSE_API_KEY="<workspace API key>"
node scripts/pulse-gate.mjs --url https://staging.example.com --min-score 70
```

Flags: `--url` (required) · `--min-score <0-100>` (fail below) · `--markets EU,US-CA` (optional) ·
`--no-fail-on-confirmed` (don't fail on confirmed issues, score-only).

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
        run: node scripts/pulse-gate.mjs --url "${{ github.event.deployment_status.environment_url }}" --min-score 70
```

A non-zero exit fails the check, blocking the merge/promote. Tune `--min-score` and
`--no-fail-on-confirmed` to taste. The endpoint is auth-gated (Pulse stays internal) — the API key
grants the same access as the in-app Pulse scanner.

## Other CI

It's just a Node script hitting one HTTPS endpoint — works anywhere (GitLab CI, CircleCI, a
Vercel post-deploy hook). Set the two env vars and run it with the deployed URL.
