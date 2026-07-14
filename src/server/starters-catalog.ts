import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StarterType, StarterContent } from "@/server/starters";
import PROMPT_STARTERS from "@/data/prompt-starters.json";

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
  /** Seed as featured (pinned to the top). Catalog featured is authoritative-on; users can
   * favourite others via the UI and those persist (the seeder never un-features). */
  featured?: boolean;
}

const CORE_BUILT_INS: BuiltInStarter[] = [
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
      promptText:
        "Scaffold a new project using the Gitwork Launch Kit.\n\n1. Set up battle-tested project rules covering security, TypeScript, database access, testing and deploy.\n2. Wire in the lifecycle hooks so quality gates (lint, type-check, tests) run automatically on every change.\n3. Add the slash-command library for common workflows (review, debug, test, ship).\n4. Enable the context-aware skills for review, debugging and testing.\n5. Scaffold the project structure for the target stack.\n\nTarget stack: <Node.js / Go / Python / React / Vue / Django — pick one>.",
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
      promptText:
        "Set up a Gitwork Design System harness for this project.\n\n1. Define the design tokens (colour, type, spacing, radius) and the brand voice, and bind them so every component reads from one source.\n2. Wire the audit skills — accessibility, mobile, copy, styling, visual, layout — to run against each screen.\n3. Add a framework handoff so the tokens/components export cleanly to the target framework's code.\n\nRun the audit lanes on every new screen before calling it done.",
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
      promptText:
        "Stand up a Gitwork Sites instance (self-hosted visual CMS) for this project.\n\n1. Deploy the server — editor, content engine and publisher run together.\n2. Model the content types and data tables this site needs.\n3. Build the pages in the visual canvas editor, using the built-in forms where needed.\n4. Publish — output is clean semantic HTML with no framework runtime left in the page.\n5. Deploy with the one-click deploy path.\n\nDescribe the site: <what it's for, the content types, the pages>.",
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
      _buildRef: "taste-skill",
    },
    featured: true,
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
      promptText:
        "You are picking a Gitwork subagent for this project.\n\nGiven the task below, recommend the single best-fit role-specialised subagent (or a short multi-agent workflow if the task needs more than one), and say in one line why a general-purpose agent wouldn't do as well.\n\nTask: <describe the task>",
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
      promptText:
        "Run a Gitwork security review pass on this project.\n\nUsing the security & audit skill set (threat modelling, hardening, incident response, compliance), identify the top 3 risks for this build, map each to the relevant framework/control, and give one concrete fix per risk. Flag anything a Pulse security scan would also catch.",
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
      promptText:
        "Wire up production integrations for this project using the Gitwork Integrations set.\n\nGiven the stack below, recommend which of Figma (design→code), Playwright (E2E), Vercel (deploy), Supabase (data), Linear (tracking), Sentry (monitoring) and Stripe (payments) this project actually needs, in priority order, and the first concrete step for each.\n\nStack / project: <describe it>",
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
      promptText:
        "Plan the go-to-market pass for this project using the Gitwork Marketing skill set.\n\nCover conversion-rate optimisation, SEO, copywriting and analytics/growth engineering — recommend the 3 highest-leverage actions to take first, and the one metric that would prove each is working.\n\nProject / audience: <describe it>",
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
      promptText:
        "Answer this data question accurately using the Gitwork Analytics context layer.\n\nBuild (or use) the semantic layer over the client's analytical database plus their company context, then answer the question below with the exact query/logic used — never guess or hallucinate a number.\n\nQuestion: <the data question>",
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
      promptText:
        "Set up the production side of this project using the Gitwork DevOps collection.\n\n1. Stand up CI/CD (build, test, deploy) for the stack below.\n2. Containerise the app if it isn't already.\n3. Add a deploy + rollback playbook.\n4. Wire monitoring and alerting so failures are caught, not discovered by users.\n\nStack / hosting target: <describe it>",
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
      promptText:
        "Build this mobile feature using the Gitwork Mobile skill set.\n\nFor iOS: apply SwiftUI + iOS architecture, networking and concurrency patterns. For Android: apply Jetpack Compose / Kotlin Multiplatform patterns. Either way, cover testing, accessibility and performance before calling it done.\n\nPlatform + feature: <e.g. iOS — offline-first sync for X>",
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
      promptText:
        "Harden this vibe-coded app (Lovable / Bolt / Replit) for production using the Gitwork Ship It kit.\n\n1. Run the hardening audit: enable Row-Level Security with owner-scoped policies on every Supabase table, and sweep the bundle for exposed anon/API keys.\n2. Move any client-only authorisation checks server-side.\n3. Eject the code into a real repo with CI/CD and a baseline test suite.\n4. Wire a custom domain, SEO, analytics and error monitoring.\n\nProject to harden: <link to the exported Lovable/Bolt/Replit project>.",
      _buildRef: "database-sentinel + supabase-pentest-skills + supashield + vibe-security",
    },
  },
  {
    slug: "chat-digest",
    name: "Chat Digest",
    summary: "Turns a raw chat thread into a summary, decisions and action items.",
    description:
      "A **skill** that cuts through a long chat thread — Slack, WeChat, wherever — and hands back what actually matters: a short overview, the decisions that were made, and who owns what next. Useful for closing out a client thread or catching up on one you missed.",
    type: "SKILL",
    tags: ["chat", "summaries", "productivity"],
    content: {
      whatYouGet: [
        "A short plain-English overview of the thread",
        "The decisions that were actually made",
        "Action items, with an owner where the thread names one",
      ],
      install: ["Paste in the chat export or thread", "Get back the summary, decisions and action items"],
      promptText:
        "Summarise the chat thread below into three sections: 1) OVERVIEW — 2-3 sentences on what the conversation was about, 2) DECISIONS — every decision actually made, one line each, 3) ACTION ITEMS — a list with an owner where the thread names one, else 'unassigned'. Skip small talk and anything that didn't lead anywhere.\n\nChat: <paste the conversation>",
      _buildRef: "slashcmd:chat-organizer-x11ri (bystander563/chat-codex-skill)",
    },
  },
  {
    slug: "audit-pass",
    name: "Audit Pass",
    summary: "A fast, practical security sweep for real, exploitable issues — not theoretical ones.",
    description:
      "A **skill** for a quick, pragmatic security pass over a codebase, API or MVP — the kind of check that catches the obvious real risks (exposed secrets, missing auth, injection gaps) before a client ships, without pretending to be a full penetration test. Complements the deeper Security collection when a project needs that level of rigour.",
    type: "SKILL",
    tags: ["security", "audit", "codebase"],
    content: {
      whatYouGet: [
        "A fast pass over a codebase/API/MVP for the common, real risks",
        "Findings ranked by severity, with the concrete fix for each",
        "No noise — skips anything that would need a full pen-test to confirm",
      ],
      install: ["Point it at the repo, API, or MVP", "Get a prioritised list of real, fixable issues"],
      promptText:
        "Run a practical security audit of this codebase/app. Focus on real, exploitable issues over theoretical ones: authentication gaps, injection risks, exposed secrets, missing input validation, insecure defaults. For each finding, give the severity, where it is, and the concrete fix. Skip anything that would need a full penetration test to actually confirm.\n\nTarget: <repo / API / description>",
      _buildRef: "slashcmd:codex-security-audit-skill-knqmk (Kappaemme-git/codex-security-audit-skill)",
    },
  },
  {
    slug: "tidy",
    name: "Tidy",
    summary: "Safely inventories helper/background processes — nothing gets stopped without approval.",
    description:
      "A **kit** for cleaning up after AI-assisted dev sessions safely: it inventories whatever helper or background processes are running, flags what looks safe to stop, and never actually stops or removes anything without explicit sign-off first. Built for the moment a session ends and you want to know what's still running before you close the laptop.",
    type: "KIT",
    tags: ["cleanup", "processes", "safety"],
    content: {
      whatYouGet: [
        "A clear inventory of currently running helper/background processes",
        "A flagged 'safe to stop' shortlist, with reasoning per item",
        "Nothing destructive happens without explicit approval first",
      ],
      install: ["Run it to inventory what's running", "Review the flagged list", "Approve before anything is stopped"],
      promptText:
        "Inventory the background/helper processes currently running for this project. For each one: what it is, whether it looks safe to stop, and why. Do not stop or remove anything yourself — just report, and wait for explicit approval before taking any destructive action.\n\nContext: <what's running / OS / project>",
      _buildRef: "slashcmd:housemaid-90181 (jgarbarino3/housemaid)",
    },
  },
  {
    slug: "site-backend",
    name: "Site Backend",
    summary: "A lightweight, self-hosted visual site builder and CMS backend.",
    description:
      "A **kit** for standing up a content-driven site fast: a visual page builder wired to a simple, self-hosted CMS backend, so a client can manage their own content without touching code. A lighter-weight sibling to the Sites kit — same job, different foundation.",
    type: "KIT",
    tags: ["cms", "website", "backend"],
    content: {
      whatYouGet: [
        "A visual page builder for non-technical content editing",
        "A simple, self-hosted CMS backend to model content types",
        "A fast path from empty repo to an editable, content-driven site",
      ],
      install: ["Deploy the backend", "Model the content types the site needs", "Build the pages visually"],
      promptText:
        "Stand up a lightweight visual CMS backend for this project. Model the content types it needs, wire a simple visual builder for the pages, and keep the output clean and framework-agnostic so it's easy to self-host.\n\nProject: <what the site needs to do>",
      _buildRef: "slashcmd:backy-coadw (varshneydevansh/backy)",
    },
  },
  {
    slug: "bridge",
    name: "Bridge",
    summary: "Converts a Claude Skill into a Codex-compatible skill, so one definition works on both.",
    description:
      "A **plugin** that closes the interop gap between agent platforms: point it at a Claude Skill folder and it hands back a Codex-compatible version of the same skill, preserving the instructions and behaviour as closely as the target format allows. Useful once Foundry starters need to travel beyond Claude.",
    type: "PLUGIN",
    tags: ["interop", "codex", "claude", "skills"],
    content: {
      whatYouGet: [
        "A Claude Skill folder converted into a Codex-compatible equivalent",
        "Instructions and behaviour preserved as closely as the target format allows",
        "Anything that can't convert cleanly is flagged, not silently dropped",
      ],
      install: ["Point it at a Claude Skill folder", "Get back a Codex-compatible version"],
      promptText:
        "Convert the Claude Skill below into a Codex-compatible skill format, preserving its instructions and behaviour as closely as the target format allows. Flag anything that doesn't have a clean equivalent rather than silently dropping it.\n\nSkill to convert: <paste or describe the Claude Skill>",
      _buildRef: "slashcmd:skillbridge-v70vd (tot3lis/SkillBridge)",
    },
  },
  {
    slug: "session-notes",
    name: "Session Notes",
    summary: "Turns a finished AI session into a clean, curated Obsidian note.",
    description:
      "A **skill** for closing out a build session properly: it distills the conversation into a curated Markdown note — key decisions, what got built, what's next — stripped of sensitive information and the raw transcript, ready to drop straight into an Obsidian vault.",
    type: "SKILL",
    tags: ["obsidian", "notes", "memory"],
    content: {
      whatYouGet: [
        "A curated Markdown note distilled from a finished session",
        "Key decisions and what was built or learned, not the raw transcript",
        "Sensitive information (credentials, personal data) stripped out automatically",
      ],
      install: ["Run it at the end of a session", "Drop the resulting note into an Obsidian vault"],
      promptText:
        "Turn this AI session into a curated Obsidian note. Capture the key decisions, what was built or learned, and any follow-ups — in clean Markdown. Strip out anything sensitive (credentials, personal data) and don't include the raw transcript, just the distilled takeaways.\n\nSession: <paste the session content or summary>",
      _buildRef: "slashcmd:obsidian-memory-closeout-7maz4 (Nova1390/obsidian-memory-closeout)",
    },
  },
  {
    slug: "persona-test",
    name: "Persona Test",
    summary: "Runs five customer personas past a landing page to find where it actually loses them.",
    description:
      "A **skill** that stress-tests a landing page the way real visitors would: it runs five distinct customer personas past the page and reports where each one hesitates, bounces, or converts — surfacing friction a single reviewer would miss.",
    type: "SKILL",
    tags: ["landing-page", "personas", "conversion"],
    content: {
      whatYouGet: [
        "Five persona-driven walkthroughs of the page, each with its own goals and objections",
        "The specific point in the page where each persona would bounce or convert",
        "A prioritised list of the friction worth fixing first",
      ],
      install: ["Point it at the landing page", "Get back each persona's reaction and where it breaks down"],
      promptText:
        "Evaluate this landing page as five distinct customer personas would (pick personas appropriate to the product — e.g. skeptical bargain-hunter, time-pressed exec, technical evaluator, price-sensitive student, brand-loyal returner). For each: what convinces them, where they'd hesitate or bounce, and whether they'd convert. Finish with a prioritised list of the friction points worth fixing first.\n\nLanding page: <URL or description>",
      _buildRef: "slashcmd:codex-startup-user-simulator-skill (Kappaemme-git/codex-startup-user-simulator-skill)",
    },
  },
  {
    slug: "landing-polish",
    name: "Landing Polish",
    summary: "Audits a landing page for the tells that give away 'built by AI' and fixes them.",
    description:
      "A **skill** for the pass a landing page needs right before launch: it hunts down the common AI-generated design tells — generic stock-photo energy, cookie-cutter layout, filler copy — and hands back concrete fixes so the page reads like it was actually designed, not templated.",
    type: "SKILL",
    tags: ["landing-page", "design", "polish"],
    content: {
      whatYouGet: [
        "A flagged list of the AI-generated tells on the page (layout, copy, imagery)",
        "A concrete fix for each, not just 'this looks generic'",
        "A final pass check once the fixes are applied",
      ],
      install: ["Point it at the landing page", "Apply the flagged fixes", "Re-run for a final pass"],
      promptText:
        "Audit this landing page for the tells that give away it was built by AI without a design pass — generic stock imagery, cookie-cutter section layout, filler/placeholder-sounding copy, inconsistent spacing or type. For each issue found, give the concrete fix, not just the observation.\n\nLanding page: <URL or description>",
      _buildRef: "slashcmd:MengToFrontend (Kappaemme-git/MengToFrontend)",
    },
  },
  {
    slug: "deck-export",
    name: "Deck Export",
    summary: "Turns a landing page URL or HTML file into a concise slide deck.",
    description:
      "A **skill** for the moment a page needs to become a deck: point it at a landing page URL or HTML file and get back a concise slide deck (8 slides by default) that captures the same story — useful for a sales leave-behind or an internal pitch, without rebuilding the content by hand.",
    type: "SKILL",
    tags: ["presentations", "export", "sales"],
    content: {
      whatYouGet: [
        "A concise slide deck built from the page's actual content and structure",
        "A sensible default slide count, condensed rather than padded",
        "A version ready to hand off as a sales leave-behind or internal pitch",
      ],
      install: ["Point it at a landing page URL or HTML file", "Get back a ready-to-present deck"],
      promptText:
        "Turn this landing page into a concise slide deck (aim for around 8 slides unless the content genuinely needs more). Keep the page's actual narrative and key points — condense, don't pad — so it reads well as a sales leave-behind or internal pitch.\n\nLanding page: <URL or HTML>",
      _buildRef: "slashcmd:landing-to-powerpoint (Kappaemme-git/landing-to-powerpoint)",
    },
  },
  {
    slug: "saas-social",
    name: "SaaS Social",
    summary: "Turns a SaaS product URL into ready-to-post copy for X, LinkedIn and Reddit.",
    description:
      "A **skill** that turns a SaaS product's URL into platform-native launch/promo copy — matching the voice and format each platform actually rewards, so a founder isn't posting the same generic blurb everywhere.",
    type: "SKILL",
    tags: ["marketing", "social", "saas"],
    content: {
      whatYouGet: [
        "Platform-native copy for X, LinkedIn and Reddit — not one blurb pasted three times",
        "A hook suited to each platform's actual audience and format",
        "Ready to post, with minor edits for tone if needed",
      ],
      install: ["Point it at the SaaS product URL", "Get back copy tailored to each platform"],
      promptText:
        "Write launch/promo copy for this SaaS product, tailored separately to X, LinkedIn and Reddit — match each platform's actual voice and format rather than reusing one blurb. Lead with a hook suited to that platform's audience.\n\nProduct: <URL or description>",
      _buildRef: "slashcmd:codex-sell-my-saas-skill (Kappaemme-git/codex-sell-my-saas-skill)",
    },
  },
  {
    slug: "site-snapshots",
    name: "Site Snapshots",
    summary: "Generates polished desktop and mobile screenshots of a live site, ready for social or a deck.",
    description:
      "A **skill** for turning a live site into presentation-ready visuals: it captures polished desktop and mobile screenshots at sensible custom dimensions, so there's always a clean shot on hand for a deck, a social post, or a case study without a manual screenshot-and-crop session.",
    type: "SKILL",
    tags: ["screenshots", "marketing", "assets"],
    content: {
      whatYouGet: [
        "Polished desktop and mobile screenshots of the live site",
        "Custom, presentation-ready dimensions rather than a raw browser capture",
        "Assets ready to drop into a deck, case study or social post",
      ],
      install: ["Point it at the live site URL", "Get back desktop + mobile screenshots"],
      promptText:
        "Capture polished, presentation-ready screenshots of this live site — both desktop and mobile views, at clean custom dimensions (not a raw unedited browser capture). These are for a deck / case study / social post, so frame accordingly.\n\nSite: <URL>",
      _buildRef: "slashcmd:site-post-screenshots (Kappaemme-git/site-post-screenshots)",
    },
  },
  {
    slug: "complexity-pass",
    name: "Complexity Pass",
    summary: "Finds the algorithmic complexity and performance bottlenecks actually worth fixing.",
    description:
      "A **skill** for a codebase performance review: it examines the code for real algorithmic complexity issues and bottlenecks — not stylistic nitpicks — and hands back concrete optimisation recommendations ranked by actual impact.",
    type: "SKILL",
    tags: ["performance", "codebase", "optimization"],
    content: {
      whatYouGet: [
        "The actual algorithmic complexity/performance issues in the codebase",
        "Concrete optimisation recommendations, not stylistic nitpicks",
        "Findings ranked by real-world impact",
      ],
      install: ["Point it at the codebase or a specific module", "Get back ranked optimisation recommendations"],
      promptText:
        "Examine this codebase for real algorithmic complexity issues and performance bottlenecks — not style nitpicks. For each finding: where it is, why it's a real problem (not theoretical), the concrete fix, and its actual impact. Rank by impact.\n\nCodebase / module: <repo or code>",
      _buildRef: "slashcmd:codex-complexity-optimizer (Kappaemme-git/codex-complexity-optimizer)",
    },
  },
  {
    slug: "pressure-test",
    name: "Pressure Test",
    summary: "Stress-tests a startup concept's assumptions before a client bets a build on it.",
    description:
      "A **skill** for the conversation before the build starts: it interrogates a startup concept's core assumptions, surfaces the weaknesses a founder is too close to see, and gives founder-focused analysis — MVP scope, customer acquisition — so the build that follows is aimed at something real.",
    type: "SKILL",
    tags: ["strategy", "validation", "planning"],
    content: {
      whatYouGet: [
        "The core assumptions the concept is actually resting on, made explicit",
        "The critical weaknesses in those assumptions, argued honestly",
        "Founder-focused next steps: MVP scope and a customer acquisition angle",
      ],
      install: ["Describe the startup concept", "Get back the assumptions, weaknesses and next steps"],
      promptText:
        "Pressure-test this startup concept. Identify the core assumptions it depends on, argue honestly against them (don't just cheerlead), and surface the critical weaknesses a founder too close to the idea might miss. Finish with founder-focused next steps: a lean MVP scope and a realistic customer acquisition angle.\n\nConcept: <description>",
      _buildRef: "slashcmd:codex-startup-pressure-test-skill (Kappaemme-git/codex-startup-pressure-test-skill)",
    },
  },
];

// The Prompts category — a large pack of PROMPT-type starters parsed from the prompt packs into
// src/data/prompt-starters.json (see scripts/parse-prompt-library.mjs). Gitwork-branded; each
// carries its provenance only in content._buildRef, which serializeStarter strips before any
// payload leaves the server. Combined with the core catalog into the seeded set.
export const STARTER_BUILT_INS: BuiltInStarter[] = [
  ...CORE_BUILT_INS,
  ...(PROMPT_STARTERS as unknown as BuiltInStarter[]),
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
  "chat-digest": `${OWNED}/chat-digest`,
  "audit-pass": `${OWNED}/audit-pass`,
  tidy: `${OWNED}/tidy`,
  "site-backend": `${OWNED}/site-backend`,
  bridge: `${OWNED}/bridge`,
  "session-notes": `${OWNED}/session-notes`,
  "persona-test": `${OWNED}/persona-test`,
  "landing-polish": `${OWNED}/landing-polish`,
  "deck-export": `${OWNED}/deck-export`,
  "saas-social": `${OWNED}/saas-social`,
  "site-snapshots": `${OWNED}/site-snapshots`,
  "complexity-pass": `${OWNED}/complexity-pass`,
  "pressure-test": `${OWNED}/pressure-test`,
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
        // Only promote to featured from the catalog — never un-feature, so user favourites persist.
        ...(s.featured ? { featured: true } : {}),
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
        featured: s.featured ?? false,
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
