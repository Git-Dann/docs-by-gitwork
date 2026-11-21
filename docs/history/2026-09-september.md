# September 2026

Foundry by Gitwork — what changed, and what it cost to learn. Split out of `CLAUDE.md`
so the rules stay small enough to read. The section numbers are unchanged, because the code
cites them: 939 `§N` references across 496 files, 277 of them spelled `CLAUDE.md §N`.
`CLAUDE.md` indexes every section here.

---

## 45. Recent Changes (September 2026) — Course requests: a forgiving search, and 200px of the table was unreachable on a phone

### 45.1 Search that spans every status

"Have we already got this course?" was only answerable by clicking through four status tabs
and then expanding the collapsed **02 // ADDED COURSES** table. The Wedge list is ~750 rows.

A search now sits at the **opposite end of the tab row** and **overrides the tabs while it has
a value**, deliberately spanning every status — `NEW`, `SENT`, `ADDED`, `REJECTED`. That is the
whole point: an answer of *"not in New"* is useless for a course that went out as Sent months
ago and is now Added. Each row already renders its own status, so a hit reads correctly whichever
bucket it came from, and the **Added** table is hidden while searching so the same row can't
appear twice. Filtering runs over the list already in memory, so results appear as you type with
no request behind it.

**`src/lib/fuzzy-search.ts`** is the matcher (pure, no dependency). It is forgiving in the two
directions that actually occur in this data, and the second one is the one people forget:

- **the query is misspelled** — "wentwerth" finds Wentworth Club;
- **THE DATA is misspelled** — the live rows literally include **"Iver Golf Vlub"**, so a search
  for "iver golf club" has to find it. A matcher tested only against clean fixtures fails this.

Both fall out of a capped Levenshtein distance whose tolerance scales with token length, plus an
in-order subsequence fallback. Two rules worth keeping:

- **Tokens are ANDed.** Every word typed must match something, so a second word narrows rather
  than widens. Scoring the best token instead lets "iver" pull in every row containing "golf".
- **≤3 characters must be a real prefix.** Below that length a one-character allowance matches
  almost every row, and a search that returns everything is worse than no search.

⚠️ **A sabotage that reported "the tests are weak" when they were fine.** Disabling `tolerance()`
appeared to change nothing — 27 tests still green. The replacement string had missed a trailing
`//` comment on the line, so the edit was a **no-op**. Always print the sabotaged region (or
assert the edit applied) before believing a passing suite. Once applied for real, the four
sabotages fail 4 / 1 / 2 / 3 tests respectively.

### 45.2 ⚠️ `.widget-card` is `overflow: hidden` — a wide child is UNREACHABLE, not just off-screen

Measuring the section on a phone turned up a **pre-existing** defect worth generalising. The row
is a 7-column grid whose fixed columns total **416px**, plus 72px of gaps and 24px of padding,
before the course name is allocated a single pixel — so it cannot fit a 364px card and never did.

The section renders inside `.widget-card`, which is **`overflow: hidden`**. So the overflowing
columns were not scrolled off, they were **clipped with no scrollable ancestor**: at 390px wide,
**249px was lost, taking the entire Status column and its dropdown**. A phone user could not see
or change a request's status at all.

**Why nothing caught it for months:** `overflow: hidden` absorbs the overflow, so the *page* never
scrolls sideways and a `PAGE-X` check reports clean. `audit:ui` reads source and sees no misused
class. `audit:clipping` would have caught it — it tests precisely "cut off by an ancestor that
cannot scroll" — but `/app` is auth-gated with no staging, so it has never been pointed at this
page. **The card being `overflow: hidden` is now called out in `docs/mobile-playbook.md`'s
primitive table**, because "wide child of a widget-card" is a whole class of invisible defect,
not one section's bug.

Fixed per the playbook — tables scroll, they do not reflow — with **one** `overflow-x-auto` frame
wrapping the column header **and** the rows. Two details that are not optional:

- **The header must share the rows' scroller.** Left outside, the columns desync the instant
  anyone scrolls sideways. `scroller.contains(header)` is **not** a sufficient test for this: a
  header nested in its own scroller inside the outer one satisfies it and still desyncs. The
  committed test compares each grid's **nearest** scrollable ancestor instead — a distinction the
  first version of that test got wrong and a sabotage exposed.
- **The inner frame's `min-width` is 700px, not the 512px the columns strictly need.** At 512px
  the `1fr` course-name column is squeezed to **76px** — narrower than the Country column beside
  it — and every name ellipses, which defeats the point of scrolling. 700px gives the name 186px.

The row's status dropdown was already `<MenuItems anchor="bottom end">`, which portals, so the new
scroller does **not** clip it. Check that before wrapping any row that contains a popover — an
inline Headless UI panel would have been cut off by the very frame that fixed the columns.

**Verified:** `npm run verify` green — tsc + lint 0 errors, **3137 tests**, `audit:ui` 0 findings;
`npx next build` clean. Geometry measured in headless Chromium against CSS built from this tree
(Tailwind only emits classes the source uses, so a stale bundle silently ignores new ones), in
both the editable and read-only variants, at 390 · 430 · 768 · 1024 · 1280: **0px unreachable,
0px page scroll**, header and rows sharing one scroller. Proved to discriminate by removing the
scroller (249px unreachable returns), removing the min-width, setting it to 512px, and giving the
header its own scroller.

**Still open:** a 7-column table on a 390px phone is a 384px sideways scroll — honest, and better
than clipping, but a stacked card layout below `sm` would be better still. Not done here because
it is a redesign rather than the defect, and `/app` cannot be visually verified before merge.

### 45.3 Course requests carry a demand count and a Low/Medium/High tag

Every row in the Wedge course-request table now shows **how many golfers have asked
for that course** and a **LOW / MEDIUM / HIGH** reading of it, in both the active
table and the collapsed Added table, and in the read-only client wiki view.

**It is derived, never stored.** `computeCourseDemand` runs over the request list on
every render, so it is correct for all 756 requests already in the table *and* for
every new one, with no backfill, no schema change and no migration. That is the whole
reason it was built this way — Dan asked for "all previous courses and all new
requests", and derivation gives both for free.

**Each row is one golfer's submission**, which is what makes counting rows a valid
measure of demand: Big Wedge stamps the *submitted* date into the notes, and rows for
the same course carry different ones. Checked before building — 13 of the 15
duplicate-name pairs in the audit were submitted on different days, so they are
separate people, not an import that ran twice.

⚠️ **The count only works because the names are folded, and that fold is the whole
design.** Keyed on the raw `courseName` the answer is always 1: an audit of the live
table (368 of 756 rows, September 2026) found **zero** exact duplicates. Folding the
trailing club/course designator, punctuation, casing and spacing found **18 courses
asked for twice or more**, topping out at three — "Allen Park Golf Centre",
"AllenPark" and "Allen park", one of whose notes reads *"I requested this over two
weeks ago"*.

⚠️ **Do NOT add a typo tolerance to `courseKey`.** It was tried. A one-character
allowance merged **Hawick** (Scotland) with **Howick** (New Zealand), and **Basildon**
(Essex) with **Baildon** (West Yorkshire) — four real, distinct courses reported as
two. `country` cannot rescue it: the field is polluted with **raw UUIDs** from the
intake (`3dae3001-4e4f-…`, which `safeCountry()` already hides in the UI) and
disagrees with itself — "England" / "United Kingdom" / "Scotland" for the same place.
Under-counting a genuine misspelling is the safe error; inventing demand sends someone
to license a course nobody asked for. For the same reason the fold is anchored to the
**end** of the name and never removes an interior word: "Richmond Park" is a different
course from "The Richmond Golf Club", and both are in the table.

Because the count is a judgement about free text, the grouping is **inspectable** — the
cell's `title` lists every spelling that was counted together.

**Demand is computed over EVERY request, never the filtered tab.** A course three
golfers asked for that was sent to the provider months ago must not read "1 LOW" in
the New tab; it is the most wanted course on the board. There is a render test for
exactly this, because `filtered` is in scope, the component compiles either way, and
the wrong numbers still look plausible.

**Thresholds** live in `DEMAND_THRESHOLDS` (`medium: 2, high: 3`) and are calibrated to
the observed distribution — 330 courses at one request, 16 at two, 2 at three. Anything
higher and every row reads LOW.

**Two things the contrast measurement caught**, both the class of defect behind the
August `/login` incident:
- `bg-indigo-100` beside `bg-indigo-50` measured a **1.1:1** step and read as the same
  chip. HIGH is a **solid** fill instead, which also carries its own contrast rather
  than borrowing the page surface, so it is safe in both themes.
- The LOW chip used `--text-4` on `--surface-1` = **4.36:1**, under AA for 10px text.
  It is `--text-3` now (6.95:1) — which is what the country chip beside it already
  used.

⚠️ **Measuring rendered contrast has two traps, and I hit both.** Tailwind v4 emits
**`oklch()`**, and Chrome leaves it in oklch form in computed style — so parsing the
numbers out of the string reads L/C/H as if they were R/G/B (it reported "fg=0,0,277").
Resolve colours through a **1×1 canvas**, which always hands back sRGB bytes. And the
dark remap turns `bg-indigo-50` into a **12%-alpha overlay**, so comparing against the
declared colour as if it were opaque gives a meaningless 1.17:1 — **composite every
alpha layer down to the first opaque ancestor** before computing the ratio.

Demand uses **indigo**, deliberately not the amber/blue/emerald/red the statuses own:
demand and status are different axes and must not read as the same scale. Indigo is one
of the families `globals.css` remaps for dark mode; violet is not.

**Verified:** `npm run verify` green — tsc + lint 0 errors, **3161 tests** (24 new),
`audit:ui` 0 findings; `npx next build` clean. The module was run over the audited live
data and reproduced the audit exactly (348 courses, 18 with repeat demand, 6 rows HIGH
/ 32 MEDIUM / 330 LOW, no false merges). Geometry re-measured at 390 · 430 · 768 ·
1024 · 1280 · 1440 in both variants: 0px unreachable, 0px page scroll, course name
still 186px on a phone, no chip overflow. All six chip × theme contrast pairs clear
AA. Proved to discriminate by computing demand from `filtered` (2 failures), removing
the designator fold (10), removing the space compression (5), reintroducing an
over-eager fold (2) and shifting the thresholds (3).

**Known limits, both under-counts rather than false positives:** a genuine misspelling
("Rideway" for "Ridgeway", "contree" for "Cobtree") counts separately, and a name that
gains a real word ("Cobtree Manor" vs "Cobtree Manor Park") does too. The fuzzy search
from §45.1 is how you find those by hand. **Not verified:** the live table — `/app` is
auth-gated with no staging, so the audit was done through the Foundry MCP and the UI
through server-rendered screenshots. Post-deploy, open Wedge → Wiki → Course requests
and confirm Allen Park reads 3 HIGH.

### 45.4 The course search matched 33 rows for a course that was not there

Searching the live table for **"Jamestown"** — not in it — returned **33 rows**, none
containing the word: "HS2 Renovated Course", "home course", "Ardlodge", "Dorking"…

**Cause: a subsequence match is meaningless against long text.** Every bogus row
scored exactly **280** = `400 × 0.7`, the subsequence fallback hitting the **`notes`**
field, which holds the original Big Wedge feedback email — 500-850 characters of
prose. In a text that long, almost any ordinary sequence of letters can be found *in
order*, so `isSubsequence` had quietly become a near-universal match on every row
with a note. Name-only score was 0; dropping `notes` from the field list gave 0 hits.

**The same disease sat one tier up.** A 600-character note holds hundreds of words, so
one of them is nearly always within edit distance 2 of whatever was typed — which is
how **"St Andrews"** matched "Wyboston Lakes Golf" (`"andrews"` was two edits from a
word buried in its note, and `"st"` sits inside "Wybo**st**on").

**Four fixes, each a bound rather than a removal** — the forgiveness Dan asked for is
the point of the feature, so none of it was thrown away:

| Fix | Rule |
|---|---|
| `SUBSEQ_MAX_TEXT_RATIO = 2.5` | A subsequence counts only where the text is at most 2.5x the query. "wtsn" in "Watson" still means something. |
| `FUZZY_MAX_FIELD = 120` | Fuzzy tiers (typo **and** subsequence) apply only to short, identity-bearing fields. Long prose still matches — on an exact word, a word prefix or a literal substring, which is what makes searching "antrim" find the row whose note reads "Antrim, Allen Park, 18 holes". |
| `MIN_TOKEN_FOR_MIDWORD = 3` | A one- or two-character token must match a word's START, never its middle. |
| `tolerance()`: two edits from **7** chars, not 6 | At six characters two edits is a third of the word. It made "horley" match **40** rows. One edit at four characters is kept deliberately — it is what finds the real row "Iver Golf **Vlub**" when someone types "club". |

Two ranking bugs surfaced on the way and are fixed too: a **word typo now outranks a
mid-word substring** (ranked the other way round, "iver golf club" returned "Dodge
R**iver**side Golf Club" above the actual "Iver Golf Vlub"), and the typo tier
**breaks ties on shared prefix** ("dokring" is two edits from both "Dorking" and
"Bowring"; only one plausibly starts the way it was typed).

⚠️ **Why the suite missed all of this: its only negative case was `"zzzzzz"`.** Letters
that appear nowhere cannot be a subsequence of anything, so it passed while every
normal-looking absent name leaked. **A fuzzy matcher has to be tested with queries
that LOOK like the data and still are not in it** — the new cases use Jamestown,
Pebble Beach, Augusta National, Torrey Pines, Chambers Bay, Whistling Straits and
Muirfield Village, against fixtures carrying a realistic 500-character note.

⚠️ **And one of the new tests was itself weaker than it looked.** Removing the
subsequence bound left all 35 green, because `FUZZY_MAX_FIELD` already excludes long
notes — the two fixes overlap *there*. The bound still matters for a long course
**name**, which is short enough to be matched fuzzily, so that needed its own case:
**"tampa" is genuinely a subsequence of the real row "Elmpter Wald Golf ClubGolfclub
Elmpter Wald"**. Found by searching the live names for a plausible absent query that
was a subsequence of one of them, rather than inventing a fixture.

**Measured on the live data after the fix:** 26 of 26 target queries rank the right
row first (including "dokring", "brechn", "neangar", "wentwerth", "allenpark",
"iver golf club"); 12 of 13 absent courses return **nothing**; "horley" went 40 -> 2
with the right top hit; and "antrim" / "bendigo" still find their rows via the notes.

**The one remaining loose match, kept deliberately:** "Wolf Creek" returns 2 rows,
both containing "Creek", because `"wolf"` is one edit from `"golf"` — which appears in
most rows of a golf table. It is inseparable from the flagship case: `"wolf"` vs
"Sandy Creek **Golf** Club" and `"club"` vs "Iver Golf **Vlub**" both score 780 by the
identical mechanism, so removing one removes the other. Two well-ranked rows for an
absent course is normal fuzzy behaviour; 33 unrelated rows was the bug.

**Verified:** `npm run verify` green — tsc + lint 0 errors, **3178 tests** (17 new),
`audit:ui` 0 findings; `npx next build` clean. Proved to discriminate by reverting each
fix in turn — subsequence bound (1 failure), field-length gate (1), mid-word floor (1),
tolerance scale (1), prefix tie-break (1), tier order (1).

## 46. Recent Changes (September 2026) — The standup review dialog resized with its content

Dan reported that the **Morning** and **End of day** review popups on the daily roll-up
card "do not follow our fixed height rule for pop ups". They did not.

**Cause: nothing declared a height, so the content set one.** The panel was
`w-full max-w-lg` — width only — and the update list inside was `max-h-[46vh]`. A
`max-h` caps the tall case but does nothing for the short one, so the box collapsed
around whatever was being reviewed. Measured in headless Chromium against CSS built
from the tree, the **same dialog**:

| Viewport | one-line update | long update | swing |
|---|---|---|---|
| 1440×900 | 281px | 597px | **316px** |
| 1280×620 | 281px | 468px | 187px |
| 390×844 | 298px | 571px | 273px |

Opening Morning and then End of day resized the box under the cursor — which is
exactly what the rule exists to stop.

**Fixed by giving the height to the panel**, per DESIGN.md: `flex h-[80vh]
max-h-[680px] min-h-[min(460px,80vh)] w-full max-w-lg flex-col`, with a `shrink-0`
header, a `min-h-0 flex-1 overflow-y-auto` middle and a `shrink-0` footer. Same clamp
as `project-update-composer.tsx`, the sibling dialog that does the same job (pushing an
update to Slack) — consistency between the two was worth more than shaving 100px off the
short case. Re-measured: **0px spread at all three viewports**, header a steady 36px,
Send always reachable without scrolling, nothing off-screen.

⚠️ **`min-h-[min(460px,80vh)]`, not `min-h-[460px]`** — a bare 460px floor would push the
panel past a short viewport, and the Modal's backdrop layer does not scroll, so the
bottom of the dialog would be unreachable rather than merely cramped.

**`.widget-header` had no `flex-shrink: 0`.** It is `height: 36px` with no shrink guard,
so the moment a dialog panel becomes a flex column the header compresses. Fixed in the
`<Modal>` primitive (`widget-header shrink-0`) rather than in `globals.css` — scoped to
dialogs, which is where flex-col panels are being introduced.

⚠️ **The rule was written narrowly and that is why this shipped.** DESIGN.md described the
fixed height only as part of the **two-column "list + inspector"** pattern, so a
single-column review dialog read as out of scope. The rule now says explicitly that it
applies to **any** dialog whose content varies, and that a `max-h-[Nvh]` on the scroll
region is not a fixed height.

⚠️ **A test that passed for free.** The first version of the regression test mounted each
content size without clearing the DOM, so `document.querySelector('[role="dialog"]')`
returned the **previous** mount's panel — making the long-vs-short comparison compare one
panel with itself. It only surfaced because a later assertion failed against the stale
panel. `openDialog()` now clears `document.body` first.

**~20 other components still use `max-h-[Nvh]`** (`grep -rl "max-h-\[[0-9]*vh\]" src/components`).
Most are dropdowns and menus, where sizing to the viewport is correct. Not swept — a dialog
that varies its height needs the panel treatment, a menu does not, and telling them apart
needs looking at each one.

**Verified:** `npm run verify` green — tsc + lint 0 errors, **3216 tests** (5 new), `audit:ui`
0 findings; `npx next build` clean. Geometry measured at 1440×900 · 1280×620 · 390×844 in
both themes, before and after. Proved to discriminate by reverting each part in turn —
restoring the original `max-h-[46vh]` (2 failures), removing the panel height (1), dropping
`min-h-0` (1), unpinning the footer (1), letting the header compress (1), and collapsing the
empty state (1).

**Not verified live:** `/app` is auth-gated with no staging, so the dialog was mounted in
jsdom through its real hooks (mocked at the module edge) and the resulting markup measured in
headless Chromium. Post-deploy: open Morning and End of day back to back and confirm the box
does not move.

## 47. Recent Changes (September 2026) — Requests became a tracker, and the client's sheet follows the board

Dan's brief: *"clients are forever linking spreadsheets, I want to unify this in Foundry
… make it easier for devs to take the tasks into their pipeline, but clients to also see
where the tasks are up to."* Reading the code, the reason clients keep their own sheets
turned out to be a defect, not a missing feature.

### 46.1 The defect: nothing ever wrote back

`promoteWikiIntakeItemToTask` sets `ClientWikiIntakeItem.status = "PROMOTED"` and stamps
`taskId`. **No code path anywhere writes that row again.** A developer could drag the card
BACKLOG → DOING → DONE, ship the fix, and the client's Requests page would still read
"Task created" — forever. Verified exhaustively: `src/server/tasks.ts` contains **zero**
references to the intake table, `taskId` is a bare `String?` with no relation (so Prisma
cannot even join it), and the `metadata.wikiIntake` breadcrumb written at promotion is
**written once and never read anywhere in the repo**.

So Foundry told a client we had started and could never tell them we had finished. That is
what a parallel spreadsheet is for.

### 46.2 The fix is derived, not synced — and that is the whole design

The obvious repair is to write the task's status onto the intake row whenever a task moves.
That is a second source of truth, correct only while **every** write path remembers it —
batch updates, the drag handler, the detail drawer, the standup, the importer, MCP. Miss
one and the row lies again, silently, exactly as it does today.

Instead: `loadLinkedTaskStatuses()` batch-reads the linked tasks in the wiki loader, and the
**pure** `deriveRequestStage()` (`src/lib/wiki-request-stage.ts`) turns
`(intake status, task status)` into one client-facing word on every read. There is no write
path to forget, and a board that has drifted repairs itself the moment anyone looks at it.
Same call as Care's reply state (§42.2) and the Docs cover contents (§41.6): **store the
facts a system can observe, derive the judgement at read time.**

Two rules the derivation must keep, each with a test named for it:

- ⚠️ **`taskStatus: null` never becomes SCHEDULED.** It means either nothing is promoted yet
  *or* `taskId` points at a task that has been deleted — there is no FK, so that dangles.
  Both collapse to `REVIEWING`, because "we have it" is true in both cases and "it is on the
  board" is not. Reporting a deleted task as scheduled is the §35 mistake exactly: "we could
  not look" rendered as a fact.
- ⚠️ **`CLOSED` wins over a live task.** "Mark dealt with" is the team explicitly filing the
  request, and its own tooltip says any task created from it is deliberately untouched. A
  task still in flight must not put a filed request back on the client's open list.

`stage` also ships on the intake API's `?items=1` reconciliation endpoint — that is the
endpoint an integrator polls to answer "has Gitwork shipped this yet", which until now it
could only answer as `PROMOTED` forever. Documented in `docs/client-intake-api.md`.

### 46.3 Five DTO fields were in the model and in the type but not in the query

`WIKI_INCLUDE.intakeItems.select` omitted `label`, `categoryId`, `categoryLabel`,
`externalUrl` and `attachmentUrls`. The omission was **invisible** because
`serializeWikiIntakeItem` defaults each to `null` rather than failing — so the Requests page
showed every item's category as its underlying TYPE, never showed a dev label at all, and
dropped the deep link back into the client's own tracker, which is the entire reason the
intake API stores `externalUrl`. A defaulting serializer over a narrowed `select` turns a
missing column into a plausible value; prefer requiring the field in the parameter type.

### 46.4 The UI is a grid, and it collapses rather than scrolls on a phone

Two stacked `widget-card`s, full width: `01 // LOG A REQUEST` (one line + Enter, with
everything optional behind "More fields") and `02 // REQUESTS` (the grid). Search reuses
`fuzzySearch` (§45.1) and spans every category and stage, a stage `<select>` filters the new
axis, bulk select drives a fixed batch bar (create tasks / dealt with / reopen / delete), and
**Copy** puts the visible rows on the clipboard as TSV — one paste into Sheets, because
pretending nobody will ever want the data elsewhere is what created the problem.

⚠️ **The mobile answer here is fewer columns, not a scroller.** Below `md` the grid is two
columns — request and stage — with the other four values on a mono sub-line under the title,
so nothing is lost and **nothing overflows**. The `min-w-[940px]` is therefore `md:`-prefixed;
unprefixed it would manufacture a sideways scroll on a phone that need not exist. From `md`
up the header and the rows share **one** `overflow-x-auto`, per §45.2 — this section renders
inside `.widget-card`, which is `overflow: hidden`, so a wide child with no scroller of its
own is *unreachable*, not merely off-screen.

### 46.5 Three defects found by rendering it, none of which a code read would have caught

1. **`sm:flex-row` on the add row left the title input 38px wide.** A breakpoint asks about
   the VIEWPORT; the constraint was the CONTAINER — the wiki's own content column is 405px at
   a 768px viewport. Now `flex-wrap` with `min-w-[220px]` on the field, which asks the right
   question: if the title cannot have 220px, the selects drop to their own line.
2. **The mobile sub-line truncated with no `title`** — a `TRUNCATED` defect under
   `audit:clipping`, and measured: it really does cut off mid-name at 375px. A test now sweeps
   every `.truncate` in a rendered row and fails naming any without a recoverable title.
3. **The stage chip rendered empty with a literal `undefined` in its class list** when `stage`
   was absent. Caught because a render fixture ended in `as unknown as WikiIntakeItemRecord`,
   which is precisely why that cast is a trap — it meant a new required field was missing and
   `tsc` said nothing. The cast is gone, and the chip now shows an em-dash, which matters for
   one real case: a React Query cache written by the deploy *before* `stage` existed.

**Verified:** tsc + lint **0 errors** (41 warnings, all pre-existing), **3239 tests**,
`audit:ui` **0 findings** with its self-test passing; `npx next build` clean, 103 static
pages. Driven live at `/demo/wiki` (seeded with a request at every stage — a demo showing
only NEW and TRIAGED would verify the CSS and nothing else, §43.3): at 375 · 768 · 1440 the
page overflow is **0**, no truncated cell is unrecoverable, and the grid scrolls rather than
clips. Seven guards were **proved to discriminate** by breaking them on purpose — removing
the scroller (6 failures), dropping the `md:` prefix (2), giving the header its own scroller
(2), removing the unknown-stage guard (1), un-escaping tabs in the export (1), dropping a
truncation title (1), and claiming SCHEDULED for an unestablished task status (1).

⚠️ **`npm run verify` failed on `main` for everyone when this was written. Fixed in
September 2026 — see §54.** The diagnosis recorded here (`audit:dependencies`) was wrong:
that step passes on its own and always did. Every one of the ~28,000 errors came from
ESLint walking into `.claude/worktrees`, the nested checkouts Claude Code creates per
session, and linting the whole repo again from inside each one. `npm run verify` now
exits 0.

**Not verified:** the live page against a real database. `/app` is auth-gated with no
staging, so the derivation has only been exercised against demo data. **Post-deploy:** open a
client's Requests page, promote a request, move its task to Doing on the board, reload the
wiki, and confirm the row reads **In progress** without anyone having touched the request.

## 48. Recent Changes (September 2026) — Insights: charts and diagrams in a client's wiki

A new client-wiki section where a Gitwork user authors figures for a client: **bar, pie,
Venn and a two-level node map**. The node map is why it exists — Dan's brief was to show
Coachman *"the caravan as a core then loads of connected entities"*, and there was no node
or Venn renderer anywhere in the codebase.

**No charting library, and none was needed.** `analytics-widgets.tsx` is already a
dependency-free, token-correct SVG kit; its `Donut` is reused **verbatim** for the pie
(zero prop changes). Only the node and Venn renderers are genuinely new.

⚠️ **`MiniColumns` is deliberately NOT reused for the bar**, and that is the one place
this work went against "reuse before building". Three concrete blockers: it is
`preserveAspectRatio="none"` so it STRETCHES (correct for a micro-chart, wrong the moment
there is text); it has no labels at all (its one consumer supplies them as a sibling row
of `<span>`s, which works for five fixed buckets and not for twelve authored names); and
it takes `values: number[]`, so there is no per-column colour. Extending it would push
label fitting, a height-varying viewBox and a palette into a component whose two existing
consumers want none of it. The five-line diverging-baseline maths is reimplemented in
`bar-layout.ts` and its test pins the same semantics, so the two cannot disagree.

### 47.1 The data model is one board table and THREE point tables

A single flat point table would have had **four of seven columns dead for three of the
four types**, and would have forced `value Float?` — which no validator can express and
every bar renderer would then have to handle. That is the `LaunchpadFieldType` trap from
§43, one layer down. Bar and pie DO share a table, because they are genuinely the same
shape; splitting those would be the opposite mistake.

The usual objection to three tables is 3× the CRUD. It does not apply, because **writes
replace the whole board's content** — the same contract `updateCodeVersion` uses for a
version's files. There is no per-point API, `orderKey` is the array index, and the three
tables collapse to one `switch` in `replaceBoardContent`.

**The DTO is a discriminated union even though the table is not.** The database keeps a
union header (five nullable config columns, which a board header inherently is); the wire
format does not, so a bar board carries no `sets` and no `branches` and no component ever
receives a field that cannot apply to it. `wiki-insights-serialize.test.ts` asserts that
shape directly, because the pressure to flatten it back is exactly what produces "why is
this nullable" three months later.

**Palette keys, never hex.** A stored hex outlives the palette it came from: change the
scale and old boards keep a colour nothing else on the page uses, with no way to find
them. Colours are re-resolved on every render, and the editor offers swatches rather than
a colour input. Venn set colours are derived by POSITION and not stored at all — three
fewer columns, and palette compliance becomes structural.

### 47.2 The radial layout, and the two rules that make it hold

`src/lib/insights/radial-layout.ts` — pure, DOM-free, deterministic.

- **Angular slice proportional to `1 + leafCount`.** The `1 +` is load-bearing twice: a
  branch with no leaves still earns a wedge, and an all-empty board does not divide by
  zero. Even spacing looks broken the moment a tree is lopsided.
- **The leaf ring GROWS until its circumference can hold every leaf** at 22 viewBox-px of
  arc each, with a per-branch stagger for the residual case. That is what makes "loads of
  connected entities" work rather than degrade — at 100 leaves the ring is ~407px, the
  viewBox grows with it and the SVG scales down.
- **No coordinates are stored.** A freeform canvas with saved x/y cannot reflow to a
  phone and can be saved in a state that renders wrong. Computing the layout means a
  board is correct by construction at every width.
- **`MAX_BRANCHES_RADIAL = 10`, past which the LIST is rendered instead** — and that is
  not a degraded mode. A twenty-spoke radial is a bad diagram and no machinery makes it a
  good one.

⚠️ **Do not make the Venn area-proportional.** Sizing circles so every region's area
matches its count is a constrained optimisation with **no exact solution for most
inputs** — for a great many three-set boards the correct diagram cannot be drawn with
circles at all, so an area-proportional renderer necessarily draws something close-but-
wrong and presents it as measurement. Fixed geometry with honest counts makes no claim it
cannot keep. Region names are plain English ("Both — Standard + Premium"), never `∩`.

### 47.3 Every figure is followed by the same facts in text

An SVG scaled into a 350px column is decoration, and a screen reader gets nothing from it
at all. So each chart renders a readable list underneath carrying the same numbers: on a
phone that list IS the chart, on a desktop it is the caption. The Venn's item names live
in that list rather than inside the circles, which is what actually gets read.

⚠️ Venn fills are **stacked alpha over the surface token, never `mixBlendMode: multiply`**
— multiply collapses to black on the navy ground, so every overlap would vanish in dark
mode. Alpha self-adapts: 0.16 → 0.29 → 0.40 reads as progressively deeper in both themes.

An **empty region shows a muted `0` when the board has items anywhere, and nothing at all
when the board is empty.** "We looked and it is empty" and "there is nothing here to look
at" are different facts (§43.2's `null`-vs-`0` rule, applied to a lens).

### 47.4 The node editor is a FLAT list

A two-level tree's obvious editor is a nested one with nested drag-and-drop. Instead each
row carries a Branch/Leaf toggle and **a leaf attaches to the nearest branch above it**,
so the tree is edited as one flat reorderable list — which is also literally how the brief
described it ("add data points… as easy as possible"). A leaf dragged above the first
branch is promoted on save, so there is no list order the tree cannot express.

### 47.5 Wiring, and the assertion that nearly did not discriminate

Twelve allow-lists, of which `tsc` catches four. `insights-section-wiring.test.ts` is a
sibling of the Launchpad one rather than an addition to it — that test's needles are
launchpad-shaped and its last blocks assert a `[token]`-route posture Insights
deliberately does NOT have. The new test asserts the inverse: **`app/api/wiki/[token]/insights`
must not exist.** The client side is read-only and boards ride down inside the wiki DTO,
so a token write route would be dead surface with a live attack surface.

⚠️ A naive `toContain('"insights",')` does **not** discriminate in `wiki-sidebar.tsx` — it
is a substring of the `navItem("insights", "Insights", …)` line, so it passes with the
`visibleSections` entry deleted. The test slices a single declaration block instead
(stopping at a **line-leading** `]`, because stopping at the first `]` cuts
`WikiSection[] = [` in half at its own type annotation).

The dashboard gets a **real `case "insights"`**. A section with no case falls through to
the markdown-doc default and the card reads "Documentation." — the defect the Requests
card actually shipped with (§40.1). ⚠️ Launchpad still has no case and still falls
through; worth fixing separately.

### 47.6 Verified

`tsc` + `lint` **0 errors** (41 warnings, all pre-existing) · **3324 tests** ·
`audit:ui` **0 findings** · `npx next build` clean, 103 static pages, both routes
registered. Schema diff is **purely additive** — two enums, four models, one flag.

⚠️ **Do not run `npx prisma format` to apply a schema change here.** It reformats the
whole 4,000-line file (measured: 435 insertions / 313 deletions for a five-line addition),
which buries the diff and conflicts with every other open branch.

Driven live at `/demo/wiki`, seeded with **all four board types** including a five-branch
node map — a demo carrying only a bar chart would verify the CSS and nothing else (§43.3).
Measured in the DOM rather than by screenshot (the browser pane was not displayed, and
`read_page`/`javascript_tool` are the better instruments anyway): **0 elements fall outside
their SVG box, 0 real label collisions across 18 labels**, and at **375px the page overflow
is 0** with each wide figure carrying its own scroller (119–179px of travel) — so nothing
is unreachable inside `.widget-card`'s `overflow: hidden` (§45.2).

**88 new unit tests.** Proved to discriminate by breaking things on purpose: **19
wiring sabotages, each failing exactly one test**, plus twelve on the pure modules
(mistyped Venn anchor, `∩` in a region name, baseline ignoring negatives, the bar-width
cap, value labels on negative bars, a single-colour palette fallback, `isInsightColorKey`
accepting a hex, a drifted palette hex, reordered palette keys, a set label drifting
inside its circle, the `maxAbs === 0` guard, bars sorted by value).

⚠️ Twice during this work a sabotage was a **silent no-op** — the edit did not match and
the suite stayed green, which reads as a weak test. Both times the fix was to prove the
edit landed before believing the result. That is §45.1, and it keeps happening.

**Not verified:** nothing ran against a real database. **Post-deploy:** open a client's
wiki → Add New → Insights, create a node board, and confirm it renders and the client's
share link shows the same figure.

## 49. Recent Changes (September 2026) — Delivery and Support: two client-portal pages over data we already held

Two more client-wiki sections, both **read-only for the client** and both built almost
entirely out of figures Foundry was already computing and simply never showing to the
person they were about.

### 49.1 Delivery — no loader, no route beyond a toggle, no DTO object

`WikiTimeline` already carries per-phase `statusCounts`, `progress` and `milestones`, and
`wiki.blockers` was already in the DTO and already documented client-safe. So Delivery is
**pure presentation** — `src/lib/wiki-delivery.ts`, not `src/server/`, because there is
nothing to fetch and it can therefore be unit-tested with no database. The wiring test
asserts there is **no `loadWikiDelivery` anywhere under `src/server`**: adding one would be
a second copy of data the DTO already carries.

**The number that justifies the page is "waiting on you"** — open `wiki.blockers` with no
client reply. It already existed and had never been surfaced to the one person who could
clear it.

Three honesty rules, each with a test:

- ⚠️ **No timeline reports `percent: null`, never `0%`.** "Nobody has built a plan" and
  "the plan is 0% done" are different facts, and the second is the one a client acts on.
- ⚠️ **A phase with no tasks is "not started", not "complete".** 0 of 0 is not 100%, and a
  plan whose phases are not broken down would otherwise report as finished — the single
  most misleading thing this page could say.
- **Only UNANSWERED blockers count as waiting on the client.** One they have replied to is
  ours again.

### 49.2 ⚠️ The demo's timeline blocks carry no `statusCounts`, and the cast hid it

Rendering the page threw on first paint: *"Cannot read properties of undefined (reading
'DONE')"* inside `WikiDashboard`. `dev-demo-data.ts` builds the wiki timeline from
`demoGanttBlocks` with **`as unknown as WikiDTO["timeline"]`**, so the blocks carry
`tasks: [{title, done}]` and no `statusCounts` at all — and `tsc` said nothing, because
the cast is the point of a cast.

Fixed by counting from `statusCounts` when present and **falling back to `tasks`**. That is
not a second source of truth: they are the same facts at two grains, the finer one wins,
and a block carrying both can never report two different answers. Three regression tests
pin it, including the both-present case.

The lesson is the one §45.1 keeps re-teaching in a different costume: **an `as unknown as`
in a fixture disables the only check that would have caught the mismatch.** A page rendered
against that fixture is the only thing that finds it.

### 49.3 Support — client-safe by PRECEDENT, not by judgement

Every figure on the Support page is one the monthly Care report **already emails the
client** (`support-report-doc.ts`). That is deliberately the test used, because the
alternative is one person's taste standing between a client and their own data.

Deliberately excluded, and each for a stated reason: **sentiment** and
`getClientHealthScore` ("23% of your customers sound negative" is a conversation, not a
number to publish at someone); `SupportConversationNote` (staff-only by its own schema
comment); raw `SupportMessage` bodies and `CustomerIdentity` (the client's END customers'
personal data — we hold it to do the work, not to redistribute it); anything cross-client.

⚠️ **Support days are NOT the `clients.viewFinancials` fields.** That gate covers
`monthlyCost` / `workingDays` / `retainerDays` / `retainerDaysUsed` on `WorkspaceClient`
and must never appear here. `SupportClient.supportDaysPerMonth` is the client's own
contractual allowance — a term of an agreement they already hold a copy of.

The Care link is `SupportClient.workspaceClientId`, never a name match: the same client is
`wedge` in Portal and "Big Wedge Golf" in Care, which is exactly the failure §42.15
records. It is **not** declared `@unique`, so this is a `findFirst`.

⚠️ **`TrendBadge` has a `goodWhen` prop and durations must use `goodWhen="down"`.** Without
it, "we replied 29% faster" paints green-for-up and reads as a regression. Inverting the
sign by hand would have worked and would have hidden the intent inside a minus. Verified by
resolving the rendered colours through a canvas: tickets neutral slate, resolution-rate up
green, and **both duration trends green while pointing down**.

### 49.4 The public predicates differ per section, on purpose

- `insights` — enabled AND at least one board.
- `delivery` — enabled AND `timeline.blocks.length > 0`. A client following a link that
  promised progress must not land on "no plan yet".
- `support` — enabled AND **linked**. An unlinked section shows "not connected", which is
  our problem to fix, not theirs to read.

`insights-section-wiring.test.ts` became **`wiki-section-wiring.test.ts`**, parameterised
over all three sections for the seventeen shape-identical checks and keeping separate
assertions for the parts that genuinely differ. **60 tests**, and eight sabotages across
`delivery` and `support` each failed exactly one test.

⚠️ That sabotage pass could not use `git` to restore, because the feature work was
uncommitted — `git checkout --` would have destroyed it. Scratchpad backups with `shasum`
verification are the technique when the tree is dirty.

### 49.5 Verified

`tsc` + `lint` **0 errors** (41 warnings, all pre-existing) · **3380 tests** ·
`audit:ui` **0 findings** · `npx next build` clean, 103 static pages, both toggle routes
registered. Schema diff purely additive — two boolean flags.

Driven live at `/demo/wiki` with a linked Support fixture carrying **two months** of
figures, so the trend badges have something to compare against — one month would render
every trend as an em-dash and prove nothing about the part most likely to be wrong.
Measured: page overflow **0**, and the rendered trend colours are correct in all four
tiles.

**Not verified:** nothing ran against a real database, so the Care reads in
`loadWikiSupport` have only been exercised against a fixture. **Post-deploy:** enable
Support on a client that has a linked Care record and confirm the month's figures match
that client's latest Care report.

## 50. Incident (September 2026) — every client's wiki 500'd, and `tsc` could not have caught it

**Symptom:** `/api/clients/[slug]/wiki` returned 500 for **all 13 clients**. Reported from a
browser console; root cause read out of the production container logs, not inferred.

```
prisma:error Invalid `prisma.clientWiki.findUnique()` invocation:
Unknown argument `createdAt`. Available options are marked with ?.
```

`BOARD_INCLUDE` in `wiki-insights.ts` ordered the three Insight child relations by
`createdAt`. None of `WikiInsightSeriesPoint`, `WikiInsightVennItem` or `WikiInsightNode`
has that column.

### 50.1 ⚠️ The compiler check that a named const silently disables

**TypeScript's excess-property check fires only on an object literal assigned DIRECTLY at
the call site.** The moment a Prisma `select` / `include` / `where` / `orderBy` is lifted
into a named const — or returned from a helper, or spread in — that check is skipped
entirely, and a field that does not exist compiles perfectly.

So the readability refactor *was* the defect. `tsc`, `eslint`, **3,394 tests**, `audit:ui`
and `npx next build` were all green on a query that could never run.

There is now a test — `src/server/__tests__/wiki-insights-include.test.ts` — that reads
`prisma/schema.prisma` and checks every field named in an extracted include actually
exists on its model. Reintroducing the exact bug fails 5 of its 9 tests. **Any future
extracted Prisma args object wants the same treatment**, because nothing else can see it.

### 50.2 The severity was a `Promise.all`, not the bad column

A wrong column in one optional section should have broken one optional section. Instead
`loadWikiInsights` ran inside `buildDTO`'s `Promise.all`, so its rejection rejected the
whole DTO — **clients who had never enabled Insights lost their entire wiki.**

Every loader now goes through `settle(section, load, fallback)`: it logs the failing
section by name and falls back to that section's empty state. A broken section reads as
"nothing here" and is findable in the logs, instead of taking the page with it. Same shape
as §35.1, where one failed GraphQL call silently discarded a whole repo scan — the lesson
did not transfer the first time, hence writing it down again.

### 50.3 ⚠️ A green deploy job does NOT mean the release works

I reported the release sound because the `deploy` job was green and `/api/health` returned
200. That proves the image built, `prisma db push` applied, and the container is up. It
says **nothing** about whether any real page loads — `/api/health` touches none of the
code a feature changed.

**Verify a release by hitting the surface the change actually touched.** For anything
server-side that is one command from the box, and it takes seconds:

```bash
ssh <vps> "cd /opt/apps/foundry && K=\$(grep '^API_KEY=' .env | cut -d= -f2- | tr -d '\"') \
  && curl -s -o /dev/null -w '%{http_code}\n' -H \"Authorization: Bearer \$K\" \
     localhost:3000/api/clients/<slug>/wiki"
```

Post-fix that was run for **every** client, not one: 13/13 → 200.

### 50.4 Two log lines that look like defects and are not

Checked while sweeping, and recorded so the next person does not chase them:

- **`Error: The Server Reference ID did not match the expected format. Received "x".`** —
  8 in 24h. The received value is a single character, not a stale bundle hash. Cross-
  referenced against nginx: external POSTs to `/` and `/portal/login` from Cloudflare,
  GCP and other scanner IPs, all answered **404**. Next is correctly refusing junk and
  being loud about it. Silencing it would hide real Server Action errors.
- **`[auth][error] InvalidCheck: pkceCodeVerifier value could not be parsed`** — exactly
  **once** in 48h, seconds after a deploy restarted the container, with a successful
  Google callback (302) nearby. An in-flight OAuth handshake interrupted by a restart.
  Sign in again; nothing to fix.

Apart from those two, production's error log across 24 hours contained **only** this
incident.

### 50.5 The compiler check the outage disabled, re-enabled everywhere

§50 explains *why* `tsc` could not see the bad `orderBy`: the excess-property check fires
only on an object literal passed **directly** at the call site, so extracting it into a
named const (`include: BOARD_INCLUDE`) silently switches it off. The first fix corrected
the bad value. This one removes the mechanism.

⚠️ **`as const` does NOT restore the check.** It reads like a safety measure and is not
one. Verified both directions rather than assumed:

```ts
const A = { id: true, bogusA: true } as const;                          // 0 diagnostics
const B = { id: true, bogusB: true } as const satisfies Prisma.XSelect; // TS2353 ✅
```

**`as const satisfies T` is the form, and both halves are load-bearing.** `satisfies`
re-enables the excess-property check; `as const` preserves the literal `true` types that
Prisma's payload inference needs — with `satisfies` alone, `true` widens to `boolean` and
every result degrades to `{ [x: string]: any }`. (That is what a first pass produced, and
it showed up as ~20 unrelated type errors downstream, which is how it was caught.)

Applied to all **19** extracted args objects across 17 files. Reintroducing the exact
outage bug is now a **compile error naming all three models**, and a bogus relation in
`WIKI_INCLUDE` is `TS2353` — both proved by deliberate sabotage, both reverted.

**`src/server/__tests__/prisma-args-satisfies.test.ts`** keeps it that way: it sweeps
`src/` for consts used at a `select:`/`include:`/`orderBy:` position and fails naming any
that lack a `satisfies Prisma.` tail. It carries its own "did the sweep actually find
anything" assertion, because a broken matcher would otherwise report *"0 unguarded"* and
pass forever. It found one the hand pass missed (`CHILD_ORDER`).

**Known gaps, so a green run is not over-read:** `$queryRaw`/`$executeRaw` name columns in
SQL strings and are invisible to all of this (~13 sites); shapes built inline in a helper's
return, or spread into a call, are not matched; `where`/`data` are excluded deliberately
(routinely built from variables, so requiring a tail there would be mostly noise).

### 50.6 `audit:clipping` was crying wolf — four false-positive sources, all fixed

A full wiki sweep (11 sections × 4 viewports) produced ~60 raw findings of which **roughly
half were false**. A detector that noisy is worse than none: it trains you to skim.

| Was reported | Why it was wrong |
|---|---|
| Content inside a **closed `<details>`** | `isClosedDisclosure` was only consulted on ancestors that *themselves* clip. A `<details>` is `overflow: visible`, so the walk sailed past it to the nearest card. 12 of 12 Charts findings. |
| A **sticky** element below the fold | `sticky` was treated as `fixed`. A sticky element is in normal flow and scrolls into view like anything else. |
| Text whose full value is on a **titled wrapper** | Only `el.title` was read. Hovering a child shows its wrapper's tooltip, so the text *is* reachable (bounded to 3 levels — unbounded `closest('[title]')` would let one titled panel excuse everything inside it). |
| An **inline child of an ellipsed box** | The ellipsis clipping its own children is the ellipsis working. Whether that box loses text is the TRUNCATED rule's call; reporting each inner `<span>` doubled it up and pointed the fix at the wrong element. |

All four are now in **`--self-test`** (seven lookalikes, up from three) and each was proved
to discriminate by reverting the fix and watching the named case fail.

⚠️ **Run it from where `playwright-core` lives** (§44.6), not from the repo — the script is
ESM, so `NODE_PATH` is ignored, and a Claude worktree shares `node_modules` by symlink.

After the fixes, and with the real defects below repaired: **44 wiki states, 0 findings,
0 console errors.**

### 50.7 What the sweep found once it was trustworthy

All client-facing, none caught by `tsc`, `lint`, `audit:ui` or 3,461 unit tests:

- **The wiki hero shattered the client's own name mid-word** — `Nort / hwin / d / Studi / o.`
  at 768–1023px, on the front door of their wiki. The team stack beside it is `shrink-0`
  and the row went horizontal at `sm:`, so from the moment the 256px sidebar mounted the
  title column absorbed every pixel of squeeze: **139px for 52px serif, 7 line boxes,
  295px tall**. Now `lg:`, measured **303px / 2 lines / 120px**, and ≤2 lines at all of
  390 · 430 · 640 · 760 · 768 · 800 · 880 · 1023 · 1024 · 1280 · 1440 with 0 page overflow.
- **`null%` on the Delivery dashboard card** — the section guarded `percent === null`, the
  card did not. Fires whenever a Gantt is drawn before tasks are broken out, which is the
  normal state, and the card is the landing page of a whole-wiki client share.
- **Monitors' uptime strip** — bars are `flex-1` floored at 3px, so N checks need ~5N px and
  cannot shrink. In the 2-up grid at 768 the last ~10 days were past the card, and
  `.widget-card` is `overflow: hidden`, so **unreachable** (§45.2).
- **Changelog on a phone** — the action cluster is `shrink-0` in a nowrap row, so editing a
  release was impossible at 390px.
- **The Design System type specimen showed `Wa…`** — a 210px meta column left the sample
  117px at 768 and **36px at 390**, clipped rather than wrapped. A type specimen that
  cannot show its sentence is not doing its job.
- **Two Design System tables were `overflow-hidden`** — 198px of columns (`Border`,
  `Surfaces`, `Use`) unreachable at 390px. Tables scroll, they do not reflow.

**The lesson is the one §42.8 already paid for, one layer out:** every one of these needed
the page *rendered at a real viewport*. Reading the component tells you nothing about a
column that collapses only when a sibling stops shrinking.

### 50.8 Requests: eight defects, and the one pattern behind four of them

Found by adversarial review of the merged PRs, all confirmed by reproduction:

- **Every internal mutation was fire-and-forget.** No intake hook defines `onError`, and
  every internal call site was `void x.mutateAsync(…)`. A failed promote/close/delete was
  an unhandled rejection with zero UI consequence. Delete was worst: `setConfirmDeleteId(null)`
  sat *after* an `await`, so a failure left the row stuck on "Delete permanently?" forever —
  which reads as an unresponsive button and invites a second click. ⚠️ **The public half of
  the same file did this correctly and rendered into `rowError`; the internal half never
  adopted it.** Now one `runRowAction` / `runBatch` pair that a call site cannot forget.
- **A partial batch cleared the selection wholesale**, including the rows that failed. It
  now clears only what completed, leaving the failures ticked and ready to retry.
- **The stage filter offered a "Closed" bucket that was always empty** — `stagesPresent`
  read `allItems`, the list read `scopedItems`, and those two are exactly complementary
  for CLOSED while "Dealt with" is off (the default).
- **A deleted-but-selected row left a stuck batch bar** — `selected` is a `Set<string>`
  never pruned, so `selected.size` counted ids with nothing behind them and every button on
  the bar was a silent no-op. All user-facing counts read `selectedRows` now.
- **A >500-row or long-title import failed with the bare words "Validation failed"** — the
  cap lived only in the route's zod schema, so the modal previewed "640 to import", offered
  "Import 640", and surfaced the rejection after every column had been mapped by hand. The
  limits now live in `src/lib/wiki-intake-import-limits.ts` and **both sides import them**;
  over-long titles are shortened and *counted in the preview* rather than rejected.
- **Escape stranded the import modal on its success screen** — `Modal` fires `onClose` on
  Escape/backdrop/X and the parent only hides the component, so reopening showed
  "5 requests imported / Done" with nothing to paste into.
- **The "could not read this column" tooltip never rendered** — `title` was passed to a
  Heroicon, which spreads it onto the `<svg>` as an *attribute*; SVG needs a `<title>`
  **child**. The `DUP` marker four lines above got it right with `<span title=…>`.

### 50.9 Naming: "Insights" was two different things

The wiki section holding author-drawn bar/pie/Venn/node boards was called **Insights**, and
`proposal-editor-layout.tsx` already ships `{ id: "insights", label: "Insights" }` for the
Docs editor's analytics tab — same word, same platform, unrelated thing. Worse, it sat
directly above **Delivery** and **Support** in the rail, both of which are *also* insights,
so the label distinguished it from nothing.

Renamed to **Charts** in all seven label sites. ⚠️ **The section id stays `insights`** —
changing it would touch all twelve allow-lists (§43.1), the `insightsEnabled` column and
every share link already sent, for no user-visible gain. Label ≠ id is already the norm
here (`intake` → "Requests", `ia` → "Info Architecture").

**Delivery was left alone** despite sitting next to Timeline: its own header reads
`01 // WHERE WE ARE`, and "Delivery" is the agency's word for it.

## 51. Recent Changes (September 2026) — Two controls nobody could reach

Both found by a full-page sweep, both live (not demo-only), neither visible to `tsc`,
`lint`, `audit:ui` or 3,459 unit tests.

### 51.1 A phone could not change month in the Backstage calendar

`.widget-header` is a **fixed 36px band** inside `.widget-card`, which is
`overflow: hidden`. `CalendarTab` put five controls in that band — three `<details>`
pickers plus Previous/Today/Next. Measured at 390px (card right edge 366px):

| Control | past the card | fully outside |
|---|---|---|
| Calendars picker | 34px | no |
| Previous month | 70px | **yes** |
| Today | 137px | **yes** |
| Next month | 169px | **yes** |

So on a phone **you could not change month or return to today, ever** — and page overflow
read **0** the whole time, because a flex row clips rather than scrolls (§45.2). Live at
`/app/backstage`, not just the demo.

⚠️ **Neither obvious fix works here**, and both are worth knowing:
- **Wrapping the row** breaks the 36px band, which is the instrument grammar.
- **`overflow-x-auto` on the row clips the dropdowns.** All three pickers are inline
  `absolute right-0` panels, NOT portalled — so the scroller that fixed the buttons would
  have cut the panels instead. §45.2 says to check that before wrapping any row holding a
  popover; this is the case where the check changes the answer.

**The month nav moved into the body, beside the month label it controls** — which is where
calendar nav belongs anyway — and the three pickers drop their text word below `sm`,
keeping icon + count. Measured after: every control **inside** the card at 390 · 430 · 768
· 1440, 0 clipping findings, 0 page overflow.

⚠️ **The admin case is the one that matters and it is not the default.** `isAdminOrAbove`
gates the Timeline picker, so the demo user sees **two** pickers and an admin sees
**three**. The first fix measured clean on the demo and was still **19px over** for an
admin. Verified under a *temporary* local grant, reverted before commit (§42.12's
technique). **Measure the branch with the most controls, not the one that renders by
default.**

⚠️ **A `str.replace` mislabelled a control.** Both picker summaries carry an identical
`className`, so replacing on it hit the FIRST — leaving the **Holidays** control announcing
itself as "Overlay Google Calendars" to a screen reader. Anchor on something unique to each
element (here, its icon), and assert the post-condition (`count(...) == 1`).

### 51.2 `/api-docs` served two documents

`src/app/api-docs/page.tsx` rendered its own `<html lang="en">` / `<head>` / `<body>`
inside the root layout, so every response carried **two of each**:

```
curl -s …/api-docs | grep -o "<html\|<body\|<head>" | sort | uniq -c
   2 <body    2 <head>    2 <html          →  after: 1 / 1 / 1
```

Every load threw `Hydration failed…`, `In HTML, <html> cannot be a child of <body>` and
two `You are mounting a new html/head/body component…`, then **discarded the SSR tree and
re-rendered client-side**. It *looked* perfect — browsers hoist the stray `<style>` — which
is exactly why it survived. The only page in `src/app` doing it.

⚠️ **The styles had to be scoped in the same change, or the fix leaks.** The page's CSS
styled `body` directly (`background: #0a0a0a`), so simply deleting the wrapper would have
painted the real document body dark **on every route**. Everything is now `.apidocs`-scoped
with `min-height: 100vh`; verified the wrapper is `rgb(10,10,10)` while `document.body`
stays `rgb(250,250,249)`. The hand-written `<meta viewport>` became a `viewport` export.

### 51.3 The console is now clean across every reachable page — measured, 19 pages, 0 errors

`resolveDemoApi`'s catch-all `return {}` is not harmless for a hook that reads a field off
the response: `useUnreadCount` does `.then((r) => r.unread)`, gets `undefined`, and React
Query treats an undefined result as an error. **Every demo page that mounts the app shell**
logged *"Query data cannot be undefined"* with the notification bell stuck in an error
state. Two endpoints were unmapped (`notifications/unread-count`, and
`documents/[id]/signature-requests` on `/demo/docs/doc-1`); both are mapped now.

**And the white-label demo painted the WRONG BRAND first.** `/demo/<Client>` read its name
from `window.location`, which is `null` on the server — so SSR always rendered "Foundry by
Gitwork" and the client swapped in the client's name a moment later. That is a hydration
mismatch on every load *and* a prospect opening a white-labelled sales link seeing **our**
branding before theirs. The segment is a **route param**, so the server has it: it is passed
to `<DemoHub>` as `initialBrand` and `readBrand()` now only covers `/demo?client=` and the
localStorage carry-over. Verified on the wire — SSR went from 0 to 27 occurrences of the
client name, and from 0 to 2 of "Powered by Foundry".

⚠️ The comment above `readBrand()` claimed it read the brand "synchronously so the first
paint is already on-brand (no flash)". That was **never true on the server**, and the
`suppressHydrationWarning` on the wrapper only covers that element's own attributes and
direct text children — not the subtree — so it suppressed nothing here.

**Measured after: 19 reachable pages swept, `0` real console errors** (excluding two local
env artefacts — no `DATABASE_URL`, no `AUTH_SECRET` — which are absent in production). A
console that is never clean is a console nobody reads, which is how the two defects above
went unnoticed.

### 51.4 Verified

`npm run verify` green — tsc + lint **0 errors** (41 warnings, all pre-existing),
**3459 tests**, `audit:dependencies` clean, `audit:ui` **0 findings** with its self-test
passing; `npx next build` clean, 103 static pages.

**Proved by before/after on the same harness**, restoring `origin/main`'s file rather than
hand-editing a sabotage — the first attempt at that produced a **syntax error**, which is a
broken build, not a reproduction of the defect. On main's code the three buttons measure
+70 / +137 / +169px past the card with `offscreen: true`; on this branch, −145 / −78 / −46
inside it.

⚠️ **The closed-`<details>` false positives are back in this measurement**, because the
detector fix lives in a different branch (§50.6 of that PR). The unpatched detector
reported 12 findings at 390px where 2 were real. Re-measured with the corrected one before
believing either number.

## 52. Recent Changes (September 2026) — The recorded debt, cleared

Five items that had been written down in this file as known-and-open rather than fixed.

### 52.1 Launchpad's dashboard card read "Documentation."

§43 shipped it without a `case` in `wiki-dashboard.tsx`, so it fell through to the
markdown-doc default — the exact defect §40.1 records for the Requests card, repeated.
The card now leads with **what is still outstanding** (`7 To send · 5/14 Provided` plus
the named list), not a percentage: the client's question is "what do you still want from
me", and a percentage makes them do the subtraction. Measured on `/demo/wiki`.

### 52.2 Every HQ widget sat on a hardcoded white card

`AppOverview`'s tile container was `bg-white` + a literal `rgba(0,0,0,0.08)` border.
`globals.css` **does** remap both of those for dark mode — but this element wraps every
widget, so a token-correct widget still rendered on a white slab. That is why §42.13's
Care tile "looked wrong in dark mode" after its own colours were fixed. Now
`bg-[var(--surface-0)]` + `border-[var(--border-1)]`, both of which genuinely flip
(`#FFFFFF` → `#161617`, black → white at 18%).

### 52.3 The `max-h-[Nvh]` sweep — triaged, not blanket-applied

§46 fixed one dialog and deferred the rest because "telling them apart needs looking at
each one". Doing that: **35 matches, 14 were dialogs, 21 correctly stay as they are.**

**The clamp is now declared ONCE** as `.app-dialog-fixed` in `globals.css` (`height: 80vh;
max-height: 680px; min-height: min(460px, 80vh)` + flex column), so the magic numbers
cannot drift across 14 files.

| Left alone, on purpose | Why |
|---|---|
| Menus / dropdowns / popovers (app-shell, mobile nav, notifications, reminders, batch bar, settings shell, two editor popovers, two scan/assessment dropdowns) | A menu is *supposed* to hug its content and cap at the viewport |
| Image lightboxes (receipts, intake attachments, task attachments) | `max-h-[70vh]` on an `<img>` is how you fit an image to the viewport |
| `presentation-mode` speaker notes | Same — an overlay that hugs |
| `support-dashboard` | Already has an explicit `h-[600px]`; the `max-h` is the viewport guard |

⚠️ **Pinning a panel is only half the change, and the other half is the dangerous half.**
A pinned panel is `overflow: hidden`, so a body with no scroll region makes everything
past 80vh **unreachable** — strictly worse than the resizing it replaced. My first pass
did exactly that to **six** dialogs. `src/components/__tests__/dialog-fixed-height.test.ts`
now fails naming any `app-dialog-fixed` panel without one.

⚠️ **The first version of that test was wrong about grid children.** It required
`flex-1 + min-h-0 + overflow-y-auto` on one element, but the two-column "meta | content"
dialogs put the scroller in a **grid** track, where `flex-1` is meaningless and the track
carries it instead. The rule that holds for both is **`min-h-0` on the scrolling
element** — a flex *or* grid item's automatic minimum size is its content, so without it
the region refuses to shrink and pushes the footer out of the panel.

**Measured** on the reachable case (`AddVersionModal`, `/demo/wiki` → Code Handover),
one file vs six:

| Viewport | 1 file | 6 files | active scrollers |
|---|---|---|---|
| 1440×900 | 680px | 680px | 0 → 1 |
| 1280×620 | 496px | 496px | 0 → 1 |
| 390×844 | 675px | 675px | 2 → 2 |

Identical height, viewport-bound, always inside the viewport, **0 clipping findings** —
and the scroller *activating* as content grows is the proof that nothing became
unreachable.

### 52.4 `/context` and `/api-docs` told readers production runs on Vercel + Neon

It hasn't since July 2026 (§23). `/context` is the page whose entire purpose is telling an
AI reader what is true, and it also still called auth "upcoming" (it shipped) and was
stamped "May 2026". All corrected.

⚠️ The Vercel **team slug and project id** were *removed* rather than updated: that page
needs no auth, and naming internal infrastructure on it is a small disclosure for no
reader benefit.

### 52.5 Pulse's scan list lost the client name with no way to recover it

`pulse-scan-list.tsx` truncated the sub-line with no `title`, and the part that gets cut
is the **client name** (it trails the URL) — so at 390px the row reads as a bare URL and
you cannot tell whose scan it is. Live at `/app/pulse`. Both that line and the project
name above it now carry a `title`.

### 52.6 Verified

`npm run verify` green — tsc + lint **0 errors** (41 warnings, all pre-existing),
**3464 tests**, `audit:dependencies` clean, `audit:ui` **0 findings**; `npx next build`
clean, 103 static pages. The new test was proved to discriminate by removing a `min-h-0`
(fails, naming the file) and by replacing the `min(460px, 80vh)` floor with a bare
`460px` (fails).

**Not verified:** the 13 pinned dialogs that have no demo route — `/app` is auth-gated
with no staging. What IS verified for those is structural (every one carries a shrinkable
scroll region, enforced by the test) plus the one reachable dialog measured above. The
honest post-deploy check is to open a Backstage leave form, a client Edit modal and the
Team member modal and confirm each opens at a steady size with its footer reachable.

### 52.7 The Insights figures stretched to the card, which is also why the venn read as meaningless

Dan asked *"how does the Venn diagram work… where does the 1 come from?"* and, separately,
that the charts were "massive". **One root cause.**

Every SVG figure is `w-full` with an `aspect-ratio` and **no cap**, so its height grows
with whatever width it is handed. Measured in a 1591px card at 1920px wide:

| Figure | Was | Now |
|---|---|---|
| Node map | 1549 × **1270px** | 894 × 733 |
| Venn | 1549 × **996px** | 560 × 360 |
| Bar | 1549 × 595px | 640 × 246 |
| Pie | 150 × 150 | unchanged — `Donut` already takes a `size` |

Both the node map and the venn were **taller than the viewport**.

⚠️ **The size was not just an aesthetic problem — it broke the figure's meaning.** The
numbers inside the venn's regions are **counts**, and the item NAMES deliberately live in
the list underneath rather than inside the circles (§48.3 — that is what gets read, and
what works at 350px). A 996px-tall figure pushes that list below the fold, so the reader
is left with bare numerals and no way to resolve them. "Where does the 1 come from" is the
exact question that produces, and the figure by design cannot answer it alone.

**The viewBox IS the design size, so that is the cap** (`figureScale()`). A wider card now
gets whitespace, not a bigger drawing; a narrower one still scales down, and `min-w` still
drives the §45.2 scroller. Identical at 1440 and 1920, 420×270 at 390px with **0 page
overflow and 0 clipping findings**.

**And the figure now says what its numbers are** — a one-line mono legend, shown only when
the board has items: *"Numbers are how many items sit in each region · named below."* A
reader seeing "1" had no way to know it meant one item unless something said so.

⚠️ The lesson generalises past this file: **`w-full` + `aspect-ratio` with no `max-width`
is an unbounded figure.** It looks right in the width you designed it at and grows without
limit in every wider one.

## 53. Incident (September 2026) — 389 "Untitled Course" rows on a client's wiki

Big Wedge reported that their Course Requests all read **"Untitled Course"**. They were
right, it was ours, and the rows were not course requests at all — they were ordinary app
feedback: handicap questions, "add Apple Watch support", yards-vs-metres.

**State on production when reported:** 875 rows. **486 correct** (real names, created 5 and
25 Aug — the importer working as designed). **~389 junk**, every one `courseName: ""`, all
created in a **single run on 16 Sept 2026 at 13:00:15**.

### 53.1 One line, and it disabled three guards at once

```ts
const onlyCourse = (opts.onlyCourseRequests ?? !opts.conversationIds?.length) && aiUsed;
//                                                                              ^^^^^^^
```

`aiUsed` is `verdicts.size > 0`. The AI is what decides **both** whether an item is a
course request **and** what the course is called. So when it produced no verdicts — no
key, a failed chunk, unparseable JSON — `onlyCourse` went false and switched off, in one
move:

1. the **is-this-a-course-request** filter,
2. the **require-a-real-name** check,
3. the **dedupe**.

Every scanned feedback email was then written as a nameless course request.

⚠️ **It was deliberate**, and the comment said so: *"so an AI outage can't silently drop
everything — it falls back to importing unfilled."* That trade is wrong in both
directions:

- **Nothing is dropped by importing none.** The scan re-runs on every sync and dedupes on
  `sourceConversationId`, so a skipped batch is picked up whole by the next run with a
  working classifier. The cost of waiting is one sync.
- **Importing unfilled costs the client.** Junk on a page they read, and a person deleting
  rows by hand.

**This is §35's rule one layer out: a check that could not run must not become a confident
assertion.** "We could not classify these" is not "these are all course requests". The
codebase has paid for this lesson in Pulse (§35, §44) and in Care (§42.7); it reached a
client here.

### 53.2 ⚠️ My own change widened the blast radius

The fail-open behaviour predates **#584** (§42.15, 12 Aug), but that PR moved the
course-request auto-import inside `runPostSyncHousekeeping` — which #584 made **all three**
sync paths call, including the **nightly cron**. Before it, the auto-import ran only when
someone pressed client-level **Sync now**.

So the import went from operator-triggered to unattended-and-nightly, which is what turned
a latent bad failure mode into 389 rows. Consolidating those paths was right — two of the
three previously skipped the identity repair entirely — but **widening what runs
unattended raises the bar on how its failures behave, and that half was not revisited.**

### 53.3 The fix — fail closed, and never write a nameless row

Auto mode now returns `{ created: [], skipped: n, scanned: n, classifierUnavailable: true }`
and logs the count. ⚠️ `scanned` deliberately reports the real number rather than 0:
*"there was no feedback waiting"* is a different and reassuring fact from *"there was
feedback and we declined to classify it"*.

Explicit manual selection is untouched — an operator who ticked specific rows chose them
and is about to name them.

`src/server/__tests__/course-feedback-fail-closed.test.ts` pins it. Proved to discriminate
by restoring the original `&& aiUsed` line: **3 of 4 fail**, including *"never writes a
course request with an empty name"*, while the operator-selection case correctly still
passes.

### 53.4 The 389 existing rows are a separate, destructive job

Code cannot un-write them. They are identifiable exactly — `courseName` empty **and**
`createdAt` on 2026-09-16 **and** `sourceConversationId` set — but deleting client data on
production is Dan's call, not a cleanup to run unilaterally. Not done here.

### 53.5 The classifier failed because its model had been retired seven months earlier

⚠️ **`LIGHT_MODELS.ANTHROPIC` was pinned to `claude-3-5-haiku-20241022`, which Anthropic
retired on 19 Feb 2026.**

A retired id does not degrade — every request 404s. And **nine** features route through
`tier: "light"`: Dispatch, Foreman's narrative, the Curator's consolidation pass, Scribe
meeting summaries, Slack activity, both Care narratives, the Care agents, and the Wedge
course-request classifier. Every one of them wraps its call in a `catch`, so a dead model
arrives as *"the AI returned nothing"*, not as an error. Most degrade quietly by design
(Dispatch and Foreman have no-AI floors); only the course importer converted it into
something a client could see.

Now `claude-haiku-4-5`. **Anthropic ids are complete as-is — never append a date suffix.**

⚠️ `DEFAULT_MODELS.ANTHROPIC` is `claude-sonnet-4-6`: previous-generation but **still
served**, so stale rather than broken. Deliberately left alone and dated instead —
moving every workspace without a pinned model onto a new model changes behaviour and cost
across the platform, which is a decision, not a bug fix.

**The `catch {}` is the other half of this.** `aiExtractCourses` swallowed each failed
chunk under the comment *"chunk failed — leave its items unfilled"*, which is precisely
why a retired model looked identical to "this feedback contained no courses". It now logs
the provider and model id, because the likeliest cause of a **total** classifier failure
is that the pin went stale.

**`src/server/__tests__/model-pins.test.ts`** is the floor: no id from a retired
generation (Claude 1/2/3/3.5), and no date-suffixed id. ⚠️ It cannot ask Anthropic what is
live — no network, no key — so a future 4.x retirement will not fail it. The durable
defence is the review cadence now written on the constants (§37.5's discipline) plus the
fact that a total failure names its model.

⚠️ **`audit:ui`'s MODEL-LITERAL rule fired on this test's own error message** — the third
time a guard has matched a model-shaped string in prose rather than at a call site
(§37.6 records two). The prose was reworded; **the rule was not weakened**, because it is
right that a model id in server code is suspicious.

**Still unestablished:** which provider the Wedge workspace is actually configured with.
If it is `ANTHROPIC`, the retirement explains the failure exactly — but a course import on
**5 Aug** extracted a real name *and* a country it had to infer, which that model could
not have done if it was already retired in February. So either the workspace runs a
different provider (the light pin for `GROQ` is `llama-3.1-8b-instant`, which Groq also
retires on its own schedule) or the pin was reached some other way. **Do not close this
out as "stale model id, fixed" without checking the workspace's configured provider** —
the fix is right either way, but the diagnosis is not confirmed.

### 53.6 The board could not select the rows it needed to delete

The bulk select + delete on Course Requests had existed all along. What did not exist was
any way to **isolate** the unnamed rows:

- they all sit in `NEW` alongside genuine requests, so "select all" would have swept real
  work in with them;
- the fuzzy search (§45.1) cannot match an empty string.

**That is the only reason clearing 389 junk rows needed database access rather than two
clicks.** A repair the product cannot perform on itself becomes a support ticket and a
person with a SQL prompt.

An **Unnamed (n)** chip now sits beside the status tabs. ⚠️ It is **not a status** — it is
a repair view derived from `!courseName.trim()`, shown only when such rows exist and never
in the client's read-only view (they cannot act on it, and it names our own mess).

⚠️ **The demo seeded `courseRequests: []`**, so this section rendered empty and could not
be verified at all. Seeded now with BOTH shapes — genuine extracted requests and unnamed
classifier casualties — because a demo carrying only the healthy shape cannot express the
bug and therefore cannot verify the fix (§42.15, §43.3).

⚠️ `COURSE_REQUESTS_SLUGS` is `["wedge"]`, so the section is unreachable on the demo
client. It was verified under a **temporary local edit adding the demo slug**, reverted
before commit and the revert confirmed in the diff — the §42.12 technique. **Do not add a
demo slug to that list**: it is a production gate, and §42.15 records why it keys on the
Portal slug specifically.

### 53.7 The classifier invented course names when the golfer never gave one

Clearing the unnamed rows left four, and three were the same fabrication — **none of these
golfers named a course**:

| What the golfer wrote | What was filed |
|---|---|
| "My home course has very incorrect information" | `home course` |
| "My home course was renovated due to hs2" | `HS2 Renovated Course (Home Course)` |
| "the scorecard for my home course is incorrect" — from `craig@ardlodge.co.uk` | `Ardlodge` |

All three are genuine complaints about *some* course's data and all three are
**unactionable**: you cannot ask a provider to fix "home course". The third is the
dangerous one — the name came from the sender's **email domain**, which makes it plausible
enough to send on while being something the golfer never said.

The prompt only ever said a course request concerns a *"specific named course"*. It never
said what to do when the complaint is about a course the user did **not** name, so the
model filled the gap. It now says so explicitly, and forbids taking a name from an email
address, a signature, or the surrounding words.

⚠️ **A prompt instruction is a request, not a guarantee** (§35's discipline), so
`src/lib/wiki-course-name.ts` enforces it deterministically:

1. **Placeholder** — no course is called "home course"; also rejects a name whose words
   are *all* generic ("Golf Club", "The Course").
2. **Not in the golfer's own message** — if no distinctive token of the name appears in
   what they wrote, it came from somewhere else. That is a fabrication whether or not it
   happens to be correct.

⚠️ Rule 2 strips the notification wrapper **first**, and that is the whole trick: the raw
body carries the `From:`/`Email:` headers, so `ardlodge` *is* in the text. Checking the
whole body would have accepted the one fabrication it exists to catch.

⚠️ **One distinctive token must match, not all of them** — the model routinely tidies the
golfer's spelling, and misspelled names are the norm here (§45.3).

⚠️ **My first fixture for that rule could not detect it.** "Iver Golf Vlub" → "Iver Golf
Club" reduces to the single token `["iver"]`, so `some` and `every` are identical and
swapping the implementation left all 13 tests green. Replaced with a two-token name the
golfer misspelled ("Wybostn Lakes Golf" → "Wyboston Lakes Golf"), which fails under
`every`. **A fixture that cannot distinguish the bug from the fix is not covering it**
(§42.10) — and it is worth re-running each sabotage after changing a fixture, not just
after changing the code.

Every fixture is a verbatim slice of a real row: the three fabrications, and the five
genuine requests (Wyboston, Brechin, Pendleton Creek, a spelling correction, and
"Home Farm Golf Club" — a real name containing "home") that must keep working.

**Deliberately biased toward rejecting.** A wrongly-rejected request costs one golfer's
course going untracked, and the operator can still add it by hand from the Care thread. A
wrongly-accepted one puts a fabricated name in front of a client and can be sent to a
provider. Not symmetric.

⚠️ **Known gap, pre-existing:** a rejected item records nothing, and dedupe is on
`sourceConversationId` — which is only written when a row is *created*. So every rejected
item is re-fetched and re-classified on **every sync, forever**. Harmless at this volume
and it costs a light-tier call each time; fixing it properly needs a "seen, not imported"
record, which is a schema change.

## 54. Recent Changes (September 2026) — The gate could not pass, and the iOS app could not authenticate

### 50.1 `npm run verify` reported ~28,000 errors, none of them in this codebase

The quality gate had been failing locally for everyone — §47 recorded it as red and
blamed `audit:dependencies`, which was wrong and passes on its own. **Every one of the
28,136 errors was in `.claude/worktrees`.** Claude Code creates a git worktree per
session there: a nested checkout of this repo inside itself. ESLint walked into them and
linted 1,533 duplicate files, a second and fifth and tenth time.

⚠️ **CI never saw it**, because CI clones fresh and has no worktrees. So the failure was
invisible in the one place designed to catch it and unavoidable in the one place people
actually run it — which is how a gate stops being run at all. `.claude/**` is now in
`eslint.config.mjs`'s ignore list; lint goes to 0 errors and `verify` exits 0.

**The lesson worth keeping:** a tool that walks the working directory will find whatever
the *environment* leaves there, and a per-session worktree is invisible to everyone
except the person whose machine has one. When a gate fails locally but passes in CI,
suspect the environment before the code — and check *where* the findings are before
reading the count.

### 50.2 The iOS app could never complete its half of sign-in

Reported as "the Portal asks me to sign in but the rest of the app doesn't". Three
separate defects, and the reported symptom was the least of them.

**Google sign-in has always worked and is how everyone got into the app.** What never
worked is the second half — trading Google's ID token for a per-user Foundry JWT. That
step was only added on 2026-09-17; before then the app ran on the workspace `API_KEY`. So
the exchange has failed every time it has ever run, invisibly, because the workspace key
covered for it. (Stating this precisely matters: an earlier commit message here claimed
"sign-in has never worked", which is false and was corrected before pushing.)

1. **`POST /api/auth/mobile-callback` returned 400, always.** The app's shared
   `JSONEncoder` applied `.convertToSnakeCase`, so it sent `{"id_token":…}` where the Zod
   schema requires `idToken`. ⚠️ **Foundry's API is camelCase end to end**, so this broke
   every multi-word key: creating a Pulse scan (`project_name`) failed the same way, and
   device registration failed *silently*, storing a null app version forever, because
   those fields are optional. Only single-word payloads (`body`, `status`, `token`)
   survived — which is why most of the app worked and nobody noticed.
   ⚠️ Explicit `CodingKeys` would not have helped: a key-encoding strategy rewrites the
   key `CodingKeys` produces. The strategy is the only place it can be fixed.

2. **The ID token audience never matched.** `verifyGoogleIdToken` pinned `aud` to a single
   value — `GOOGLE_IOS_SERVER_CLIENT_ID`, holding the **web** client ID — while the app,
   configured with `serverClientID: nil`, mints a token for the **iOS** client ID. Which
   one lands in `aud` is decided by the *client's* configuration, so pinning the backend
   to one value couples it to a client build it cannot see. The env var is now a
   comma-separated allow-list.
   ⚠️ **It is an allow-list of our own client IDs and must never be widened to one we do
   not control** — the `aud` check is what stops a token minted for another application
   being replayed here. The `hd` workspace-domain check remains the real authorisation
   gate.

3. **The sign-in gate was on the wrong screen.** `SessionStore.isSignedIn` meant the
   *Google* session alone, so the app showed its full tab bar while holding no Foundry
   credential and each screen reported the failure on its own. A whole-app condition asked
   one screen at a time. It now requires both, and a credential refused mid-session
   broadcasts an invalidation so the gate closes without waiting for a cold start.

**Also:** the security fix from the day before — deleting the compiled-in workspace key —
had not taken effect on any device that had already run an older build, because the
Keychain outlives the app and the key was still in the slot. A credential that is not a
Foundry mobile JWT (wrong issuer, wrong audience, no subject, expired, or not a JWT) is
now refused and erased at the single read path.

⚠️ **Rotating a shared key is a good diagnostic**: what breaks is what was using it. The
rotation is what exposed both the stale Keychain key and a Stream Deck bridge still
polling `/api/agents/status` every three seconds on the old credential.

## 55. Recent Changes (September 2026) — Messages: one recipient field, and the audit the feature never had

Messages shipped with a **chip per teammate**. Measured at 390px, the 29 chips ran to 13
rows and consumed ~700px of a 760px viewport, so the MESSAGE box — the entire point of
the dialog — started below the fold and you scrolled past everyone's name to reach it.

Replaced with one field that opens a checklist: a filter box, **Select all / Clear**, and
a checkbox row per person. The field names the choice rather than counting it
(`Sian Woolridge, Harry Brown +2`), because *"4 selected"* makes you reopen the picker to
check you picked the right four — which is the check you want before something reaches
29 people's phones. Picking everyone reads **`Everyone (29)`**: sending to the whole
company is the one choice that should never look like an ordinary list.

⚠️ **The panel MUST be anchored/portalled, and that is not a preference.** It sits inside
the dialog's `overflow-y-auto` body, and `overflow-y: auto` forces `overflow-x: auto` —
so that element clips on **both** axes. An absolutely-positioned panel (the shape
`task-filter-bar.tsx` uses, which is correct on a page) would be cut off, and the cut is
invisible to `audit:ui` (no class is misused) and reports **no page overflow** (the
scroller absorbs it). Same trap as `.widget-card` in §45.2. There is a test asserting the
panel has no clipping ancestor; removing `anchor` fails it.

### 55.1 The house popover is now declared once

`menuPanel` / `menuItem` were written out in **three** files; two were byte-identical.
They live in **`src/components/ui/menu-styles.ts`** now, and the two identical copies
import it. `wiki-workspace.tsx` keeps its variant (it adds `min-w-[12rem]` and `gap-2.5`)
— a real difference, left alone rather than flattened.

Both Messages dialogs also **adopted `.app-dialog-fixed`** (§52.3). They had invented
their own clamps — `76vh/680/460` on compose and `70vh/620/420` on read — which is
precisely the drift that class exists to prevent. Adopting it also pulls the file into
`dialog-fixed-height.test.ts`'s sweep, which went 11 files → 12.

### 55.2 What the audit found, and what it found nothing wrong with

Driven at 390 · 768 · 1440 in **both themes**, across four states (list, compose, read,
**picker open**), using the repo's own `AUDIT` from `scripts/audit-clipping.mjs` as a
library plus a canvas-resolving, alpha-compositing contrast sweep (§45.3's two traps).

- **Clipping / offscreen / truncated / page-X: 0.**
- **Contrast: 234 text nodes examined, 0 below AA.** The previous session's colour work
  is sound — the tightest are `10px "1 UNREAD"` at 4.56:1 and `11px "Mark read"` at
  4.76:1, both passing. Reported as measured rather than dressed up as a finding.
- **Two defects a detector cannot see**, both found by screenshotting: the row actions
  were `-mt-2` under a bordered button, so the **hairline ran through the link text**;
  and they were drawn on every resting row, which is the §42.8 lesson (a list whose every
  row carries controls reads as chrome, not content). They reveal on hover now, with
  `focus-within` so they stay keyboard-reachable — revealing is a visual default, never
  a gate.

⚠️ **The first audit run reported "clean" on a control it had never looked at.** The
popover is portalled and only exists while open, so the harness — which only clicked
*New message* — never rendered it. Adding the open state took the sweep from 124 text
nodes to 234. **A harness that does not drive a surface into a state cannot report on
that state**, and "0 findings" reads identically either way.

⚠️ **jsdom computes no layout, so `--button-width` arrived as `0px`** and the panel
measured 2px wide. A harness artefact — but it exposed a real fragility, since anything
leaving that variable unset collapses the panel to nothing. It now carries a
`min-w-[260px]` floor that never binds at a real field width.

⚠️ **One of my own sabotages proved a branch was dead.** Guarding `Everyone` with
`totalPeople > 0` changed no test — because an empty selection returns before that line,
so the two can only be equal when both are real. The guard is gone and the test that
pretended to cover it now asserts the case that can actually happen.

**Verified:** tsc + lint **0 errors**, **3527 tests** (17 new), `audit:ui` **0 findings**;
`npx next build` clean, 104 static pages. The new tests were proved to discriminate by
breaking four things on purpose — removing `anchor` (1 failure), dropping the blank-name
filter (1), removing accent stripping (1), and putting the filter box back under 16px,
which is what makes iOS Safari zoom the viewport on focus (1).

**Not verified:** `/app/messages` is auth-gated with no demo route, so the picker has not
been driven in a real browser — anchoring and keyboard behaviour are Headless UI's and
were asserted structurally, not observed. **Post-deploy:** open New message, confirm the
panel opens over the dialog rather than being cut off, filter, Select all, and send one
to yourself to check the phone notification still lands.

⚠️ **Another session was mid-edit on `messages-workspace.tsx`** (adding pagination to the
list) when this landed. This change is from `origin/main` and touches the compose modal
and the row markup; that one touches the list's data flow. They will need merging.
