#!/bin/bash
# SessionStart hook — Foundry by Gitwork.
#
# Purpose: the house rules are non-negotiable, so they are injected into EVERY
# session rather than left to whether someone happened to read a file. Two
# things it enforces by stating them before any work begins:
#   1. the read-first requirement (Dan's standing rule), and
#   2. the chat naming convention, so the session list stays manageable.
#
# Synchronous and instant — it only prints. It deliberately does NOT install
# dependencies: that would add minutes to every session start, and `npm run
# verify` tells you to run `npm install` when it needs it.
set -euo pipefail

cat <<'RULES'
════════════════════════════════════════════════════════════════════════
 FOUNDRY BY GITWORK — HOUSE RULES (injected every session; not optional)
════════════════════════════════════════════════════════════════════════

1. READ BEFORE YOU CHANGE ANYTHING — MANDATORY, NO EXCEPTIONS
   Read these BEFORE editing, creating, refactoring or deploying anything.
   Not skimmed, not assumed from a previous session, not inferred from the
   diff. If you are about to touch a file and have not read these, STOP.

     • CLAUDE.md                  project guide, conventions, module map
     • DESIGN.md                  the design system — tokens, components
     • docs/build-checklist.md    the quality gate + what `verify` checks
     • docs/mobile-playbook.md    MANDATORY for any layout/responsive work

   "It looked like a one-liner" is not an exemption. Neither is a request
   to move fast.

2. NAME THIS CHAT TO THE CONVENTION — required for tracking
   Every Gitwork chat/session is titled `<Name> {{Tag}}`, tag verbatim:

     <Name> {{Product}}   a top-level module
                          Pulse · Care · Docs · Code · Studio · Portal
     <Name> {{Feat}}      a feature in or across products
                          Deck · Starters · Wiki · DevSignal · Dispatch ·
                          RoundUp · Demo · On Your Desk · Settings · MCP ·
                          Calendar · Dashboard · Handbooks · Analytics ·
                          Notifications
     <Name> {{Agent}}     a scheduled/background agent
                          Curator · Foreman

   `{{Feat}}` — never `{{Feature}}`. Standing intake threads are the only
   exception (SOUNDING BOARD, SUGGESTIONS, and named feedback threads).
   Working on something not listed? Use its name + the right tag; don't
   invent a fourth tag. Full spec: CLAUDE.md §32.

3. BEFORE ANY PR — run the gate, and report what it actually said
     npm run verify     # tsc + lint + tests + audit:ui   (no DB needed)
   CI runs the same on every PR. Never call something verified that was
   not actually run. There is NO staging and NO branch previews: only
   `main` deploys, straight to the Fasthosts VPS. Not Vercel.

4. NEVER run `npm run build` against a live DATABASE_URL — it does a
   `prisma db push`. Use `npx next build`.
════════════════════════════════════════════════════════════════════════
RULES
