// Foundry addition (not upstream bento).
//
// The About / deck-settings dialog, rebuilt as THE standard Foundry popup rather
// than upstream's stacked one-column scroll. DESIGN.md § "Grid & Container" calls
// this shape out by name — "Fixed-height two-column popup … reach for this shape
// before inventing a new layout" — and the reference implementation in the
// platform is src/components/starters/starter-versions-modal.tsx:
//
//   · panel at max-w-3xl (768px), 36px widget-header strip with a mono label + ✕
//   · body a FIXED 460px — never content-driven, so the popup doesn't jump size
//     as you move between sections
//   · grid minmax(0,300px) / minmax(0,1fr), a hairline rule between, each column
//     its own overflow-y-auto; pick on the left, read on the right; first row
//     selected on open
//
// It is written by hand here (not with the React <Modal>) because Deck is a
// vanilla-TS shell — but the geometry, tokens and behaviour are the platform's,
// so it reads as the same dialog. Styles live in foundry/theme.css (.fd-dlg-*).
//
// Upstream's update-check UI is deliberately absent: we publish no manifest, so
// those controls could only ever fail. What people actually need from here is the
// document's merge-field properties and the network switch.

import type { Store } from '../store'
import { t } from '../i18n'
import { APP_VERSION } from '../update'
import { FORMAT_VERSION } from '../model'
import { activeBrand } from './boot'

/**
 * A gear, for the Save ▾ menu row that opens this dialog. Lives here rather than
 * in upstream's icons.ts so the vendored file stays untouched — upstream has no
 * settings icon because it had no settings menu row.
 */
export const SETTINGS_ICON =
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ` +
  `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<circle cx="12" cy="12" r="3"/>` +
  `<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 ` +
  `1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 ` +
  `1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 ` +
  `4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 ` +
  `1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06` +
  `a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`

export interface AboutContext {
  store: Store
  /** Read the current offline-mode state. */
  offlineEnabled: () => boolean
  /** Flip offline mode — the editor owns the connect/disconnect side effects. */
  setOffline: (next: boolean) => void
}

interface Section {
  id: string
  label: string
  /** Mono index shown in the nav rail — the house `NN` grammar. */
  render: (ctx: AboutContext) => HTMLElement
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** A right-hand panel: mono eyebrow, serif title, then whatever follows. */
function panel(eyebrow: string, title: string): HTMLElement {
  const wrap = el('div', 'fd-dlg-panel')
  wrap.append(el('div', 'fd-dlg-eyebrow', eyebrow), el('h2', 'fd-dlg-title', title))
  return wrap
}

/** A `LABEL   value` readout row — mono label, per DESIGN.md's data grammar. */
function dataRow(label: string, value: string): HTMLElement {
  const row = el('div', 'fd-dlg-data')
  row.append(el('span', 'fd-dlg-data-label', label), el('span', 'fd-dlg-data-value', value))
  return row
}

/** A stacked label-over-input field (the rail rule: never crammed horizontally). */
function field(label: string, value: string, onChange: (next: string) => void): HTMLElement {
  const row = el('label', 'fd-dlg-field')
  row.append(el('span', 'fd-dlg-field-label', label))
  const input = el('input')
  input.type = 'text'
  input.value = value
  input.spellcheck = false
  input.addEventListener('change', () => onChange(input.value.trim()))
  row.appendChild(input)
  return row
}

const SECTIONS: Section[] = [
  {
    id: 'about',
    label: 'About',
    render: () => {
      const brand = activeBrand()
      const body = panel(t('About'), brand.appName)
      const lede = el('p', 'fd-dlg-lede')
      // FOUNDRY: says what this is, in our own words. No credit line, no link out
      // to another product's site — the licence notices that must travel with the
      // file are embedded in the shell's source (see THIRD_PARTY_NOTICES.md).
      lede.textContent = t(
        '{product} is Foundry’s slide editor. A deck is one file: edit it, present it, send it — no export step, no account needed to open it.',
        { product: brand.appName },
      )
      body.appendChild(lede)

      const data = el('div', 'fd-dlg-datagrid')
      data.append(
        dataRow(t('Build'), `v${APP_VERSION}`),
        dataRow(t('Format'), `v${FORMAT_VERSION}`),
        dataRow(t('Brand'), brand.id === 'gitwork' ? 'Gitwork' : 'Foundry'),
      )
      body.appendChild(data)

      const fine = el('p', 'fd-dlg-fine')
      fine.textContent = t(
        'This file carries its own app — it works offline, forever, as is. Nothing here phones home: no ids, no telemetry, no update checks.',
      )
      body.appendChild(fine)
      // FOUNDRY: no third-party credit line in the UI, by decision. The licences
      // that must travel with the file DO travel with it — the NOTICE block at the
      // top of index.html is carried verbatim into the shell and into every saved
      // deck, and the repo keeps LICENSE + THIRD_PARTY_NOTICES.md. Attribution is
      // satisfied by the source, which is what those licences actually ask for.
      // Do not "helpfully" re-add a credit paragraph here.
      return body
    },
  },
  {
    id: 'document',
    label: 'Document',
    render: (ctx) => {
      const body = panel(t('Properties'), t('This deck'))
      const hint = el('p', 'fd-dlg-lede')
      hint.innerHTML = t(
        'Type <b>{{author}}</b>, <b>{{company}}</b>, <b>{{subject}}</b> or <b>{{event}}</b> in any text box and it fills in from here — everywhere at once. Handy for title slides and footers.',
      )
      body.appendChild(hint)
      const store = ctx.store
      const meta = () => (store.doc.meta ??= {})
      const commit = (fn: () => void) => store.commit(fn)
      body.append(
        field(t('Title'), store.doc.title, (v) => commit(() => { store.doc.title = v || 'Untitled' })),
        field(t('Author'), store.doc.meta?.author ?? '', (v) => commit(() => { meta().author = v })),
        field(t('Company'), store.doc.meta?.company ?? '', (v) => commit(() => { meta().company = v })),
        field(t('Subject'), store.doc.meta?.subject ?? '', (v) => commit(() => { meta().subject = v })),
        field(t('Event'), store.doc.meta?.event ?? '', (v) => commit(() => { meta().event = v })),
        field(t('Keywords'), store.doc.meta?.keywords ?? '', (v) => commit(() => { meta().keywords = v })),
      )
      return body
    },
  },
  {
    id: 'privacy',
    label: 'Privacy',
    render: (ctx) => {
      const body = panel(t('Network'), t('Privacy'))
      const lede = el('p', 'fd-dlg-lede')
      lede.textContent = t(
        'Offline mode blocks every network feature for this browser — live collaboration included. Tabs on this machine still sync with each other; that is not networking.',
      )
      body.appendChild(lede)

      const toggle = el('label', 'fd-dlg-toggle')
      const box = el('input')
      box.type = 'checkbox'
      box.checked = ctx.offlineEnabled()
      box.addEventListener('change', () => ctx.setOffline(box.checked))
      toggle.append(box, el('span', undefined, t('Offline mode — nothing leaves this computer')))
      body.appendChild(toggle)

      const fine = el('p', 'fd-dlg-fine')
      fine.textContent = t(
        'Auto-saved versions are kept in this browser only — never in the file, never online. Restore them from Save ▾ → Version history.',
      )
      body.appendChild(fine)
      return body
    },
  },
]

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Open the dialog. Replaces any dialog already up, like upstream's did. */
export function openFoundryAbout(ctx: AboutContext, startAt = SECTIONS[0].id): void {
  document.querySelector('.fd-dlg-backdrop')?.remove()

  const backdrop = el('div', 'fd-dlg-backdrop')
  const dialog = el('div', 'fd-dlg')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', t('{product} settings', { product: activeBrand().appName }))
  dialog.tabIndex = -1

  const head = el('div', 'fd-dlg-head')
  head.appendChild(el('span', 'fd-dlg-head-label', t('Deck settings')))
  const closeB = el('button', 'fd-dlg-close')
  closeB.type = 'button'
  closeB.innerHTML = '&#10005;'
  closeB.setAttribute('aria-label', t('Close'))
  head.appendChild(closeB)

  const body = el('div', 'fd-dlg-body')
  const nav = el('div', 'fd-dlg-nav')
  nav.setAttribute('role', 'tablist')
  const view = el('div', 'fd-dlg-view')
  view.setAttribute('role', 'tabpanel')
  body.append(nav, view)

  const rows = SECTIONS.map((section, i) => {
    const row = el('button', 'fd-dlg-navrow')
    row.type = 'button'
    row.setAttribute('role', 'tab')
    row.append(
      el('span', 'fd-dlg-navidx', String(i + 1).padStart(2, '0')),
      el('span', 'fd-dlg-navlabel', t(section.label)),
    )
    row.addEventListener('click', () => show(section.id))
    nav.appendChild(row)
    return [section.id, row] as const
  })

  function show(id: string) {
    const section = SECTIONS.find((s) => s.id === id) ?? SECTIONS[0]
    for (const [rowId, row] of rows) {
      const on = rowId === section.id
      row.classList.toggle('on', on)
      row.setAttribute('aria-selected', String(on))
    }
    view.innerHTML = ''
    view.scrollTop = 0
    view.appendChild(section.render(ctx))
  }

  dialog.append(head, body)
  backdrop.appendChild(dialog)

  const close = () => {
    backdrop.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation()
      close()
      return
    }
    if (ev.key !== 'Tab') return
    // Focus trap — the platform <Modal> has one, so this dialog does too.
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault()
      last.focus()
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault()
      first.focus()
    }
  }
  closeB.addEventListener('click', close)
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) close()
  })
  document.addEventListener('keydown', onKey, true)

  document.body.appendChild(backdrop)
  show(startAt)
  dialog.focus()
}
