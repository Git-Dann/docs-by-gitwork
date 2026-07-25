/**
 * Deck — slide decks authored in Deck (`/deck`).
 *
 * A deck has NO document sections: its content is the slide document, stored as
 * JSON on `Document.deckDoc`, and edited in the Deck window rather than the Docs
 * editor. This file exists because the registry is exhaustive over `DocumentType`
 * (see the recipe at the top of `index.ts`) — an empty blueprint list is the
 * correct answer here, not an oversight.
 *
 * The deck's starting content comes from the template catalogue in
 * `src/lib/deck-templates.ts`: the create flow records the chosen slug on
 * `metadata.deckTemplate`, and the Deck app materialises it on first open.
 */

import type { SectionBlueprint } from "@/lib/default-template";

export const deckSectionBlueprints: SectionBlueprint[] = [];
