// Smoke test for the pure (non-DB) bits of src/server/oauth.ts.
// Run: npx tsx scripts/oauth-smoke.ts
//
// Exits 0 on success, 1 on any assertion failure. Touches no database.

import { createHash, randomBytes } from "node:crypto";
import { verifyPkce, parseScope, formatScope, _testing } from "../src/server/oauth";

let failures = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("PKCE S256");
{
  const verifier = randomBytes(48).toString("base64url"); // valid: 64 chars in unreserved set
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  check("valid verifier passes", verifyPkce(verifier, challenge, "S256"));
  check("wrong verifier rejected", !verifyPkce("a".repeat(50), challenge, "S256"));
  check("plain method rejected", !verifyPkce(verifier, challenge, "plain"));
  check("short verifier rejected", !verifyPkce("a".repeat(10), challenge, "S256"));
  check("long verifier rejected", !verifyPkce("a".repeat(200), challenge, "S256"));
  check(
    "verifier with bad chars rejected",
    !verifyPkce("invalid+chars/here" + "a".repeat(40), challenge, "S256"),
  );
}

console.log("Scope parsing");
{
  check("empty defaults to mcp", JSON.stringify(parseScope("")) === '["mcp"]');
  check("null defaults to mcp", JSON.stringify(parseScope(null)) === '["mcp"]');
  check("'mcp' parsed", JSON.stringify(parseScope("mcp")) === '["mcp"]');
  check(
    "unknown scope dropped, falls back",
    JSON.stringify(parseScope("nope")) === '["mcp"]',
  );
  check("dedup", JSON.stringify(parseScope("mcp mcp")) === '["mcp"]');
  check(
    "formatScope roundtrip",
    formatScope(parseScope("mcp")) === "mcp",
  );
}

console.log("Token generation + hashing");
{
  const tok = _testing.randomToken("foundry_at_");
  check("prefix preserved", tok.startsWith("foundry_at_"));
  check("base64url-safe body", /^foundry_at_[A-Za-z0-9_-]+$/.test(tok));
  const hashA = _testing.sha256Hex(tok);
  const hashB = _testing.sha256Hex(tok);
  check("hash is deterministic", hashA === hashB);
  check("hash is 64 hex chars", /^[0-9a-f]{64}$/.test(hashA));
  const otherHash = _testing.sha256Hex(_testing.randomToken("foundry_at_"));
  check("different tokens hash differently", hashA !== otherHash);
}

console.log();
if (failures > 0) {
  console.log(`✗ ${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log("✓ All assertions passed.");
}
