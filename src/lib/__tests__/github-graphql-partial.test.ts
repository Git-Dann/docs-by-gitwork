import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { githubGraphQL, GitHubRequestError } from "../github";

// WHY THIS FILE EXISTS.
//
// GraphQL is partial-success by design: when a token lacks the permission for ONE
// field, GitHub answers HTTP 200 with that field `null`, an entry in `errors`, and
// perfectly good data for everything else. githubGraphQL used to throw on any
// `errors` entry, so the whole response was discarded — and because runCodeAgent
// catches that into `checks: []`, a token that could not read `vulnerabilityAlerts`
// (needs Dependabot alerts: read) or `branchProtectionRules` (needs
// administration: read) silently produced ZERO code-agent checks.
//
// Measured on two real client repos: 39 iOS and 21 Flutter checks, every one
// missing, while the scan still reported a plausible score. No error surfaced
// anywhere. That is the failure mode these tests exist to prevent.

const OK_HEADERS = { "Content-Type": "application/json" };

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(OK_HEADERS),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("githubGraphQL partial-error handling", () => {
  const originalToken = process.env.GITHUB_TOKEN;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = "github_pat_test";
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  });

  it("returns the usable data when only some fields errored", async () => {
    // The exact shape GitHub sends a fine-grained PAT without Dependabot/admin read.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          data: {
            repository: {
              vulnerabilityAlerts: null,
              branchProtectionRules: null,
              stargazerCount: 4,
              isArchived: false,
              primaryLanguage: { name: "Swift" },
            },
          },
          errors: [
            {
              type: "FORBIDDEN",
              path: ["repository", "vulnerabilityAlerts"],
              message: "Resource not accessible by personal access token",
            },
            {
              type: "FORBIDDEN",
              path: ["repository", "branchProtectionRules"],
              message: "Resource not accessible by personal access token",
            },
          ],
        }),
      ),
    );

    const data = await githubGraphQL<{
      repository: { stargazerCount: number; primaryLanguage: { name: string } | null };
    }>("query {}", {});

    // The whole point: the fields that DID resolve must survive.
    expect(data.repository.stargazerCount).toBe(4);
    expect(data.repository.primaryLanguage?.name).toBe("Swift");
  });

  it("names the unreadable fields in a warning rather than failing silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          data: { repository: { stargazerCount: 1 } },
          errors: [
            { type: "FORBIDDEN", path: ["repository", "vulnerabilityAlerts"], message: "nope" },
          ],
        }),
      ),
    );

    await githubGraphQL("query {}", {});

    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("repository.vulnerabilityAlerts");
    expect(logged).toContain("partial");
  });

  it("still throws when there is nothing usable to return", async () => {
    // A repo the token cannot see at all: `repository` itself is null. This must
    // remain an error — it is genuinely "we could not look", not partial success.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          data: { repository: null },
          errors: [{ type: "NOT_FOUND", path: ["repository"], message: "Could not resolve to a Repository" }],
        }),
      ),
    );

    await expect(githubGraphQL("query {}", {})).rejects.toThrow(GitHubRequestError);
  });

  it("throws when the response carries no data key at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ errors: [{ message: "Bad credentials" }] })),
    );

    await expect(githubGraphQL("query {}", {})).rejects.toThrow(/Bad credentials/);
  });

  it("returns data untouched when there are no errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ data: { repository: { stargazerCount: 9 } } })),
    );

    const data = await githubGraphQL<{ repository: { stargazerCount: number } }>("query {}", {});
    expect(data.repository.stargazerCount).toBe(9);
    expect(warn).not.toHaveBeenCalled();
  });

  it("requires a token before making any request", async () => {
    delete process.env.GITHUB_TOKEN;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(githubGraphQL("query {}", {})).rejects.toThrow(/GITHUB_TOKEN is required/);
    expect(fetchSpy, "must not call GitHub without a token").not.toHaveBeenCalled();
  });
});
