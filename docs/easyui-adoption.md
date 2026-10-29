# EasyUI-inspired components: tracker

[EasyUI](https://easyui.site) (MIT, github.com/Surajmaurya1/easyui) is a library of animated React
components. Where Foundry has a real gap, we **use EasyUI's own components** and keep their design,
layout and motion. We change only what Foundry needs: colours mapped to Foundry's tokens so they work
in light and dark (EasyUI is dark only), imports and icons, accessibility, and reduced motion.
Vendored files live in `src/components/ui/easyui/`, each with a header naming its source, and the
licence is in `docs/third-party-ui.md`.

(October 2026: the first versions were our own rebuilds in Foundry's style. Dan's verdict was that
they looked nothing like EasyUI's, so we switched to vendoring the real components.)

Update this table in the same PR that changes a row.

| Component | Where it goes in Foundry | Status | PR |
|---|---|---|---|
| Command menu (⌘K) | Every app page and the demo: jump to a product, client or document, switch theme. EasyUI's Command Menu, vendored | Shipped | #752 |
| Undo toast | Sheet row remove, Requests "Mark dealt with", Care close: undo instead of a confirm. EasyUI's Undo Toast, vendored | Shipped | #753 |
| Date picker / calendar | Replaces the native date inputs, starting with task, milestone and feature-block forms | In progress | feat/date-picker |
| Activity heatmap | Analytics → Portal, "completion activity": tasks completed per day. EasyUI's Activity Heatmap, vendored | In review | #754 |
| Funnel chart | Docs analytics: created, shared, opened, accepted. EasyUI's Funnel Chart, vendored | In review | #754 |
| AI agent activity | Foreman, Curator and Dispatch runs as a step timeline | Not started: a run stores a stats summary, not its steps, so the runs must record steps first | |
| Product tour | A new builder's first week; a client's first wiki visit | Not started: needs a decision on who sees it and when | |
| Expandable data row | Care table and task list view | Not started: Care's record view may make it redundant | |

## Not adopted, and why

- **Already in Foundry:** toast, modal, skeleton, notification bell, stat cards, the chart kit in
  `analytics-widgets.tsx`.
- **Off brand:** decorative pieces (Evil Eye, Nimbu Mirchi, Rocket Party Popper, Meteors, Rainbow and
  Neon buttons, Glitch Text, Car Smoke transition) and the pill-shaped controls.
