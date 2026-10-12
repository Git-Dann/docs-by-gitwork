import { describe, expect, it } from "vitest";
import { z } from "zod";
import { REQUEST_MAX_TITLE, fitRequestTitle } from "@/lib/wiki-request-title";
import { IMPORT_MAX_TITLE } from "@/lib/wiki-intake-import-limits";
import { describeValidation } from "@/lib/api-response";

// Verbatim: the note Javed tried to log on PollenIQ's wiki (Slack, 9 Oct 2026). Every
// attempt failed with a bare "Validation failed" because it is 258 characters long.
const JAVED =
  "We need to ensure that time zones are handled consistently and accurately between the sensor and the platform.  Ideally, we should update the sensors so that all logs present data in the same time zone as the platform.  That way we would avoid any confusion.";

// The same rule every route applies to a title.
const titleSchema = z.string().trim().min(1).max(REQUEST_MAX_TITLE);

describe("fitRequestTitle", () => {
  it("the real request that failed now produces a title the routes accept", () => {
    expect(JAVED.length).toBeGreaterThan(REQUEST_MAX_TITLE);
    expect(titleSchema.safeParse(JAVED).success).toBe(false); // the bug, reproduced

    const fitted = fitRequestTitle(JAVED, null);
    expect(titleSchema.safeParse(fitted.title).success).toBe(true);
    expect(fitted.title).toBe(
      "We need to ensure that time zones are handled consistently and accurately between the sensor and the platform.",
    );
    expect(fitted.moved).toBe(true);
  });

  it("loses nothing — the full text leads the description, then what they wrote there", () => {
    const fitted = fitRequestTitle(JAVED, "  Seen on the Leeds sensor.  ");
    expect(fitted.description).toBe(`${JAVED}\n\nSeen on the Leeds sensor.`);
  });

  it("leaves a title that fits exactly as it is", () => {
    const fitted = fitRequestTitle("  Exit counts are an hour out  ", "  ");
    expect(fitted).toEqual({ title: "Exit counts are an hour out", description: null, moved: false });
    const edge = "x".repeat(REQUEST_MAX_TITLE);
    expect(fitRequestTitle(edge).title).toBe(edge);
  });

  it("with no usable first sentence, cuts at a word boundary and marks the cut", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const fitted = fitRequestTitle(words);
    expect(fitted.title.length).toBeLessThanOrEqual(REQUEST_MAX_TITLE);
    expect(fitted.title.endsWith("…")).toBe(true);
    expect(words.startsWith(fitted.title.slice(0, -1))).toBe(true);
    expect(fitted.title.slice(0, -1)).toMatch(/word\d+$/); // not mid-word
    expect(fitted.description).toBe(words);
  });

  it("does not use a first 'sentence' too thin to be a title", () => {
    const text = `Hi. ${"the sensor double counts every exit ".repeat(8)}`;
    expect(fitRequestTitle(text).title.startsWith("Hi. the sensor")).toBe(true);
  });

  it("the importer and the add form share one limit", () => {
    expect(IMPORT_MAX_TITLE).toBe(REQUEST_MAX_TITLE);
  });
});

describe("describeValidation", () => {
  it("names the field and the reason instead of the bare words", () => {
    const result = z.object({ title: titleSchema }).safeParse({ title: JAVED });
    expect(result.success).toBe(false);
    const message = describeValidation(result.error!);
    expect(message.startsWith("Validation failed: title — ")).toBe(true);
    expect(message).toContain(String(REQUEST_MAX_TITLE));
  });
});
