#!/usr/bin/env node
/**
 * Pulse CI/CD gate — "prompt → production" shift-left check.
 *
 * Exits on the RELEASE DECISION, not on a score.
 *
 * This used to invent its own two rules — "any confirmed issue" and "health
 * below N" — which is how a CI gate ends up disagreeing with the report it is
 * gating. The decision now comes from the same deterministic policy engine the
 * app renders (src/server/pulse-checks/release-decision.ts), so the pipeline
 * and the human are reading one answer.
 *
 * The state worth understanding is INCONCLUSIVE: it means Pulse did not see
 * enough of the product to judge it. That is NOT a pass. A scan that verified
 * 42% of what a policy expects and found nothing wrong has found nothing, and
 * this script fails on it by default — passing it silently is the single most
 * common way an assurance tool overstates itself.
 *
 * Exit codes (any non-zero fails the build; distinct so CI can branch):
 *   0  READY, or CONDITIONAL without --strict
 *   1  BLOCKED — a confirmed, non-negotiable control is failing
 *   2  harness error (bad config, unreachable API, malformed response)
 *   3  INCONCLUSIVE — not enough evidence to decide
 *   4  CONDITIONAL under --strict, or an extra floor (--min-score) not met
 *
 * Env:
 *   PULSE_API_URL   base URL of the Pulse/Foundry app (e.g. https://foundry.gitwork.co.uk)
 *   PULSE_API_KEY   the workspace API key (sent as Authorization: Bearer)
 * Args:
 *   --url <url>            target to scan (required)
 *   --policy <id>          gate policy: launch-ready (default) · saas-production · handover
 *   --strict               also fail on CONDITIONAL
 *   --allow-inconclusive   do NOT fail on INCONCLUSIVE (read the warning above first)
 *   --min-score <0-100>    extra floor: fail if healthScore < this (default 0 = off)
 *   --fail-on-confirmed    fail on ANY confirmed issue, including ones the policy
 *                          treats as conditional (default ON; --no-fail-on-confirmed
 *                          to defer entirely to the decision)
 *   --markets <a,b>        optional jurisdiction codes (e.g. EU,US-CA)
 *   --json                 print the raw verdict instead of the human summary
 *
 * Usage:
 *   node scripts/pulse-gate.mjs --url https://staging.example.com --policy saas-production
 */

const args = process.argv.slice(2);
function flag(name) { const i = args.indexOf(`--${name}`); return i !== -1 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : undefined; }

const apiUrl = (process.env.PULSE_API_URL || "").replace(/\/$/, "");
const apiKey = process.env.PULSE_API_KEY || "";
const url = flag("url");
const policy = typeof flag("policy") === "string" ? String(flag("policy")) : undefined;
const strict = args.includes("--strict");
const allowInconclusive = args.includes("--allow-inconclusive");
const asJson = args.includes("--json");
const minScore = Number(flag("min-score") ?? 0);
const failOnConfirmed = args.includes("--no-fail-on-confirmed") ? false : true;
const markets = typeof flag("markets") === "string" ? String(flag("markets")).split(",").map((s) => s.trim()).filter(Boolean) : undefined;

if (!apiUrl || !apiKey) { console.error("✗ Set PULSE_API_URL and PULSE_API_KEY."); process.exit(2); }
if (typeof url !== "string") { console.error("✗ --url <url> is required."); process.exit(2); }

const res = await fetch(`${apiUrl}/api/agents/pulse-scan`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({ url, targetMarkets: markets, gatePolicyId: policy }),
}).catch((e) => { console.error("✗ Request failed:", e.message); process.exit(2); });

if (!res.ok) { console.error(`✗ Pulse API ${res.status}: ${await res.text().catch(() => "")}`); process.exit(2); }
const { verdict } = await res.json();

if (asJson) { console.log(JSON.stringify(verdict, null, 2)); }

const gate = verdict.gate;
if (!gate?.decision) {
  // An older deployment that predates the release decision. Refusing here is
  // deliberate: falling back to the old score rules would let this script
  // report a pass under rules the operator did not ask for.
  console.error("✗ This Pulse deployment returned no release decision. Upgrade it, or pin an older gate script.");
  process.exit(2);
}

if (!asJson) {
  console.log(`\nPulse — ${verdict.url}`);
  console.log(`  Decision: ${gate.decision}   (policy ${gate.policy.id}@${gate.policy.version})`);
  console.log(`  Health ${gate.metrics.health}/100 · coverage ${gate.metrics.coverage}%`);
  console.log(`  ${verdict.summary}`);
  const section = (title, reasons) => {
    if (!reasons?.length) return;
    console.log(`  ${title}:`);
    for (const r of reasons) console.log(`    • [${r.code}] ${r.summary}`);
  };
  section("Blocking", gate.blocking);
  section("Not established", gate.unverified);
  section("Conditions", gate.conditional);
}

// The decision decides. The flags below can only ever make the gate STRICTER —
// none of them can turn a BLOCKED or INCONCLUSIVE into a pass, because a CI
// flag should not be able to overrule the evidence.
if (gate.decision === "BLOCKED") {
  console.error(`\n✗ Gate BLOCKED — this cannot ship.\n`);
  process.exit(1);
}
if (gate.decision === "INCONCLUSIVE" && !allowInconclusive) {
  console.error(`\n✗ Gate INCONCLUSIVE — Pulse did not verify enough to say. Fix the coverage, or pass --allow-inconclusive if you accept shipping unverified.\n`);
  process.exit(3);
}

const extra = [];
if (strict && gate.decision === "CONDITIONAL") extra.push("CONDITIONAL under --strict");
if (failOnConfirmed && (verdict.confirmedIssues?.length ?? 0) > 0) extra.push(`${verdict.confirmedIssues.length} confirmed issue(s)`);
if (minScore > 0 && verdict.healthScore < minScore) extra.push(`health ${verdict.healthScore} < ${minScore}`);

if (extra.length > 0) { console.error(`\n✗ Gate FAILED: ${extra.join("; ")}\n`); process.exit(4); }
console.log(`\n✓ Gate passed (${gate.decision}).\n`);
process.exit(0);
