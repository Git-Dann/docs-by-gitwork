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

import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
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
      const n0 = await page.evaluate(() => window.bento.doc.slides[0].elements.length)
      await page.click(`.ed-insert button:has-text("${label}")`)
      await page.waitForTimeout(250)
      const n1 = await page.evaluate(() => window.bento.doc.slides[0].elements.length)
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
      deck: window.bento.doc.theme.accent,
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
    if ((await page.evaluate(() => window.bento.doc.theme.accent)) !== a.deck) throw new Error('re-theme not undoable')
    await page.click('.fd-brandswitch button:nth-child(1)')
  })
  await check('help dialog', async () => {
    await page.click('.ed-btn-help'); await page.waitForTimeout(400)
    if (!(await page.$('.ed-help-box'))) throw new Error('no help box')
    await esc()
  })
  await check('about dialog (wordmark)', async () => {
    await page.click('.ed-logo'); await page.waitForTimeout(500)
    if (!(await page.$('.ed-about'))) throw new Error('no about dialog')
    await esc()
  })
  await check('new slide → layout picker → insert', async () => {
    const n0 = await page.evaluate(() => window.bento.doc.slides.length)
    await page.click('.ed-add-slide'); await page.waitForTimeout(350)
    const items = await page.$$('.ed-layoutpick-item')
    if (!items.length) throw new Error('layout picker empty (it is a PICKER, not an insert button)')
    await items[0].click(); await page.waitForTimeout(400)
    if ((await page.evaluate(() => window.bento.doc.slides.length)) !== n0 + 1) throw new Error('layout did not insert')
    await page.keyboard.press('Control+z')
  })
  await check('slideshow starts + Escape exits', async () => {
    await page.click('.ed-pill-main'); await page.waitForTimeout(1600)
    if (!(await page.$('.bento-present-overlay'))) throw new Error('no present overlay')
    await page.keyboard.press('Escape'); await page.waitForTimeout(700)
    if (await page.$('.bento-present-overlay')) throw new Error('overlay did not close')
  })
  await check('props rail sections collapse + carry the NN // counter', async () => {
    await page.click('.ed-stage .bento-el', { position: { x: 10, y: 10 } }).catch(() => {})
    await page.waitForTimeout(300)
    const secs = await page.$$('.ed-props .ed-section')
    if (!secs.length) throw new Error('no props sections')
    for (const s of secs) { await s.click(); await page.waitForTimeout(50); await s.click() }
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
    const html = await page.evaluate(() => window.bento.serialize())
    if (!html.startsWith('<!DOCTYPE html>')) throw new Error('not a document')
    if (html.length < 300_000) throw new Error(`suspiciously small: ${html.length}`)
    if (html.includes('fd-brand-fonts')) throw new Error('injected @font-face got captured into the save (inject AFTER capturePristine)')
  })
  if (errors.length) note('controls', `page errors: ${errors.join(' | ')}`)
  await ctx.close()
}

// ── 2. no upstream accent leaks ─────────────────────────────────────────────
console.log('\n02 // BRAND ACCENTS')
{
  const CORAL = /255,\s*158,\s*138|255,\s*178,\s*155|237,\s*130,\s*102|247,\s*166,\s*0/
  for (const brand of ['foundry', 'gitwork']) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
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
    }, CORAL.source)
    const runner = await page.$eval('.ed-present-pill', (e) => getComputedStyle(e, '::after').backgroundImage).catch(() => '')
    if (leaks.length) note('accents', `${brand}: upstream coral/amber on ${leaks.slice(0, 6).join(', ')}`)
    else if (CORAL.test(runner)) note('accents', `${brand}: slideshow runner still coral`)
    else pass(`${brand}: no upstream accent left in the chrome`)
    // present mode must follow the DECK's accent, not amber
    await page.click('.ed-pill-main'); await page.waitForTimeout(1500)
    const rev = await page.evaluate(() => {
      const o = document.querySelector('.bento-present-overlay')
      return o ? getComputedStyle(o).getPropertyValue('--r-link-color').trim() : ''
    })
    const deck = await page.evaluate(() => window.bento.doc.theme.accent)
    if (rev.toUpperCase() !== deck.toUpperCase()) note('accents', `${brand}: present mode link colour ${rev} ≠ deck accent ${deck}`)
    else pass(`${brand}: present mode follows the deck accent (${deck})`)
    await ctx.close()
  }
}

// ── 3. responsive ───────────────────────────────────────────────────────────
console.log('\n03 // RESPONSIVE')
{
  // The playbook's bands: phone < 640, tablet 640-1023, desktop >= 1024.
  for (const [name, width, height] of [['390', 390, 844], ['768', 768, 1024], ['1023', 1023, 768], ['1280', 1280, 800], ['1600', 1600, 1000]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900 })
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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const { page } = await openShell(ctx)
  await page.click('.fd-brandswitch button:nth-child(2)') // author it as Gitwork
  await page.waitForTimeout(400)
  const saved = await page.evaluate(() => window.bento.serialize())
  await ctx.close()
  console.log(`       saved deck: ${(saved.length / 1024).toFixed(0)}KB`)

  // Reopen it the way a recipient does: as a FILE on disk, in a fresh profile
  // that prefers the other brand — the deck's own theme must win, or a deck sent
  // to a client opens off-brand. (setContent() is not equivalent: the shell boots
  // its runtime from a blob URL and needs a real document origin.)
  const tmp = join(tmpdir(), `deck-verify-${process.pid}.bento.html`)
  writeFileSync(tmp, saved)
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await ctx2.addInitScript(() => { try { localStorage.setItem('foundry.deck.brand', 'foundry') } catch {} })
  const page2 = await ctx2.newPage()
  const errs = []
  page2.on('pageerror', (e) => errs.push(e.message))
  await page2.goto(`file://${tmp}`)
  await page2.waitForSelector('.ed-root', { timeout: 20000 })
  await page2.waitForTimeout(2200)
  const reopened = await page2.evaluate(() => ({
    brand: document.documentElement.dataset.brand,
    slides: window.bento.doc.slides.length,
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
      await p.click('.ed-stage .bento-el', { position: { x: 8, y: 8 } }).catch(() => {})
      await p.waitForTimeout(400)
    },
    'props sections all open': async (p) => {
      await p.click('.ed-stage .bento-el', { position: { x: 8, y: 8 } }).catch(() => {})
      await p.waitForTimeout(400)
      for (const sec of await p.$$('.ed-props .ed-section.closed')) { await sec.click(); await p.waitForTimeout(50) }
    },
    'help dialog': async (p) => { await p.click('.ed-btn-help'); await p.waitForTimeout(500) },
    'about dialog': async (p) => { await p.click('.ed-logo'); await p.waitForTimeout(700) },
    'layout picker': async (p) => { await p.click('.ed-add-slide'); await p.waitForTimeout(500) },
    'save menu': async (p) => { await p.click('.ed-split .ed-split-caret'); await p.waitForTimeout(400) },
    'present mode': async (p) => { await p.click('.ed-pill-main'); await p.waitForTimeout(2000) },
  }
  // 1280x620 is in the list on purpose: a short laptop viewport is where dialogs
  // run off the bottom with nothing to scroll.
  for (const [w, h] of [[1600, 1000], [1280, 620], [768, 1024], [390, 844]]) {
    let bad = 0
    for (const [state, drive] of Object.entries(STATES)) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 })
      const { page } = await openShell(ctx)
      try { await drive(page) } catch { /* control absent at this width — audit what is there */ }
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

await browser.close()

console.log('')
if (failures.length) {
  console.log(`✗ ${failures.length} failure(s):`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exit(1)
}
console.log('✓ shell verified — controls, brand accents, responsive bands, saved-deck round trip')
