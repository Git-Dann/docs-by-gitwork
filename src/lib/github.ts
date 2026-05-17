const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_GRAPHQL = "https://api.github.com/graphql";

export class GitHubRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GitHubRequestError";
    this.code = code;
  }
}

export function githubHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim();

  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "docs-by-gitwork",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function githubRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: githubHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    const message = body || `GitHub request failed with status ${response.status}.`;

    if (response.status === 404) {
      throw new GitHubRequestError("GITHUB_NOT_FOUND", "GitHub resource not found.");
    }

    if (response.status === 403) {
      throw new GitHubRequestError(
        "GITHUB_RATE_LIMITED",
        "GitHub API is temporarily rate limited. Try again shortly or configure GITHUB_TOKEN.",
      );
    }

    throw new GitHubRequestError("GITHUB_REQUEST_FAILED", message);
  }

  return response.json() as Promise<T>;
}

export async function safeGithubRequest<T>(path: string, fallback: T): Promise<T> {
  try {
    return await githubRequest<T>(path);
  } catch {
    return fallback;
  }
}

export async function githubGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new GitHubRequestError("GITHUB_NO_TOKEN", "GITHUB_TOKEN is required for GraphQL queries.");

  const response = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "docs-by-gitwork",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GitHubRequestError("GITHUB_GRAPHQL_FAILED", `GraphQL request failed: ${response.status}`);
  }

  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new GitHubRequestError("GITHUB_GRAPHQL_ERROR", json.errors[0].message);
  }
  return json.data as T;
}

export function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\.git$/, "");

  // Handle "owner/repo" format
  const simpleMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simpleMatch) {
    return { owner: simpleMatch[1], repo: simpleMatch[2] };
  }

  // Handle full GitHub URL
  const urlMatch = cleaned.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  return null;
}
