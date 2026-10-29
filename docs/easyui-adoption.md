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
| Command menu (⌘K) | Every app page and the demo: jump to a product, client or document, switch theme. EasyUI's Command Menu, vendored | In review | #752 |
| Undo toast | Reversible actions (close, archive, soft delete) instead of a confirm | In progress | feat/undo-toast |
| Date picker / calendar | Replaces 21 of the 31 native date inputs (tasks, milestones, leave, expenses, platforms, CRM and more). EasyUI's Calendar and Date Picker, vendored | In review | #755 |
| Activity heatmap | Developer activity (tasks completed per day) | In progress | feat/heatmap-funnel |
| Funnel chart | Docs analytics: sent, opened, accepted | In progress | feat/heatmap-funnel |
| AI agent activity | Foreman, Curator and Dispatch runs as a step timeline | Not started: a run stores a stats summary, not its steps, so the runs must record steps first | |
| Product tour | A new builder's first week; a client's first wiki visit | Not started: needs a decision on who sees it and when | |
| Expandable data row | Care table and task list view | Not started: Care's record view may make it redundant | |

## Not adopted, and why

- **Already in Foundry:** toast, modal, skeleton, notification bell, stat cards, the chart kit in
  `analytics-widgets.tsx`.
- **Off brand:** decorative pieces (Evil Eye, Nimbu Mirchi, Rocket Party Popper, Meteors, Rainbow and
  Neon buttons, Glitch Text, Car Smoke transition) and the pill-shaped controls.
