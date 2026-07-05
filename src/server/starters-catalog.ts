import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StarterType, StarterContent } from "@/server/starters";

// ── Built-in Starters catalog ───────────────────────────────────────────────────
// The shipped Prompt→Production library. Seeded automatically on boot (see
// seedBuiltInStarters, called from src/server/bootstrap.ts) so the library is populated
// with no manual "load" step. Each entry is keyed by a stable `slug` so renames/copy edits
// upsert in place across deploys. Internal provenance lives in content._buildRef and is
// stripped by serializeStarter before it can reach any UI/API payload — nothing external is
// ever shown; these are presented as our own authored catalog.

export interface BuiltInStarter {
  slug: string;
  name: string;
  summary: string;
  description: string;
  type: StarterType;
  tags: string[];
  content: StarterContent;
}

export const STARTER_BUILT_INS: BuiltInStarter[] = [
  {
    slug: "humanizer",
    name: "Humanizer",
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
    slug: "skills-library",
    name: "Skills Library",
    summary: "Gitwork's index of reusable skills, grouped by where they help across a build.",
    description:
      "A **collection** — Gitwork's own catalogue of the reusable skills in this library, grouped by the stage of a build they serve:\n\n- **Content & copy** — Humanizer, Marketing\n- **Design & UI** — Design System, Taste\n- **Delivery & workflow** — Planner, Flow, Agents\n- **Quality & safety** — Testing, Security\n- **Data** — Analytics\n- **Platform** — Integrations, Ship It, Mobile\n\nIt's the map of what's in the library and how the pieces fit — the shortlist you reach for when a project needs a specific capability rather than a whole kit. Combine several: e.g. Design System (structure) + Taste (polish) + Humanizer (copy) for a whole surface that reads intentional.",
    type: "COLLECTION",
    tags: ["skills", "directory", "index"],
    content: {
      whatYouGet: [
        "A lifecycle-grouped index of every skill in the library",
        "Guidance on which skill fits which stage of a build",
        "Recommended combinations for common goals",
      ],
      promptText:
        "You are helping pick Gitwork skills for a project.\n\nGiven the project's stage and its top gaps, recommend which skills from the library to apply and in what order, and name one concrete combination that would move it forward fastest. Keep it to 3–5 picks with a one-line reason each.",
      _buildRef: "gitwork-authored",
    },
  },
  {
    slug: "projects-index",
    name: "Projects Index",
    summary: "Gitwork's blueprint map — project archetypes and which starters each one needs.",
    description:
      "A **collection** that maps a project to a blueprint, so you go from *\"what is this?\"* to *\"what do we grab?\"* fast. Gitwork's archetypes:\n\n- **SaaS app** — auth, billing, dashboard → Launch Kit · Design System · Security · Analytics · Ship It\n- **Marketing site** — brand, SEO, conversion → Web Starter · Design System · Marketing · Taste\n- **Marketplace** — two-sided, trust, payments → Launch Kit · Security · Analytics · Product\n- **Internal tool** — CRUD, roles, speed → Launch Kit · Flow · Agents\n- **API / service** — contracts, docs, limits → Launch Kit · Security · Testing\n- **Mobile app** — iOS/Android, native UX → Mobile · Design System · Testing\n- **E-commerce** — catalogue, checkout, ops → Web Starter · Marketing · Security · Analytics\n\nUse it at the start of an engagement to classify the build and assemble the right starter set.",
    type: "COLLECTION",
    tags: ["projects", "blueprints", "reference"],
    content: {
      whatYouGet: [
        "Seven project archetypes with the signals that identify each",
        "The recommended starter set per archetype",
        "A fast path from project type → what to grab",
      ],
      promptText:
        "Classify this project into one of the Gitwork archetypes (SaaS, marketing site, marketplace, internal tool, API/service, mobile app, e-commerce) and justify it in one line from the signals. Then list the starter set to grab for it and the single most important one to start with.",
      _buildRef: "gitwork-authored",
    },
  },
  {
    slug: "launch-kit",
    name: "Launch Kit",
    summary: "The flagship Prompt→Production scaffold: rules, commands, hooks, skills, templates.",
    description:
      "The flagship **kit** — the definitive starting point for a new project. Ships battle-tested rules, slash commands, lifecycle hooks, skills and project templates so a codebase has quality gates and structure from day one. The fastest way to take a project from prompt toward production.",
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
    slug: "design-system",
    name: "Design System",
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
    slug: "sites",
    name: "Sites",
    summary: "Self-hosted visual CMS — a deployable site foundation.",
    description:
      "A **kit** for shipping a site fast: a self-hosted visual CMS where the editor, content engine and publisher live in one server, producing clean semantic HTML. A deployable foundation for content-driven sites.",
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
    slug: "web-starter",
    name: "Web Starter",
    summary: "Gitwork's marketing-site build kit — conventions plus a first-pass build prompt.",
    description:
      "A **kit** for standing up a branded marketing site fast, the Gitwork way. It's stack-flexible (Next.js + Tailwind by default) and built on a few conventions that let an agent build pages correctly on the first pass:\n\n- **One identity file** — brand name, colours, fonts, nav and footer live in a single config; every page reads from it.\n- **Section components, not pages** — hero, features, logos, pricing, FAQ, CTA as reusable blocks; pages are compositions.\n- **SEO by default** — per-page title/description, Open Graph, sitemap and robots wired from the start.\n- **CMS-optional** — start with typed content in the repo; swap in a headless CMS later without touching components.\n\nBrand it, compose the pages, ship.",
    type: "KIT",
    tags: ["website", "marketing-site", "seo"],
    content: {
      whatYouGet: [
        "A centralised brand/identity config every page reads from",
        "A set of composable section blocks (hero, features, pricing, FAQ, CTA)",
        "SEO, Open Graph, sitemap and robots baked in",
        "A CMS-optional content model you can upgrade later",
      ],
      install: [
        "Set the identity config (brand, colours, fonts, nav, footer)",
        "Compose pages from the section blocks",
        "Fill content (in-repo or CMS) and deploy",
      ],
      techStack: ["Next.js", "Tailwind", "TypeScript"],
      promptText:
        "Build a branded marketing site using the Gitwork Web Starter conventions.\n\n1. Create a single identity config (brand name, colour tokens, fonts, nav items, footer) and make every component read from it.\n2. Implement reusable section blocks: hero, feature grid, logo strip, pricing, FAQ, CTA.\n3. Compose the home page from those blocks, then any extra pages.\n4. Add per-page SEO (title, description, Open Graph) plus sitemap.xml and robots.txt.\n5. Keep content typed and in-repo for now, structured so a headless CMS can replace it later without changing components.\n\nDefault stack: Next.js + Tailwind + TypeScript unless told otherwise.",
      _buildRef: "gitwork-authored",
    },
  },
  {
    slug: "taste",
    name: "Taste",
    summary: "Gives generated frontends real taste — stops the boring, generic slop.",
    description:
      "A **skill** that raises the quality bar on generated UI: it steers layout, type, spacing and colour away from the flat, generic defaults an agent reaches for, toward something that looks considered. Pairs with Design System (structure) and Humanizer (copy) so a project's whole surface reads intentional.",
    type: "SKILL",
    tags: ["design", "frontend", "ui", "taste"],
    content: {
      whatYouGet: [
        "A design-taste skill that lifts generated UI above generic defaults",
        "Better layout, type, spacing and colour decisions out of the box",
        "Complements Design System (structure) and Humanizer (copy)",
      ],
      install: ["Add the skill to the project's skill set", "Invoke it while building or reviewing UI"],
      featured: true,
      _buildRef: "taste-skill",
    },
  },
  {
    slug: "planner",
    name: "Planner",
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
    slug: "flow",
    name: "Flow",
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
    slug: "agents",
    name: "Agents",
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
    slug: "security",
    name: "Security",
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
    slug: "integrations",
    name: "Integrations",
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
  {
    slug: "marketing",
    name: "Marketing",
    summary: "CRO, SEO, copywriting, analytics and growth engineering for client work.",
    description:
      "A **collection** of marketing skills covering the whole growth surface — conversion-rate optimisation, SEO, copywriting, analytics and growth engineering. The toolkit for taking a client's product to market once it's built.",
    type: "COLLECTION",
    tags: ["marketing", "seo", "copywriting", "growth"],
    content: {
      whatYouGet: [
        "Conversion-rate optimisation and landing-page playbooks",
        "SEO and content strategy",
        "Copywriting across ads, email and site",
        "Analytics and growth-engineering methods",
      ],
      _buildRef: "marketingskills",
    },
  },
  {
    slug: "product",
    name: "Product",
    summary: "Gitwork's discovery→spec skill: turn a rough idea into a buildable brief.",
    description:
      "A **skill** for the front of Prompt→Production — taking a vague idea and making it something a team can actually build. Gitwork's four-step method:\n\n1. **Frame** — who it's for, the job they're hiring it to do, and the one outcome that defines success.\n2. **Discover** — the sharpest open questions and assumptions to test before building (pair with a Study to test them with users).\n3. **Prioritise** — cut to a first slice by impact vs effort; name what's explicitly *not* in v1.\n4. **Spec** — a tight brief: problem, users, scope, out-of-scope, success metric, and the key flows.\n\nThe output feeds straight into Launch Kit and a Pulse scan.",
    type: "COLLECTION",
    tags: ["product", "discovery", "specs"],
    content: {
      whatYouGet: [
        "A framing pass — user, job-to-be-done, single success outcome",
        "Discovery questions + assumptions to test first",
        "An impact/effort cut to a v1 slice (with explicit out-of-scope)",
        "A tight PRD/brief ready to build from",
      ],
      promptText:
        "Act as a Gitwork product lead. Turn the idea below into a buildable brief:\n\n1. FRAME — target user, job-to-be-done, and the single outcome that defines success.\n2. DISCOVER — the 5 sharpest questions/assumptions to validate before building.\n3. PRIORITISE — an impact vs effort cut to a v1 slice; list what is explicitly out of scope for v1.\n4. SPEC — problem, users, in-scope, out-of-scope, success metric, and the 3–5 key user flows.\n\nIdea: <describe the idea>",
      _buildRef: "gitwork-authored",
    },
  },
  {
    slug: "testing",
    name: "Testing",
    summary: "Model-invoked E2E / browser tests as a quality gate before shipping.",
    description:
      "A **skill** that autonomously writes and runs browser automation to test and validate a build — it drives the browser, exercises the key flows and reports what breaks. A production quality gate, not just unit tests.",
    type: "SKILL",
    tags: ["testing", "qa", "e2e"],
    content: {
      whatYouGet: [
        "Model-invoked browser automation",
        "End-to-end validation of the key user flows",
        "Catches regressions before a deploy goes out",
      ],
      install: ["Add the skill", "Point it at the app and let it exercise the critical flows"],
      _buildRef: "playwright-skill",
    },
  },
  {
    slug: "analytics",
    name: "Analytics",
    summary: "A context layer for querying a client's analytics data accurately.",
    description:
      "A **collection** that gives agents an executable context layer over a client's analytical databases — a semantic layer plus company context and query tooling — so data questions get answered accurately instead of hallucinated.",
    type: "COLLECTION",
    tags: ["data", "analytics", "sql"],
    content: {
      whatYouGet: [
        "An executable context / semantic layer over analytical databases",
        "Accurate natural-language querying with full company context",
        "Data-engineering and BI groundwork",
      ],
      _buildRef: "ktx",
    },
  },
  {
    slug: "devops",
    name: "DevOps",
    summary: "CI/CD, containerisation, deploys and monitoring — the production side.",
    description:
      "A **collection** covering the production side of a build — CI/CD pipelines, containerisation, deploys and rollbacks, and monitoring — so a project ships and stays up. Authored in-house rather than sourced.",
    type: "COLLECTION",
    tags: ["devops", "ci-cd", "infra", "deploy"],
    content: {
      whatYouGet: [
        "CI/CD pipeline patterns",
        "Docker / containerisation",
        "Deploy and rollback playbooks",
        "Monitoring and alerting setup",
      ],
      _buildRef: "gitwork-authored",
    },
  },
  {
    slug: "mobile",
    name: "Mobile",
    summary: "iOS (SwiftUI) and Android (Compose) dev skills — architecture to shipping.",
    description:
      "A **collection** of mobile-development skills across iOS (SwiftUI) and Android (Jetpack Compose / Kotlin Multiplatform) — architecture, networking, data, concurrency, testing, accessibility and performance. Relevant to Foundry's own iOS app and to client mobile work.",
    type: "COLLECTION",
    tags: ["mobile", "ios", "android", "swiftui"],
    content: {
      whatYouGet: [
        "SwiftUI + iOS architecture, networking and concurrency",
        "Jetpack Compose / Kotlin Multiplatform patterns",
        "Mobile testing, accessibility and performance",
      ],
      _buildRef: "ios-agent-skills + compose-skill",
    },
  },
  {
    slug: "ship-it",
    name: "Ship It",
    summary: "Take a Lovable / Bolt / Replit build from prototype to production.",
    description:
      "A **kit** for hardening a vibe-coded app — Lovable, Bolt or Replit — into something you can actually ship. Enables Supabase Row-Level Security on every table, sweeps the bundle for exposed keys, moves authorisation server-side, ejects the code into a real repo with CI, and wires custom domain, SEO, analytics and error monitoring. The missing step between a prototype and production.",
    type: "KIT",
    tags: ["vibe-coding", "lovable", "bolt", "replit", "supabase", "rls", "security", "deploy"],
    content: {
      whatYouGet: [
        "Row-Level Security enablement + owner-scoped policy templates for every Supabase table",
        "Secret sweep — find exposed anon/API keys baked into the client bundle",
        "Server-side authorisation to replace client-only auth checks",
        "Eject to a real repo with CI/CD and a baseline test suite",
        "Custom domain, SEO, analytics and error-monitoring wiring",
      ],
      install: [
        "Point it at the exported Lovable / Bolt / Replit project",
        "Run the hardening audit (RLS, secrets, auth)",
        "Apply the fixes and eject to a production repo",
      ],
      _buildRef: "database-sentinel + supabase-pentest-skills + supashield + vibe-security",
    },
  },
];

// ── Source references ("view & use") ─────────────────────────────────────────────
// Each built-in is built on top of an upstream repo/skill (tracked internally in
// content._buildRef). We surface a public source link so a starter can actually be viewed and
// grabbed. Direct repo URLs for the ones we've pinned; everything else resolves to a GitHub
// repository search seeded with the ref, so the "View & use" link is always valid (never a 404).
// Refs that are our own / multi-source (no single upstream) get no link.

// Verified direct upstream repo per starter (audited to resolve, licence-checked). Starters
// with no single upstream — authored in-house (devops), the official marketplace (integrations),
// or built from several repos (mobile, ship-it) — are deliberately omitted → no "View & use"
// button, rather than a misleading link.
// Gitwork-owned mirror (Git-Dann/starter-library) — one folder per starter. These are OUR copies,
// so the library no longer depends on an upstream staying online.
const OWNED = "https://github.com/Git-Dann/starter-library/tree/main";
const SOURCE_URLS: Record<string, string> = {
  // Mirrored into our own repo → point at the owned copy.
  humanizer: `${OWNED}/humanizer`,
  "launch-kit": `${OWNED}/launch-kit`,
  "design-system": `${OWNED}/design-system`,
  sites: `${OWNED}/sites`,
  taste: `${OWNED}/taste`,
  planner: `${OWNED}/planner`,
  flow: `${OWNED}/flow`,
  agents: `${OWNED}/agents`,
  security: `${OWNED}/security`,
  marketing: `${OWNED}/marketing`,
  testing: `${OWNED}/testing`,
  analytics: `${OWNED}/analytics`,
  mobile: `${OWNED}/mobile`,
  "ship-it": `${OWNED}/ship-it`,
  // Skills Library, Projects Index, Web Starter and Product are now Gitwork-authored content
  // served in-app (no upstream, no external repo) — see their entries above. No source link.
};

function sourceFor(slug: string): { sourceLabel?: string; sourceUrl?: string } {
  const sourceUrl = SOURCE_URLS[slug];
  if (!sourceUrl) return {};
  const owned = sourceUrl.startsWith(OWNED);
  const sourceLabel = owned ? "Gitwork starter library" : sourceUrl.replace(/^https:\/\/github\.com\//, "");
  return { sourceUrl, sourceLabel };
}

/**
 * Idempotently seed the built-in starters for a workspace. Upserts each by its stable slug
 * (so copy/name edits propagate on deploy and ids stay stable across boots), then removes any
 * stale built-ins no longer in the catalog (e.g. renamed slugs). Safe to run on every boot.
 */
export async function seedBuiltInStarters(workspaceId: string): Promise<number> {
  const slugs = STARTER_BUILT_INS.map((s) => s.slug);
  for (const s of STARTER_BUILT_INS) {
    // Merge in the public source reference derived from the internal _buildRef.
    const content = { ...s.content, ...sourceFor(s.slug) } as unknown as Prisma.InputJsonValue;
    await prisma.starter.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        summary: s.summary,
        description: s.description,
        type: s.type,
        tags: s.tags,
        content,
        isDefault: true,
        isArchived: false,
      },
      create: {
        workspaceId,
        slug: s.slug,
        name: s.name,
        summary: s.summary,
        description: s.description,
        type: s.type,
        status: "PUBLISHED",
        tags: s.tags,
        content,
        isDefault: true,
      },
    });
  }
  // Drop any previously-seeded built-ins that are no longer in the catalog (e.g. old slugs).
  await prisma.starter.deleteMany({
    where: { workspaceId, isDefault: true, slug: { notIn: slugs } },
  });
  return STARTER_BUILT_INS.length;
}
