import { describe, expect, it } from "vitest";
import { APNS_MAX_PAYLOAD_BYTES, type ApnsPayload } from "../apns";
import { fitTitle, shrinkToFit } from "../notifications";

// ⚠️ APNs does NOT truncate an oversized payload — it refuses it with 413 and the
// notification is never delivered. The intuition runs the other way, because iOS
// visibly truncates a long alert on screen, so it is natural to assume a long body is
// simply shortened. It is not: a message long enough to be worth sending would be
// exactly the one that silently fails to arrive.
//
// Every caller currently passes a short preview, so nothing reaches this guard today.
// It exists for the day one passes a full message body instead.

const bytes = (p: ApnsPayload) => Buffer.byteLength(JSON.stringify(p), "utf8");

function payload(body: string, title = "Weekly summary"): ApnsPayload {
  return {
    aps: { alert: { title, body }, sound: "default", "thread-id": "t" },
    kind: "notification",
    path: "/app/messages/cmabc123",
  };
}

describe("oversized push payloads", () => {
  it("leaves a normal payload completely untouched", () => {
    const p = payload("A short preview of the message.");
    expect(shrinkToFit(p)).toEqual(p);
  });

  it("shrinks a full-length message body to fit", () => {
    const p = payload("x".repeat(20_000));
    expect(bytes(p)).toBeGreaterThan(APNS_MAX_PAYLOAD_BYTES);

    const fitted = shrinkToFit(p);
    expect(bytes(fitted)).toBeLessThanOrEqual(APNS_MAX_PAYLOAD_BYTES);
    // It must still say something — a payload trimmed to nothing "fits" and is useless.
    const alert = fitted.aps.alert as { body: string };
    expect(alert.body.length).toBeGreaterThan(1000);
    expect(alert.body.endsWith("…")).toBe(true);
  });

  // ⚠️ Bytes, not characters. One emoji is four bytes, so a payload well under 4096
  // CHARACTERS can be well over 4096 BYTES — counting the wrong unit passes a payload
  // Apple then rejects.
  it("measures bytes, so a wall of emoji is still trimmed to fit", () => {
    const fitted = shrinkToFit(payload("🎉".repeat(4000)));
    expect(bytes(fitted)).toBeLessThanOrEqual(APNS_MAX_PAYLOAD_BYTES);
  });

  // ⚠️ Slicing a JS string by index can cut a surrogate pair in half and produce a
  // lone surrogate, which is not valid UTF-8 and corrupts the JSON.
  // Swept across eight cut offsets rather than one, so the assertion is not hostage to
  // where a single fixture happens to land.
  //
  // ⚠️ HONESTY NOTE: this does NOT fail if `Array.from` is swapped for `split("")`,
  // which would slice by UTF-16 unit. That was tried. The reason is worth knowing:
  // `JSON.stringify` escapes a lone surrogate as `\udXXX` — six bytes where the intact
  // pair is four — so a mid-pair cut makes the candidate BIGGER, the size-driven binary
  // search rejects it, and it backs off to a clean boundary on its own. The invariant
  // below is real and worth asserting; it simply is not the thing that would catch that
  // particular regression. Do not read a pass here as proof the code-point iteration is
  // load-bearing — it is correct by construction, not by test.
  it("never splits a multi-byte character, at any cut offset",
    { timeout: 20_000 },
    () => {
      for (let pad = 0; pad < 8; pad++) {
        const body = "a".repeat(pad) + "😀".repeat(3000);
        const fitted = shrinkToFit(payload(body));
        const alert = fitted.aps.alert as { body: string };

        // A lone surrogate is a HIGH half with no low after it, or a LOW half with no
        // high before it. The obvious `[\uD800-\uDFFF]` covers BOTH halves, so it
        // matches the low half of every correctly-paired emoji — an earlier version of
        // this test failed on that, and the code was right all along.
        expect(alert.body, `pad=${pad}`).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
        expect(alert.body, `pad=${pad}`).not.toMatch(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/);

        // The invariant that actually matters: it survives a UTF-8 round trip. A split
        // pair comes back as U+FFFD and corrupts the JSON sent to Apple.
        expect(Buffer.from(alert.body, "utf8").toString("utf8"), `pad=${pad}`).toBe(alert.body);
      }
    });

  it("keeps the routing data — trimming the body must not cost the destination", () => {
    const fitted = shrinkToFit(payload("x".repeat(20_000)));
    expect(fitted.path).toBe("/app/messages/cmabc123");
    expect(fitted.kind).toBe("notification");
    expect((fitted.aps.alert as { title: string }).title).toBe("Weekly summary");
  });

  it("caps a very long title so it cannot crowd out the body", () => {
    expect(fitTitle("y".repeat(500)).length).toBeLessThanOrEqual(120);
    expect(fitTitle("Weekly summary")).toBe("Weekly summary");
  });
});
