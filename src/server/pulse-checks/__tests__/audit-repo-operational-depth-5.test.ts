import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import {
  OPERATIONAL_DEPTH_RULES,
  evaluateOperationalDepthChecks,
  evaluateOperationalRuleText,
} from "../operational-depth";

function snap(files: Record<string, string>, unread: string[] = []): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...unread],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const at = (checks: PulseScanCheckInput[], key: string) => {
  const check = checks.find((candidate) => candidate.checkKey === key);
  if (!check) throw new Error(`No check emitted for ${key}`);
  return check;
};

const ruleFor = (key: string) => {
  const found = OPERATIONAL_DEPTH_RULES.find((r) => r.key === key);
  if (!found) throw new Error(`No rule ${key}`);
  return found;
};

describe("audit repo-operational-depth-5: thin-sample absence is inconclusive", () => {
  const service = [
    "const organizationId = oAuthClient.organizationId;",
    "if (!organizationId) { throw new BadRequestException(); }",
  ].join("\n");

  it("does not report cross-tenant tests as missing when most source was never read", () => {
    const unread = Array.from({ length: 40 }, (_, i) => `packages/features/unread-${i}.ts`);
    const check = at(
      evaluateOperationalDepthChecks(
        snap({ "apps/api/v2/src/modules/oauth-clients/services/oauth-clients-users.service.ts": service }, unread),
      ),
      "saas_depth_tenant_isolation_tests",
    );
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.confidence).toBe("LOW");
    expect(check.detail).toMatch(/inconclusive/i);
    expect(check.detail).not.toMatch(/required safeguard was not established/);
  });

  it("still flags when the whole source was read and no cross-tenant test exists", () => {
    const check = at(
      evaluateOperationalDepthChecks(
        snap({ "apps/api/v2/src/modules/oauth-clients/services/oauth-clients-users.service.ts": service }),
      ),
      "saas_depth_tenant_isolation_tests",
    );
    expect(check.status).toBe("WARN");
    expect(check.confidence).toBe("MEDIUM");
  });
});

describe("audit repo-operational-depth-5: roles_depth_object_ownership", () => {
  it("recognises an author-ownership guard (node-express article.service.ts)", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "src/app/routes/article/article.service.ts": [
          "const existingArticle = await prisma.article.findFirst({ where: { slug }, select: { author: { select: { id: true, username: true } } } });",
          "const user = await prisma.user.findUnique({ where: { id } });",
          "if (existingArticle.author.id !== id) {",
          "  throw new HttpException(403, { message: 'You are not authorized to update this article' });",
          "}",
        ].join("\n"),
      }),
    );
    expect(at(checks, "roles_depth_object_ownership").status).toBe("PASS");
  });

  it("recognises a session-scoped authorId where clause (taxonomy posts route)", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "lib/auth.ts": "const user = await db.user.findUnique({ where: { email } })",
        "app/api/posts/[postId]/route.ts": [
          "async function verifyCurrentUserHasAccessToPost(postId: string) {",
          "  const session = await getServerSession(authOptions)",
          "  const count = await db.post.count({",
          "    where: {",
          "      id: postId,",
          "      authorId: session?.user.id,",
          "    },",
          "  })",
          "  return count > 0",
          "}",
        ].join("\n"),
      }),
    );
    expect(at(checks, "roles_depth_object_ownership").status).toBe("PASS");
  });

  it("still flags an unscoped lookup even when authorId is set on create", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "app/api/items/route.ts": [
          "const item = await db.item.findUnique({ where: { id: params.id } });",
          "await db.post.create({ data: { title, authorId: session.user.id } });",
          "return Response.json(item);",
        ].join("\n"),
      }),
    );
    expect(at(checks, "roles_depth_object_ownership").status).toBe("WARN");
  });
});

describe("audit repo-operational-depth-5: vibe_depth_environment_schema", () => {
  it("does not treat lockfile hash noise as zod validation (node-express)", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "package-lock.json":
          '{ "integrity": "sha512-YgLLKmS3aUBhHaxp5hi1WJTgOUb/NCuDHzGT9z9WTt3YG+CPRhJs6nprbStx6DnWM4dh6gt7SU3sZodbZ08adQ==" }',
        "src/app/routes/auth/auth.ts": "const auth = { required: jwt({ secret: process.env.JWT_SECRET || 'superSecret', algorithms: ['HS256'] }) };",
      }),
    );
    expect(at(checks, "vibe_depth_environment_schema").status).toBe("WARN");
  });

  it("still passes a real zod env schema (taxonomy env.mjs)", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "env.mjs": [
          'import { createEnv } from "@t3-oss/env-nextjs"',
          'import { z } from "zod"',
          "export const env = createEnv({ server: { NEXTAUTH_URL: z.string().url().optional() }, runtimeEnv: { NEXTAUTH_URL: process.env.NEXTAUTH_URL } })",
        ].join("\n"),
        "lib/db.ts": "export const db = new PrismaClient()",
      }),
    );
    expect(at(checks, "vibe_depth_environment_schema").status).toBe("PASS");
  });
});

describe("audit repo-operational-depth-5: vibe_depth_lint_not_bypassed", () => {
  const rule = ruleFor("vibe_depth_lint_not_bypassed");

  it("does not treat a line-level eslint-disable-line as a blanket bypass (cal.com)", () => {
    const text = [
      'package.json {"devDependencies":{"eslint":"^8"}}',
      "} as any); // eslint-disable-line @typescript-eslint/no-explicit-any",
    ].join("\n");
    expect(evaluateOperationalRuleText(rule, text).status).toBe("PASS");
  });

  it("still WARNs a file-scope /* eslint-disable */ (node-express e2e/jest.config.ts)", () => {
    const text = [
      'package.json {"devDependencies":{"eslint":"^8"}}',
      "/* eslint-disable */",
      "export default { displayName: 'e2e', preset: '../jest.preset.js' };",
    ].join("\n");
    expect(evaluateOperationalRuleText(rule, text).status).toBe("WARN");
  });
});

describe("audit repo-operational-depth-5: vibe_depth_no_unresolved_markers", () => {
  const httpException = [
    "class HttpException extends Error {",
    "  errorCode: number;",
    "}",
    "export default HttpException;",
  ].join("\n");

  it("ignores a TODO that exists only in a test file (node-express)", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "src/app/models/http-exception.model.ts": httpException,
        "src/tests/services/tag.service.test.ts": [
          "describe('TagService', () => {",
          "  // TODO : prismaMock.tag.groupBy.mockResolvedValue(mockedResponse) doesn't work",
          "  test.todo('should return a list of strings');",
          "});",
        ].join("\n"),
      }),
    );
    expect(at(checks, "vibe_depth_no_unresolved_markers").status).toBe("PASS");
  });

  it("still WARNs a TODO in shipped route code and cites that file (taxonomy)", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "src/tests/services/tag.service.test.ts": "// TODO : fix mock",
        "app/api/posts/[postId]/route.ts": [
          "export async function PATCH(req: Request, context: z.infer<typeof routeContextSchema>) {",
          "  // TODO: Implement sanitization for content.",
          "  await db.post.update({ where: { id: params.postId }, data: { title: body.title, content: body.content } })",
          "}",
        ].join("\n"),
      }),
    );
    const check = at(checks, "vibe_depth_no_unresolved_markers");
    expect(check.status).toBe("WARN");
    expect(check.evidence).toContain("app/api/posts/[postId]/route.ts");
  });
});

describe("audit repo-operational-depth-5: vibe_depth_ui_error_boundary", () => {
  it("skips a framework-less static page whose README merely says 'frontend' (tutorials)", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "README.md": "Locally, the frontend skips the proxy and talks straight to `agentcore dev` on `localhost:8080`.",
        "index.html": '<script>try { await fetch(url) } catch (err) { bubble.textContent = "Something went wrong. Try again in a moment."; }</script>',
        "proxy/index.mjs": "export const handler = async (event) => fetch(process.env.AGENT_URL);",
      }),
    );
    expect(at(checks, "vibe_depth_ui_error_boundary").status).toBe("SKIPPED");
  });

  it("still WARNs a Next.js app with no error boundary (taxonomy)", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "package.json": '{"dependencies":{"next": "13.3.2-canary.13", "react": "^18.2.0"}}',
        "app/(marketing)/page.tsx": 'import Link from "next/link"\nexport default async function IndexPage() { return <Link href="/login">Login</Link> }',
      }),
    );
    expect(at(checks, "vibe_depth_ui_error_boundary").status).toBe("WARN");
  });

  it("passes a Next.js app with app/error.tsx (commerce)", () => {
    const checks = evaluateOperationalDepthChecks(
      snap({
        "package.json": '{"dependencies":{"next": "15.3.0", "react": "19.0.0"}}',
        "app/error.tsx": "'use client';\nexport default function Error({ reset }: { reset: () => void }) { return <button onClick={() => reset()}>Try Again</button>; }",
      }),
    );
    expect(at(checks, "vibe_depth_ui_error_boundary").status).toBe("PASS");
  });
});
