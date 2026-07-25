// Foundry addition (not upstream bento).
//
// DECK AS A FOUNDRY DOCUMENT. Upstream's model is that the file IS the store:
// ⌘S rewrites the .html you opened. That is still true for a deck someone saved
// to disk — but a deck created in Docs is a `Document` row like any other, so it
// has to load and save through Foundry or it could never appear in the library,
// carry a document number, or belong to a client.
//
// So there are two modes, and exactly one thing decides which:
//
//   /deck?doc=<id>   DOCUMENT MODE — slides come from the API and ⌘S PUTs them
//                    back. The standalone file is an export (Save a copy).
//   /deck            FILE MODE — unchanged upstream behaviour, and what a saved
//                    deck opened from disk always gets.
//
// A saved deck therefore still works offline forever: the embedded document wins
// over this path (see main.ts), and `?doc=` cannot survive into a saved file
// because the file is opened from disk without the query string.

const DOC_PARAM = 'doc'

export interface FoundryDocRef {
  id: string
  /** Template slug to materialise when the document has no slides yet. */
  template: string | null
  title: string
}

/** The Document id this window is editing, if it was opened from Foundry. */
export function foundryDocId(): string | null {
  try {
    if (!(location.protocol === 'http:' || location.protocol === 'https:')) return null
    if (!location.pathname.startsWith('/deck')) return null
    return new URLSearchParams(location.search).get(DOC_PARAM)
  } catch {
    return null
  }
}

/**
 * Load the deck for a Foundry document. Returns the stored slide document, or
 * null slides plus the template to build from on a deck that has never been
 * opened. Throws on a real failure — the caller shows it rather than silently
 * booting an empty deck over someone's document.
 */
export async function loadFoundryDeck(id: string): Promise<{ doc: unknown | null; ref: FoundryDocRef }> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}/deck`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Could not load this deck (${res.status})`)
  const body = (await res.json()) as {
    data?: { deck?: { doc?: unknown; title?: string; template?: string | null } }
    deck?: { doc?: unknown; title?: string; template?: string | null }
  }
  const deck = body?.data?.deck ?? body?.deck
  if (!deck) throw new Error('That document did not come back as a deck')
  return {
    doc: deck.doc ?? null,
    ref: { id, template: deck.template ?? null, title: deck.title ?? 'Untitled Deck' },
  }
}

/** Save the slides back to Foundry. Resolves false when the save was rejected. */
export async function saveFoundryDeck(id: string, doc: unknown, title: string): Promise<true> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}/deck`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ doc, title }),
  })
  if (res.ok) return true
  // Surface the server's own words — the size cap in particular explains itself
  // far better than "save failed" ever could.
  let detail = `${res.status}`
  try {
    const body = (await res.json()) as { error?: string; message?: string }
    detail = body?.error ?? body?.message ?? detail
  } catch {
    /* not JSON — keep the status */
  }
  throw new Error(detail)
}
