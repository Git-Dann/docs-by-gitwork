# Recovery: 9 PRs marked merged on 2026-07-27 whose code did NOT land

## What happened

Reattaching the pre-reroot history to `main` (commit `d01c3326`) used
`git merge -s ours --allow-unrelated-histories`, which records the old lineage as
parents **without changing a single file** — that was the intent, and main's tree hash
was verified byte-identical before pushing.

The unintended consequence: GitHub's merge detection is **ancestry-based**. Once those
branch tips became ancestors of `main`, GitHub marked their PRs as merged, closed them,
and auto-deleted the branches (auto-delete-on-merge is enabled). Because `-s ours` kept
main's tree unchanged, **none of their changes are actually in the codebase.**

Verified absent from `main` after the merge: #202's `gmail.modify` scope in `src/auth.ts`,
#332's `deploy/nginx/` directory.

**Nothing is lost.** Every commit is still reachable from `main`, and the head SHAs are
recorded below.

## Why recreating the branches is not enough

A branch whose tip is an ancestor of `main` produces an **empty diff** against it, so a
new PR from it would show no changes. Each one has to be **cherry-picked onto a fresh
branch off `main`**:

```bash
git fetch origin main
git checkout -b redo/<name> origin/main
git cherry-pick <head-sha>        # or the range, for multi-commit PRs
# resolve conflicts, run: npm run verify
git push -u origin redo/<name>
```

## The nine

| PR | Title | Branch (deleted) | Head SHA |
|---|---|---|---|
| #354 | fix(auth): 30-day sessions + stop consent screen | `fix/login-consent-and-session` | `2d95fbbaf6f60f0e0a1d776e48fde88d9a2637c6` |
| #332 | infra: VPS nginx config + proxy-buffer 502 fix | `infra/nginx-proxy-buffers-502-fix` | `a3329a6c18918930d86f6e6b500b936278fd36d1` |
| #255 | chore(ai): current-gen models, tiering, caching | `chore/ai-usage-lean-tiering-caching` | `beed73007b403fb11409ce0bedeb2578aa66fca0` |
| #432 | docs(care): IMAP/SMTP connector build plan | `care/imap-smtp-connector-plan` | `c4eb6e0f11782d79b4b1eafb3b3293fd7ccd9fd3` |
| #222 | feat(design-system): per-logo download buttons | `claude/design-system-isolation-xAyS7` | `44847afc46a26a9fda75c84fbc95a1af64975cdc` |
| #202 | fix(care): preserve Gmail UNREAD after sync | `care/gmail-preserve-unread` | `2753e9ddda9f0502bf4964b5e7ea1166984fa2cd` |
| #140 | fix(wiki): wiki-public-view type sync | `fix/wiki-public-view-types` | `7330d65d61cc024fc2035c3e6dd476b17db639a8` |
| #43 | fix(care): sync spinner on clicked connector only | `fix/per-connection-sync-pending` | `2937a285bc16f8e5e491d8326b5c975ac010e460` |
| #37 | fix: Care empty states to Pulse dashed pattern | `fix/empty-state-alignment` | `b3e7b045509910209ab40f39cdd576896a268209` |

## Two that need a decision, not just a cherry-pick

- **#354** carried "**Hold merge until Internal is set**" — the Google OAuth consent screen
  must be Internal first, or refresh tokens expire after 7 days. It now reads as merged
  without that having happened. Do not redo it until the console setting is confirmed.
- **#140** was a hotfix for a build failure from June. `main` builds green today, so it
  was probably fixed another way — check before redoing it.

## The lesson

`git merge -s ours` is safe for the *files* and not safe for *GitHub's PR state*. If this
is ever needed again, close or convert the affected PRs to draft **first**, or expect
ancestry-based merge detection to close them for you.
