// @vitest-environment node
/**
 * repo_secret_keys was withheld because Firebase client config files (firebase_options.dart,
 * firebase.ts) carry AIza… keys that are public by design, and every Flutter / RN / Android /
 * web Firebase app got a CRITICAL "rotate immediately". It now reads real key formats only
 * (secret-formats.ts), notes public-by-design keys without failing, drops placeholders and
 * test keys, and says INCONCLUSIVE when it could not read anything.
 *
 * Key-shaped strings are built at runtime so the source never contains a literal key
 * (GitHub push protection blocks those).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findSecrets, isPlaceholderToken } from "../secret-formats";

let files: Record<string, string | null> = {};

vi.mock("@/lib/github", () => ({
  safeGithubRequest: vi.fn(async (path: string) => {
    if (path.includes("/git/trees/")) {
      return { tree: Object.keys(files).map((p) => ({ path: p, type: "blob", size: (files[p] ?? "x").length })) };
    }
    const p = decodeURIComponent(path.match(/\/contents\/(.+)$/)?.[1] ?? "");
    const body = files[p];
    if (typeof body === "string") return { content: Buffer.from(body, "utf-8").toString("base64"), encoding: "base64" };
    return {}; // unreadable (rate limit, 404)
  }),
}));

const { scanRepoSecrets } = await import("@/server/pulse-agents/secret-scanner");
const secretCheck = async () => (await scanRepoSecrets("o", "r")).checks.find((c) => c.checkKey === "repo_secret_keys")!;

// Realistic random tails, assembled so no literal key appears in source.
const tail = (n: number) => "aB3dE5fG7hJ9kL2mN4pQ6rS8tV1wX3yZ5cD7eF9gH2jK4mP6qR8sT1uW3xY5zA7".repeat(3).slice(0, n);
const google = "AI" + "za" + "Sy" + tail(33);
const stripeLive = "sk" + "_live_" + tail(32);
const stripeTest = "sk" + "_test_" + tail(32);
const stripePub = "pk" + "_live_" + tail(32);
const openai = "sk" + "-proj-" + tail(48);
const anthropic = "sk" + "-ant-api03-" + tail(60);
const aws = "AK" + "IA" + "Q3EGRYQP5WXNZ7KD";
const github = "gh" + "p_" + tail(36);
const slack = "xo" + "xb-" + "418392057164-" + tail(24);
const sendgrid = "SG" + "." + tail(22) + "." + tail(43);
const pem = "-----BEGIN " + "RSA PRIVATE KEY-----";

describe("secret formats: real keys only", () => {
  it.each([
    ["Stripe live secret key", `const k = "${stripeLive}";`],
    ["OpenAI API key", `OPENAI = "${openai}"`],
    ["Anthropic API key", `key: '${anthropic}'`],
    ["AWS access key ID", `aws_access_key_id = ${aws}`],
    ["GitHub token", `token=${github}`],
    ["Slack token", `SLACK=${slack}`],
    ["SendGrid API key", `sg = "${sendgrid}"`],
    ["Private key block", pem],
  ])("finds a %s", (kind, line) => {
    const hits = findSecrets(line);
    expect(hits.map((h) => h.kind)).toContain(kind);
    expect(hits.find((h) => h.kind === kind)!.publicByDesign).toBe(false);
  });

  it("an OpenAI key is not ALSO reported for an Anthropic key", () => {
    expect(findSecrets(anthropic).map((h) => h.kind)).toEqual(["Anthropic API key"]);
  });

  it("marks Google browser keys and Stripe publishable keys public by design", () => {
    const hits = findSecrets(`apiKey: "${google}",\nconst p = "${stripePub}"`);
    expect(hits.every((h) => h.publicByDesign)).toBe(true);
    expect(hits.map((h) => h.kind).sort()).toEqual(["Google API key", "Stripe publishable key"]);
  });

  it("a Google key used for Gemini is a secret, not a browser key", () => {
    const [hit] = findSecrets(`const genAI = new GoogleGenerativeAI("${google}");`);
    expect(hit).toMatchObject({ kind: "Google AI (Gemini) API key", publicByDesign: false });
  });

  it.each([
    ["Stripe test key", `STRIPE=${stripeTest}`],
    ["XXXX filler", `OPENAI_API_KEY=sk-${"X".repeat(40)}`],
    ["your_ placeholder", `const key = "sk-proj-your_api_key_goes_here_123ABCdef";`],
    ["AWS documentation example", "aws_access_key_id = AKIA" + "IOSFODNN7EXAMPLE"],
    ["CSS class that starts sk-", `<div class="sk-loading-spinner-container-wrapper">`],
    ["filler", `sk-${"a".repeat(30)}`],
    ["example line", `# example: ${stripeLive}`],
  ])("ignores %s", (_name, line) => {
    expect(findSecrets(line).filter((h) => !h.publicByDesign)).toEqual([]);
  });

  it("isPlaceholderToken does not reject a real-looking key on an ordinary line", () => {
    expect(isPlaceholderToken(stripeLive, `const stripe = new Stripe("${stripeLive}");`)).toBe(false);
  });
});

describe("repo_secret_keys", () => {
  beforeEach(() => { files = {}; });

  it("does not FAIL a Flutter app's firebase_options.dart (public-by-design Google key)", async () => {
    files = {
      "lib/firebase_options.dart": `static const FirebaseOptions android = FirebaseOptions(\n  apiKey: '${google}',\n  appId: '1:123:android:abc',\n);`,
      "lib/main.dart": "void main() {}",
    };
    const c = await secretCheck();
    expect(c.status).toBe("PASS");
    expect(c.detail).toMatch(/public by design/);
    expect(c.detail).toMatch(/firebase_options\.dart/);
  });

  it("does not FAIL a web app's src/firebase.ts", async () => {
    files = { "src/firebase.ts": `export const firebaseConfig = { apiKey: "${google}", projectId: "demo-app" };` };
    expect((await secretCheck()).status).toBe("PASS");
  });

  it("still FAILs a live Stripe secret key committed in config", async () => {
    files = { "src/config.ts": `export const stripe = "${stripeLive}";` };
    const c = await secretCheck();
    expect(c.status).toBe("FAIL");
    expect(c.evidence).toContain("Stripe live secret key in src/config.ts");
  });

  it("still FAILs a Gemini key committed in server code", async () => {
    files = { "server/config.ts": `const gemini = new GoogleGenerativeAI("${google}");` };
    expect((await secretCheck()).status).toBe("FAIL");
  });

  it("is INCONCLUSIVE, not PASS, when none of the candidate files could be read", async () => {
    files = { "src/config.ts": null, "src/secrets.ts": null };
    const c = await secretCheck();
    expect(c.status).toBe("INCONCLUSIVE");
  });

  it("says how many files it read when it passes", async () => {
    files = { "src/config.ts": "export const x = 1;", "src/settings.ts": null };
    const c = await secretCheck();
    expect(c.status).toBe("PASS");
    expect(c.detail).toMatch(/1 highest-risk file Pulse read \(1 could not be read\)/);
  });
});
