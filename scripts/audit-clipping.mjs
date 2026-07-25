#!/usr/bin/env node
/**
 * Clipping audit — finds UI that is on the page but cannot be seen.
 *
 *   node scripts/audit-clipping.mjs <url> [url...] [--viewports=1440x900,390x844]
 *   node scripts/audit-clipping.mjs http://localhost:3000/ --json
 *
 * Written because "I opened the UI and it was cut off" kept being found by hand.
 * It walks every rendered element and reports the five ways content goes missing
 * without anyone noticing in code review:
 *
 *   CLIPPED      an ancestor's overflow cuts it off AND that ancestor cannot
 *                scroll to reveal it — the content is simply unreachable
 *   OFFSCREEN    it sits outside the viewport with no page scroll to reach it
 *                (position:fixed panels that render past the bottom edge)
 *   COLLAPSED    it has text but zero height/width — a container that closed up
 *   TRUNCATED    its text is ellipsed/cut with no title attribute, so the full
 *                value is unreadable anywhere
 *   PAGE-X       the document scrolls sideways — reported once per page, WITH the
 *                element responsible, so nobody has to go hunting for it
 *
 * Deliberately quiet about things that are *meant* to be out of view: display:none,
 * visibility:hidden, opacity:0, aria-hidden, sr-only nodes, closed disclosures
 * (aria-expanded / <details> / a collapsed class / a zero-size rail), SVG internals,
 * fixed-canvas artboards (a slide crops what hangs off it by design), off-screen
 * measuring nodes, and anything a scrollable ancestor can bring into view —
 * scrollable-but-clipped is normal UI, not a bug. Those exclusions are heuristics,
 * so a suspiciously clean report deserves one look at the panel in question.
 *
 * Two rules that are easy to get wrong, and are the reason this exists:
 *   · `overflow:hidden` is NOT scrollable. The browser still reports scrollWidth /
 *     scrollHeight past the box, so testing those alone silently excuses the single
 *     most common way UI goes missing. Only auto/scroll means a person can reach it.
 *   · `innerWidth` lies on mobile. When content forces a page wider than the device,
 *     mobile browsers widen innerWidth to fit — so it reports nothing past the edge
 *     while the user is scrolling sideways. Measure documentElement.clientWidth.
 *
 * Run `--self-test` after touching the rules: it renders deliberately broken markup
 * and asserts every kind still fires, and that three lookalikes stay quiet. A
 * detector that never fires is worse than no detector.
 *
 * Needs the preinstalled Chromium and playwright-core:
 *   npm i --no-save playwright-core
 * Not in CI (no browser). Exit code is 1 if anything was found, so it can gate.
 * See docs/mobile-playbook.md §3a.
 */

import { existsSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

// Imported as a library (just take AUDIT) vs run as a CLI.
const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const urls = args.filter((a) => !a.startsWith('--'))
const vpArg = args.find((a) => a.startsWith('--viewports='))
const VIEWPORTS = (vpArg ? vpArg.split('=')[1].split(',') : ['390x844', '768x1024', '1280x620', '1440x900'])
  .map((v) => v.split('x').map(Number))

if (isCli && !urls.length && !args.includes('--self-test')) {
  console.error('usage: node scripts/audit-clipping.mjs <url> [url...] [--viewports=WxH,...] [--json]')
  console.error('       node scripts/audit-clipping.mjs --self-test')
  process.exit(2)
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const dir = existsSync(root) && readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().pop()
  if (!dir) throw new Error(`no chromium under ${root} — set CHROMIUM_PATH`)
  return `${root}/${dir}/chrome-linux/chrome`
}

/**
 * Runs IN the page. Keep it self-contained — it is stringified into the browser,
 * so it can close over nothing. Exported so other harnesses (e.g.
 * vendor/bento/scripts/verify-shell.mjs) can run the same detector against a page
 * they have already driven into some state, instead of copying it.
 */
export const AUDIT = () => {
  const out = []
  const label = (el) => {
    const id = el.id ? `#${el.id}` : ''
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`
  }
  /**
   * Is this clipping box a CLOSED DISCLOSURE (a collapsed rail, a shut drawer, an
   * unopened <details>) rather than a box that is accidentally too small? Content
   * inside one is hidden on purpose and there is a control to reveal it, so
   * reporting every descendant buries the real findings — a phone-collapsed side
   * rail produced 1000+ lines before this existed.
   *
   * HEURISTIC, deliberately: aria-expanded, <details>, a collapsed/closed class, or
   * a box with no room on the clipped axis. If you get a suspicious "clean", check
   * the panel is genuinely toggleable and not just squashed.
   */
  const isClosedDisclosure = (el, axisSize) => {
    if (el.matches('[aria-expanded="false"], details:not([open]), [hidden]')) return true
    if (el.closest('[aria-expanded="false"], details:not([open])')) return true
    const cls = typeof el.className === 'string' ? el.className : ''
    if (/(^|[-_\s])(collapsed|closed|minimi[sz]ed)([-_\s]|$)/i.test(cls)) return true
    return axisSize < 8
  }

  const hiddenOnPurpose = (el, cs) => {
    if (cs.visibility === 'hidden' || cs.opacity === '0') return true
    if (el.closest('[aria-hidden="true"], [hidden]')) return true
    // upstream/app off-screen measuring nodes
    const r = el.getBoundingClientRect()
    if (r.right < -9000 || r.bottom < -9000) return true
    // the screen-reader-only idiom: a ~1px clipped box that exists to be ANNOUNCED,
    // never shown (reveal.js's .aria-status, Tailwind's sr-only, etc). Both
    // dimensions must be tiny — a zero-HEIGHT full-width box is a collapsed
    // container, which is a real defect and must still be reported.
    if (r.width <= 2 && r.height <= 2) return true
    if (cs.clipPath === 'inset(50%)' || (cs.clip && cs.clip !== 'auto')) return true
    return false
  }

  /**
   * Fixed-canvas render surfaces: a slide (or any fixed-size artboard) crops what
   * hangs off its edge BY DESIGN — in the editor, in a thumbnail and when
   * presenting. Same reasoning as an <svg> viewBox. Content overflowing one of
   * these is a document-authoring question, not hidden UI, so the walk stops there.
   * Extend this list if the app grows another artboard-style surface.
   */
  const CROP_SURFACES = '.bento-slide, .bento-thumb-surface, .reveal .slides section'

  const all = document.querySelectorAll('body *')
  for (const el of all) {
    if (!el.getClientRects().length) continue // display:none / detached — absent, not clipped
    // Inside an <svg>, clipping is the viewBox doing its job: paths and shapes are
    // routinely drawn past the edge and cropped on purpose. Audit the <svg> itself,
    // never its drawing primitives — otherwise one illustration buries the report.
    if (el.ownerSVGElement) continue
    const cs = getComputedStyle(el)
    if (hiddenOnPurpose(el, cs)) continue
    const r = el.getBoundingClientRect()
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())

    // COLLAPSED — carries its own text but has no box to show it in. Not when it
    // sits inside a CLOSED disclosure though: a collapsed side rail legitimately
    // squeezes its contents to zero, and reporting each label inside one buries
    // the real findings (a phone-collapsed props rail is ~20 of them).
    if (ownText && (r.width < 1 || r.height < 1)) {
      let drawer = el.parentElement, insideClosed = false
      while (drawer && drawer !== document.body) {
        const ds = getComputedStyle(drawer)
        if (ds.overflowX !== 'visible' || ds.overflowY !== 'visible') {
          if (isClosedDisclosure(drawer, Math.min(drawer.clientWidth || 0, drawer.clientHeight || 0))) {
            insideClosed = true
            break
          }
        }
        drawer = drawer.parentElement
      }
      if (!insideClosed) {
        out.push({ kind: 'COLLAPSED', el: label(el), detail: `${Math.round(r.width)}x${Math.round(r.height)}` })
      }
      continue
    }
    if (r.width < 1 || r.height < 1) continue

    // TRUNCATED — its own text is cut AND cannot be read any other way. A code
    // block with overflow-x:auto is not truncated, it is scrollable; likewise a
    // value whose full text is in a title/aria-label, or an input the caret moves
    // through. Only `hidden`/`clip` actually loses the text.
    const selfScrollsX = ['auto', 'scroll'].includes(cs.overflowX)
    if (ownText && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !selfScrollsX && cs.overflowX !== 'visible') {
      const recoverable = el.title || el.getAttribute('aria-label') || el.matches('input, textarea, select')
      if (!recoverable) {
        out.push({ kind: 'TRUNCATED', el: label(el), detail: `${el.scrollWidth}px of text in ${el.clientWidth}px, no title and no scroll` })
      }
    }

    // CLIPPED — cut off by an ancestor that cannot scroll to reveal it.
    // position:fixed escapes non-transformed clippers, so stop the walk there.
    if (cs.position !== 'fixed') {
      let p = el.parentElement
      while (p && p !== document.body) {
        const ps = getComputedStyle(p)
        const clipX = ps.overflowX !== 'visible'
        const clipY = ps.overflowY !== 'visible'
        if (clipX || clipY) {
          const pr = p.getBoundingClientRect()
          // A closed drawer/rail is hiding its contents on purpose — stop here.
          if (isClosedDisclosure(p, Math.min(p.clientWidth || 0, p.clientHeight || 0))) break
          // A slide/artboard cropping its own content is the canvas doing its job.
          if (p.matches(CROP_SURFACES)) break
          // A person can only scroll `auto`/`scroll`. With `hidden`/`clip` the
          // browser still reports scrollWidth/scrollHeight past the box, so testing
          // those alone silently excuses the single most common way UI goes missing.
          const userScrollsX = ['auto', 'scroll'].includes(ps.overflowX)
          const userScrollsY = ['auto', 'scroll'].includes(ps.overflowY)
          const canScrollX = userScrollsX && p.scrollWidth - p.clientWidth > 1
          const canScrollY = userScrollsY && p.scrollHeight - p.clientHeight > 1
          const cuts = []
          // >2px of slop: borders and sub-pixel rounding are not defects
          if (clipX && !canScrollX && r.right > pr.right + 2) cuts.push(`right by ${Math.round(r.right - pr.right)}px`)
          if (clipX && !canScrollX && r.left < pr.left - 2) cuts.push(`left by ${Math.round(pr.left - r.left)}px`)
          if (clipY && !canScrollY && r.bottom > pr.bottom + 2) cuts.push(`bottom by ${Math.round(r.bottom - pr.bottom)}px`)
          if (clipY && !canScrollY && r.top < pr.top - 2) cuts.push(`top by ${Math.round(pr.top - r.top)}px`)
          if (cuts.length) {
            out.push({ kind: 'CLIPPED', el: label(el), detail: `${cuts.join(', ')} — by ${label(p)} (overflow ${ps.overflow})` })
            break
          }
          // Reachable: this ancestor scrolls on the axis the element runs past, so
          // the content can be brought into view. Stop — an OUTER clipper cutting
          // the same element is not a second defect, and reporting it points the
          // fix at the wrong box (this is what kept blaming a card for a table its
          // own scrollable body already handles).
          const runsPastX = r.right > pr.right + 2 || r.left < pr.left - 2
          const runsPastY = r.bottom > pr.bottom + 2 || r.top < pr.top - 2
          if ((runsPastX && canScrollX) || (runsPastY && canScrollY)) break
        }
        if (ps.position === 'fixed') break
        p = p.parentElement
      }
    }

    // OFFSCREEN — a fixed/sticky panel rendering outside the viewport can't be
    // scrolled to. Only flag ones big enough to be real UI.
    if ((cs.position === 'fixed' || cs.position === 'sticky') && r.width > 40 && r.height > 24) {
      const off = []
      if (r.bottom > innerHeight + 2) off.push(`${Math.round(r.bottom - innerHeight)}px below the fold`)
      if (r.right > innerWidth + 2) off.push(`${Math.round(r.right - innerWidth)}px past the right edge`)
      if (r.top < -2) off.push(`${Math.round(-r.top)}px above the top`)
      if (off.length) out.push({ kind: 'OFFSCREEN', el: label(el), detail: off.join(', ') })
    }
  }

  // PAGE-X — sideways page scroll, with the element(s) responsible. Reporting the
  // symptom alone means someone still has to go hunting; name the widest nodes
  // that aren't inside something scrollable, which is almost always the cause.
  const doc = document.documentElement
  const over = doc.scrollWidth - doc.clientWidth
  if (over > 1) {
    // Compare against the LAYOUT viewport, not innerWidth. When content forces a
    // page wider than the device, mobile browsers widen innerWidth to fit it — so
    // innerWidth says nothing is past the edge while the user is still scrolling
    // sideways. documentElement.clientWidth stays honest.
    const edge = doc.clientWidth
    const culprits = []
    for (const el of all) {
      if (!el.getClientRects().length || el.ownerSVGElement) continue
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.right <= edge + 1) continue
      // Ignore nodes whose overflow is genuinely absorbed: an ancestor that both
      // clips/scrolls AND fits inside the viewport itself. An ancestor that is just
      // as wide as the offender absorbs nothing — that check is what let a 455px
      // table hide behind a shrug of a report.
      let p = el.parentElement, absorbed = false
      while (p && p !== document.body) {
        const ps = getComputedStyle(p)
        if (['auto', 'scroll', 'hidden', 'clip'].includes(ps.overflowX) &&
            p.getBoundingClientRect().right <= edge + 1) { absorbed = true; break }
        p = p.parentElement
      }
      if (absorbed) continue
      // report the outermost offender, not every descendant of it
      if (culprits.some((c) => c.node.contains(el))) continue
      culprits.push({ node: el, past: Math.round(r.right - edge) })
    }
    out.unshift({
      kind: 'PAGE-X',
      el: culprits.length ? culprits.map((c) => label(c.node)).slice(0, 3).join(' · ') : 'document',
      detail: `page scrolls sideways by ${over}px` +
        (culprits.length ? ` — widest offender past the edge by ${Math.max(...culprits.map((c) => c.past))}px` : ''),
    })
  }
  // de-dupe identical findings (repeated rows in a list say the same thing once)
  const seen = new Set()
  return out.filter((f) => {
    const key = `${f.kind}|${f.el.replace(/"[^"]*"/, '')}|${f.detail}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

if (!isCli) {
  // library use — the CLI run below is skipped
} else {

/**
 * Self-test fixture. A detector that never fires is worse than no detector, so
 * `--self-test` renders deliberately broken markup and asserts every kind fires
 * AND that the three lookalikes stay quiet: a scrollable parent, a scrollable code
 * block, and a screen-reader-only node. Run it after touching the rules above.
 */
const SELF_TEST_HTML = `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 14px system-ui }
  .clipbox { width: 200px; height: 60px; overflow: hidden; border: 1px solid #ccc }
  .toowide { width: 400px }
  .scrollbox { width: 200px; height: 60px; overflow: auto; border: 1px solid #ccc }
  .zero { height: 0; overflow: hidden }
  .ellipsed { width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .fixedoff { position: fixed; bottom: -80px; left: 0; width: 300px; height: 60px }
  table { width: 100%; min-width: 520px }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%) }
</style>
<div class="clipbox"><div class="toowide">cut off, parent cannot scroll</div></div>
<div class="scrollbox"><div class="toowide">fine: parent scrolls</div></div>
<div class="zero">container has zero height</div>
<div class="ellipsed">this label is far too long to fit inside its box</div>
<div class="fixedoff">fixed below the fold</div>
<div class="sr">announcement, must be ignored</div>
<pre style="overflow-x:auto">fine: scrollable code block ......................................................</pre>
<table><tr><td>forces the page wider than a phone</td></tr></table>`

async function selfTest(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.setContent(SELF_TEST_HTML)
  await page.waitForTimeout(200)
  const findings = await page.evaluate(AUDIT)
  await ctx.close()
  const kinds = new Set(findings.map((f) => f.kind))
  const want = ['PAGE-X', 'CLIPPED', 'COLLAPSED', 'TRUNCATED', 'OFFSCREEN']
  const missing = want.filter((k) => !kinds.has(k))
  const falsePositives = findings.filter((f) => /fine:|announcement/.test(f.el))
  for (const k of want) console.log(`  ${kinds.has(k) ? 'ok  ' : 'MISS'} detects ${k}`)
  for (const f of falsePositives) console.log(`  FALSE POSITIVE on ${f.el}`)
  const ok = !missing.length && !falsePositives.length
  console.log(ok ? '\n✓ detector is sensitive and quiet on lookalikes' : '\n✗ detector is broken — fix the rules before trusting a clean report')
  return ok
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
const report = []

if (args.includes('--self-test')) {
  const ok = await selfTest(browser)
  await browser.close()
  process.exit(ok ? 0 : 1)
}

for (const url of urls) {
  for (const [width, height] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900 })
    const page = await ctx.newPage()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(2500)
      const findings = await page.evaluate(AUDIT)
      report.push({ url, viewport: `${width}x${height}`, findings })
    } catch (e) {
      report.push({ url, viewport: `${width}x${height}`, error: String(e).split('\n')[0].slice(0, 120) })
    }
    await ctx.close()
  }
}
await browser.close()

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  for (const r of report) {
    const head = `${r.url}  @ ${r.viewport}`
    if (r.error) { console.log(`\n${head}\n  ERROR ${r.error}`); continue }
    if (!r.findings.length) { console.log(`\n${head}\n  ok — nothing hidden`); continue }
    console.log(`\n${head}`)
    for (const f of r.findings) console.log(`  ${f.kind.padEnd(9)} ${f.el}\n            ↳ ${f.detail}`)
  }
}
const total = report.reduce((n, r) => n + (r.findings?.length ?? 0), 0)
console.log(`\n${total} finding(s) across ${report.length} page/viewport combination(s)`)
process.exit(total ? 1 : 0)
}
