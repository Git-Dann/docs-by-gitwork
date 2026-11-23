#!/usr/bin/env node
/**
 * Browser smoke tests for the signed-in app (npm run test:smoke, docs/build-checklist.md §4c).
 *
 * Loads the main /app pages as a seeded Super Admin, at 390px and 1440px, against a server running
 * on a throwaway database (scripts/smoke-db.sh seeds `foundry_smoke`). Each page must:
 *   - answer 200 and stay on its own URL (not bounced to /login or /app);
 *   - throw no uncaught error and log no console error;
 *   - not show Next's "Application error" page;
 *   - render its page header (an h1);
 *   - not scroll sideways (documentElement.scrollWidth ≤ clientWidth).
 *
 * The session is minted HERE, with the server's own AUTH_SECRET, exactly as Auth.js would sign it:
 * there is no test-only route or bypass in the app. The token carries only the seeded user's id
 * and the session version; the app's own jwt callback then reads role, permissions and workspace
 * from the database, as it does for every real session.
 *
 *   SMOKE_DATABASE_URL=… ./scripts/smoke-db.sh
 *   DATABASE_URL=… AUTH_SECRET=smoke API_KEY=smoke npx next start -p 3200   (or next dev)
 *   AUTH_SECRET=smoke node scripts/smoke.mjs --url=http://localhost:3200
 *
 * Needs playwright-core and a Chromium (CHROMIUM_PATH, else /opt/pw-browsers or the system
 * Chrome). Exit 1 on any failure.
 */

import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encode } from 'next-auth/jwt'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const BASE = (args.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3200').replace(/\/$/, '')
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1] ?? null
const SECRET = process.env.AUTH_SECRET
if (!SECRET) {
  console.error('smoke: AUTH_SECRET must be set, to the same value the server runs with.')
  process.exit(2)
}

// The seeded identity (tests/isolation/fixtures.ts, business A, which holds the Gitwork slug).
const USER = { id: 'iso-a-user', email: 'iso-a@iso-a.test', name: 'ISO-A-user', workspaceId: 'iso-a-ws' }
const CLIENT_SLUG = 'iso-a-client'

export const PAGES = [
  '/app',
  '/app/portal',
  `/app/portal/${CLIENT_SLUG}`,
  '/app/pulse',
  '/app/docs',
  '/app/care',
  '/app/monitors',
  '/app/staff',
  '/app/backstage',
  '/app/money',
]
const VIEWPORTS = [
  [390, 844],
  [1440, 900],
]
const SETTLE_MS = 1500
const PAGE_TIMEOUT_MS = 90_000

// Console lines that say nothing about the page: the browser's own noise, and requests the
// sandboxed browser makes to third parties it can't reach. A console error from the app itself
// is never on this list.
const IGNORED_CONSOLE = [
  /Download the React DevTools/,
  /net::ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_REFUSED|BLOCKED_BY_CLIENT|TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED|CERT_AUTHORITY_INVALID)/,
]

function sessionVersion() {
  const src = readFileSync(resolve(here, '../src/auth.config.ts'), 'utf8')
  const m = /export const SESSION_VERSION = (\d+);/.exec(src)
  if (!m) throw new Error('could not read SESSION_VERSION from src/auth.config.ts')
  return Number(m[1])
}

async function loadChromium() {
  const require = createRequire(import.meta.url)
  const candidates = ['playwright-core', process.env.PLAYWRIGHT_CORE_PATH, '/opt/node22/lib/node_modules/playwright'].filter(Boolean)
  for (const c of candidates) {
    try {
      return require(c).chromium
    } catch {
      // next candidate
    }
  }
  throw new Error('playwright-core not found: npm i --no-save playwright-core, or set PLAYWRIGHT_CORE_PATH')
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const versioned = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d/.test(d)).sort().reverse() : []
  const candidates = [
    `${root}/chromium`,
    ...versioned.flatMap((d) => [`${root}/${d}/chrome-linux/chrome`, `${root}/${d}/chrome-linux64/chrome`]),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('no Chromium found: set CHROMIUM_PATH')
  return found
}

async function sessionCookie() {
  const secure = BASE.startsWith('https:')
  const name = `${secure ? '__Secure-' : ''}authjs.session-token`
  const now = Math.floor(Date.now() / 1000)
  const value = await encode({
    secret: SECRET,
    salt: name,
    maxAge: 3600,
    token: {
      sub: USER.id,
      id: USER.id,
      email: USER.email,
      name: USER.name,
      // The middleware gates pages on these before the jwt callback has refreshed them from the
      // database (memberCheckedAt 0 forces that refresh on the first server read).
      role: 'SUPER_ADMIN',
      permissions: [],
      workspaceModules: null,
      workspaceId: USER.workspaceId,
      sessionVersion: sessionVersion(),
      memberCheckedAt: 0,
      iat: now,
    },
  })
  const url = new URL(BASE)
  return { name, value, domain: url.hostname, path: '/', httpOnly: true, secure, sameSite: 'Lax' }
}

async function checkPage(browser, cookie, path, [width, height]) {
  const context = await browser.newContext({ viewport: { width, height } })
  await context.addCookies([cookie])
  const page = await context.newPage()
  const problems = []
  page.on('pageerror', (err) => problems.push(`uncaught: ${String(err.message).split('\n')[0]}`))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return
    // A resource that failed to load from ANOTHER site (Google's favicon service has no icon for
    // the seed's made-up domain) says nothing about our page. One from our own server still fails.
    const url = msg.location()?.url ?? ''
    if (/^Failed to load resource/.test(text) && url && !url.startsWith(BASE)) return
    const where = msg.location()?.url ? ` (${msg.location().url.replace(BASE, '')})` : ''
    problems.push(`console: ${text.split('\n')[0].slice(0, 300)}${where}`)
  })
  try {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS })
    const status = res?.status() ?? 0
    if (status !== 200) problems.push(`answered HTTP ${status}`)
    const landed = new URL(page.url()).pathname
    if (landed !== path) problems.push(`ended up on ${landed}`)
    // The shell has two headers (phone and desktop), one hidden at each width: take the visible one.
    const h1 = page.locator('h1 >> visible=true').first()
    try {
      await h1.waitFor({ state: 'visible', timeout: 30_000 })
    } catch {
      problems.push('no page header (h1) rendered')
    }
    await page.waitForTimeout(SETTLE_MS)
    const body = await page.evaluate(() => document.body?.innerText ?? '')
    if (/Application error: a (client|server)-side exception has occurred/.test(body)) problems.push('shows "Application error"')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (overflow > 1) problems.push(`scrolls sideways by ${overflow}px`)
  } catch (err) {
    problems.push(`did not load: ${String(err.message).split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return problems
}

async function main() {
  const chromium = await loadChromium()
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
  const cookie = await sessionCookie()
  const pages = ONLY ? PAGES.filter((p) => p.startsWith(ONLY)) : PAGES
  const started = Date.now()
  let failed = 0
  try {
    for (const path of pages) {
      for (const vp of VIEWPORTS) {
        const problems = await checkPage(browser, cookie, path, vp)
        const label = `${path} @ ${vp[0]}px`
        if (problems.length) {
          failed++
          console.log(`FAIL ${label}`)
          for (const p of [...new Set(problems)]) console.log(`     ${p}`)
        } else {
          console.log(`ok   ${label}`)
        }
      }
    }
  } finally {
    await browser.close()
  }
  const secs = Math.round((Date.now() - started) / 1000)
  console.log(`\n${pages.length * VIEWPORTS.length - failed} of ${pages.length * VIEWPORTS.length} passed in ${secs}s`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
