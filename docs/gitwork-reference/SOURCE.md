# Gitwork brand reference — the canonical source for the Docs Gitwork theme

This directory is **checked in on purpose.** The Gitwork theme spec has now been derived from
these files twice, because both times the analysis lived only in a session that ended. The
numbers in `DESIGN.md` are only auditable if the thing they were counted from is still here.

## What this is

The 31 designed signing emails (`N1`–`N7`, `F1`–`F16`, `D1`–`D8`), Gitwork's own templates —
not client material. `00-preview-gallery.html` renders all 31 in one page. `README.md` is the
original brief that shipped with them, and its "Design notes" and "Patterns" tables are the
source of the ink-on-dark rule and the five email patterns.

## How to re-derive the numbers in DESIGN.md

Every claim in DESIGN.md's Gitwork palette table is a count over these files. Re-run rather
than trust:

```bash
cd docs/gitwork-reference

# Fraunces is always 700 — 62 explicit + one default-bold <h1> = 63/63
grep -oh "font-family:'Fraunces'[^}\"]*" *.html | grep -c "font-weight:700"
grep -oh "font-family:'Fraunces'[^}\"]*" *.html | grep -o "font-weight:[0-9]*" | sort | uniq -c

# The palette, by frequency
grep -oh "#[0-9A-Fa-f]\{6\}" *.html | tr 'a-f' 'A-F' | sort | uniq -c | sort -rn | head -12

# What each colour is actually FOR (role, not just presence)
grep -oh "[a-z-]*:#6B6B6B" *.html | sort | uniq -c
grep -oh "border[a-z-]*:[^;]*#EAE5DC[^;]*" *.html | sort | uniq -c

# Playfair Display italic numerals — the one place a third face appears
grep -oh "Playfair[^}\"]*" *.html | sort -u
```

## Deliberately NOT committed

Two client documents were supplied alongside these as rendered-document references —
`Kernel ATS Plan of Work Aug 2026` and `CGC Tournament Platform Build Brief`. They are client
work product containing commercial detail, and committing them would put that in git history
permanently, so they are left out pending an explicit call from Dan. If they should live here
too, say so and they'll be added; the layout facts taken from them are recorded in DESIGN.md
either way.
