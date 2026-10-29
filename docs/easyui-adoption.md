# EasyUI-inspired components: tracker

[EasyUI](https://easyui.site) (MIT, github.com/Surajmaurya1/easyui) is a library of animated React
components. We take the **ideas** where Foundry has a real gap and rebuild them in Foundry's own
style (DESIGN.md: 6px controls, no pills, blue for interaction, 100 to 300ms motion, reduced motion
respected). We do not paste its source; if a PR ever does, it must add the MIT notice to
`docs/third-party-ui.md`.

Update this table in the same PR that changes a row.

| Component | Where it goes in Foundry | Status | PR |
|---|---|---|---|
| Command menu (⌘K) | Every app page and the demo: jump to a product, client or document, switch theme | In review | feat/command-menu |
| Undo toast | Reversible actions (close, archive, soft delete) instead of a confirm | In progress | feat/undo-toast |
| Date picker / calendar | Replaces the native date inputs, starting with task, milestone and feature-block forms | In progress | feat/date-picker |
| Activity heatmap | Developer activity (tasks completed per day) | In progress | feat/heatmap-funnel |
| Funnel chart | Docs analytics: sent, opened, accepted | In progress | feat/heatmap-funnel |
| AI agent activity | Foreman, Curator and Dispatch runs as a step timeline | Not started | |
| Product tour | A new builder's first week; a client's first wiki visit | Not started: needs a decision on who sees it and when | |
| Expandable data row | Care table and task list view | Not started: Care's record view may make it redundant | |

## Not adopted, and why

- **Already in Foundry:** toast, modal, skeleton, notification bell, stat cards, the chart kit in
  `analytics-widgets.tsx`.
- **Off brand:** decorative pieces (Evil Eye, Nimbu Mirchi, Rocket Party Popper, Meteors, Rainbow and
  Neon buttons, Glitch Text, Car Smoke transition) and the pill-shaped controls.
