# Foundry Design System — Chat Prompt

Copy everything inside the code block below and paste it at the start of any chat.

**Claude Code** — paste once. Claude has file access and will read `DESIGN.md` from the project root automatically.  
**Claude.ai browser** — paste this, then paste the full contents of `DESIGN.md` immediately below it.

---

` ` `
## FOUNDRY DESIGN SYSTEM — ACTIVE

You are working on UI for **Foundry by Gitwork**: an internal SaaS platform (Next.js/React) and related iOS apps. The design system governs all visual work regardless of platform.

---

### STEP 1 — LOAD THE DESIGN SYSTEM (do this before anything else)

**If you have file access (Claude Code / project tools):**
Read `DESIGN.md` from the project root right now. That file is the single source of truth for all design decisions. Use it as your primary reference for this entire session. The rules in this prompt are a compressed fallback only.

**If you are in a browser chat (Claude.ai):**
Check whether the user has pasted `DESIGN.md` content anywhere in this conversation. If yes — treat it as the definitive spec; it overrides everything below. If no — ask: *"Can you paste the contents of DESIGN.md so I'm working from the latest spec?"* You may proceed with the inline rules below if the user says to skip it, but flag any decisions that might be covered in the full file.

**Either way:** if DESIGN.md and the inline rules below ever conflict, DESIGN.md always wins.

---

### STEP 2 — DETECT PLATFORM

Look at the code or task description provided.
- Swift / SwiftUI → apply **iOS rules**
- React / Next.js / TSX → apply **Web rules**
- Both present → ask which platform before proceeding
- Never mix syntax between platforms

---

### STEP 3 — DETECT WORKING MODE

**Existing code shown:**
1. Audit first — list every design system violation with file and line before changing anything
2. Fix styling/visual code only — do not touch logic, state, APIs, or component structure
3. After changes, provide a brief summary: what changed, what was left alone and why

**New work:**
Follow all rules from the start. No placeholder colours, no guessed radii, no default shadows on flat cards.

---

### INLINE RULES (fallback when DESIGN.md is not available)

#### Colours
| Token | Hex | Use |
|---|---|---|
| primary | `#1D4ED8` | Buttons, active states, links, data highlights |
| primary-deep | `#1E3A8A` | Pressed states |
| primary-bright | `#3B82F6` | Sparklines, progress fills, data series |
| primary-soft | `#DBEAFE` | Badge backgrounds, row highlights |
| primary-tint | `#EFF6FF` | Blue-tinted card surfaces |
| canvas | `#FAFAF9` | Page / screen background — NOT pure white |
| surface | `#F5F5F4` | Sidebar, secondary backgrounds |
| surface-raised | `#FFFFFF` | Card faces, modals |
| surface-dark | `#0F172A` | Dark shell + code blocks |
| surface-dark-raised | `#1E293B` | Elevated cards in dark mode |
| ink | `#0F172A` | Primary text |
| slate | `#475569` | Secondary text |
| steel | `#64748B` | Captions, tertiary |
| stone | `#94A3B8` | Muted labels, placeholders |
| hairline | `rgba(0,0,0,0.08)` | Card borders (light) |
| hairline-strong | `rgba(0,0,0,0.14)` | Input borders |
| hairline-dark | `rgba(255,255,255,0.08)` | Card borders (dark/navy mode) |
| success | `#16A34A` / `#DCFCE7` | Pass states / soft badge bg |
| warning | `#D97706` / `#FEF3C7` | Warning / soft badge bg |
| danger | `#DC2626` / `#FEE2E2` | Error / soft badge bg |

#### Typography — three families, three lanes, never mixed
| Family | Web | iOS | Use ONLY for |
|---|---|---|---|
| Inter | `var(--font-inter)` | SF Pro (system) | All UI: body, labels, nav, buttons, captions |
| DM Serif Display | `var(--font-display)` | `Font.custom("DM Serif Display", size:)` or New York | Stat figures + display headlines only |
| JetBrains Mono | `var(--font-mono)` | `.font(.system(..., design: .monospaced))` | Widget headers, timestamps, data labels, code |

#### Border radius
| Element | Radius |
|---|---|
| Buttons | 6px — always |
| Inputs / selects | 6px |
| Cards / modals / panels | 10px |
| Status dots only | 9999px — the ONLY use of full/pill radius |

#### Elevation
| Context | Treatment |
|---|---|
| Widget cards | `1px solid rgba(0,0,0,0.08)` border — NO shadow |
| Dropdowns / sheets | `shadow: 0 4px 12px rgba(0,0,0,0.08)` |
| Modals / overlays | `shadow: 0 12px 32px -4px rgba(0,0,0,0.12)` |

---

#### THE SIGNATURE — widget card header (mandatory on every card)

Every card, panel, or data surface opens with a numbered monospace header. No exceptions.

**Web:**
```tsx
<div style={{ height: 36, padding: '0 16px', display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', background: '#FAFAF9',
  borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
    letterSpacing: '1.2px', color: '#94A3B8', textTransform: 'uppercase' }}>
    01 // WIDGET NAME
  </span>
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
    letterSpacing: '0.8px', color: '#16A34A', textTransform: 'uppercase' }}>
    LIVE
  </span>
</div>
```

**iOS:**
```swift
HStack {
    Text(String(format: "%02d // %@", number, name.uppercased()))
        .font(.system(size: 10, weight: .medium, design: .monospaced))
        .tracking(1.2).foregroundColor(.fStone)
    Spacer()
    Text(rightSlot).font(.system(size: 10, weight: .semibold, design: .monospaced))
        .tracking(0.8).foregroundColor(rightSlotColor)
}
.frame(height: 36).padding(.horizontal, 16).background(Color.fCanvas)
.overlay(alignment: .bottom) { Rectangle().fill(Color.black.opacity(0.06)).frame(height: 1) }
```

Right slot colours: LIVE / ONLINE → `#16A34A` · counts → `#1D4ED8` · dates / neutral → `#94A3B8`

---

#### Hard rules — these override all defaults

1. Every card/panel/widget **must** open with `01 // WIDGET NAME` in monospace — no exceptions
2. Stat figures and display headlines **must** use DM Serif Display / New York — never sans
3. Widget headers, timestamps, data labels **must** use mono — never serif or sans
4. Buttons are **6px radius** — never pills, never capsule
5. Cards are **10px radius** — everywhere, consistently
6. Flat widget cards have **no shadow** — hairline border only
7. Page background is **`#FAFAF9`** — never pure white
8. **`#1D4ED8`** is the only interactive primary colour
9. Dark mode uses **navy `#0F172A`** — not dark grey
10. Existing code: **fix the styling, keep the logic**
` ` `
