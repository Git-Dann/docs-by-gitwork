#!/usr/bin/env node
// Foundry addition (not upstream bento).
//
// Drives the BUILT Deck shell in headless Chromium and checks the things that
// break silently in a vendored fork: a control that stopped working, an upstream
// accent leaking back through the skin, the topbar taking the page sideways on a
// phone, a saved deck bloating or losing its brand.
//
//   node vendor/bento/scripts/verify-shell.mjs                  # public/deck/index.html
//   node vendor/bento/scripts/verify-shell.mjs http://host/x    # any served shell
//
// Requires the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)
// and playwright-core, which is NOT a repo dependency — install it ad hoc:
//   npm i --no-save playwright-core
// Not wired into CI (no browser there). Run it after every re-sync with upstream,
// and after any change to foundry/theme.css — that file re-skins upstream's chrome
// by overriding it, so upstream moving a rule is exactly how this silently rots.
//
// Exits non-zero on the first failing group, so it works as a gate.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { AUDIT } from '../../../scripts/audit-clipping.mjs'

const target = process.argv[2] ?? `file://${new URL('../../../public/deck/index.html', import.meta.url).pathname}`
const CHROME = findChromium()
const failures = []
const note = (group, msg) => { failures.push(`${group}: ${msg}`); console.log(`  FAIL ${msg}`) }
const pass = (msg) => console.log(`  ok   ${msg}`)

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (!existsSync(root)) throw new Error(`no browser root at ${root} — set CHROMIUM_PATH`)
  const dir = readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().pop()
  if (!dir) throw new Error(`no chromium-* under ${root} — set CHROMIUM_PATH`)
  return `${root}/${dir}/chrome-linux/chrome`
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })

/**
 * A browser context that behaves like Foundry is serving the shell: /api/account
 * answers, because that is the environment Deck is built for (middleware gates
 * /deck behind the same session as /app, so a real user always has it). Without
 * this the harness generates its own 404 and then reports it as a defect.
 * Group 06 deliberately opens a SAVED deck outside this helper, to prove the
 * file:// case makes no requests at all.
 */
// The REAL shape of GET /api/account (src/app/api/account/route.ts): the user is
// nested under `account`. Mocking a flat object here is what let a broken read
// pass — if that route changes, change this and watch group 06 fail honestly.
const FOUNDRY_USER = {
  account: { id: 'u_test', name: 'Test Person', email: 'test@gitwork.co.uk', role: 'ADMIN', permissions: [] },
}
async function newCtx(opts = {}) {
  const ctx = await browser.newContext(opts)
  await ctx.route('**/api/account', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FOUNDRY_USER) }))
  return ctx
}

async function openShell(ctx, url = target) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('dialog', (d) => d.dismiss().catch(() => {}))
  await page.goto(url)
  await page.waitForSelector('.ed-root', { timeout: 20000 })
  await page.waitForTimeout(2200)
  return { page, errors }
}

// ── 1. controls ─────────────────────────────────────────────────────────────
console.log('\n01 // CONTROLS')
{
  const ctx = await newCtx({ viewport: { width: 1600, height: 1000 } })
  const { page, errors } = await openShell(ctx)
  const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150) }
  const check = async (name, fn) => {
    const before = errors.length
    try {
      await fn()
      await page.waitForTimeout(300)
      if (errors.length > before) note('controls', `${name} → ${errors.slice(before).join(' | ')}`)
      else pass(name)
    } catch (e) { note('controls', `${name} → ${String(e).slice(0, 140)}`) }
  }

  for (const label of ['Text', 'Table', 'Chart']) {
    await check(`insert ${label}`, async () => {
      const n0 = await page.evaluate(() => window.deck.doc.slides[0].elements.length)
      await page.click(`.ed-insert button:has-text("${label}")`)
      await page.waitForTimeout(250)
      const n1 = await page.evaluate(() => window.deck.doc.slides[0].elements.length)
      if (n1 <= n0) throw new Error(`no element added (${n0}→${n1})`)
      await page.keyboard.press('Control+z')
    })
  }
  await esc()
  await check('undo / redo', async () => {
    await page.click('.ed-group-history button:nth-child(1)')
    await page.click('.ed-group-history button:nth-child(2)')
  })
  await check('brand switch re-skins + re-themes', async () => {
    const read = () => page.evaluate(() => ({
      brand: document.documentElement.dataset.brand,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      deck: window.deck.doc.theme.accent,
      title: document.title,
    }))
    const a = await read()
    await page.click('.fd-brandswitch button:nth-child(2)')
    await page.waitForTimeout(400)
    const b = await read()
    if (b.brand === a.brand) throw new Error('brand attribute unchanged')
    if (b.accent === a.accent) throw new Error('chrome accent unchanged')
    if (b.deck === a.deck) throw new Error('deck theme not re-themed')
    if (b.title === a.title) throw new Error('window title suffix not re-declared')
    await page.keyboard.press('Control+z') // the re-theme must be undoable
    await page.waitForTimeout(250)
    if ((await page.evaluate(() => window.deck.doc.theme.accent)) !== a.deck) throw new Error('re-theme not undoable')
    await page.click('.fd-brandswitch button:nth-child(1)')
  })
  await check('help surface is gone (button AND the ? key)', async () => {
    if (await page.$('.ed-btn-help')) throw new Error('the ? button is still in the topbar')
    await page.keyboard.press('Shift+Slash'); await page.waitForTimeout(350)
    if (await page.$('.ed-help-box')) throw new Error('? still opens a shortcuts overlay')
  })
  await check('topbar slot goes BACK, never to the dashboard', async () => {
    const slot = await page.$('.ed-logo')
    if (!slot) throw new Error('no topbar slot')
    const info = await slot.evaluate((e) => ({
      tag: e.tagName, href: e.getAttribute('href'), text: (e.textContent || '').trim(), arrow: !!e.querySelector('.fd-home-arrow'),
    }))
    // file:// is a saved deck — it must show the inert lockup, NOT a dead link.
    if (target.startsWith('http')) {
      if (info.tag !== 'A') throw new Error(`served by Foundry but slot is <${info.tag}>`)
      if (!info.arrow) throw new Error('back link has no arrow')
      if (!/Back/i.test(info.text)) throw new Error(`back link reads "${info.text}"`)
      // No referrer in this context, so it must fall back to the LIBRARY.
      // `/app` is the dashboard and is the specific thing complained about.
      if (info.href === '/app') throw new Error('back link goes to the dashboard, not the previous screen')
      if (info.href !== '/app/docs') throw new Error(`no-referrer fallback is ${info.href}, expected /app/docs`)
    } else if (info.tag === 'A') {
      throw new Error('a saved deck must not render a back link')
    }
  })
  await check('about opens from Save ▾ as the standard 2-col dialog', async () => {
    await page.click('.ed-split .ed-split-caret'); await page.waitForTimeout(350)
    await page.click('.ed-save-menu button:has-text("Deck settings")'); await page.waitForTimeout(450)
    const dlg = await page.$('.fd-dlg')
    if (!dlg) throw new Error('no Foundry dialog')
    // The shape DESIGN.md specifies: 768px wide, a FIXED 460px body, two columns.
    const shape = await page.evaluate(() => {
      const d = document.querySelector('.fd-dlg')
      const b = document.querySelector('.fd-dlg-body')
      return {
        w: Math.round(d.getBoundingClientRect().width),
        h: Math.round(b.getBoundingClientRect().height),
        cols: getComputedStyle(b).gridTemplateColumns.split(' ').length,
        rows: document.querySelectorAll('.fd-dlg-navrow').length,
      }
    })
    if (shape.w !== 768) throw new Error(`dialog is ${shape.w}px, expected max-w-3xl (768)`)
    if (shape.h !== 460) throw new Error(`body is ${shape.h}px, expected a fixed 460`)
    if (shape.cols !== 2) throw new Error(`body has ${shape.cols} column(s), expected 2`)
    if (shape.rows < 2) throw new Error('nav rail has nothing to pick')
    // …and the body must NOT resize as you move between sections.
    await page.click('.fd-dlg-navrow:nth-child(2)'); await page.waitForTimeout(250)
    const h2 = await page.$eval('.fd-dlg-body', (e) => Math.round(e.getBoundingClientRect().height))
    if (h2 !== 460) throw new Error(`body jumped to ${h2}px when switching section`)
    await esc()
    if (await page.$('.fd-dlg')) throw new Error('Escape did not close it')
  })
  await check('no MIT / bento credit anywhere in the chrome', async () => {
    await page.click('.ed-split .ed-split-caret'); await page.waitForTimeout(300)
    await page.click('.ed-save-menu button:has-text("Deck settings")'); await page.waitForTimeout(400)
    const text = await page.$eval('.fd-dlg', (e) => e.textContent || '')
    if (/\bMIT\b|bento/i.test(text)) throw new Error(`credit text still shown: ${text.match(/.{0,40}(MIT|bento).{0,40}/i)?.[0]}`)
    await esc()
    // …but the licence itself MUST still travel in the file. That is the deal:
    // the notice lives in the source, not the UI. If this ever fails we are
    // shipping MIT code with no notice at all, which is not what was asked for.
    const html = await page.evaluate(() => window.deck.serialize())
    if (!/Permission is hereby granted/.test(html)) throw new Error('the NOTICE block is missing from a saved deck')
  })
  await check('replace-from-JSON has visible buttons', async () => {
    // Regression: a `.ed-about-row:has(> button)` hide (added to bury the update
    // UI) also hid this dialog's Apply/Cancel — it shipped with no buttons.
    await page.click('.ed-split .ed-split-caret'); await page.waitForTimeout(300)
    await page.click('.ed-save-menu button:has-text("Replace from JSON")'); await page.waitForTimeout(400)
    const visible = await page.$$eval('.ed-about-row button', (bs) =>
      bs.filter((b) => b.getBoundingClientRect().width > 0).length)
    if (visible < 2) throw new Error(`${visible} visible button(s) in Replace from JSON`)
    // …and Escape must close it. Upstream wired only a backdrop click, so the one
    // dialog you land in with the keyboard was the one you couldn't leave with it —
    // which is also how this left a modal over the page and broke the next check.
    await esc()
    if (await page.$('.ed-about-overlay')) throw new Error('Escape does not close Replace from JSON')
  })
  await check('new slide → layout picker → insert', async () => {
    const n0 = await page.evaluate(() => window.deck.doc.slides.length)
    await page.click('.ed-add-slide'); await page.waitForTimeout(350)
    const items = await page.$$('.ed-layoutpick-item')
    if (!items.length) throw new Error('layout picker empty (it is a PICKER, not an insert button)')
    await items[0].click(); await page.waitForTimeout(400)
    if ((await page.evaluate(() => window.deck.doc.slides.length)) !== n0 + 1) throw new Error('layout did not insert')
    await page.keyboard.press('Control+z')
  })
  await check('slideshow starts + Escape exits', async () => {
    await page.click('.ed-pill-main'); await page.waitForTimeout(1600)
    if (!(await page.$('.deck-present-overlay'))) throw new Error('no present overlay')
    await page.keyboard.press('Escape'); await page.waitForTimeout(700)
    if (await page.$('.deck-present-overlay')) throw new Error('overlay did not close')
  })
  await check('props rail sections collapse + carry the NN // counter', async () => {
    await page.click('.ed-stage .deck-el', { position: { x: 10, y: 10 } }).catch(() => {})
    await page.waitForTimeout(300)
    const count = (await page.$$('.ed-props .ed-section')).length
    if (!count) throw new Error('no props sections')
    // Re-query per index rather than holding handles: toggling a section
    // re-renders the rail, which detaches any handle captured before the click.
    for (let i = 0; i < count; i++) {
      const sel = `.ed-props .ed-section:nth-of-type(${i + 1})`
      for (const _ of [0, 1]) {
        const s = await page.$(sel)
        if (!s) break
        await s.click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(60)
      }
    }
    const bad = await page.evaluate(() => {
      const out = []
      document.querySelectorAll('.ed-props .ed-section').forEach((el, i) => {
        // Chrome reports counter() unresolved in computed style — assert the rule.
        if (!/counter\(fd-sec/.test(getComputedStyle(el, '::before').content)) out.push(`section ${i + 1} lost its counter`)
        if (!/JetBrains|Inter/.test(getComputedStyle(el).fontFamily)) out.push(`section ${i + 1} is not label type`)
        if (Math.round(el.getBoundingClientRect().height) !== 36) out.push(`section ${i + 1} strip is not 36px`)
      })
      return out
    })
    if (bad.length) throw new Error(bad.join('; '))
  })
  await check('serialize produces a whole file', async () => {
    const html = await page.evaluate(() => window.deck.serialize())
    if (!html.startsWith('<!DOCTYPE html>')) throw new Error('not a document')
    if (html.length < 300_000) throw new Error(`suspiciously small: ${html.length}`)
    if (html.includes('fd-brand-fonts')) throw new Error('injected @font-face got captured into the save (inject AFTER capturePristine)')
    // capturePristine() clones the document ATTRIBUTES AND ALL, so anything
    // stamped on <html> before it is frozen into every saved deck. data-theme is
    // the author's own light/dark preference and has no business travelling.
    const htmlTag = html.slice(0, html.indexOf('>', html.indexOf('<html')) + 1)
    if (/data-theme/.test(htmlTag)) throw new Error(`the author's theme got baked into the save: ${htmlTag}`)
  })
  if (errors.length) note('controls', `page errors: ${errors.join(' | ')}`)
  await ctx.close()
}

// ── 2. no upstream accent leaks ─────────────────────────────────────────────
console.log('\n02 // BRAND ACCENTS')
{
  // Every non-token colour upstream paints its chrome with, in rgb() form as the
  // browser reports it. Enumerated from styles.css rather than collected one
  // screenshot at a time — coral/amber was only ever half of it: the share status
  // was goldenrod, the live dots sea-green + brass, the errors brick.
  const CORAL = [
    '255,\\s*158,\\s*138',  // #FF9E8A wordmark coral
    '255,\\s*178,\\s*155',  // #FFB29B button gradient
    '237,\\s*130,\\s*102',  // #ED8266 button gradient
    '247,\\s*166,\\s*0',    // #F7A600 amber accent
    '240,\\s*123,\\s*84',   // #F07B54 about hover
    '184,\\s*134,\\s*11',   // #B8860B share status goldenrod
    '46,\\s*139,\\s*87',    // #2E8B57 share status sea green
    '217,\\s*161,\\s*59',   // #D9A13B connecting dot
    '52,\\s*168,\\s*102',   // #34A866 live dot
    '201,\\s*48,\\s*44',    // #C9302C invalid
    '192,\\s*57,\\s*43',    // #C0392B morph warning
    '160,\\s*50,\\s*60',    // #A0323C kick
    '194,\\s*90,\\s*67',    // #C25A43 version-row action
  ].join('|')
  for (const brand of ['foundry', 'gitwork']) {
    const ctx = await newCtx({ viewport: { width: 1600, height: 1000 } })
    const { page } = await openShell(ctx, `${target}?brand=${brand}`)
    const leaks = await page.evaluate((src) => {
      const re = new RegExp(src)
      const bad = []
      document.querySelectorAll('.ed-root *').forEach((e) => {
        const s = getComputedStyle(e)
        for (const prop of ['backgroundColor', 'color', 'borderTopColor', 'backgroundImage', 'accentColor']) {
          if (s[prop] && re.test(s[prop])) bad.push(`${(e.className || e.tagName).toString().split(' ')[0]}.${prop}`)
        }
      })
      return [...new Set(bad)]
    }, CORAL)
    const runner = await page.$eval('.ed-present-pill', (e) => getComputedStyle(e, '::after').backgroundImage).catch(() => '')
    if (leaks.length) note('accents', `${brand}: upstream palette on ${leaks.slice(0, 6).join(', ')}`)
    else if (new RegExp(CORAL).test(runner)) note('accents', `${brand}: slideshow runner still coral`)
    else pass(`${brand}: no upstream accent left in the chrome`)
    // present mode must follow the DECK's accent, not amber
    await page.click('.ed-pill-main'); await page.waitForTimeout(1500)
    const rev = await page.evaluate(() => {
      const o = document.querySelector('.deck-present-overlay')
      return o ? getComputedStyle(o).getPropertyValue('--r-link-color').trim() : ''
    })
    const deck = await page.evaluate(() => window.deck.doc.theme.accent)
    if (rev.toUpperCase() !== deck.toUpperCase()) note('accents', `${brand}: present mode link colour ${rev} ≠ deck accent ${deck}`)
    else pass(`${brand}: present mode follows the deck accent (${deck})`)
    await ctx.close()
  }
}

// ── 2b. geometry: no pills, and split controls meet cleanly ─────────────────
console.log('\n02b // INSTRUMENT GEOMETRY')
{
  // DESIGN.md reserves full radius for status dots; every control is 6px and
  // every card 10px. Upstream ships 999px in several places and writes its split
  // radii with selectors that out-specify our de-pilling rule, so "no pills" is
  // NOT something the token swap gets for free — it has to be measured. Nothing
  // else in this harness looks at border-radius, which is how the present pill
  // stayed a literal pill while DESIGN.md claimed otherwise.
  const ctx = await newCtx({ viewport: { width: 1600, height: 1000 } })
  const { page } = await openShell(ctx)
  const geo = await page.evaluate(() => {
    const px = (v) => parseFloat(v) || 0
    const pills = []
    document.querySelectorAll('.ed-root button, .ed-root .ed-btn, .ed-toast, .ed-zoombar, .ed-setbar').forEach((e) => {
      const r = e.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) return
      const c = getComputedStyle(e)
      // a status dot is legitimately round: small AND square-ish
      const dot = r.width <= 14 && Math.abs(r.width - r.height) <= 2
      if (dot) return
      const max = Math.max(...['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((k) => px(c[`border${k}Radius`])))
      if (max >= 100) pills.push(`${(e.className || e.tagName).toString().split(' ')[0]} (${max}px)`)
    })
    // split seams: the two halves must round on opposite outer corners only
    const seams = []
    for (const [name, left, right] of [
      ['save', '.ed-split > .ed-btn', '.ed-split-caret'],
      ['present', '.ed-pill-main', '.ed-pill-caret'],
    ]) {
      const a = document.querySelector(left)
      const b = document.querySelector(right)
      if (!a || !b) { seams.push(`${name}: missing half`); continue }
      const ca = getComputedStyle(a)
      const cb = getComputedStyle(b)
      if (px(ca.borderTopRightRadius) || px(ca.borderBottomRightRadius))
        seams.push(`${name}: left half is rounded on the SEAM side (${ca.borderRadius})`)
      if (px(cb.borderTopLeftRadius) || px(cb.borderBottomLeftRadius))
        seams.push(`${name}: right half is rounded on the SEAM side (${cb.borderRadius})`)
      if (px(ca.borderTopLeftRadius) !== px(cb.borderTopRightRadius))
        seams.push(`${name}: halves disagree — outer radii ${px(ca.borderTopLeftRadius)} vs ${px(cb.borderTopRightRadius)}`)
      const ra = a.getBoundingClientRect()
      const rb = b.getBoundingClientRect()
      if (Math.abs(rb.x - ra.right) > 1) seams.push(`${name}: ${(rb.x - ra.right).toFixed(1)}px gap at the seam`)
      if (Math.abs(ra.height - rb.height) > 1) seams.push(`${name}: halves differ in height`)
    }
    return { pills: [...new Set(pills)], seams }
  })
  if (geo.pills.length) note('geometry', `pill radii in the chrome: ${geo.pills.slice(0, 6).join(', ')}`)
  else pass('no pill radii in the chrome (status dots excepted)')
  if (geo.seams.length) for (const s of geo.seams) note('geometry', s)
  else pass('split controls meet cleanly — matched outer radii, square seam, no gap')
  await ctx.close()
}

// ── 3. responsive ───────────────────────────────────────────────────────────
console.log('\n03 // RESPONSIVE')
{
  // The playbook's bands: phone < 640, tablet 640-1023, desktop >= 1024.
  for (const [name, width, height] of [['390', 390, 844], ['768', 768, 1024], ['1023', 1023, 768], ['1280', 1280, 800], ['1600', 1600, 1000]]) {
    const ctx = await newCtx({ viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900 })
    const { page, errors } = await openShell(ctx)
    const m = await page.evaluate(() => {
      const doc = document.documentElement
      const bar = document.querySelector('.ed-topbar')
      const clipped = []
      document.querySelectorAll('.ed-topbar button, .ed-topbar input').forEach((e) => {
        const r = e.getBoundingClientRect()
        if (r.width > 0 && (r.right > innerWidth + 1 || r.left < -1)) clipped.push(e.title || e.className)
      })
      const stage = document.querySelector('.ed-stage')?.getBoundingClientRect()
      return {
        pageOverflowX: doc.scrollWidth - doc.clientWidth,
        topbarOverflow: bar.scrollWidth - bar.clientWidth,
        clipped,
        stageWide: stage ? stage.width > 60 : false,
        canPresent: !!document.querySelector('.ed-pill-main'),
      }
    })
    const bad = []
    if (m.pageOverflowX > 0) bad.push(`page scrolls sideways +${m.pageOverflowX}px`)
    if (m.topbarOverflow > 0) bad.push(`topbar overflows +${m.topbarOverflow}px`)
    if (m.clipped.length) bad.push(`clipped controls: ${m.clipped.slice(0, 4).join(', ')}`)
    if (!m.stageWide) bad.push('canvas not visible')
    if (!m.canPresent) bad.push('no slideshow control')
    if (errors.length) bad.push(`errors: ${errors.join(' | ')}`)
    if (bad.length) note('responsive', `${width}px — ${bad.join('; ')}`)
    else pass(`${width}px clean`)
    await ctx.close()
  }
}

// ── 4. save → reopen round trip ─────────────────────────────────────────────
console.log('\n04 // SAVED DECKS')
{
  const ctx = await newCtx({ viewport: { width: 1600, height: 1000 } })
  const { page } = await openShell(ctx)
  await page.click('.fd-brandswitch button:nth-child(2)') // author it as Gitwork
  await page.waitForTimeout(400)
  const saved = await page.evaluate(() => window.deck.serialize())
  await ctx.close()
  console.log(`       saved deck: ${(saved.length / 1024).toFixed(0)}KB`)

  // Reopen it the way a recipient does: as a FILE on disk, in a fresh profile
  // that prefers the other brand — the deck's own theme must win, or a deck sent
  // to a client opens off-brand. (setContent() is not equivalent: the shell boots
  // its runtime from a blob URL and needs a real document origin.)
  const tmp = join(tmpdir(), `deck-verify-${process.pid}.bento.html`)
  writeFileSync(tmp, saved)
  const ctx2 = await newCtx({ viewport: { width: 1400, height: 900 } })
  await ctx2.addInitScript(() => { try { localStorage.setItem('foundry.deck.brand', 'foundry') } catch {} })
  const page2 = await ctx2.newPage()
  const errs = []
  page2.on('pageerror', (e) => errs.push(e.message))
  await page2.goto(`file://${tmp}`)
  await page2.waitForSelector('.ed-root', { timeout: 20000 })
  await page2.waitForTimeout(2200)
  const reopened = await page2.evaluate(() => ({
    brand: document.documentElement.dataset.brand,
    slides: window.deck.doc.slides.length,
    title: document.title,
  }))
  if (reopened.brand !== 'gitwork') note('saved', `reopened as ${reopened.brand}, expected gitwork (adoptDeckBrand)`)
  else pass(`reopens in its own brand (${reopened.brand}), ${reopened.slides} slides`)
  if (errs.length) note('saved', `errors on reopen: ${errs.join(' | ')}`)
  await ctx2.close()
  rmSync(tmp, { force: true })
}

// ── 5. nothing hidden, in every state ───────────────────────────────────────
// Idle is not where clipping lives — open dialogs, popovers, a full props rail and
// present mode are. Shares the detector with scripts/audit-clipping.mjs.
console.log('\n05 // NOTHING HIDDEN')
{
  const STATES = {
    idle: async () => {},
    'element selected': async (p) => {
      await p.click('.ed-stage .deck-el', { position: { x: 8, y: 8 }, timeout: 4000 }).catch(() => {})
      await p.waitForTimeout(400)
    },
    'props sections all open': async (p) => {
      await p.click('.ed-stage .deck-el', { position: { x: 8, y: 8 }, timeout: 4000 }).catch(() => {})
      await p.waitForTimeout(400)
      for (const sec of await p.$$('.ed-props .ed-section.closed')) { await sec.click({ timeout: 4000 }).catch(() => {}); await p.waitForTimeout(50) }
    },
    'about dialog': async (p) => {
      await p.click('.ed-split .ed-split-caret', { timeout: 4000 }); await p.waitForTimeout(350)
      await p.click('.ed-save-menu button:has-text("Deck settings")', { timeout: 4000 }); await p.waitForTimeout(600)
    },
    'about dialog · document tab': async (p) => {
      await p.click('.ed-split .ed-split-caret', { timeout: 4000 }); await p.waitForTimeout(350)
      await p.click('.ed-save-menu button:has-text("Deck settings")', { timeout: 4000 }); await p.waitForTimeout(600)
      await p.click('.fd-dlg-navrow:nth-child(2)', { timeout: 4000 }); await p.waitForTimeout(300)
    },
    'layout picker': async (p) => { await p.click('.ed-add-slide', { timeout: 4000 }); await p.waitForTimeout(500) },
    'save menu': async (p) => { await p.click('.ed-split .ed-split-caret', { timeout: 4000 }); await p.waitForTimeout(400) },
    'present mode': async (p) => { await p.click('.ed-pill-main', { timeout: 4000 }); await p.waitForTimeout(2000) },
  }
  // 1280x620 is in the list on purpose: a short laptop viewport is where dialogs
  // run off the bottom with nothing to scroll.
  for (const [w, h] of [[1600, 1000], [1280, 620], [768, 1024], [390, 844]]) {
    let bad = 0
    for (const [state, drive] of Object.entries(STATES)) {
      const ctx = await newCtx({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 })
      const { page } = await openShell(ctx)
      // A control that doesn't exist at this width is fine — audit whatever IS on
      // screen. But let it fail FAST: the default 30s actionability timeout, times
      // two dialog states times four viewports, is four minutes of pure waiting.
      try { await drive(page) } catch { /* not reachable here — audit what is */ }
      await page.waitForTimeout(300)
      for (const f of await page.evaluate(AUDIT)) {
        bad++
        note('hidden', `${w}px / ${state}: ${f.kind} ${f.el} — ${f.detail}`)
      }
      await ctx.close()
    }
    if (!bad) pass(`${w}px — nothing hidden in any of the ${Object.keys(STATES).length} states`)
  }
}

// ── 6. identity: the signed-in Foundry user, and no callouts from a file ────
console.log('\n06 // IDENTITY')
{
  // (a) served by Foundry → the People list names the signed-in user
  const ctx = await newCtx({ viewport: { width: 1600, height: 1000 } })
  const { page } = await openShell(ctx)
  const seeded = await page.evaluate(() => localStorage.getItem('deck-author'))
  if (target.startsWith('http')) {
    if (seeded !== 'Test Person') note('identity', `display name not seeded from /api/account (got ${seeded})`)
    else pass('signed-in Foundry user seeds the display name')
    await page.click('.ed-btn-share, button[title*="Share"]').catch(() => {})
    await page.waitForTimeout(600)
    const who = await page.$eval('.ed-share-me .who', (e) => ({
      text: e.textContent, cut: e.scrollWidth > e.clientWidth + 1,
    })).catch(() => null)
    if (!who) pass('share panel has no People row yet (no collab session) — nothing to check')
    else if (!who.text.includes('Test Person')) note('identity', `People row reads "${who.text}"`)
    else if (who.cut) note('identity', `People row truncates the name: "${who.text}"`)
    else pass(`People row names the user, untruncated ("${who.text.trim()}")`)
  } else {
    pass('file:// target — skipping the served-by-Foundry half')
  }
  await ctx.close()

  // (b) a SAVED deck must never call home. This is the format's contract: zero
  //     external requests, so a deck still opens in five years, offline.
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const calls = []
  await ctx2.route('**/*', (route) => {
    const url = route.request().url()
    if (!url.startsWith('file:')) calls.push(url)
    return route.continue()
  })
  const page2 = await ctx2.newPage()
  const tmp2 = join(tmpdir(), `deck-identity-${process.pid}.deck.html`)
  writeFileSync(tmp2, readFileSync(new URL('../../../public/deck/index.html', import.meta.url), 'utf8'))
  await page2.goto(`file://${tmp2}`)
  await page2.waitForSelector('.ed-root', { timeout: 20000 })
  await page2.waitForTimeout(2500)
  if (calls.length) note('identity', `a saved deck made ${calls.length} external request(s): ${calls.slice(0, 3).join(', ')}`)
  else pass('a saved deck makes zero external requests')
  await ctx2.close()
  rmSync(tmp2, { force: true })
}

// ── 7. dark mode follows the platform ───────────────────────────────────────
console.log('\n07 // DARK MODE')
{
  const parse = (rgb) => (rgb.match(/\d+/g) ?? []).slice(0, 3).map(Number)
  const luma = (rgb) => { const [r, g, b] = parse(rgb); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 }
  const contrast = (a, b) => {
    const L = (rgb) => {
      const [r, g, bl] = parse(rgb).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl
    }
    const [x, y] = [L(a), L(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }

  for (const mode of ['light', 'dark']) {
    const ctx = await newCtx({ viewport: { width: 1600, height: 1000 } })
    // Exactly how Foundry stores it — if the platform's key or values change,
    // this fails rather than silently theming nothing.
    await ctx.addInitScript((m) => { try { localStorage.setItem('gitwork.theme.v1', m) } catch {} }, mode)
    const { page, errors } = await openShell(ctx)
    const seen = await page.evaluate(() => document.documentElement.dataset.theme)
    if (seen !== mode) { note('dark', `stored "${mode}" but <html data-theme> is "${seen}"`); await ctx.close(); continue }

    const m = await page.evaluate(() => {
      const cs = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : null }
      return {
        bar: cs('.ed-topbar')?.backgroundColor,
        barInk: cs('.ed-topbar')?.color,
        rail: cs('.ed-props')?.backgroundColor,
        slide: cs('.ed-stage')?.backgroundColor ?? cs('.bento-slide')?.backgroundColor,
        deckPaper: window.deck.doc.theme.background,
      }
    })
    const barDark = luma(m.bar) < 0.35
    if (mode === 'dark' && !barDark) note('dark', `topbar stayed light in dark mode (${m.bar})`)
    else if (mode === 'light' && barDark) note('dark', `topbar went dark in light mode (${m.bar})`)
    else pass(`${mode}: chrome surfaces follow the platform setting`)

    // Legibility is the whole point — a token block that half-applies is worse
    // than none, because the text goes invisible rather than merely off-brand.
    const ratio = contrast(m.bar, m.barInk)
    if (ratio < 4.5) note('dark', `${mode}: topbar text contrast ${ratio.toFixed(1)}:1 (want ≥ 4.5)`)
    else pass(`${mode}: topbar text contrast ${ratio.toFixed(1)}:1`)

    // …and the ARTBOARD must not follow. It's the document, not the UI.
    if (m.deckPaper.toUpperCase() !== '#FAFAF9') note('dark', `${mode}: deck paper changed to ${m.deckPaper} — the artboard must keep the deck's own theme`)
    else pass(`${mode}: the artboard keeps the deck's paper (${m.deckPaper})`)

    if (errors.length) note('dark', `${mode}: page errors ${errors.join(' | ')}`)
    await ctx.close()
  }

  // A live flip in another Foundry tab must move this window — that's a `storage`
  // event, which is the only way two tabs on one origin hear each other here.
  const ctx = await newCtx({ viewport: { width: 1400, height: 900 } })
  await ctx.addInitScript(() => { try { localStorage.setItem('gitwork.theme.v1', 'light') } catch {} })
  const { page } = await openShell(ctx)
  await page.evaluate(() => {
    localStorage.setItem('gitwork.theme.v1', 'dark')
    dispatchEvent(new StorageEvent('storage', { key: 'gitwork.theme.v1', newValue: 'dark' }))
  })
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => document.documentElement.dataset.theme)
  if (after !== 'dark') note('dark', `a theme change in another tab did not reach Deck (still ${after})`)
  else pass('follows a live theme change from another Foundry tab')
  await ctx.close()
}

// ── 8. the shipped shell carries no upstream identity ───────────────────────
console.log('\n08 // NO UPSTREAM NAME')
{
  // Dan's rule: the Bento name and icon appear NOWHERE. The one exception is the
  // MIT notice — the licence requires the copyright line be retained in copies,
  // and the copyright holder is literally "The Bento authors". So: strip the
  // NOTICE block, then assert the rest of the file is clean. Checking the BUILT
  // shell (not the source) is the point — this is the byte-for-byte artefact that
  // ships and that every saved deck carries.
  const shellPath = new URL('../../../public/deck/index.html', import.meta.url)
  const shell = readFileSync(shellPath, 'utf8')

  const notice = shell.match(/<!--\s*\n\s*NOTICE[\s\S]*?-->/)
  if (!notice) {
    note('identity', 'the MIT NOTICE block is MISSING from the shell — that is a licence breach, put it back')
  } else {
    pass('the MIT NOTICE block is present (required — do not remove)')
    const body = shell.replace(notice[0], '')
    const hits = [...body.matchAll(/[Bb]ento/g)]
    if (hits.length) {
      const sample = body.slice(Math.max(0, hits[0].index - 60), hits[0].index + 60).replace(/\s+/g, ' ')
      note('identity', `${hits.length} "bento" occurrence(s) outside the NOTICE, e.g. …${sample}…`)
    } else {
      pass('no "bento" anywhere in the shipped shell outside the NOTICE')
    }
  }

  // The compressor rebuilds the outer shell by REGEX against the vite output, so
  // renaming an id in index.html can make a piece silently vanish from the build.
  // That is not hypothetical: renaming `bento-splash` → `deck-splash` dropped the
  // boot splash out of the artefact, and nothing said a word. Assert the pieces
  // that only exist in the built file.
  for (const [what, needle] of [
    ['boot splash markup', '<div id="deck-splash"'],
    ['splash wordmark', 'class="bs-word"'],
    ['document block', 'id="deck-doc"'],
    ['compressed runtime', 'id="deck-rt"'],
  ]) {
    if (!shell.includes(needle)) note('identity', `the build dropped the ${what} (${needle})`)
    else pass(`the build kept the ${what}`)
  }

  // The favicon must be the PLATFORM's, not a mark invented here or upstream's
  // tile. Compare against src/app/icon.svg — the same disc Foundry's own tabs use.
  const appIcon = readFileSync(new URL('../../../src/app/icon.svg', import.meta.url), 'utf8')
  const fill = appIcon.match(/fill="(#[0-9A-Fa-f]{6})"/)?.[1] ?? ''
  const iconTag = shell.match(/<link rel="icon"[^>]*>/)?.[0] ?? ''
  if (!iconTag) note('identity', 'the shell has no <link rel="icon">')
  else if (!fill || !iconTag.toLowerCase().includes(fill.replace('#', '%23').toLowerCase()))
    note('identity', `the favicon is not the platform disc (${fill}): ${iconTag.slice(0, 120)}`)
  else if (/rect/i.test(iconTag)) note('identity', 'the favicon still contains a tile/rect — that was upstream\'s mark')
  else pass(`the favicon is the platform's own disc (${fill})`)
}

// ── 9. document mode: a deck that lives in Docs ─────────────────────────────
console.log('\n09 // FOUNDRY DOCUMENT MODE')
{
  // `/deck?doc=<id>` makes Deck part of Docs: slides load from the API and ⌘S
  // saves back, so the library card can never go stale behind an open window.
  // The failure that matters is silent — saving to a FILE when it should have
  // gone to Foundry looks identical on screen until the card is out of date.
  if (!target.startsWith('http')) {
    pass('file:// target — document mode needs a served shell, skipping')
  } else {
    const ctx = await newCtx({ viewport: { width: 1500, height: 950 } })
    let stored = null
    let puts = 0
    await ctx.route('**/api/documents/*/deck', async (route) => {
      const req = route.request()
      if (req.method() === 'GET') {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: { deck: { doc: stored, title: 'Harness Deck', template: 'gw-pitch' } } }),
        })
      }
      if (req.method() === 'PUT') {
        puts += 1
        stored = JSON.parse(req.postData() || '{}').doc
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { deck: {} } }) })
      }
      return route.continue()
    })

    const { page, errors } = await openShell(ctx, `${target}?doc=doc_harness`)
    const first = await page.evaluate(() => ({
      title: window.deck.doc.title, slides: window.deck.doc.slides.length,
    }))
    if (first.slides < 2) note('docmode', `first open produced ${first.slides} slide(s) — the template did not materialise`)
    else if (first.title !== 'Harness Deck') note('docmode', `first open titled "${first.title}", expected the document's title`)
    else if (puts < 1) note('docmode', 'a brand-new deck was not saved back — its slides would exist only in the tab')
    else pass(`first open builds the template and saves it (${first.slides} slides)`)

    // ⌘S must reach Foundry, not the filesystem.
    await page.evaluate(() => { window.deck.doc.title = 'Renamed' })
    const before = puts
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1200)
    if (puts <= before) note('docmode', '⌘S did not save to Foundry — a deck in Docs must not save to a file')
    else pass('⌘S saves to Foundry')

    // …and reopening must restore the STORED slides, not rebuild the template.
    const page2 = await ctx.newPage()
    await page2.goto(`${target}?doc=doc_harness`)
    await page2.waitForSelector('.ed-root', { timeout: 20000 })
    await page2.waitForTimeout(2200)
    const again = await page2.evaluate(() => window.deck.doc.title)
    if (again !== 'Renamed') note('docmode', `reopen showed "${again}" — stored slides were not used`)
    else pass('reopening restores the stored deck, not a fresh template')

    if (errors.length) note('docmode', `page errors: ${errors.slice(0, 2).join(' | ')}`)
    await ctx.close()
  }
}

await browser.close()

console.log('')
if (failures.length) {
  console.log(`✗ ${failures.length} failure(s):`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exit(1)
}
console.log('✓ shell verified — controls, brand accents, responsive bands, saved-deck round trip')
