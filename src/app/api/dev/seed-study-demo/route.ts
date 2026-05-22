import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ensureBaseRecords } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

// ── Demo transcript helpers ────────────────────────────────────────────────────

function mkExchange(question: string, spoken: string, sentiment: string, painPoints: string[], delights: string[], confusionPoints: string[], isFollowUp = false, depth = 0) {
  return {
    question,
    response: { spoken, sentiment, painPoints, delights, confusionPoints },
    isFollowUp,
    depth,
  };
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const STUDY_TITLE = "Project management tool onboarding evaluation";
const PROBLEM_STATEMENT =
  "Our new SaaS project management tool has a 34% drop-off rate during the first 7-day onboarding flow. We need to understand which moments cause confusion or friction and why users abandon before reaching their first 'aha' moment.";
const RESEARCH_GOALS = [
  "Identify the top 3 friction points in the current onboarding flow",
  "Understand what 'success' looks like from the user's perspective in the first week",
  "Determine whether the feature discovery order matches user mental models",
];

const PERSONA_IDS = ["maya", "helen", "daniel", "sam"];

const PLAN_QUESTIONS = [
  {
    text: "Walk me through what you were trying to accomplish the first time you signed up for a new project management tool. What was your goal in that moment?",
    personaIds: ["maya", "helen", "daniel", "sam"],
    turnType: "SINGLE" as const,
    orderIndex: 0,
    rationale: "Sets context and surfaces job-to-be-done before introducing any product specifics.",
  },
  {
    text: "When you first land in a new tool, what's the first thing you typically look for or try to do?",
    personaIds: ["maya", "helen", "daniel", "sam"],
    turnType: "SINGLE" as const,
    orderIndex: 1,
    rationale: "Reveals natural exploration patterns and expected entry points.",
  },
  {
    text: "Describe a time when an onboarding flow helped you understand a product quickly — what made it click?",
    personaIds: ["maya", "helen", "daniel", "sam"],
    turnType: "SINGLE" as const,
    orderIndex: 2,
    rationale: "Surfaces benchmarks and success criteria from the user's own experience.",
  },
  {
    text: "What would make you abandon a tool in the first few days?",
    personaIds: ["maya", "helen", "daniel", "sam"],
    turnType: "SINGLE" as const,
    orderIndex: 3,
    rationale: "Directly targets the drop-off problem from a user-motivation perspective.",
  },
  {
    text: "Imagine you've just created your first project in a new tool. What would you expect to see or be able to do immediately after?",
    personaIds: ["maya", "helen", "daniel", "sam"],
    turnType: "SINGLE" as const,
    orderIndex: 4,
    rationale: "Tests mental model alignment with the post-project-creation flow.",
  },
  {
    text: "If you could redesign the first 10 minutes of using this kind of tool, what would you include or remove?",
    personaIds: ["maya", "helen", "daniel", "sam"],
    turnType: "SINGLE" as const,
    orderIndex: 5,
    rationale: "Generative closing question — surfaces unprompted feature desires and removal candidates.",
  },
];

// Per-persona transcripts
const TRANSCRIPTS: Record<string, { turns: object[]; synthesis: object }> = {
  maya: {
    turns: [
      {
        questionText: PLAN_QUESTIONS[0].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[0].text,
            "I was joining a design sprint mid-flight — the team had been using the tool for a week and I had maybe 20 minutes to get oriented before a standup. I wasn't trying to learn the tool, I was trying to find the brief document and the task assigned to me. That's it.",
            "neutral",
            ["No guest or read-only mode obvious from the homepage", "Had to create an account before seeing anything"],
            [],
            ["Wasn't sure if I needed a paid seat or could observe for free"],
          ),
        ],
        synthesis: {
          summary: "Maya's first use was task-driven under time pressure, not exploratory. She needed fast access to a specific artefact, not a guided tour.",
          keyInsights: ["Time-pressure onboarding is common — joining mid-sprint is a real scenario", "Guest access friction caused immediate confusion"],
          sentimentDistribution: { neutral: 1 },
          commonPainPoints: ["Account creation gate before value preview"],
          commonDelights: [],
        },
      },
      {
        questionText: PLAN_QUESTIONS[1].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[1].text,
            "I look for something that already looks like work in progress — not an empty template. If I see a blank canvas with a 'get started' button I immediately feel like this is going to take 30 minutes I don't have. Show me a populated example immediately.",
            "neutral",
            ["Empty state on first load feels like homework"],
            ["Tools that pre-populate with example content feel trustworthy"],
            [],
          ),
        ],
        synthesis: {
          summary: "Maya strongly prefers populated example states over blank canvases. Empty onboarding screens trigger avoidance behaviour.",
          keyInsights: ["Pre-populated demo data dramatically lowers anxiety", "Blank-canvas tools signal high time cost"],
          sentimentDistribution: { neutral: 1 },
          commonPainPoints: ["Empty first-load state"],
          commonDelights: ["Example content on first load"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[2].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[2].text,
            "Figma, honestly. I opened it, saw a canvas with stuff on it, grabbed a shape, moved it. Done — I understood the tool in 90 seconds. No tutorial, no email sequence. The product itself taught me by being immediately usable.",
            "positive",
            [],
            ["Immediate interactivity = fastest possible learning loop", "No prerequisite reading before first action"],
            [],
          ),
        ],
        synthesis: {
          summary: "Figma's approach of immediate interactivity without a tutorial is Maya's gold standard. The product itself was the teacher.",
          keyInsights: ["Action-first > explanation-first for design-oriented users", "Tutorial-free onboarding can work when the UI affords exploration"],
          sentimentDistribution: { positive: 1 },
          commonPainPoints: [],
          commonDelights: ["Immediate interactivity"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[3].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[3].text,
            "Mandatory tutorial videos. If I have to watch a 3-minute explainer before I can touch the product I'm gone. Same with email sequences that ask me to 'complete your setup' — I haven't even decided if I like it yet. Stop selling me before I've tried it.",
            "frustrated",
            ["Forced tutorial gates", "Premature upsell emails during evaluation"],
            [],
            ["Why does a free trial send me 5 emails in 48 hours?"],
          ),
        ],
        synthesis: {
          summary: "Forced video tutorials and premature email marketing are Maya's primary abandonment triggers. They signal the tool prioritises its funnel over user time.",
          keyInsights: ["Tutorial gates create immediate resistance in experienced users", "Email cadence perceived as pushy before value is proven"],
          sentimentDistribution: { frustrated: 1 },
          commonPainPoints: ["Mandatory tutorial videos", "Aggressive email sequences"],
          commonDelights: [],
        },
      },
      {
        questionText: PLAN_QUESTIONS[4].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[4].text,
            "I'd expect to immediately invite a teammate and assign them a task. If I can't do that within the first 2 minutes of creating a project, the tool isn't ready for real work. Collaboration is the whole point.",
            "neutral",
            ["Invite flow buried after project creation", "Can't assign tasks without setting up roles first"],
            [],
            [],
          ),
          mkExchange(
            "And if invite is easy — what comes right after that in your mind?",
            "Seeing their face on the task. That little avatar next to a task title is surprisingly powerful — it makes the tool feel alive and used, not just a personal to-do list.",
            "positive",
            [],
            ["Teammate avatar on tasks creates sense of shared purpose"],
            [],
            true,
            1,
          ),
        ],
        synthesis: {
          summary: "Collaboration features must be immediately accessible post-project-creation. Teammate presence (avatars) signals the tool is genuinely collaborative.",
          keyInsights: ["Invite flow discoverability is critical first-project feature", "Visual teammate presence creates emotional 'tool is alive' moment"],
          sentimentDistribution: { neutral: 1, positive: 1 },
          commonPainPoints: ["Buried invite flow"],
          commonDelights: ["Teammate avatar visibility"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[5].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[5].text,
            "I'd remove the permissions setup entirely from onboarding. Nobody knows what permissions they need on day one. I'd add a single 'duplicate this example project' button instead — let me start from something real. And I'd surface the keyboard shortcuts panel immediately because power users will find it and think 'this tool respects me'.",
            "positive",
            ["Permissions setup during onboarding creates decision paralysis"],
            ["Example project duplication", "Early keyboard shortcut exposure"],
            [],
          ),
        ],
        synthesis: {
          summary: "Maya's redesign removes decision-heavy setup (permissions) and replaces it with example-first, power-user signals (keyboard shortcuts).",
          keyInsights: ["Permissions gate creates paralysis on day one", "Keyboard shortcuts panel early signals product sophistication"],
          sentimentDistribution: { positive: 1 },
          commonPainPoints: ["Day-one permissions setup"],
          commonDelights: ["Example project quick-start", "Early keyboard shortcut discovery"],
        },
      },
    ],
    synthesis: {
      personaId: "maya",
      personaName: "Maya",
      overallSentiment: "mixed",
      keyThemes: ["Action-before-explanation", "Collaboration as core value", "Respect for user time"],
      topPainPoints: ["Empty first-load state", "Forced tutorial gates", "Permissions setup during onboarding"],
      topDelights: ["Pre-populated example data", "Immediate interactivity", "Keyboard shortcut discoverability"],
      notableQuotes: [
        "Show me a populated example immediately.",
        "The product itself taught me by being immediately usable.",
        "Stop selling me before I've tried it.",
        "That little avatar next to a task title makes the tool feel alive.",
      ],
      summary:
        "Maya is a proficient, time-pressured user who evaluates tools through the lens of 'can I do real work immediately?' She has zero patience for tutorial gates, blank canvases, or permissions dialogs on day one. Her gold standard is Figma's action-first model. The biggest win for her would be pre-populated example data and a visible invite flow within the first project screen.",
    },
  },

  helen: {
    turns: [
      {
        questionText: PLAN_QUESTIONS[0].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[0].text,
            "I was evaluating tools to replace our current system for a team of 40. I needed to understand the pricing model, the admin controls, and whether our IT team would approve it before I could even think about trialling it. The first thing I did was read the pricing page for 15 minutes.",
            "neutral",
            ["Pricing not visible until late in the sign-up flow", "No enterprise/SSO mention on the homepage"],
            [],
            ["Pricing page had a clear per-seat breakdown"],
          ),
        ],
        synthesis: {
          summary: "Helen's onboarding is driven by procurement due diligence, not personal exploration. Pricing, admin controls and IT compliance are the first gates.",
          keyInsights: ["Enterprise buyers read pricing before trialling", "SSO/IT approval is a prerequisite, not a feature"],
          sentimentDistribution: { neutral: 1 },
          commonPainPoints: ["No enterprise signals on homepage"],
          commonDelights: ["Clear per-seat pricing"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[1].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[1].text,
            "Admin panel. I need to know what controls I have before I invite anyone. Can I set data retention policies? Can I control who can create projects? Can I export everything if we decide to leave? These are my first questions, always.",
            "neutral",
            ["Admin panel not visible to trial users", "Data export option not obvious"],
            [],
            [],
          ),
        ],
        synthesis: {
          summary: "Helen's primary orientation is administrative control and data governance, not feature discovery. She evaluates 'what can I control?' before 'what can I do?'",
          keyInsights: ["Admin panel access should be available to trial account owners", "Data portability (export) is a trust signal for enterprise buyers"],
          sentimentDistribution: { neutral: 1 },
          commonPainPoints: ["Admin controls hidden from trial users"],
          commonDelights: [],
        },
      },
      {
        questionText: PLAN_QUESTIONS[2].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[2].text,
            "Notion, actually. Our team adopted it without me needing to run a training session. The templates meant everyone could start from a consistent structure, and the fact that it worked like a document — something everyone already understands — meant the learning curve was essentially zero.",
            "positive",
            [],
            ["Zero training session required", "Templates drove team consistency from day one"],
            [],
          ),
        ],
        synthesis: {
          summary: "Helen values tools that don't require top-down training initiatives. Notion's document metaphor and templates drove adoption without her direct involvement.",
          keyInsights: ["Self-serve adoption reduces IT/L&D burden", "Familiar metaphors (documents) lower team resistance"],
          sentimentDistribution: { positive: 1 },
          commonPainPoints: [],
          commonDelights: ["No training required", "Template-driven consistency"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[3].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[3].text,
            "No GDPR documentation or DPA. Any tool handling our project data needs to show me a Data Processing Agreement within the first click from their pricing page. If I can't find it, I assume it doesn't exist and the evaluation ends there.",
            "frustrated",
            ["DPA not linked from pricing page", "GDPR documentation buried in legal subdirectory"],
            [],
            ["Why make the compliance docs so hard to find? It looks like you're hiding something."],
          ),
        ],
        synthesis: {
          summary: "Missing or hidden GDPR/DPA documentation is an instant disqualifier for Helen. Compliance transparency is a trust prerequisite, not a feature.",
          keyInsights: ["DPA must be one click from pricing for enterprise buyers", "Buried legal docs actively damage trust"],
          sentimentDistribution: { frustrated: 1 },
          commonPainPoints: ["DPA not linked from pricing", "Compliance docs buried"],
          commonDelights: [],
        },
      },
      {
        questionText: PLAN_QUESTIONS[4].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[4].text,
            "I'd expect a prompt to set up team roles and then invite people from my directory. If it can connect to our Azure AD that would be the ideal — single sign-on means my IT team stops asking questions immediately.",
            "neutral",
            ["No Azure AD / SAML integration in trial tier", "Role setup comes after project creation, not before"],
            [],
            [],
          ),
        ],
        synthesis: {
          summary: "Helen wants team structure (roles + SSO) established before project work begins. SSO is not a nice-to-have — it's an IT compliance requirement.",
          keyInsights: ["SSO/SAML integration is a procurement prerequisite", "Role setup should precede project creation in enterprise onboarding"],
          sentimentDistribution: { neutral: 1 },
          commonPainPoints: ["SSO unavailable in trial tier", "Role setup sequencing mismatch"],
          commonDelights: [],
        },
      },
      {
        questionText: PLAN_QUESTIONS[5].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[5].text,
            "I'd add a dedicated 'admin setup' track separate from the regular user onboarding. Right now both flows are identical and that's wrong. An admin needs compliance docs, user provisioning, and billing visibility before they can evaluate properly. A regular user just needs to create a task. Separate the journeys.",
            "neutral",
            ["Single onboarding flow for all user types is inappropriate"],
            ["A clearly separate admin-first onboarding track would build immediate trust"],
            [],
          ),
        ],
        synthesis: {
          summary: "Helen's core redesign request is role-aware onboarding: admins and end-users have fundamentally different first-session needs that shouldn't share a flow.",
          keyInsights: ["Admin track vs. user track is a critical UX distinction", "Compliance-first admin flow dramatically accelerates enterprise procurement"],
          sentimentDistribution: { neutral: 1 },
          commonPainPoints: ["One-size-fits-all onboarding"],
          commonDelights: ["Admin-specific onboarding track concept"],
        },
      },
    ],
    synthesis: {
      personaId: "helen",
      personaName: "Helen",
      overallSentiment: "neutral",
      keyThemes: ["Procurement-driven evaluation", "Compliance and governance", "Admin-vs-user journey separation"],
      topPainPoints: ["No enterprise signals at onboarding entry", "DPA/GDPR docs buried or missing", "Single onboarding flow ignores admin needs"],
      topDelights: ["Clear per-seat pricing", "Self-serve adoption potential", "Template-driven team consistency"],
      notableQuotes: [
        "The first thing I did was read the pricing page for 15 minutes.",
        "Admin panel. I need to know what controls I have before I invite anyone.",
        "If I can't find the DPA, I assume it doesn't exist and the evaluation ends there.",
        "Separate the journeys — an admin and a regular user have nothing in common on day one.",
      ],
      summary:
        "Helen evaluates tools as a procurement decision, not a personal preference. Her first-session needs are radically different from an end user's: admin controls, compliance docs, SSO/Azure AD, and data portability. The current onboarding flow treats her identically to a solo freelancer and that misalignment ends evaluations before they start. A dedicated admin onboarding track with compliance visibility would meaningfully improve enterprise conversion.",
    },
  },

  daniel: {
    turns: [
      {
        questionText: PLAN_QUESTIONS[0].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[0].text,
            "I was a new dev joining a team mid-sprint. My tech lead had set up the board but no one had explained the naming conventions or how they structured epics vs stories. I ended up reading 20 closed tickets to reverse-engineer the workflow. That was my onboarding.",
            "frustrated",
            ["No onboarding path for 'joining an existing team' use case", "Workflow documentation lives in closed tickets not a readme"],
            [],
            ["Found the API docs fast — that was well linked"],
          ),
        ],
        synthesis: {
          summary: "Daniel's onboarding was entirely reverse-engineered from existing data. The tool had no 'joining mid-project' path which is extremely common for developers.",
          keyInsights: ["'Join existing team' is as common as 'start new project' for devs", "Closed tickets as informal documentation is a real anti-pattern"],
          sentimentDistribution: { frustrated: 1 },
          commonPainPoints: ["No mid-project join flow", "Workflow context lives in closed tickets"],
          commonDelights: ["API docs well-linked"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[1].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[1].text,
            "The API or CLI. I want to know if I can automate this thing or integrate it into our existing pipeline before I commit any time to it. If there's no public API I'm already less interested. If there's a good CLI I get very excited.",
            "positive",
            ["API docs not visible from main nav in trial mode"],
            ["CLI availability is a major trust signal for developer tools"],
            [],
          ),
          mkExchange(
            "What does 'good CLI' mean to you specifically?",
            "Tab-complete, sensible defaults, and it respects my dotfiles. Tools that hard-code paths or require root are immediate red flags. I want it to feel like it was written by someone who uses a terminal daily, not someone who bolted a CLI onto a GUI product as an afterthought.",
            "positive",
            [],
            ["Tab completion signals craft and developer respect"],
            [],
            true,
            1,
          ),
        ],
        synthesis: {
          summary: "Daniel evaluates tools by their API/CLI quality as a proxy for overall craft. A well-made CLI signals the product was built by people who understand developer workflows.",
          keyInsights: ["API/CLI discoverability is a first-session requirement for developers", "CLI quality signals overall product care to dev users"],
          sentimentDistribution: { positive: 2 },
          commonPainPoints: ["API docs buried from trial mode nav"],
          commonDelights: ["CLI tab-completion signals developer respect"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[2].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[2].text,
            "Linear. It was fast, had keyboard shortcuts for everything, and the issue creation flow was genuinely the quickest I'd seen. It also had GitHub integration that just worked — I linked a PR and the issue moved automatically. That automation in the first 5 minutes told me the tool understood how I actually work.",
            "positive",
            [],
            ["Linear's speed and keyboard-first design", "GitHub integration that worked immediately", "Automation on first use built trust rapidly"],
            [],
          ),
        ],
        synthesis: {
          summary: "Linear set Daniel's benchmark: keyboard-first, fast, and with GitHub automation visible in the first 5 minutes. Automation that 'just works' early builds rapid trust.",
          keyInsights: ["Speed is the primary quality signal for developer tools", "First-use automation (GitHub PR linking) dramatically accelerates trust"],
          sentimentDistribution: { positive: 1 },
          commonPainPoints: [],
          commonDelights: ["Keyboard-first navigation", "First-use GitHub automation"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[3].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[3].text,
            "Slow. Not slow like 'needs a second to load' — slow like every interaction has a spinner. If I create a task and have to wait 500ms to see it, I'm out. Also: if the mobile app is the primary experience. I work in a terminal all day. Give me a desktop-first product.",
            "frustrated",
            ["Any interaction with a visible spinner kills the flow", "Mobile-first design language signals wrong target audience"],
            [],
            [],
          ),
        ],
        synthesis: {
          summary: "Perceived latency on task creation is Daniel's top abandonment trigger. Mobile-first design language signals a product aimed at a different user type.",
          keyInsights: ["Optimistic UI updates are essential for developer tool retention", "Desktop-first/keyboard-first is a strong developer signal"],
          sentimentDistribution: { frustrated: 1 },
          commonPainPoints: ["Visible loading spinners on task creation", "Mobile-first design patterns"],
          commonDelights: [],
        },
      },
      {
        questionText: PLAN_QUESTIONS[4].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[4].text,
            "Connect it to my GitHub repos. Immediately. Not as a setting I configure in integrations — I want the product to say 'I see you have GitHub, want to connect it?' right after I create the project. That handshake is the moment the tool becomes useful instead of just pretty.",
            "positive",
            ["Integrations buried in settings, not surface-level"],
            ["Proactive GitHub connection prompt after project creation"],
            [],
          ),
        ],
        synthesis: {
          summary: "Daniel wants GitHub connection surfaced proactively post-project-creation, not buried in settings. That integration moment is the product's value inflection point for devs.",
          keyInsights: ["Proactive integration prompts outperform buried settings pages", "GitHub connection = value inflection point for developer users"],
          sentimentDistribution: { positive: 1 },
          commonPainPoints: ["Integrations buried in settings drawer"],
          commonDelights: ["Proactive GitHub connect prompt"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[5].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[5].text,
            "Start with a GitHub import. If the tool can read my existing repos and auto-create a backlog from open issues, I'm sold in under 2 minutes. No manual setup. Remove the 'tell us about your team size' survey — I don't care. Add a dark mode toggle that persists immediately. And show me the keyboard shortcut cheatsheet on first load, pinned, until I dismiss it.",
            "positive",
            ["'Tell us about your team' surveys create friction for solo devs"],
            ["GitHub import to auto-create backlog", "Persistent dark mode from first load", "Keyboard shortcut cheatsheet pinned on first visit"],
            [],
          ),
        ],
        synthesis: {
          summary: "Daniel's redesign is import-first: pull existing GitHub data to eliminate manual setup. Remove friction surveys; add dark mode and keyboard shortcuts as immediate signals of developer-first design.",
          keyInsights: ["GitHub issue import eliminates setup entirely for dev teams", "Dark mode persistence signals developer culture understanding"],
          sentimentDistribution: { positive: 1 },
          commonPainPoints: ["Team-size surveys at onboarding"],
          commonDelights: ["GitHub import to auto-backlog", "Dark mode first-load toggle"],
        },
      },
    ],
    synthesis: {
      personaId: "daniel",
      personaName: "Daniel",
      overallSentiment: "mixed",
      keyThemes: ["Speed and optimistic UI", "API/CLI quality as craft signal", "GitHub-first workflow integration"],
      topPainPoints: ["Visible spinners on task creation", "API/integrations buried from trial mode", "No 'join existing team' onboarding path"],
      topDelights: ["Keyboard shortcuts", "First-use GitHub automation", "CLI quality signals developer care"],
      notableQuotes: [
        "If there's a good CLI I get very excited.",
        "Tab-complete, sensible defaults — I want it to feel like it was written by someone who uses a terminal daily.",
        "That handshake [GitHub connection] is the moment the tool becomes useful instead of just pretty.",
        "Start with a GitHub import — if the tool can read my repos I'm sold in under 2 minutes.",
      ],
      summary:
        "Daniel's evaluation is overwhelmingly API and automation-driven. Speed, GitHub integration, and CLI quality are proxies for overall product craft. The current onboarding has no developer-specific path: it buries integrations, lacks a 'join existing project' flow, and has no GitHub import option. Fixing these three points would transform the developer conversion rate.",
    },
  },

  sam: {
    turns: [
      {
        questionText: PLAN_QUESTIONS[0].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[0].text,
            "I had just hired my 4th person and we'd been using a spreadsheet to track work. It was falling apart. I needed something we could all see in real-time that took 30 minutes to set up, not 30 days. I had literally no time — we had a client deadline in 72 hours.",
            "frustrated",
            ["No indication of setup time on landing page", "Couldn't find a 'quick start' option vs 'full configuration'"],
            [],
            ["Free tier was available immediately — no credit card"],
          ),
        ],
        synthesis: {
          summary: "Sam's adoption driver was immediate team coordination need under deadline pressure. He needed a working shared view in under 30 minutes with zero IT involvement.",
          keyInsights: ["Deadline-driven adoption is common for small founder teams", "Setup time estimates on landing page would directly reduce bounce rate"],
          sentimentDistribution: { frustrated: 1 },
          commonPainPoints: ["No setup time indication", "No 'quick start' vs 'full setup' distinction"],
          commonDelights: ["No credit card required for free tier"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[1].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[1].text,
            "Invite link. I need to get my team in before I do anything else. A tool I can't share in 60 seconds is useless to me. My second move is adding tasks from a rough mental list I've been carrying around — I want to brain-dump everything immediately so it's out of my head.",
            "positive",
            ["Invite link buried under 'team settings' rather than top-level"],
            ["Immediate brain-dump capability — just type tasks rapidly"],
            [],
          ),
          mkExchange(
            "What does that rapid task creation feel like in practice?",
            "Like Google Keep but with assignments. Press enter, next task. Press tab, assign. No modal, no form. The fewer clicks per task the better — I'm entering 20 tasks in 3 minutes when I'm in that mode.",
            "positive",
            [],
            ["Inline task creation (enter = next task)", "Tab to assign without breaking flow"],
            ["Any modal or drawer for basic task creation"],
            true,
            1,
          ),
        ],
        synthesis: {
          summary: "Sam's first action is always invite, then rapid brain-dump. He needs frictionless bulk task entry and direct team access, both within 60 seconds of first load.",
          keyInsights: ["Invite link as top-level CTA is critical for small team adoption", "Bulk task entry (enter = new task) is a primary founder use case"],
          sentimentDistribution: { positive: 2 },
          commonPainPoints: ["Invite link buried in settings"],
          commonDelights: ["Rapid sequential task entry", "Tab-to-assign without modal"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[2].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[2].text,
            "Stripe's dashboard, weirdly. Not a PM tool. But the first time I logged in it showed me a chart with real data about my test transactions immediately — it didn't make me set up a payment before I could see the interface. That approach of 'here's the interface with your actual data' is what I want from a PM tool.",
            "positive",
            [],
            ["Showing real user data immediately rather than requiring setup first"],
            [],
          ),
        ],
        synthesis: {
          summary: "Sam's onboarding benchmark is Stripe's 'real data immediately' philosophy. He wants the PM tool to be immediately functional with his data, not to demand configuration before value.",
          keyInsights: ["Immediate value with real data > configuration before access", "Stripe's dashboard as benchmark: chart on first login"],
          sentimentDistribution: { positive: 1 },
          commonPainPoints: [],
          commonDelights: ["Real data on first login without prerequisite setup"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[3].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[3].text,
            "If my team tells me it's confusing. I can adapt to almost anything but if the person I hired last week — who's never used a PM tool before — can't figure out how to mark a task done without asking me, the tool has failed. My team's confusion is my problem.",
            "frustrated",
            ["If team member can't self-serve basic actions, cost falls back on founder"],
            [],
            [],
          ),
        ],
        synthesis: {
          summary: "Sam's abandonment threshold is team confusion, not personal confusion. His team's ability to self-serve basic actions without his help is the tool's actual value proposition.",
          keyInsights: ["For founders, team adoption friction is the primary retention risk", "New hire onboarding (first-time PM tool user) is a critical test case"],
          sentimentDistribution: { frustrated: 1 },
          commonPainPoints: ["Basic actions unclear to first-time PM tool users"],
          commonDelights: [],
        },
      },
      {
        questionText: PLAN_QUESTIONS[4].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[4].text,
            "A 'what's next' prompt. Something like 'you created your first project — here are the 3 most useful things to do now.' Not a tour, not a checklist with 12 items, just 3 high-leverage next actions. I can ignore it if I want but it's there if I'm stuck.",
            "positive",
            ["Post-action guidance usually takes the form of a long checklist"],
            ["Minimal 3-action 'what's next' prompt post-project-creation"],
            ["12-item checklists feel overwhelming when you're under deadline"],
          ),
        ],
        synthesis: {
          summary: "Sam wants minimal, contextual next-action prompts rather than exhaustive checklists. Three high-leverage actions is ideal — more than that creates decision paralysis.",
          keyInsights: ["Contextual 3-action prompts outperform 12-item checklists for busy founders", "Optional guidance respects user agency while reducing uncertainty"],
          sentimentDistribution: { positive: 1 },
          commonPainPoints: ["Long post-action checklists"],
          commonDelights: ["Minimal contextual 'what's next' prompt"],
        },
      },
      {
        questionText: PLAN_QUESTIONS[5].text,
        exchanges: [
          mkExchange(
            PLAN_QUESTIONS[5].text,
            "Put the invite link in huge letters at the top of the first screen. Remove every question that isn't 'what's the project name'. Add a 5-minute setup guarantee on the homepage — something like 'your team will have a live board in 5 minutes or we've failed'. And make the mobile app as good as the desktop — half my team checks tasks on their phone during client meetings.",
            "positive",
            ["Mobile experience clearly secondary to desktop"],
            ["Top-level invite link on first screen", "5-minute setup guarantee promise"],
            [],
          ),
        ],
        synthesis: {
          summary: "Sam's redesign is radical simplification: one field (project name), guaranteed fast setup, top-level invite. He also flags mobile parity as critical — his team uses phones as primary access during client interactions.",
          keyInsights: ["Setup time guarantee is a compelling homepage conversion signal", "Mobile parity matters when team is client-facing"],
          sentimentDistribution: { positive: 1 },
          commonPainPoints: ["Mobile app clearly secondary to desktop"],
          commonDelights: ["5-minute setup guarantee as homepage promise", "Simplified first screen with only project name field"],
        },
      },
    ],
    synthesis: {
      personaId: "sam",
      personaName: "Sam",
      overallSentiment: "mixed",
      keyThemes: ["Speed of team activation", "Founder as bottleneck reducer", "Real-data immediacy"],
      topPainPoints: ["Invite link buried in settings", "No setup time estimate", "Mobile app secondary to desktop"],
      topDelights: ["No credit card free tier", "Rapid bulk task entry", "Minimal contextual 'what's next' prompt"],
      notableQuotes: [
        "A tool I can't share in 60 seconds is useless to me.",
        "My team's confusion is my problem.",
        "Put the invite link in huge letters at the top of the first screen.",
        "Make the mobile app as good as the desktop — half my team checks tasks on their phone during client meetings.",
      ],
      summary:
        "Sam's onboarding needs are defined by urgency and team activation speed. He needs to invite his team and enter tasks within 60 seconds of first login — everything else is secondary. His abandonment trigger is not personal frustration but team confusion, making ease-of-use for first-time users a founder-retention metric. Mobile parity is also non-negotiable for his client-facing team.",
    },
  },
};

const REPORT = {
  executiveSummary:
    "The current onboarding flow has a critical structural mismatch: it presents a single, role-agnostic journey to four radically different user types. Power users (Maya) want action-first and zero tutorial gates. Enterprise buyers (Helen) need compliance and admin controls before anything else. Developers (Daniel) evaluate by API quality and GitHub integration. Founders (Sam) need team activation in under 60 seconds. The 34% drop-off likely concentrates at two specific moments: the blank-canvas first load (which repels Maya and Sam) and the missing admin/compliance track (which ends Helen's evaluation immediately). Addressing these two moments would have the highest impact on activation rates.",
  keyFindings: [
    "All four personas had negative or frustrated reactions to the blank first-load state — pre-populated example data was universally preferred",
    "Invite link discoverability is the top day-one priority for founders and team-oriented users; currently buried under team settings",
    "Enterprise procurement is blocked before trial even begins — DPA not linked from pricing page disqualifies immediately",
    "Developer users evaluate API/CLI quality as a proxy for overall product craft — developer docs buried from trial mode is a critical gap",
    "Post-project-creation guidance takes the form of a long checklist which creates decision paralysis; a minimal 3-action 'what's next' prompt was consistently preferred",
    "GitHub integration is expected immediately post-project-creation by developer users, not as a buried settings option",
    "Mobile parity is non-negotiable for client-facing founder teams but the current mobile experience is clearly secondary",
  ],
  themes: [
    {
      theme: "Action-before-explanation",
      description:
        "All four personas resisted tutorial-first or configuration-first flows. The dominant mental model is: let me do something real first, then teach me. This contradicts the current 'complete your setup' onboarding approach.",
      personaIds: ["maya", "daniel", "sam"],
    },
    {
      theme: "Role-aware onboarding gap",
      description:
        "The current single-track onboarding is appropriate for none of the four user types. Admin buyers need compliance visibility first; developers need API access; founders need team activation; power users need an empty canvas with example data. A branching first-session experience is the highest-leverage structural fix.",
      personaIds: ["maya", "helen", "daniel", "sam"],
    },
    {
      theme: "Integration as immediate value",
      description:
        "GitHub, Azure AD, and mobile access were all cited as first-session requirements, not nice-to-haves. Users who can't connect their existing tools in the first session are unlikely to return.",
      personaIds: ["helen", "daniel", "sam"],
    },
    {
      theme: "Team activation speed",
      description:
        "Across all personas, getting teammates into the product quickly was more important than personal feature discovery. The tool is evaluated as a team coordination surface, not a personal productivity tool.",
      personaIds: ["maya", "helen", "daniel", "sam"],
    },
  ],
  perPersonaFindings: [
    {
      personaId: "maya",
      personaName: "Maya",
      summary:
        "Maya requires action-first onboarding with pre-populated data. Her benchmark is Figma's zero-tutorial, immediate-interactivity model. Forced tutorial gates and empty canvases are her primary abandonment triggers.",
      topInsights: [
        "Pre-populated example data eliminates anxiety about time investment",
        "Keyboard shortcut visibility early signals product sophistication",
        "Collaboration features (invite, task assignment) must be available within first project creation",
      ],
    },
    {
      personaId: "helen",
      personaName: "Helen",
      summary:
        "Helen evaluates as a procurement decision-maker. DPA, SSO, and admin controls are prerequisites to trial. The current uniform onboarding flow ends her evaluation before it begins.",
      topInsights: [
        "DPA linked from pricing page is a binary pass/fail for enterprise deals",
        "Admin-specific onboarding track needed — role-agnostic flow is inappropriate",
        "Template-driven team consistency (Notion model) can drive self-serve enterprise adoption",
      ],
    },
    {
      personaId: "daniel",
      personaName: "Daniel",
      summary:
        "Daniel benchmarks quality through API and CLI craft. GitHub integration in the first session and optimistic UI (no spinners) are non-negotiable. Linear is his gold standard.",
      topInsights: [
        "GitHub issue import to auto-create backlog eliminates setup entirely for dev teams",
        "Proactive GitHub connect prompt post-project-creation outperforms buried settings",
        "CLI tab-completion signals product was built by people who use terminals",
      ],
    },
    {
      personaId: "sam",
      personaName: "Sam",
      summary:
        "Sam's adoption is team-activation-driven and deadline-pressured. Invite link prominence and bulk task entry are first-session critical. Team confusion is his abandonment trigger — not personal confusion.",
      topInsights: [
        "Top-level invite CTA on first screen would directly reduce Sam's activation time",
        "5-minute setup guarantee on homepage is a credible conversion signal",
        "Mobile parity is required for client-facing teams",
      ],
    },
  ],
  recommendations: [
    {
      title: "Add role-aware onboarding branching (Admin / Developer / Team Lead / Solo)",
      rationale:
        "The single-track flow is sub-optimal for all four user types. Branching at the first screen — with distinct paths for admin buyers, developers, and team-lead users — would align first-session content with actual user goals and likely have the highest impact on the 34% drop-off.",
      priority: "HIGH" as const,
    },
    {
      title: "Surface invite link as primary CTA on first-load screen",
      rationale:
        "Three of four personas named team activation as their highest first-session priority. Elevating the invite link from 'team settings' to the primary onboarding CTA directly addresses the most common unmet need.",
      priority: "HIGH" as const,
    },
    {
      title: "Pre-populate the workspace with an example project on first load",
      rationale:
        "Empty-canvas first-load was cited negatively by all four personas. An example project (dismissible) removes anxiety, demonstrates the product's capability, and allows immediate interaction without setup.",
      priority: "HIGH" as const,
    },
    {
      title: "Link DPA from pricing page and add enterprise compliance section to homepage",
      rationale:
        "Enterprise evaluation ends immediately without visible GDPR/DPA documentation. A single link from the pricing page would unblock enterprise procurement evaluations. Zero engineering effort, high revenue impact.",
      priority: "HIGH" as const,
    },
    {
      title: "Proactively prompt GitHub connection post-project-creation",
      rationale:
        "Developer users expect GitHub integration in the first session. Surfacing it as a proactive prompt immediately after project creation — rather than burying it in integrations settings — would meaningfully improve developer retention.",
      priority: "MEDIUM" as const,
    },
    {
      title: "Replace long onboarding checklist with a minimal 3-action 'what's next' prompt",
      rationale:
        "Exhaustive checklists create decision paralysis for time-pressured users. A contextual, optional prompt with 3 high-leverage next actions (invite team, create first task, connect GitHub) would guide without overwhelming.",
      priority: "MEDIUM" as const,
    },
    {
      title: "Invest in mobile parity for task management core actions",
      rationale:
        "Client-facing teams (Sam's use case) use mobile as a primary access device during meetings. Secondary mobile experience is a retention risk for this segment.",
      priority: "LOW" as const,
    },
  ],
  openQuestions: [
    "What proportion of current trial sign-ups are enterprise buyers vs. individual users? The Helen findings are high-impact but only if enterprise is a meaningful segment.",
    "Does the existing onboarding analytics confirm drop-off at blank-canvas first-load, or is it earlier (e.g. sign-up form)?",
    "Is GitHub the only integration worth surfacing in onboarding, or are Slack and Jira equally expected by target segments?",
    "Would a 'joining an existing workspace' onboarding path (Daniel's missing use case) materially affect activation metrics?",
    "These are simulated AI persona responses — findings should be validated with 5–8 real user interviews before committing to major flow changes.",
  ],
};

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const { workspace } = await ensureBaseRecords();

    // Delete existing demo study if present
    await prisma.study.deleteMany({
      where: { workspaceId: workspace.id, title: STUDY_TITLE },
    });

    // Create study
    const study = await prisma.study.create({
      data: {
        workspaceId: workspace.id,
        title: STUDY_TITLE,
        problemStatement: PROBLEM_STATEMENT,
        researchGoals: RESEARCH_GOALS,
        status: "COMPLETED",
        sessionMode: "ONE_ON_ONE",
        selectedPersonaIds: PERSONA_IDS,
      },
    });

    // Create plan with questions
    const plan = await prisma.studyResearchPlan.create({
      data: {
        studyId: study.id,
        notes: "Generated from demo seed. Research plan covers motivation, mental models, benchmark tools, abandonment triggers, post-creation expectations, and redesign proposals.",
        status: "LOCKED",
      },
    });

    await prisma.$transaction(
      PLAN_QUESTIONS.map((q) =>
        prisma.studyPlanQuestion.create({
          data: {
            planId: plan.id,
            text: q.text,
            personaIds: q.personaIds,
            turnType: q.turnType,
            orderIndex: q.orderIndex,
            rationale: q.rationale,
          },
        }),
      ),
    );

    // Create sessions with transcripts
    for (const personaId of PERSONA_IDS) {
      const transcript = TRANSCRIPTS[personaId];
      if (!transcript) continue;

      const personaName = { maya: "Maya", helen: "Helen", daniel: "Daniel", sam: "Sam" }[personaId] ?? personaId;

      await prisma.studySession.create({
        data: {
          studyId: study.id,
          personaId,
          personaName,
          mode: "ONE_ON_ONE",
          status: "COMPLETED",
          transcriptData: transcript as unknown as Prisma.InputJsonValue,
          startedAt: new Date(Date.now() - 1000 * 60 * 12),
          completedAt: new Date(Date.now() - 1000 * 60 * 5),
        },
      });
    }

    // Create report
    await prisma.studyReport.create({
      data: {
        studyId: study.id,
        payload: REPORT as unknown as Prisma.InputJsonValue,
      },
    });

    return apiOk({ studyId: study.id });
  } catch (error) {
    return fromError(error);
  }
}
