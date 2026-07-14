// Smoke test for the in-app MCP handler's structural protocol bits.
// Run: npx tsx scripts/mcp-smoke.ts
//
// Covers protocol-level dispatch only — initialize, tools/list, malformed
// requests, notifications. Tool-call success paths hit the database and run
// end-to-end against a real deploy in Sitting 2's manual verification step.

import { dispatch, _testing } from "../src/server/mcp/handler";
import type { EffectiveUser } from "../src/server/auth/effective-user";

const FAKE_USER: EffectiveUser = {
  id: "cl_fake_user",
  email: "smoke@example.invalid",
  name: "Smoke Test",
  avatarUrl: null,
  role: "SUPER_ADMIN",
  permissions: [],
  workspaceId: "cl_fake_workspace",
  membershipId: "cl_fake_membership",
};

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
console.log("initialize");
{
  const res = await dispatch(FAKE_USER, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {},
  });
  check("returns response", res !== null);
  if (res && "result" in res) {
    const r = res.result as Record<string, unknown>;
    check("has protocolVersion", typeof r.protocolVersion === "string");
    check(
      "advertises tools capability",
      typeof r.capabilities === "object" && r.capabilities !== null && "tools" in r.capabilities,
    );
    const info = r.serverInfo as { name: string; version: string } | undefined;
    check("serverInfo.name = 'foundry'", info?.name === "foundry");
    check("serverInfo.version present", typeof info?.version === "string");
  } else {
    check("response is a result, not an error", false, JSON.stringify(res));
  }
}

console.log("tools/list");
{
  const res = await dispatch(FAKE_USER, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  if (res && "result" in res) {
    const tools = (res.result as { tools: Array<{ name: string; inputSchema: object }> }).tools;
    check("returns 16 tools", tools.length === 16, `got ${tools.length}`);
    const expected = [
      "list_clients",
      "create_client",
      "list_tasks",
      "get_task",
      "create_task",
      "update_task",
      "comment_task",
      "list_members",
      "whoami",
      "find_meetings",
      "create_document",
      "update_document",
      "list_documents",
      "pulse_scan",
      "pulse_scan_result",
      "list_pulse_scans",
    ];
    for (const name of expected) {
      check(`includes ${name}`, tools.some((t) => t.name === name));
    }
    check(
      "every tool has inputSchema",
      tools.every((t) => typeof t.inputSchema === "object"),
    );
  } else {
    check("tools/list returned a result", false, JSON.stringify(res));
  }
}

console.log("stripHeavyMedia (no base64 avatar bloat)");
{
  const bigDataUrl = "data:image/png;base64," + "A".repeat(100_000);
  const input = {
    tasks: [
      {
        id: "t1",
        title: "Do thing",
        assignees: [{ id: "u1", name: "Ada", avatarUrl: bigDataUrl }],
        createdBy: { id: "u2", name: "Bob", avatarUrl: bigDataUrl },
      },
    ],
    client: { name: "Acme", logoUri: bigDataUrl },
  };
  const cleaned = _testing.stripHeavyMedia(input) as typeof input;
  const serialized = JSON.stringify(cleaned);
  check("drops avatarUrl / logoUri keys", !serialized.includes("avatarUrl") && !serialized.includes("logoUri"));
  check("no base64 data: URL survives", !serialized.includes("data:image"));
  check("keeps non-media fields", cleaned.tasks[0].title === "Do thing" && cleaned.client.name === "Acme");
  check("small payload after strip", serialized.length < 1000, `got ${serialized.length}`);

  // Dates must survive (walker leaves non-plain objects alone).
  const withDate = _testing.stripHeavyMedia({ when: new Date("2026-07-14T00:00:00.000Z") }) as { when: Date };
  check("preserves Date objects", withDate.when instanceof Date);
}

console.log("notifications");
{
  const res = await dispatch(FAKE_USER, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  });
  check("notification returns null (no response)", res === null);
}

console.log("ping");
{
  const res = await dispatch(FAKE_USER, {
    jsonrpc: "2.0",
    id: 99,
    method: "ping",
    params: {},
  });
  check("ping returns empty result", !!(res && "result" in res));
}

console.log("error cases");
{
  const unknownMethod = await dispatch(FAKE_USER, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/notARealMethod",
  });
  check(
    "unknown method → error -32601",
    !!(unknownMethod && "error" in unknownMethod && unknownMethod.error.code === -32601),
  );

  const malformed = await dispatch(FAKE_USER, { not: "jsonrpc" });
  check(
    "malformed body → error -32600",
    !!(malformed && "error" in malformed && malformed.error.code === -32600),
  );

  const unknownTool = await dispatch(FAKE_USER, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "no_such_tool", arguments: {} },
  });
  check(
    "unknown tool → error -32601",
    !!(unknownTool && "error" in unknownTool && unknownTool.error.code === -32601),
  );

  const missingToolName = await dispatch(FAKE_USER, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {},
  });
  check(
    "missing tool name → error -32602",
    !!(missingToolName && "error" in missingToolName && missingToolName.error.code === -32602),
  );
}

console.log();
if (failures > 0) {
  console.log(`✗ ${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log("✓ All assertions passed.");
}
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
