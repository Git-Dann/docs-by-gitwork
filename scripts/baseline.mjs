#!/usr/bin/env node
/**
 * Baseline — proves a change has not broken anything that worked before it.
 *
 *   node scripts/baseline.mjs                 # check against tests/baseline/snapshot.json
 *   node scripts/baseline.mjs --update        # record a new snapshot (deliberate changes only)
 *   node scripts/baseline.mjs --url=http://localhost:3100
 *
 * Written for the multi-tenant work (docs/multi-tenant-roadmap.md), where the
 * rule is "Gitwork sees zero change unless the change is deliberate". `/app` is
 * auth-gated with no staging, so the pages a person can actually reach without a
 * database are the `/demo/**` mirrors and the public pages. This visits all of
 * them, plus every `/demo` page linked from them, at three widths, and checks:
 *
 *   STATUS    the page answers below 400
 *   CRASH     no uncaught page error, no console error (local-env noise excepted)
 *   BLANK     the page rendered real content
 *   PAGE-X    the page does not scroll sideways
 *   CLIPPING  the clipping audit finds no MORE problems than it did at baseline
 *   CONTENT   every title, heading and widget header recorded at baseline is
 *             still on the page (new ones are fine; a missing one fails)
 *   GATE      the auth gates behave: /app redirects to sign-in, /api refuses an
 *             unauthenticated call, /api/health answers
 *
 * A failure is either a regression or a deliberate change. Deliberate changes are
 * recorded with --update, in the same PR, so the diff of snapshot.json shows a
 * reviewer exactly what moved.
 *
 * Needs the app running WITH API_KEY and AUTH_SECRET set (any values), otherwise
 * the gate checks see local-mode behaviour rather than production's:
 *
 *   API_KEY=x AUTH_SECRET=y npx next dev -p 3100
 *
 * and playwright-core + Chromium, as for audit-clipping (docs/mobile-playbook.md §3a).
 * Not in CI (no browser there). Exit code 1 on any failure.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { AUDIT } from './audit-clipping.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = resolve(here, '../tests/baseline/snapshot.json')

const args = process.argv.slice(2)
const UPDATE = args.includes('--update')
const BASE = (args.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3100').replace(/\/$/, '')
const VIEWPORTS = [[390, 844], [768, 1024], [1440, 900]]
const MAX_PAGES = 80

// Pages that are always visited. Others are found by following /demo links.
const SEEDS = [
  '/demo', '/demo/summary', '/demo/dev', '/demo/portal', '/demo/tasks', '/demo/docs', '/demo/care',
  '/demo/backstage', '/demo/wiki', '/demo/studio', '/demo/devsignal', '/demo/pulse',
  '/demo/pulse/monitors', '/demo/pulse/portfolio', '/demo/pulse/compare', '/demo/pulse/growth',
  '/demo/pulse-embed', '/demo/Northwind',
  '/portal/login', '/login', '/pulse-overview', '/production-ready', '/pulse/features', '/api-docs',
  '/embed/pulse', '/context',
]

// Paths that must never be crawled into: they mutate, or are not pages.
const SKIP = [/\/api\//, /\/opengraph-image/, /\.(png|svg|jpg|pdf|zip|json|txt|xml)$/i]

// Console noise that is a property of running locally without a database or real
// secrets, never of the code. Anything else in the console is a failure.
const LOCAL_NOISE = [
  /DATABASE_URL/i, /MissingSecret/i, /prisma/i, /AUTH_SECRET/i,
  /Failed to load resource/i, // external hosts are blocked in the sandbox; status is checked separately
  /net::ERR_/i, /Download the React DevTools/i, /\[Fast Refresh\]/i, /\[HMR\]/i,
  /challenges\.cloudflare\.com/i, /turnstile/i,
]

// Auth gates, checked without a browser. These are the behaviours the
// multi-tenant work must not loosen.
const GATES = [
  { path: '/', expect: (r) => r.status === 307 && r.location.endsWith('/portal/login'), want: '307 → /portal/login' },
  { path: '/app', expect: (r) => [302, 307].includes(r.status) && r.location.includes('/login'), want: 'redirect → /login' },
  { path: '/app/settings', expect: (r) => [302, 307].includes(r.status) && r.location.includes('/login'), want: 'redirect → /login' },
  { path: '/deck', expect: (r) => [302, 307].includes(r.status) && r.location.includes('/login'), want: 'redirect → /login' },
  { path: '/api/clients', expect: (r) => r.status === 401, want: '401' },
  { path: '/api/tasks', expect: (r) => r.status === 401, want: '401' },
  { path: '/api/team/members', expect: (r) => r.status === 401, want: '401' },
  { path: '/api/health', expect: (r) => r.status === 200, want: '200' },
]

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const versioned = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d/.test(d)).sort().reverse() : []
  const candidates = [
    `${root}/chromium`, // the cloud sandbox's plain launcher
    ...versioned.flatMap((d) => [`${root}/${d}/chrome-linux/chrome`, `${root}/${d}/chrome-linux64/chrome`]),
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error(`no chromium under ${root} — set CHROMIUM_PATH`)
  return found
}

/** Numbers change run to run (dates, ages, counts); the words do not. */
const norm = (s) => s.replace(/\s+/g, ' ').replace(/\d+/g, '#').trim().slice(0, 120)

/** Runs in the page: the content a person would notice going missing. */
function CONTENT() {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const texts = (sel) => [...document.querySelectorAll(sel)].filter(visible).map((e) => e.textContent || '').filter((t) => t.trim())
  return {
    title: document.title,
    headings: texts('h1, h2'),
    widgets: texts('.widget-header'),
    bodyChars: (document.body?.innerText || '').trim().length,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    links: [...document.querySelectorAll('a[href^="/demo"]')].map((a) => a.getAttribute('href')),
  }
}

async function checkGates() {
  const failures = []
  for (const g of GATES) {
    try {
      const res = await fetch(BASE + g.path, { redirect: 'manual' })
      const r = { status: res.status, location: res.headers.get('location') ?? '' }
      if (!g.expect(r)) failures.push(`GATE      ${g.path}: got ${r.status} ${r.location}, want ${g.want}`)
    } catch (e) {
      failures.push(`GATE      ${g.path}: ${e.message}`)
    }
  }
  return failures
}

async function visit(browser, path, [w, h]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (!LOCAL_NOISE.some((re) => re.test(t))) errors.push(`console: ${t.slice(0, 200)}`)
  })
  let status = 0
  try {
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90_000 })
    status = res?.status() ?? 0
  } catch (e) {
    errors.push(`navigation: ${e.message.split('\n')[0]}`)
  }
  await page.waitForTimeout(400)
  const content = await page.evaluate(CONTENT).catch(() => null)
  const clipping = await page.evaluate(AUDIT).catch(() => [])
  await ctx.close()
  return { status, errors, content, clippingCount: Array.isArray(clipping) ? clipping.length : 0, clipping }
}

async function main() {
  const previous = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null
  if (!previous && !UPDATE) {
    console.error(`no snapshot at ${SNAPSHOT} — run with --update first`)
    process.exit(2)
  }

  const failures = await checkGates()
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
  const pages = {}
  const queue = [...new Set([...SEEDS, ...Object.keys(previous?.pages ?? {})])]
  const seen = new Set(queue)

  while (queue.length && Object.keys(pages).length < MAX_PAGES) {
    const path = queue.shift()
    const record = { viewports: {} }
    for (const vp of VIEWPORTS) {
      const key = `${vp[0]}`
      const r = await visit(browser, path, vp)
      const c = r.content
      const label = `${path} @${key}`
      if (r.status >= 400 || r.status === 0) failures.push(`STATUS    ${label}: ${r.status}`)
      for (const e of r.errors) failures.push(`CRASH     ${label}: ${e}`)
      if (c && c.bodyChars < 40) failures.push(`BLANK     ${label}: ${c.bodyChars} characters of text`)
      if (c && c.overflowX > 1) failures.push(`PAGE-X    ${label}: scrolls ${c.overflowX}px sideways`)
      record.viewports[key] = {
        clipping: r.clippingCount,
        content: c ? [...new Set([norm(c.title), ...c.headings.map(norm), ...c.widgets.map(norm)])].filter(Boolean).sort() : [],
      }
      if (c) {
        for (const href of c.links) {
          const p = href.split('#')[0].split('?')[0]
          if (!seen.has(p) && !SKIP.some((re) => re.test(p))) { seen.add(p); queue.push(p) }
        }
      }
      if (previous?.pages?.[path]?.viewports?.[key]) {
        const was = previous.pages[path].viewports[key]
        const now = new Set(record.viewports[key].content)
        for (const item of was.content) if (!now.has(item)) failures.push(`CONTENT   ${label}: "${item}" is gone`)
        if (r.clippingCount > was.clipping) {
          failures.push(`CLIPPING  ${label}: ${r.clippingCount} findings, was ${was.clipping}`)
          for (const f of r.clipping.slice(0, 3)) failures.push(`            ${JSON.stringify(f).slice(0, 220)}`)
        }
      }
    }
    pages[path] = record
    process.stdout.write(`  checked ${path}\n`)
  }
  await browser.close()

  for (const path of Object.keys(previous?.pages ?? {})) {
    if (!pages[path]) failures.push(`MISSING   ${path}: on the baseline, not reached this run`)
  }

  if (UPDATE) {
    mkdirSync(dirname(SNAPSHOT), { recursive: true })
    writeFileSync(SNAPSHOT, JSON.stringify({ recordedAgainst: BASE, pages }, null, 2) + '\n')
    console.log(`\nrecorded ${Object.keys(pages).length} pages → ${SNAPSHOT}`)
    // Gate, crash and status failures are never "recordable": a baseline that
    // starts broken proves nothing.
    const hard = failures.filter((f) => !f.startsWith('CONTENT') && !f.startsWith('CLIPPING') && !f.startsWith('MISSING'))
    if (hard.length) { console.log(hard.join('\n')); process.exit(1) }
    return
  }

  console.log(`\n${Object.keys(pages).length} pages × ${VIEWPORTS.length} widths, ${GATES.length} gates`)
  if (failures.length) {
    console.log(`\n✗ ${failures.length} problem(s):\n${failures.join('\n')}`)
    process.exit(1)
  }
  console.log('✓ nothing that worked at baseline has broken')
}

main().catch((e) => { console.error(e); process.exit(1) })
