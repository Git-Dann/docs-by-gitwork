import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every query that LISTS or COUNTS workspace members must decide what to do with
 * archived members — exclude them (`...ACTIVE_MEMBER`) or say in writing why it
 * needs them (`// includes-archived: <reason>`).
 *
 * ⚠️ This is the only thing that keeps a leaver out of Foundry's rosters. When
 * archiving landed there were thirty-one such queries across twenty-two files —
 * assignee pickers, standups, @mentions, Care assignees, and the fan-outs that
 * email people, push to their phones and read their Google Drive with a stored
 * refresh token. Missing one does not fail loudly; a person who left just keeps
 * getting notified about client work. Hand-patching and hoping is how that ships.
 */

const ROOT = join(process.cwd(), "src");
const QUERY = /prisma\.workspaceMember\.(findMany|count)\(/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

interface Site {
  file: string;
  line: number;
  decided: boolean;
}

function sites(): Site[] {
  const found: Site[] = [];
  for (const file of walk(ROOT)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(QUERY)) {
      const at = m.index ?? 0;
      const line = src.slice(0, at).split("\n").length;
      // The query's own argument object, up to its closing `})`.
      const body = src.slice(at, src.indexOf("})", at) + 2);
      // A reason comment in the few lines above the call.
      const above = src.slice(0, at).split("\n").slice(-6).join("\n");
      found.push({
        file: relative(process.cwd(), file),
        line,
        decided: /\.\.\.ACTIVE_MEMBER/.test(body) || /includes-archived:/.test(above),
      });
    }
  }
  return found;
}

describe("every member roster decides what to do with archived members", () => {
  const all = sites();

  it("finds the rosters at all, so a broken matcher cannot report a clean sweep", () => {
    // Without this, a regex that matched nothing would pass the test below forever.
    expect(all.length).toBeGreaterThanOrEqual(30);
  });

  it("each one either excludes archived members or says why it needs them", () => {
    const undecided = all.filter((s) => !s.decided).map((s) => `${s.file}:${s.line}`);
    expect(
      undecided,
      `Add \`...ACTIVE_MEMBER\` to the where, or a \`// includes-archived: <reason>\` comment above:\n${undecided.join("\n")}`,
    ).toEqual([]);
  });

  it("the fan-outs that reach a person outside Foundry are active-only", () => {
    // These are the ones where a miss is a data leak rather than a cosmetic bug:
    // a notification, an email or a push to someone who no longer works here, or
    // their stored Google token still being used to read their Drive.
    for (const file of [
      "src/server/notifications.ts",
      "src/server/email.ts",
      "src/server/push/devices.ts",
      "src/app/api/cron/meet-transcripts/route.ts",
      "src/server/backstage-gcal.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const queries = [...src.matchAll(QUERY)].length;
      const active = [...src.matchAll(/\.\.\.ACTIVE_MEMBER/g)].length;
      expect(active, file).toBeGreaterThanOrEqual(queries);
    }
  });
});
