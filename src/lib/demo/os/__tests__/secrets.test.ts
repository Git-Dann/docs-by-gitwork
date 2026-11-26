import { describe, expect, it } from "vitest";
import { SECRETS, SECRET_COUNT, nextHint, parseSecrets, unlockSecret } from "../secrets";

describe("secrets", () => {
  it("ids are unique and every secret has a title, a found line and a hint", () => {
    const ids = SECRETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SECRETS) expect(s.title && s.found && s.hint, s.id).toBeTruthy();
  });

  it("unlocks once, never duplicates, and knows when all are found", () => {
    let r = unlockSecret([], "about");
    expect(r).toMatchObject({ found: ["about"], isNew: true, complete: false });
    r = unlockSecret(r.found, "about");
    expect(r.isNew).toBe(false);
    expect(r.found).toEqual(["about"]);
    let all: ReturnType<typeof unlockSecret>["found"] = [];
    let last = r;
    for (const s of SECRETS) {
      last = unlockSecret(all, s.id);
      all = last.found;
    }
    expect(all).toHaveLength(SECRET_COUNT);
    expect(last.complete).toBe(true);
  });

  it("reads a stored list defensively", () => {
    expect(parseSecrets("nope")).toEqual([]);
    expect(parseSecrets(["about", "hacker", 3, "about", "ship"])).toEqual(["about", "ship"]);
  });

  it("hints at the next unfound secret, and stops when there are none", () => {
    expect(nextHint([])).toBe(SECRETS[0].hint);
    expect(nextHint([SECRETS[0].id])).toBe(SECRETS[1].hint);
    expect(nextHint(SECRETS.map((s) => s.id))).toBeNull();
  });
});

import { LAST_WORDS, lastWordsReply } from "../secrets";

describe("famous last words", () => {
  it("answers a classic, whatever the case or punctuation", () => {
    expect(lastWordsReply("Honestly it WORKS ON MY MACHINE!!")?.reply).toMatch(/ship your machine/);
    expect(lastWordsReply("we'll fix it later")?.reply).toMatch(/Later/);
  });

  it("answers each phrase once, then moves on", () => {
    const first = lastWordsReply("works on my machine, fix later")!;
    const second = lastWordsReply("works on my machine, fix later", new Set([first.key]))!;
    expect(second.key).not.toBe(first.key);
  });

  it("stays quiet on ordinary notes", () => {
    expect(lastWordsReply("We need Stripe and a login page by March.")).toBeNull();
  });

  it("every reply is unique", () => {
    expect(new Set(LAST_WORDS.map((w) => w.reply)).size).toBe(LAST_WORDS.length);
  });
});
