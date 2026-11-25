import { describe, expect, it } from "vitest";
import { cleanRef, cleanRepoPath, contentsPath, isSensitivePath, numberedLines, pickRepo, repoChoices } from "../code";
import { cleanNodeId, designChoices, frameText, imageScale, listFrames, parseFigmaUrl, pickDesign, type FigmaNode } from "../figma";
import { checkAttachments, imageMediaType } from "../images";
import { IMAGE_TOKENS, roughTokens } from "../limits";

describe("code: which repositories", () => {
  const choices = repoChoices([
    { name: "iOS app", repoUrl: "https://github.com/gitwork/wedge-ios" },
    { name: "Backend", repoUrl: "git@github.com:gitwork/wedge-api.git" },
    { name: "Dup", repoUrl: "github.com/gitwork/wedge-ios" },
    { name: "Not GitHub", repoUrl: "https://gitlab.com/x/y" },
    { name: "None", repoUrl: null },
  ]);

  it("takes only this client's GitHub repos, once each", () => {
    expect(choices.map((c) => `${c.owner}/${c.repo}`)).toEqual(["gitwork/wedge-ios", "gitwork/wedge-api"]);
  });

  it("asks which when there are several, and matches by owner/repo, name or platform", () => {
    expect(pickRepo(choices, undefined)).toMatch(/2 repositories/);
    expect(pickRepo(choices, "gitwork/wedge-api")).toMatchObject({ repo: "wedge-api" });
    expect(pickRepo(choices, "wedge-ios")).toMatchObject({ repo: "wedge-ios" });
    expect(pickRepo(choices, "Backend")).toMatchObject({ repo: "wedge-api" });
    expect(pickRepo(choices, "https://github.com/gitwork/wedge-ios")).toMatchObject({ repo: "wedge-ios" });
  });

  it("refuses a repository that isn't linked to the client, whatever is asked", () => {
    expect(typeof pickRepo(choices, "gitwork/other-client")).toBe("string");
    expect(typeof pickRepo(choices, "other-org/wedge-ios")).toBe("string");
    expect(pickRepo([], undefined)).toMatch(/no GitHub repository/);
  });
});

describe("code: secret files and paths", () => {
  it.each([".env", "apps/web/.env.production", "certs/push.p12", "ios/AuthKey_ABC.p8", "id_rsa", ".npmrc", "config/credentials.yml", "android/app/google-services.json", "ios/GoogleService-Info.plist", "infra/terraform.tfstate", "keys/service-account-prod.json"])(
    "never reads %s",
    (p) => expect(isSensitivePath(p)).toBe(true),
  );
  it.each(["src/env.ts", "README.md", "src/keyboard.ts", "app/Secrets/SecretsView.swift"])("reads %s", (p) => expect(isSensitivePath(p)).toBe(false));

  it("refuses paths that climb out", () => {
    expect(cleanRepoPath("../etc/passwd")).toBeNull();
    expect(cleanRepoPath("src/../../x")).toBeNull();
    expect(cleanRepoPath("/src/app/")).toBe("src/app");
    expect(cleanRef("main")).toBe("main");
    expect(cleanRef("main..evil")).toBeNull();
    expect(cleanRef("a b")).toBeNull();
  });

  it("encodes each path segment for the contents API", () => {
    expect(contentsPath({ platform: "x", owner: "o", repo: "r" }, "src/My File.ts")).toBe("/repos/o/r/contents/src/My%20File.ts");
  });

  it("numbers lines, honours the range, and says where to continue", () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    expect(numberedLines(text, 3, 4).text).toBe("3  line 3\n4  line 4\n");
    const cut = numberedLines(text, 1, undefined, 60);
    expect(cut.more).toBeGreaterThan(1);
    expect(cut.total).toBe(100);
  });
});

describe("figma: which designs", () => {
  it("reads file keys and node ids from every link shape", () => {
    expect(parseFigmaUrl("https://www.figma.com/design/AbCdEf1234567890/Wedge?node-id=12-34")).toEqual({ fileKey: "AbCdEf1234567890", nodeId: "12:34" });
    expect(parseFigmaUrl("https://figma.com/file/AbCdEf1234567890/x")).toEqual({ fileKey: "AbCdEf1234567890", nodeId: null });
    expect(parseFigmaUrl("https://evil.com/design/AbCdEf1234567890/x")).toBeNull();
    expect(parseFigmaUrl("https://figma.com.evil.com/design/AbCdEf1234567890/x")).toBeNull();
    expect(parseFigmaUrl("not a url")).toBeNull();
  });

  const choices = designChoices([
    { name: "App screens", url: "https://www.figma.com/design/AAAAAAAAAAAAAAAA/App" },
    { name: "Brand", url: "https://www.figma.com/design/BBBBBBBBBBBBBBBB/Brand" },
    { name: "PDF", url: "https://drive.google.com/x" },
  ]);

  it("refuses a Figma file that isn't one of the client's designs", () => {
    expect(choices).toHaveLength(2);
    expect(pickDesign(choices, "App screens")).toMatchObject({ fileKey: "AAAAAAAAAAAAAAAA" });
    expect(pickDesign(choices, "https://www.figma.com/design/BBBBBBBBBBBBBBBB/whatever")).toMatchObject({ name: "Brand" });
    expect(typeof pickDesign(choices, "https://www.figma.com/design/ZZZZZZZZZZZZZZZZ/other")).toBe("string");
    expect(pickDesign(choices, undefined)).toMatch(/2 Figma designs/);
    expect(cleanNodeId("12-34")).toBe("12:34");
    expect(cleanNodeId("12:34; drop")).toBeNull();
  });

  const doc: FigmaNode = {
    id: "0:0",
    name: "Doc",
    type: "DOCUMENT",
    children: [
      {
        id: "0:1",
        name: "Page 1",
        type: "CANVAS",
        children: [
          {
            id: "1:2",
            name: "Login",
            type: "FRAME",
            absoluteBoundingBox: { width: 390, height: 844 },
            children: [
              { id: "1:3", name: "Title", type: "TEXT", characters: "Welcome back" },
              { id: "1:4", name: "Hidden", type: "TEXT", characters: "secret draft", visible: false },
              { id: "1:5", name: "Sign in", type: "TEXT", characters: "Sign in" },
            ],
          },
          { id: "1:9", name: "a vector", type: "VECTOR" },
        ],
      },
    ],
  };

  it("lists frames and reads visible words only", () => {
    expect(listFrames(doc)).toEqual([{ page: "Page 1", id: "1:2", name: "Login", size: "390×844" }]);
    const words = frameText(doc.children![0].children![0]);
    expect(words).toBe("Title: Welcome back\nSign in");
    expect(words).not.toContain("secret draft");
  });

  it("keeps pictures at or under 1200px and never upscales", () => {
    expect(imageScale({ width: 2400, height: 1000 })).toBe(0.5);
    expect(imageScale({ width: 390, height: 844 })).toBe(1);
    expect(imageScale(null)).toBe(1);
  });
});

describe("pictures", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const html = Buffer.from("<html><script>x</script></html>");

  it("decides the type from the bytes, not the claim", () => {
    expect(imageMediaType(png)).toBe("image/png");
    expect(imageMediaType(jpg)).toBe("image/jpeg");
    expect(imageMediaType(html)).toBeNull();
    expect(checkAttachments([`data:image/png;base64,${html.toString("base64")}`])).toMatch(/isn't a PNG/);
    expect(checkAttachments([png.toString("base64")])).toEqual([{ mediaType: "image/png", data: png.toString("base64") }]);
    expect(checkAttachments(Array(5).fill(png.toString("base64")))).toMatch(/at most 4/);
  });

  it("counts a stored picture as a page of text, not its base64 length", () => {
    const big = "A".repeat(400_000);
    const tokens = roughTokens([{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: big } }] }]);
    expect(tokens).toBeLessThan(IMAGE_TOKENS + 200);
    expect(tokens).toBeGreaterThanOrEqual(IMAGE_TOKENS);
  });
});
