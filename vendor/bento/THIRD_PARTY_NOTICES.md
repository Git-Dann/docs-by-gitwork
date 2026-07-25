# Third-party notices

Foundry Deck is built on bento/slides, which is MIT-licensed (© 2026 The Bento
authors; see `LICENSE`). The product itself carries no upstream name or mark —
see `CLAUDE.md` §30 — but the licence requires the copyright notice be retained
in copies, so it lives in the `NOTICE` block at the top of the shell and travels
into every saved deck. That block is load-bearing: do not remove it.

The shippable single-file shell (`public/deck/index.html`) bundles the
following third-party open-source components. Their license terms require that
these notices accompany copies, so the same text is embedded as a `NOTICE`
comment near the top of every built shell and every saved deck.

## Bundled runtime (ships inside the shell)

### reveal.js
- License: MIT
- Copyright (C) 2011-2024 Hakim El Hattab, http://hakim.se, and reveal.js contributors
- Project: https://revealjs.com / https://github.com/hakimel/reveal.js
- Use: powers the present-mode fullscreen slideshow overlay.

### Moveable
- License: MIT
- Copyright (c) 2019 Daybrush (Younkue Choi)
- Project: https://github.com/daybrush/moveable
- Use: on-canvas element manipulation (drag / resize / rotate handles). Pulls in
  the author's supporting modules (`@daybrush/*`, `@scena/*`, `@egjs/*`,
  `@cfcs/*`), all MIT, © Daybrush.

### Selecto
- License: MIT
- Copyright (c) 2020 Daybrush (Younkue Choi)
- Project: https://github.com/daybrush/selecto
- Use: marquee / rubber-band selection on the editing canvas.

## Bundled fonts (embedded as document assets in decks that use them)

### Fraunces
- License: SIL Open Font License 1.1
- Copyright 2020 The Fraunces Project Authors
- Project: https://github.com/undercasetype/Fraunces

### Instrument Sans — NOT shipped in the Foundry build
- License: SIL Open Font License 1.1
- Copyright 2022 The Instrument Sans Project Authors
- Project: https://github.com/Instrument/instrument-sans
- Note: embedded only for upstream's starter deck, which the Foundry shell does not
  reference (see `slides/src/main.ts`), so rollup drops it — confirmed against the
  uncompressed bundle. Listed because the source tree still carries it and a
  re-sync could bring it back.

## Brand faces added by Foundry (embedded in the shell — `slides/src/foundry/fontdata.ts`)

Foundry Deck (this fork — see `README.md`) embeds three further faces so the
DESIGN.md chrome renders with the platform's own typography while keeping the
"one file, zero external requests" contract. Latin subsets only, all SIL Open
Font License 1.1, obtained from Google Fonts.

### Inter
- License: SIL Open Font License 1.1
- Copyright 2020 The Inter Project Authors
- Project: https://github.com/rsms/inter
- Use: all UI text in the editor chrome, and the default deck body face.

### JetBrains Mono
- License: SIL Open Font License 1.1
- Copyright 2020 The JetBrains Mono Project Authors
- Project: https://github.com/JetBrains/JetBrainsMono
- Use: the `NN // SECTION` widget headers, data labels and readouts.

### DM Serif Display
- License: SIL Open Font License 1.1
- Copyright 2014-2017 Colophon Foundry
- Project: https://github.com/googlefonts/dm-fonts
- Use: editorial display type — the wordmark and large stat figures.

---

Full MIT license text is reproduced in the shell's `NOTICE` comment and in the
`LICENSE` file. The SIL Open Font License 1.1 text is available at
https://openfontlicense.org.

Dev-only tooling (Vite, TypeScript, `vite-plugin-singlefile`, `qrcode`,
`@types/*`) is used to build Bento but is **not** bundled into the shipped shell
and is therefore not listed here.
