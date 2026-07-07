// One-time parser: turns the prompt-pack markdown files into a committed catalog data file
// (src/data/prompt-starters.json) of PROMPT-type built-in Starters.
//
// Gitwork-branding rule (see CLAUDE.md / starters-catalog.ts): nothing in the emitted entries
// references the original source in any UI-visible field. Provenance is kept ONLY in
// content._buildRef, which serializeStarter strips before any payload leaves the server.
//
// Usage:
//   node scripts/parse-prompt-library.mjs <file1.md> [file2.md ...] > /dev/null
// (writes src/data/prompt-starters.json). Re-run whenever the source packs change.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../src/data/prompt-starters.json");

// Function/use-case synonyms per category — the "smart" part of search: someone searching
// "sales email" or "make a logo" lands on the right prompt even if those exact words aren't in
// the title. Keyed by slugified Category.
const CATEGORY_KEYWORDS = {
  "productivity-and-personal": ["productivity", "planning", "focus", "decisions", "habits", "organization", "time management", "personal", "life"],
  "learning-and-research": ["learn", "study", "teach", "explain", "understand", "research", "course", "tutor", "education", "knowledge"],
  "writing-and-editing": ["writing", "editing", "copy", "copywriting", "rewrite", "proofread", "tone", "voice", "grammar", "email", "content"],
  "business-and-marketing": ["marketing", "sales", "business", "growth", "ads", "advertising", "copywriting", "conversion", "funnel", "outreach", "brand", "content", "launch", "strategy"],
  "coding-and-tech": ["code", "coding", "programming", "debug", "debugging", "engineering", "developer", "software", "code review", "regex", "technical", "build"],
  "career-and-money": ["career", "job", "resume", "cv", "interview", "salary", "negotiation", "money", "finance", "budget", "raise"],
  "creativity-and-ideas": ["ideas", "brainstorm", "creative", "creativity", "naming", "invention", "concepts", "innovation"],
  "roleplay-and-personas": ["roleplay", "persona", "character", "simulation", "practice", "acting"],
};

// Image-generation categories/collections → visual-creation function terms.
const IMAGE_KEYWORDS = ["image", "images", "image generation", "art", "visual", "generate", "picture", "graphic", "design"];
const DESIGN_KEYWORDS = ["design", "build", "website", "web", "ui", "landing page", "prototype", "deck", "slides", "infographic", "wireframe", "animation", "frontend"];

const STOPWORDS = new Set(["the", "a", "an", "my", "me", "to", "for", "of", "and", "or", "in", "on", "with", "that", "this", "it", "is", "your", "you", "into", "one", "then", "build", "make", "create", "get", "gets"]);

function keywordsFor({ name, category, tool, collection }) {
  const cat = category ? slugify(category) : "";
  const set = new Set();
  for (const k of CATEGORY_KEYWORDS[cat] ?? []) set.add(k);
  const isImage = /portrait|scene|logo|icon|thumbnail|illustration|art|product|photo|image/.test(cat);
  if (isImage) IMAGE_KEYWORDS.forEach((k) => set.add(k));
  if (/claude-design|^(setup|prototype|slides|document|wireframe|animation)$/.test(slugify(collection || "")) || /design/.test(cat)) {
    DESIGN_KEYWORDS.forEach((k) => set.add(k));
  }
  // Tool names (Midjourney, DALL-E, Ideogram, Claude Code…) are strong search terms.
  if (tool && !/^any\b/i.test(tool)) {
    tool.split(/[\/,]| or /i).map((t) => t.trim().toLowerCase()).filter(Boolean).forEach((t) => set.add(t));
  }
  // Meaningful words from the title.
  for (const w of name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    if (w.length > 2 && !STOPWORDS.has(w)) set.add(w);
  }
  return [...set];
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Split a markdown pack into "## N. Title" blocks and parse each into a starter entry.
function parseFile(md) {
  const blocks = md.split(/\n(?=## \d+\.\s)/g).filter((b) => /^## \d+\.\s/.test(b.trim()));
  const out = [];
  for (const block of blocks) {
    const titleMatch = block.match(/^##\s*\d+\.\s*(.+)$/m);
    if (!titleMatch) continue;
    const name = titleMatch[1].trim();

    const field = (label) => {
      const m = block.match(new RegExp(`^-\\s*${label}:\\s*(.+)$`, "m"));
      return m ? m[1].trim() : "";
    };
    const id = field("ID");
    const category = field("Category");
    const tool = field("Tool");
    const collection = field("Collection");
    const description = field("Description");

    // First fenced block is the prompt body (```text … ``` or ``` … ```).
    const fence = block.match(/```(?:text)?\n([\s\S]*?)```/);
    const promptText = fence ? fence[1].replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n").trim() : "";
    if (!promptText) continue; // skip anything without an actual prompt

    // Category first so it's the chip shown on the card; "prompt-library" is the grouping tag.
    const tags = [];
    if (category) tags.push(slugify(category));
    tags.push("prompt-library");
    if (collection) tags.push(slugify(collection));
    // Only add a tool tag when it's a specific product, not the generic "Any LLM".
    if (tool && !/^any\b/i.test(tool)) tags.push(slugify(tool));

    out.push({
      slug: `prompt-${slugify(id || name)}`,
      name,
      summary: description || name,
      description: description || "",
      type: "PROMPT",
      tags: [...new Set(tags)],
      content: {
        whatYouGet: [
          "Copy-paste prompt — fill in the [BRACKETED] fields",
          "Drop it into any Claude chat or the Foundry connector",
        ],
        promptText,
        // Hidden search terms (functions/use-cases/synonyms) — never rendered, folds into searchText.
        keywords: keywordsFor({ name, category, tool, collection }),
        _buildRef: `tristenobrien:${id || slugify(name)}`,
      },
    });
  }
  return out;
}

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("Provide at least one markdown pack path.");
  process.exit(1);
}

const all = [];
const seen = new Set();
for (const path of inputs) {
  const md = readFileSync(path, "utf8");
  for (const entry of parseFile(md)) {
    let slug = entry.slug;
    let n = 2;
    while (seen.has(slug)) slug = `${entry.slug}-${n++}`;
    seen.add(slug);
    all.push({ ...entry, slug });
  }
}

writeFileSync(OUT, JSON.stringify(all, null, 2) + "\n", "utf8");
console.error(`Wrote ${all.length} prompt starters → ${OUT}`);
