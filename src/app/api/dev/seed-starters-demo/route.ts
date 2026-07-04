import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertSuperAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import type { StarterType, StarterContent } from "@/server/starters";

export const dynamic = "force-dynamic";

// ── Gitwork built-in starters ───────────────────────────────────────────────────
// The seed catalog for the Prompt→Production library. Every entry is Gitwork-branded — no
// original-creator or origin-repo reference reaches the UI. Internal provenance lives in
// content._buildRef and is stripped by serializeStarter before it can ever be served.

interface SeedStarter {
  name: string;
  summary: string;
  description: string;
  type: StarterType;
  tags: string[];
  content: StarterContent;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "starter"
  );
}

const SEED_STARTERS: SeedStarter[] = [
  {
    name: "Gitwork Humanizer",
    summary: "Strips AI-writing tells from generated copy so it reads human.",
    description:
      "A writing **skill** that rewrites AI-generated text to remove the tells — significance inflation, em-dash overuse, hedging, filler and chatbot artifacts — across content, language, style and communication patterns. Reach for it whenever a project's marketing copy, docs or emails need to sound like a person wrote them.",
    type: "SKILL",
    tags: ["content", "writing", "marketing-copy"],
    content: {
      whatYouGet: [
        "A drop-in skill that detects and rewrites 30+ AI-writing patterns",
        "Coverage across content, language, style and communication tells",
        "Works on marketing copy, docs, emails and UI microcopy",
      ],
      install: ["Add the skill to the project's skill set", "Invoke it on any draft to humanize the tone"],
      _buildRef: "humanizer",
    },
  },
  {
    name: "Gitwork Skills Library",
    summary: "Curated Gitwork skill foundation — the pool we grow Skill starters from.",
    description:
      "A **collection**: Gitwork's curated foundation of reusable skills spanning document processing, dev tooling, data & analysis, marketing, communication and automation. This is the pool we draw from (and productise) when adding new Skill starters to the library.",
    type: "COLLECTION",
    tags: ["skills", "directory", "source"],
    content: {
      whatYouGet: [
        "A broad, categorised pool of reusable skills",
        "The source we curate individual Skill starters from",
        "Coverage across docs, code, data, marketing and automation",
      ],
      _buildRef: "awesome-claude-skills",
    },
  },
  {
    name: "Gitwork Projects Index",
    summary: "Gitwork's map of project blueprints + plugin clusters; structures the library.",
    description:
      "A **collection** that maps project blueprints and plugin clusters by use case. It's the reference that shapes how the Starters library itself is organised, and a source of plugin building blocks.",
    type: "COLLECTION",
    tags: ["projects", "plugins", "reference"],
    content: {
      whatYouGet: [
        "A categorised index of project blueprints",
        "Plugin clusters grouped by use case",
        "The structural reference behind the Starters library",
      ],
      _buildRef: "Claude-Code-Projects-Index",
    },
  },
  {
    name: "Gitwork Launch Kit",
    summary: "The flagship Prompt→Production scaffold: rules, commands, hooks, skills, templates.",
    description:
      "Gitwork's flagship **kit** — the definitive starting point for a new project. Ships battle-tested rules, slash commands, lifecycle hooks, skills and project templates so a codebase has quality gates and structure from day one. This is the fastest way to take a project from prompt toward production.",
    type: "KIT",
    tags: ["scaffolding", "code-quality", "hooks", "commands"],
    content: {
      whatYouGet: [
        "Battle-tested project rules (security, TypeScript, DB, testing, deploy)",
        "A library of slash commands for common workflows",
        "Lifecycle hooks that enforce quality gates automatically",
        "Context-aware skills for review, debugging and testing",
        "Project scaffolding templates for multiple stacks",
      ],
      install: [
        "Scaffold a new project from the kit",
        "Adopt the rules file and enable the hooks",
        "Wire the commands into the team workflow",
      ],
      techStack: ["Node.js", "Go", "Python", "React", "Vue", "Django"],
      _buildRef: "mastery-project-starter-kit",
    },
  },
  {
    name: "Gitwork Design System",
    summary: "Design-system harness: tokens, guidelines and design/audit skills.",
    description:
      "A **kit** that keeps a project's design system in the room on every screen. Binds design tokens and guidelines so components, spacing and branding stay consistent, and ships audit skills for accessibility, mobile, copy, styling, visual and layout — plus a framework handoff for code export.",
    type: "KIT",
    tags: ["design-system", "audit", "ui"],
    content: {
      whatYouGet: [
        "A design-tokens + guidelines binding that persists across sessions",
        "Audit skills: accessibility, mobile, copy, styling, visual, layout",
        "A framework handoff for exporting to code",
      ],
      install: ["Define the design tokens + voice", "Run the audit lanes on each screen", "Hand off to the target framework"],
      _buildRef: "claude-design-premium",
    },
  },
  {
    name: "Gitwork Sites",
    summary: "Self-hosted visual CMS — a deployable Gitwork site foundation.",
    description:
      "A **kit** for shipping a site fast: a self-hosted visual CMS where the editor, content engine and publisher live in one server, producing clean semantic HTML. A deployable Gitwork foundation for content-driven sites.",
    type: "KIT",
    tags: ["website", "cms", "deployable"],
    content: {
      whatYouGet: [
        "A visual canvas editor with responsive breakpoints",
        "Content types, data tables and built-in forms",
        "Clean semantic HTML output — no framework runtime left in pages",
        "One-click deployment",
      ],
      install: ["Deploy the server", "Model the content types", "Build and publish pages from the visual editor"],
      techStack: ["TypeScript", "React", "PostgreSQL"],
      _buildRef: "instatic",
    },
  },
  {
    name: "Gitwork Web Starter",
    summary: "AI-first marketing-site scaffold, ready to brand and ship.",
    description:
      "A **kit** for standing up a marketing site quickly: an AI-first scaffold with centralised identity config, reusable components and a CMS integration, plus a rules file that lets an agent build pages correctly on the first pass. Brand it and ship.",
    type: "KIT",
    tags: ["website", "marketing-site", "astro"],
    content: {
      whatYouGet: [
        "A marketing-site scaffold with centralised identity config",
        "Reusable components and a CSS-variable design system",
        "A headless CMS integration for content",
        "An agent-ready rules file for first-pass page builds",
      ],
      install: ["Fork the scaffold", "Set the identity + deployment config", "Wire the CMS and deploy"],
      techStack: ["Astro", "Sanity", "Cloudflare"],
      _buildRef: "clcreative-AI-first-website-starter",
    },
  },
  {
    name: "Gitwork Taste",
    summary: "Gives generated frontends real taste — stops the boring, generic slop.",
    description:
      "A **skill** that raises the quality bar on generated UI: it steers layout, type, spacing and colour away from the flat, generic defaults an agent reaches for by default, toward something that looks considered. Pairs with Gitwork Design System (structure) and Gitwork Humanizer (copy) so a project's whole surface reads intentional.",
    type: "SKILL",
    tags: ["design", "frontend", "ui", "taste"],
    content: {
      whatYouGet: [
        "A design-taste skill that lifts generated UI above generic defaults",
        "Better layout, type, spacing and colour decisions out of the box",
        "Complements the Design System (structure) and Humanizer (copy)",
      ],
      install: ["Add the skill to the project's skill set", "Invoke it while building or reviewing UI"],
      _buildRef: "taste-skill",
    },
  },
  {
    name: "Gitwork Planner",
    summary: "Crash-proof, file-based planning for long agentic runs.",
    description:
      "A **skill** for keeping big builds on track: it writes the plan to markdown on disk so it survives context loss and `/clear`, tracks progress against a deterministic completion gate, and lets multiple agents share state. The reliability layer under Prompt→Production itself.",
    type: "SKILL",
    tags: ["planning", "workflow", "agentic"],
    content: {
      whatYouGet: [
        "Persistent, file-based plans that survive context loss",
        "A deterministic completion gate so work isn't left half-done",
        "Shared on-disk state for multi-step / multi-agent runs",
      ],
      install: ["Add the skill", "Let the agent write and follow the plan file across the build"],
      _buildRef: "planning-with-files",
    },
  },
  {
    name: "Gitwork Flow",
    summary: "Spec-driven delivery workflow: task tracking, worker subagents, cross-model review.",
    description:
      "A **plugin** that turns a brief into a tracked, spec-driven build: it breaks work into tasks, dispatches worker subagents, and runs cross-model reviews before things land. The delivery loop that carries a project from spec to shipped.",
    type: "PLUGIN",
    tags: ["workflow", "spec-driven", "subagents", "review"],
    content: {
      whatYouGet: [
        "Spec-driven task breakdown with zero-dependency tracking",
        "Worker subagents that execute tasks in parallel",
        "Cross-model reviews as a quality gate before merge",
      ],
      install: ["Install the plugin", "Point it at a spec", "Review the tracked tasks as they complete"],
      _buildRef: "flow-next",
    },
  },
  {
    name: "Gitwork Agents",
    summary: "A pool of role subagents and workflows to grow specialised agents from.",
    description:
      "A **collection** of role-specialised subagents and multi-agent workflows — the pool we draw from (and productise) when a project needs a focused agent rather than a general one. The agents analogue of the Skills Library.",
    type: "COLLECTION",
    tags: ["agents", "subagents", "roles"],
    content: {
      whatYouGet: [
        "A broad pool of role-specialised subagents",
        "Multi-agent workflows and orchestration patterns",
        "The source we curate individual agent starters from",
      ],
      _buildRef: "wshobson/agents",
    },
  },
  {
    name: "Gitwork Security",
    summary: "Security & audit skills mapped to common frameworks — feeds Pulse security checks.",
    description:
      "A **collection** of structured security and audit skills covering threat modelling, hardening, incident response and compliance, mapped to recognised frameworks. Directly complements the security category of a Pulse scan.",
    type: "COLLECTION",
    tags: ["security", "audit", "compliance"],
    content: {
      whatYouGet: [
        "Structured security skills across many domains",
        "Mappings to recognised security & compliance frameworks",
        "A natural companion to Pulse's security checks",
      ],
      _buildRef: "Anthropic-Cybersecurity-Skills (Apache-2.0)",
    },
  },
  {
    name: "Gitwork Integrations",
    summary: "Production integrations — Figma, Playwright, Vercel, Supabase, Linear, Sentry, Stripe.",
    description:
      "A **collection** of the production integrations that close the Prompt→Production loop: design (Figma), testing (Playwright), deploy (Vercel), data (Supabase), project tracking (Linear), monitoring (Sentry) and payments (Stripe). The wiring a shipped project actually needs.",
    type: "COLLECTION",
    tags: ["integrations", "mcp", "deployment"],
    content: {
      whatYouGet: [
        "Design → code via Figma",
        "Browser automation + E2E via Playwright",
        "Deploy + logs via Vercel; data via Supabase",
        "Tracking (Linear), monitoring (Sentry) and payments (Stripe)",
      ],
      _buildRef: "official Claude Code marketplace partners (Figma/Playwright/Vercel/Supabase/Linear/Sentry/Stripe)",
    },
  },
];

export async function POST(request: Request) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(request));
    const { workspace } = await ensureBaseRecords();

    // Idempotent: clear this workspace's built-ins, then re-create from the seed catalog.
    await prisma.starter.deleteMany({ where: { workspaceId: workspace.id, isDefault: true } });

    for (const seed of SEED_STARTERS) {
      await prisma.starter.create({
        data: {
          workspaceId: workspace.id,
          name: seed.name,
          slug: slugify(seed.name),
          summary: seed.summary,
          description: seed.description,
          type: seed.type,
          status: "PUBLISHED",
          tags: seed.tags,
          content: seed.content as unknown as Prisma.InputJsonValue,
          isDefault: true,
        },
      });
    }

    return apiOk({ count: SEED_STARTERS.length });
  } catch (error) {
    return fromError(error);
  }
}
