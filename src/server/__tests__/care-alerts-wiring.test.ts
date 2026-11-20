import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (f: string) => stripComments(readFileSync(join(process.cwd(), f), "utf8"));

/**
 * The two alerts Care should always have had, and the digest that reported the wrong number.
 *
 * Asserted on shape rather than by running: each is a `void`-returning dispatch buried in a sync
 * pass or a worker tick, and mocking Prisma and the dispatcher deeply enough to drive them would
 * be testing the mock. What matters is that the wiring that was missing cannot go missing again.
 */

describe("the connector transition finally fires something", () => {
  const sync = read("src/server/support-sync.ts");

  it("syncConnection acts on justFailed / justRecovered", () => {
    /*
     * `ff19f83` computed both on every sync and DISCARDED them — the latch was armed and
     * persisted and nothing ever fired on it, so a connector went red on a screen and told
     * nobody. The transition IS the once-per-outage guarantee; there is no second latch.
     */
    expect(sync).toContain("outcome.justFailed || outcome.justRecovered");
    expect(sync).toContain("notifyConnectorHealth");
  });

  it("the alert names the channel, not just the client", () => {
    // "A channel has stopped delivering" is unactionable on a client with three connectors.
    expect(sync).toMatch(/label: ctx\.connection\.label/);
  });
});

describe("the wait alert runs often enough to mean anything", () => {
  it("rides the every-minute worker, not the daily digest cron", () => {
    /*
     * The threshold is 24 hours. On the 10:00 digest cron the alert would routinely arrive when
     * the wait was already two days old, which is exactly the uselessness it exists to end.
     */
    const jobs = read("src/app/api/cron/jobs/route.ts");
    expect(jobs).toContain("runDueCareWaitAlerts");
    const crontab = readFileSync(join(process.cwd(), "deploy/crontab"), "utf8");
    expect(crontab.split("\n").find((l) => l.includes("run-cron.sh jobs"))?.startsWith("* * * * *")).toBe(true);
  });

  it("needs no crontab line of its own", () => {
    const crontab = readFileSync(join(process.cwd(), "deploy/crontab"), "utf8");
    expect(crontab).not.toContain("care-wait");
    expect(crontab).not.toContain("care-alerts");
  });

  it("the latch is written after the dispatch, and cleared when the desk catches up", () => {
    const src = read("src/server/care-alerts.ts");
    const body = src.split("export async function runCareWaitAlerts")[1];
    /*
     * ⚠️ Against the WRITE, not the first mention: `waitAlertedAt` appears in the `select` above
     * the dispatch, so a bare indexOf matched that and failed on correct code. Latching before
     * the send would lose the alert outright if the send failed, which is the failure that
     * matters — `wedge-course-feed-alert.ts` makes the same ordering explicit.
     */
    const write = 'waitAlertedAt: alert.kind === "waiting_too_long" ? now : null';
    expect(body).toContain(write);
    expect(body.indexOf("dispatchNotification")).toBeLessThan(body.indexOf(write));
  });

  it("alerts whoever may run Care, not every admin", () => {
    const src = read("src/server/care-alerts.ts");
    expect(src).toContain('permission: "support.manage"');
  });
});

describe("the digest reports the number a person would act on", () => {
  const digest = read("src/server/support-notify.ts");

  it("counts awaiting, not every open conversation", () => {
    /*
     * It counted `status: { in: ["NEW","OPEN"] }` and called it "conversations needing action" —
     * the pre-§42.4 metric, with no wait dimension at all. An open conversation answered
     * yesterday is not work.
     */
    expect(digest).not.toMatch(/status: \{ in: \["NEW", ?"OPEN"\] \}/);
    expect(digest).not.toContain("needing action");
    expect(digest).toContain("getClientQueueSummaries");
    expect(digest).toContain("waiting on a reply");
  });

  it("is silent on a clear morning, on the right metric", () => {
    // The early return moved from "nothing is open" — almost never true, and never meaningful —
    // to "nobody is waiting and nothing is broken".
    expect(digest).not.toContain("totalOpen === 0");
    expect(digest).toContain("totalAwaiting === 0 && broken.length === 0");
  });

  it("names a client whose channel has stopped delivering", () => {
    // Their queue reads calm whether or not it is, and a morning digest is where someone looks.
    expect(digest).toContain("connectorsFailing");
  });

  it("keeps the channel key someone has already configured", () => {
    // Renaming it to a declared notification event would orphan the existing route.
    expect(digest).toContain('routes["care.digest"]');
  });
});

describe("there is one threshold and one age format", () => {
  it("care-constants re-exports them rather than declaring its own", () => {
    /*
     * The alerts run on a cron path and `care-constants.tsx` imports Heroicons and JSX, so the
     * server cannot reach into it — which is how a screen and an alert come to disagree about
     * what "too long" means.
     */
    const constants = read("src/components/care/care-constants.tsx");
    expect(constants).toContain('export { LONG_WAIT_HOURS, isLongWait } from "@/lib/care-alerts"');
    expect(constants).toContain('export { formatAge, formatWhen } from "@/lib/care-alerts"');
    expect(constants).not.toMatch(/export const LONG_WAIT_HOURS = /);
    expect(constants).not.toMatch(/export function formatAge\(/);
  });

  it("the pure module imports no React", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/care-alerts.ts"), "utf8");
    expect(src).not.toMatch(/from "react"/);
    expect(src).not.toMatch(/@heroicons/);
  });
});
