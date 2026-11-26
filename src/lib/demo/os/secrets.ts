/**
 * Gitwork OS — the secrets. Every Easter egg is an achievement, so finding them is a
 * small game: the visitor sees "Secret 3 of 11", Notification Centre keeps score, and
 * finding all of them unlocks a reward. Pure and storage-free so it can be tested; the
 * desktop persists the set.
 */

export type SecretId =
  | "about"
  | "party"
  | "konami"
  | "ship"
  | "vibe"
  | "forcequit"
  | "trash"
  | "sudo"
  | "sleep"
  | "shutdown"
  | "notch"
  | "fineprint"
  | "lastwords";

export interface Secret {
  id: SecretId;
  title: string;
  /** Shown once found. */
  found: string;
  /** Shown before it's found, as a nudge. Never gives the answer away outright. */
  hint: string;
}

export const SECRETS: Secret[] = [
  { id: "about", title: "Under the bonnet", found: "You read the spec sheet.", hint: "Every Mac tells you what it's made of." },
  { id: "ship", title: "Shipped it", found: "Straight to production.", hint: "There's a button for the best part of the job." },
  { id: "vibe", title: "Vibe checked", found: "The last 20%, finished.", hint: "Check the vibes. Properly." },
  { id: "forcequit", title: "Habit breaker", found: "Every bad agency habit, force quit.", hint: "Some things deserve to be forced to quit. All of them." },
  { id: "trash", title: "Clean slate", found: "Emptied the bin of bad habits.", hint: "Something in the dock is full of rubbish." },
  { id: "sleep", title: "Power nap", found: "Slept, and woke up refreshed.", hint: "Even a Mac needs a rest." },
  { id: "shutdown", title: "Not today", found: "Tried to shut down before launch.", hint: "Try to leave early." },
  { id: "sudo", title: "Nice try", found: "We don't delete half-built apps.", hint: "The Terminal has opinions about deleting things." },
  { id: "notch", title: "Watched it ship", found: "Saw the last 20% go live.", hint: "Keep an eye on the notch." },
  { id: "fineprint", title: "Read the fine print", found: "Found the invisible P.S. in the README.", hint: "Not everything in the README is visible. Select it." },
  { id: "lastwords", title: "Famous last words", found: "Wrote a developer classic in your notes.", hint: "Your notes have opinions about famous last words." },
  { id: "party", title: "Party animal", found: "Found party mode.", hint: "The G. doesn't like being clicked. Repeatedly." },
  { id: "konami", title: "Old school", found: "↑ ↑ ↓ ↓ ← → ← → B A", hint: "A code older than most frameworks." },
];

export const SECRET_COUNT = SECRETS.length;

export function secretById(id: SecretId): Secret {
  return SECRETS.find((s) => s.id === id)!;
}

/** Add a secret. Returns the new list and whether it was new; never duplicates. */
export function unlockSecret(found: readonly SecretId[], id: SecretId): { found: SecretId[]; isNew: boolean; complete: boolean } {
  if (found.includes(id)) return { found: [...found], isNew: false, complete: found.length >= SECRET_COUNT };
  const next = [...found, id];
  return { found: next, isNew: true, complete: next.length >= SECRET_COUNT };
}

/** Read a stored list back, dropping anything that isn't a known secret. */
export function parseSecrets(raw: unknown): SecretId[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(SECRETS.map((s) => s.id));
  return [...new Set(raw.filter((x): x is SecretId => typeof x === "string" && known.has(x as SecretId)))];
}

/** The next unfound secret's hint, in list order, or null when all are found. */
export function nextHint(found: readonly SecretId[]): string | null {
  return SECRETS.find((s) => !found.includes(s.id))?.hint ?? null;
}

/**
 * Famous last words: typed into the Notes scratchpad, each earns a reply. Matched as a
 * case-insensitive phrase so "It works on my machine!!" still counts.
 */
export const LAST_WORDS: { match: RegExp; reply: string }[] = [
  { match: /works on my machine/i, reply: "Then we'll ship your machine. (We'd rather ship your app.)" },
  { match: /fix (it )?later/i, reply: "Later is a lovely place. Nothing has ever shipped from there." },
  { match: /just one more feature/i, reply: "That's what the last feature said." },
  { match: /basically done/i, reply: "The last 20% would like a word." },
  { match: /\bno tests\b/i, reply: "Bold. We admire it from a safe distance." },
  { match: /vibe[- ]?cod/i, reply: "Vibes got you this far. Engineers get you live." },
  { match: /deploy(ing)? on (a )?friday|friday deploy/i, reply: "Brave. We'll put the kettle on." },
  { match: /lorem ipsum/i, reply: "Your users don't read Latin either." },
  { match: /todo/i, reply: "A TODO is a promise to someone you'll never meet." },
  { match: /\bmvp\b.*(next week|tomorrow)/i, reply: "Ambitious. MVP Sprint is 4 to 6 weeks, and it ships." },
];

/** The reply for the last phrase in some text, or null. Ignores phrases already answered. */
export function lastWordsReply(text: string, answered: ReadonlySet<string> = new Set()): { key: string; reply: string } | null {
  for (const w of LAST_WORDS) {
    const key = w.match.source;
    if (!answered.has(key) && w.match.test(text)) return { key, reply: w.reply };
  }
  return null;
}
