import { strToU8, zipSync } from "fflate";
import { fetchRepoSubtree } from "@/lib/github";
import type { StarterRecord } from "@/server/starters";

// ── Starter → Claude packaging ──────────────────────────────────────────────────
// One seam that turns a Starter into (a) a Claude Skill `.zip` (folder + SKILL.md at the root) and
// (b) the reusable prompt text served over MCP. Mirrored starters (files in the private
// Git-Dann/starter-library monorepo) are fetched server-side via GITHUB_TOKEN; native starters are
// synthesized from their `content.promptText` / metadata. Best-effort by design — a starter always
// produces at least a synthesized SKILL.md so a download is never empty.

const OWNER = "Git-Dann";
const REPO = "starter-library";

/** Claude Skill `name`: lowercase, hyphenated, ≤64 chars. Slugs already satisfy this. */
function skillName(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "starter";
}

/** Single-line, quote-safe YAML scalar bounded to Claude's ~1024-char description limit. */
function yamlScalar(value: string, max = 1000): string {
  const oneLine = value.replace(/\s+/g, " ").trim().slice(0, max);
  return `"${oneLine.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Synthesize a valid `SKILL.md` (YAML frontmatter + markdown body) from a starter's metadata. This
 * is the canonical text reused verbatim as the MCP prompt for the starter, so a chat gets the same
 * content whether it installs the skill or invokes the prompt.
 */
export function buildSkillMarkdown(starter: StarterRecord): string {
  const content = starter.content ?? {};
  const whatYouGet = content.whatYouGet ?? [];
  const install = content.install ?? [];
  const techStack = content.techStack ?? [];
  const promptText = content.promptText;

  const lines: string[] = [
    "---",
    `name: ${skillName(starter.slug)}`,
    `description: ${yamlScalar(starter.summary || starter.name)}`,
    "---",
    "",
    `# ${starter.name}`,
    "",
    starter.summary,
    "",
  ];

  if (starter.description) {
    lines.push(starter.description, "");
  }
  if (whatYouGet.length) {
    lines.push("## What you get", "", ...whatYouGet.map((w) => `- ${w}`), "");
  }
  if (install.length) {
    lines.push("## How to use", "", ...install.map((s, i) => `${i + 1}. ${s}`), "");
  }
  if (techStack.length) {
    lines.push("## Stack", "", techStack.map((t) => `\`${t}\``).join(" · "), "");
  }
  if (promptText) {
    lines.push("## Prompt", "", promptText, "");
  }
  if (starter.tags.length) {
    lines.push("---", "", `Tags: ${starter.tags.join(", ")}`, "");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/**
 * Build the in-zip file map (fflate shape: in-zip path → bytes) for a starter, rooted under a
 * single `<slug>/` folder so the archive installs cleanly as a Claude Skill.
 *
 * - Mirrored starters (files under `starter-library/<slug>/`): ship the fetched tree as-is; if it
 *   has no top-level `SKILL.md`, add a synthesized one so SKILL/PROMPT installs are still valid.
 * - Native / no-source starters: emit just the synthesized `<slug>/SKILL.md` from metadata.
 */
export async function assembleStarterFiles(
  starter: StarterRecord,
): Promise<Record<string, Uint8Array>> {
  const slug = starter.slug;
  const out: Record<string, Uint8Array> = {};

  // Fetched files already carry the `<slug>/…` prefix from the monorepo, so they re-root correctly.
  const fetched = await fetchRepoSubtree(OWNER, REPO, slug).catch(() => []);
  for (const file of fetched) {
    out[file.path] = file.bytes;
  }

  const hasTopLevelSkill = Object.keys(out).some(
    (p) => p.toLowerCase() === `${slug.toLowerCase()}/skill.md`,
  );
  if (!hasTopLevelSkill) {
    out[`${slug}/SKILL.md`] = strToU8(buildSkillMarkdown(starter));
  }

  return out;
}

/** Assemble + zip a starter into a single `.zip` byte buffer, ready for an HTTP download. */
export async function buildStarterZip(starter: StarterRecord): Promise<Uint8Array> {
  const files = await assembleStarterFiles(starter);
  return zipSync(files);
}
