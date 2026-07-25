// Foundry addition (not upstream bento).
//
// The "New from template…" picker. Same shape as the About dialog, because
// DESIGN.md names this exact case: "Select-on-left → render-on-right … reach for
// this shape before inventing a new layout for any pick-one-of-a-list-and-inspect
// popup." So it reuses the .fd-dlg geometry and styles wholesale — 768px, a fixed
// 460px body, 300px list beside the detail.
//
// Replacing the document goes through store.replaceDoc, which is undoable, so
// picking a template by mistake costs one ⌘Z rather than the deck you had open.

import type { Store } from '../store'
import { t } from '../i18n'
import { activeBrand } from './boot'
import { TEMPLATES, templateDoc, type DeckTemplate } from './templates'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function openTemplatePicker(store: Store, onPicked: () => void): void {
  document.querySelector('.fd-dlg-backdrop')?.remove()

  const backdrop = el('div', 'fd-dlg-backdrop')
  const dialog = el('div', 'fd-dlg')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', t('New deck from a template'))
  dialog.tabIndex = -1

  const head = el('div', 'fd-dlg-head')
  head.appendChild(el('span', 'fd-dlg-head-label', t('New from template')))
  const closeB = el('button', 'fd-dlg-close')
  closeB.type = 'button'
  closeB.innerHTML = '&#10005;'
  closeB.setAttribute('aria-label', t('Close'))
  head.appendChild(closeB)

  const bodyEl = el('div', 'fd-dlg-body')
  const nav = el('div', 'fd-dlg-nav')
  nav.setAttribute('role', 'tablist')
  const view = el('div', 'fd-dlg-view')
  view.setAttribute('role', 'tabpanel')
  bodyEl.append(nav, view)

  // Grouped by house: delivery decks and sales decks are different jobs, and the
  // group label is the fastest way to land in the right half of the list.
  const rows: Array<readonly [string, HTMLElement]> = []
  let index = 0
  for (const house of ['foundry', 'gitwork'] as const) {
    const group = TEMPLATES.filter((x) => x.house === house)
    if (!group.length) continue
    nav.appendChild(
      el('div', 'fd-dlg-navgroup', house === 'foundry' ? t('Delivery') : t('Sales')),
    )
    for (const tpl of group) {
      index += 1
      const row = el('button', 'fd-dlg-navrow')
      row.type = 'button'
      row.setAttribute('role', 'tab')
      row.append(
        el('span', 'fd-dlg-navidx', String(index).padStart(2, '0')),
        el('span', 'fd-dlg-navlabel', tpl.name),
      )
      row.addEventListener('click', () => show(tpl.slug))
      nav.appendChild(row)
      rows.push([tpl.slug, row] as const)
    }
  }

  function detail(tpl: DeckTemplate): HTMLElement {
    const brand = activeBrand()
    const wrap = el('div', 'fd-dlg-panel')
    wrap.append(
      el('div', 'fd-dlg-eyebrow', tpl.house === 'gitwork' ? t('Sales') : t('Delivery')),
      el('h2', 'fd-dlg-title', tpl.name),
    )
    wrap.appendChild(el('p', 'fd-dlg-lede', tpl.blurb))

    const slides = tpl.build(brand)
    const data = el('div', 'fd-dlg-datagrid')
    for (const [label, value] of [
      [t('Slides'), String(slides.length)],
      [t('Brand'), brand.id === 'gitwork' ? 'Gitwork' : 'Foundry'],
    ]) {
      const r = el('div', 'fd-dlg-data')
      r.append(el('span', 'fd-dlg-data-label', label), el('span', 'fd-dlg-data-value', value))
      data.appendChild(r)
    }
    wrap.appendChild(data)

    const outline = el('div', 'fd-dlg-outline')
    slides.forEach((s, i) => {
      const row = el('div', 'fd-dlg-outline-row')
      row.append(
        el('span', 'fd-dlg-navidx', String(i + 1).padStart(2, '0')),
        el('span', undefined, s.name ?? t('Slide')),
      )
      outline.appendChild(row)
    })
    wrap.appendChild(outline)

    const needs = el('p', 'fd-dlg-fine')
    needs.textContent = t('Have ready: {needs}', { needs: tpl.needs })
    wrap.appendChild(needs)

    const use = el('button', 'fd-dlg-cta')
    use.type = 'button'
    use.textContent = t('Use this template')
    use.addEventListener('click', () => {
      store.replaceDoc(templateDoc(tpl, activeBrand()))
      close()
      onPicked()
    })
    wrap.appendChild(use)

    const undo = el('p', 'fd-dlg-fine')
    undo.textContent = t('This replaces the deck in this window — ⌘Z puts it back.')
    wrap.appendChild(undo)
    return wrap
  }

  function show(slug: string) {
    const tpl = TEMPLATES.find((x) => x.slug === slug) ?? TEMPLATES[0]
    for (const [rowSlug, row] of rows) {
      const on = rowSlug === tpl.slug
      row.classList.toggle('on', on)
      row.setAttribute('aria-selected', String(on))
    }
    view.innerHTML = ''
    view.scrollTop = 0
    view.appendChild(detail(tpl))
  }

  dialog.append(head, bodyEl)
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
  // Default to the active brand's own half of the list — a Gitwork window is
  // almost certainly about to make a Gitwork deck.
  const preferred = TEMPLATES.find((x) => x.house === activeBrand().id) ?? TEMPLATES[0]
  show(preferred.slug)
  dialog.focus()
}
