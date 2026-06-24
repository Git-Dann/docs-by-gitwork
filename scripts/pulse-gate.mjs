#!/usr/bin/env node
/**
 * Pulse CI/CD gate — "prompt → production" shift-left check.
 *
 * Runs a Pulse scan via the authenticated agent endpoint and exits non-zero when the
 * build shouldn't ship: a CONFIRMED issue is present, or the health score is below a
 * threshold. Drop it into any CI pipeline (see docs/pulse-ci.md).
 *
 * Env:
 *   PULSE_API_URL   base URL of the Pulse/Foundry app (e.g. https://foundry.gitwork.co.uk)
 *   PULSE_API_KEY   the workspace API key (sent as Authorization: Bearer)
 * Args:
 *   --url <url>            target to scan (required)
 *   --min-score <0-100>    fail if healthScore < this (default 0 = off)
 *   --fail-on-confirmed    fail if any CONFIRMED issue exists (default ON; --no-fail-on-confirmed to disable)
 *   --markets <a,b>        optional jurisdiction codes (e.g. EU,US-CA)
 *
 * Usage:
 *   node scripts/pulse-gate.mjs --url https://staging.example.com --min-score 70
 */

const args = process.argv.slice(2);
function flag(name) { const i = args.indexOf(`--${name}`); return i !== -1 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : undefined; }

const apiUrl = (process.env.PULSE_API_URL || "").replace(/\/$/, "");
const apiKey = process.env.PULSE_API_KEY || "";
const url = flag("url");
const minScore = Number(flag("min-score") ?? 0);
const failOnConfirmed = args.includes("--no-fail-on-confirmed") ? false : true;
const markets = typeof flag("markets") === "string" ? String(flag("markets")).split(",").map((s) => s.trim()).filter(Boolean) : undefined;

if (!apiUrl || !apiKey) { console.error("✗ Set PULSE_API_URL and PULSE_API_KEY."); process.exit(2); }
if (typeof url !== "string") { console.error("✗ --url <url> is required."); process.exit(2); }

const res = await fetch(`${apiUrl}/api/agents/pulse-scan`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({ url, targetMarkets: markets }),
}).catch((e) => { console.error("✗ Request failed:", e.message); process.exit(2); });

if (!res.ok) { console.error(`✗ Pulse API ${res.status}: ${await res.text().catch(() => "")}`); process.exit(2); }
const { verdict } = await res.json();

console.log(`\nPulse — ${verdict.url}`);
console.log(`  Health: ${verdict.healthScore}/100`);
console.log(`  ${verdict.summary}`);
if (verdict.confirmedIssues?.length) {
  console.log(`  Confirmed issues:`);
  for (const i of verdict.confirmedIssues) console.log(`    • [${i.category}] ${i.label}`);
}

const reasons = [];
if (failOnConfirmed && (verdict.confirmedIssues?.length ?? 0) > 0) reasons.push(`${verdict.confirmedIssues.length} confirmed issue(s)`);
if (minScore > 0 && verdict.healthScore < minScore) reasons.push(`health ${verdict.healthScore} < ${minScore}`);
if (verdict.status === "FAILED") reasons.push("scan failed");

if (reasons.length > 0) { console.error(`\n✗ Gate FAILED: ${reasons.join("; ")}\n`); process.exit(1); }
console.log(`\n✓ Gate passed.\n`);
process.exit(0);
