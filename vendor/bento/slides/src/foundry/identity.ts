// Foundry addition (not upstream bento).
//
// WHO IS USING THIS. Upstream has no accounts: your display name is whatever you
// type into the share panel, kept in localStorage, defaulting to "Guest". Deck is
// served from Foundry behind the same session gate as /app, so it can simply ask
// who is signed in — the People list should say "Dan Lindsay · Owner", never
// "Guest".
//
// Two hard rules:
//
//  1. NEVER fetch from a saved deck. A .bento.html opened from disk (file://) or
//     re-hosted anywhere else must make ZERO external requests — that is the
//     format's contract and the reason a deck still works offline in five years.
//     We only call Foundry when the shell is being served BY Foundry, same-origin.
//  2. Never overwrite a name the person chose. We seed upstream's own
//     `deck-author` key so presence, comments and the share panel all pick the
//     name up with no further patching, but if they rename themselves we leave it
//     alone for good (we only replace a value we ourselves seeded).

export interface FoundryUser {
  name: string
  email: string
  role?: string
}

const CACHE_KEY = 'foundry.deck.user'
const SEEDED_KEY = 'foundry.deck.identity-seeded'
/** upstream's own display-name key — shared with presence + comments */
const AUTHOR_KEY = 'deck-author'

let current: FoundryUser | null = null

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage off */
  }
}

/**
 * Is this shell being served by Foundry (as opposed to a saved deck on disk)?
 * `file:`, `blob:` and `data:` are all saved-deck cases. A deck someone re-hosted
 * on another origin fails the fetch anyway (no session, no CORS) — this check just
 * means we never even try.
 */
export function servedByFoundry(): boolean {
  try {
    const web = location.protocol === 'http:' || location.protocol === 'https:'
    // …and at the path Foundry serves the shell from. A deck someone re-hosted on
    // their own web server would otherwise fire a doomed /api/account at THEIR
    // origin — a 404 in their console and a request the format promises not to
    // make. Keep this in step with the rewrite in next.config.ts.
    return web && location.pathname.startsWith('/deck')
  } catch {
    return false
  }
}

/** The Foundry user, if known. Available synchronously from cache after one load. */
export function foundryUser(): FoundryUser | null {
  if (current) return current
  const cached = read(CACHE_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as FoundryUser
      if (parsed?.name) current = parsed
    } catch {
      /* corrupt cache — ignore */
    }
  }
  return current
}

/**
 * The name to show for "you" — the signed-in Foundry user, else whatever was
 * typed here, else upstream's placeholder. One helper so the share panel, presence
 * and comments can't disagree with each other.
 */
export function authorName(fallback = 'Guest'): string {
  const typed = read(AUTHOR_KEY)?.trim()
  if (typed) return typed
  return foundryUser()?.name?.trim() || fallback
}

/** True when this name came from Foundry rather than being typed here. */
export function nameIsFromFoundry(): boolean {
  const typed = read(AUTHOR_KEY)?.trim()
  const user = foundryUser()
  return !!user?.name && (!typed || typed === read(SEEDED_KEY))
}

/**
 * Ask Foundry who is signed in and seed the display name. Fire-and-forget at
 * boot; resolves to null when we're a saved deck, when nobody is signed in, or
 * when anything at all goes wrong — the editor must never depend on this.
 */
export async function loadFoundryUser(): Promise<FoundryUser | null> {
  if (!servedByFoundry()) return null
  try {
    const res = await fetch('/api/account', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return foundryUser() // 401 when the session lapsed — keep the cache
    // GET /api/account answers `{ account: { id, email, name, role, … } }` — the
    // user is NESTED. Read the real contract from src/app/api/account/route.ts,
    // not from memory: the first cut of this read `data.name`, which is undefined,
    // so the name would have silently stayed "Guest" in production while a mocked
    // test passed. The flat fallback is belt-and-braces if that route ever changes.
    const body = (await res.json()) as {
      account?: { name?: string; email?: string; role?: string }
      name?: string
      email?: string
      role?: string
    }
    const data = body?.account ?? body
    const name = (data?.name ?? '').trim()
    if (!name) return foundryUser()
    const user: FoundryUser = { name, email: (data.email ?? '').trim(), role: data.role }
    current = user
    write(CACHE_KEY, JSON.stringify(user))
    // Seed upstream's key unless the person has typed their own name.
    const typed = read(AUTHOR_KEY)?.trim()
    const lastSeeded = read(SEEDED_KEY)
    if (!typed || typed === lastSeeded) {
      write(AUTHOR_KEY, name)
      write(SEEDED_KEY, name)
    }
    return user
  } catch {
    return foundryUser() // offline / blocked — the cached name still stands
  }
}
