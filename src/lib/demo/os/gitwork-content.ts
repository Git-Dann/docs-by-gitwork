/**
 * Gitwork OS — the sales copy, taken from gitwork.co.uk (captured 26 Nov 2026).
 *
 * ⚠️ This is a sales tool, so every claim here must be one the public site already
 * makes, in its words. Do not round a figure, invent a stat or add a client. When
 * the site changes, update this file from the site rather than from memory; the
 * test beside it pins the prices and case-study stats so a drift is a deliberate
 * edit, not an accident.
 */

import { GITWORK } from "@/lib/gitwork";

export const SITE = GITWORK.url;
export const BOOK_URL = "https://gitwork.co.uk/#book";
export const WORK_URL = "https://gitwork.co.uk/work";
export const CONTACT_EMAIL = GITWORK.email;

export const TAGLINE = "From prompt to production.";
export const STRAPLINE = "Built in the AI era · Shipped by humans.";

export const HERO =
  "Gitwork is the engineering partner for the AI building era. We help vibe coders ship their half-built apps, build MVPs for startups in weeks, and run greenfield squads for scale-ups.";

/** The hero card on the site — "THE LAST 20%". Done items first. */
export const LAST_20: { label: string; done: boolean }[] = [
  { label: "Design polished", done: true },
  { label: "Front-end built", done: true },
  { label: "Core flow working", done: true },
  { label: "Real users & logins", done: true },
  { label: "Payments that work", done: false },
  { label: "Ready to scale", done: false },
];

export const BUILT_WITH = ["Cursor", "v0", "Lovable", "Replit", "Bolt", "Claude Code"];

export interface Plan {
  id: string;
  name: string;
  headline: string;
  summary: string;
  price: string;
  terms: string;
  includes: string[];
  url: string;
}

export const PLANS: Plan[] = [
  {
    id: "launch-pad",
    name: "Launch Pad",
    headline: "Finish your vibe-coded app.",
    summary: "Harden and ship your AI-built prototype, typically 2 to 4 weeks.",
    price: "£4,995",
    terms: "typically 2 to 4 weeks, fixed price",
    includes: ["Code review, refactor & hardening", "Auth, payments, infra & CI/CD", "Production launch & monitoring"],
    url: "https://gitwork.co.uk/launch-pad",
  },
  {
    id: "mvp-sprint",
    name: "MVP Sprint",
    headline: "Idea to MVP in 4 to 6 weeks.",
    summary: "A full product squad building your MVP at AI-accelerated pace.",
    price: "£25,000",
    terms: "4-6 weeks, fixed price",
    includes: ["UK-led PM, designer and engineers", "Full stack: web, mobile, API, infra", "30-day post-launch support"],
    url: "https://gitwork.co.uk/mvp-sprint",
  },
  {
    id: "greenfield",
    name: "Greenfield Build",
    headline: "Embedded engineering squads.",
    summary: "Senior full-stack squads delivering against your roadmap, UK-controlled.",
    price: "£5,000",
    terms: "per developer, per month",
    includes: [
      "Senior engineers, UK sign-off on every release",
      "UK product management and oversight",
      "Scale up or down each quarter",
    ],
    url: "https://gitwork.co.uk/greenfield-build",
  },
  {
    id: "care",
    name: "Care Plan",
    headline: "Existing apps and ongoing builds.",
    summary: "Maintenance, bug fixes, security updates, and new features, month by month.",
    price: "£1,500",
    terms: "per month, rolling, cancel anytime",
    includes: ["Maintenance and security updates", "Bug fixes and new feature work", "UK quality gate on every release"],
    url: "https://gitwork.co.uk/plans",
  },
];

export const EVERY_ENGAGEMENT =
  "Free 30-minute audit to start. Fixed scope and price before any code. UK quality gate on every release, one named owner. You own the code, infra and IP. 30 days support after launch.";

export const STEPS: { n: string; title: string; body: string; when: string }[] = [
  {
    n: "i.",
    title: "Diagnose",
    body: "30-minute audit of your prototype, codebase, or brief. We tell you what's missing, what's risky, and what it takes to ship.",
    when: "Free · 30 min",
  },
  {
    n: "ii.",
    title: "Plan",
    body: "Fixed scope, fixed price, fixed timeline. You see the whole plan before a line of code gets written.",
    when: "48 hours",
  },
  {
    n: "iii.",
    title: "Ship",
    body: "Weekly demos, async standups in Slack, a shared Linear board. You watch the product come together in real time.",
    when: "2-8 weeks",
  },
  {
    n: "iv.",
    title: "Handover",
    body: "Your team owns the code, the infra, and the docs. We're around for 30 days of free post-launch support.",
    when: "Forever yours",
  },
];

export interface CaseStudy {
  id: string;
  name: string;
  tagline: string;
  engagement: "Greenfield Build" | "MVP Sprint" | "Launch Pad";
  tags: string[];
  stats: { value: string; label: string }[];
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: "wedge",
    name: "Wedge",
    tagline: "Built by golfers, for golfers.",
    engagement: "Greenfield Build",
    tags: ["Mobile", "Platform"],
    stats: [
      { value: "80,000+", label: "Active users" },
      { value: "4.9★", label: "App Store rating" },
    ],
  },
  { id: "ace-grading", name: "Ace Grading", tagline: "Turn a graded collection into a game.", engagement: "Greenfield Build", tags: ["Web App", "Platform"], stats: [] },
  {
    id: "fellas-loaded",
    name: "Fellas Loaded",
    tagline: "The members’ home for The Fellas.",
    engagement: "Greenfield Build",
    tags: ["Mobile", "Platform"],
    stats: [
      { value: "6", label: "Platforms supported" },
      { value: "4.4★", label: "App Store rating" },
    ],
  },
  { id: "speakify", name: "Speakify", tagline: "Book the perfect speaker in minutes.", engagement: "MVP Sprint", tags: ["Web App", "Marketplace", "AI / LLM"], stats: [] },
  { id: "eshores", name: "eShores", tagline: "Multi-centre holidays, built to be found.", engagement: "Greenfield Build", tags: ["Web App", "Travel"], stats: [] },
  { id: "campfire", name: "Campfire", tagline: "Spot the trend three weeks early.", engagement: "MVP Sprint", tags: ["Web App", "AI / LLM", "Platform"], stats: [] },
  { id: "travelseen", name: "TravelSeen", tagline: "Social-first luxury travel, expertly booked.", engagement: "Greenfield Build", tags: ["Web App", "Travel", "AI / LLM"], stats: [] },
  { id: "ans", name: "ANS", tagline: "Enterprise data protection, built to scale.", engagement: "Greenfield Build", tags: ["Platform", "SaaS"], stats: [] },
  { id: "venturi", name: "Venturi Group", tagline: "Recruitment site, plus the engine behind it.", engagement: "MVP Sprint", tags: ["Web App", "Platform"], stats: [] },
  { id: "graftt", name: "Graftt", tagline: "Order a skip, pinned to three words.", engagement: "Launch Pad", tags: ["Web App"], stats: [] },
  {
    id: "kernel",
    name: "Kernel Global",
    tagline: "A bespoke ATS, reimagined with AI.",
    engagement: "Greenfield Build",
    tags: ["Web App", "Platform", "AI / LLM"],
    stats: [
      { value: "3", label: "Recruitment brands, one system" },
      { value: "100s", label: "Consultants using it daily" },
    ],
  },
  { id: "gaia", name: "Gaia Learning", tagline: "Online learning that keeps every child engaged.", engagement: "Greenfield Build", tags: ["Web App", "Platform", "SaaS"], stats: [] },
  { id: "saving-grace", name: "Saving Grace", tagline: "Exclusive content and early tour tickets.", engagement: "MVP Sprint", tags: ["Mobile", "Platform"], stats: [] },
  { id: "freeway", name: "Freeway Insurance", tagline: "Cover for Uber drivers, all online.", engagement: "Greenfield Build", tags: ["Web App", "Platform"], stats: [] },
  { id: "afterdesk", name: "AfterDesk", tagline: "Warranty paperwork, handled by AI.", engagement: "Greenfield Build", tags: ["Web App", "SaaS", "AI / LLM"], stats: [] },
];

export const TESTIMONIALS: { quote: string; name: string; role: string }[] = [
  {
    quote:
      "Finding support for a massive project was challenging, but Gitwork made it easy. Immediate impact, top-quality work, and excellent communication. Together we created an industry-first, end-to-end online journey. We couldn't have asked for a better partner.",
    name: "Pete",
    role: "Head of Data, Freeway",
  },
  {
    quote:
      "Partnering with Gitwork transformed Gaia Learning. They turned our vision into reality with a modern e-learning platform. Their expertise in virtual classrooms and progress tracking let us offer a more engaging student experience.",
    name: "Kate",
    role: "Learning Director, Gaia Learning",
  },
  {
    quote:
      "Working with Gitwork has been reliable, efficient, and enjoyable. Their developers deliver high-quality work with real attention to detail, and they take care of everything from start to finish. It's rare to find such a talented and approachable team.",
    name: "Isabella",
    role: "CEO, InHaus",
  },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Will you work with my AI-built code?",
    a: "Yes. We work with output from every major AI builder: Lovable, v0, Cursor, Bolt, Claude Code. We start with a code audit and tell you straight what is solid, what needs reworking, and what is faster to rebuild. Usually most of it stays. You are not starting over.",
  },
  {
    q: "What's the difference between Launch Pad and MVP Sprint?",
    a: "Launch Pad is for when you already have something: an AI prototype, a half-built app, a no-code build hitting its limits. We finish it and ship it. MVP Sprint starts from a brief or a Figma file and builds the whole product with a full squad. Not sure which? The free 30-minute audit tells you.",
  },
  {
    q: "My code is a mess. Is that a problem?",
    a: "No. We have seen every kind of AI-generated spaghetti, and we are not here to judge it. The tools got you to a working prototype, which is the part most people never finish. The rest is our job. Bring it exactly as it is.",
  },
  {
    q: "Are you UK-based, or do you use offshore engineers?",
    a: "Both, and we are upfront about it. Gitwork is UK-led. Your project is built by our own team, UK staff plus our Islamabad studio, all Gitwork, no random subcontractors. Senior engineers on every build. Every release is reviewed, QA'd, and shipped by a UK-based senior engineer, with one named UK owner accountable for what ships. Global build capacity, UK quality control.",
  },
  {
    q: "Do you build mobile, or web only?",
    a: "Web, mobile (React Native and native iOS and Android), and AI or LLM features. We do not do hardware, embedded, or games. If it runs in a browser or on a phone, we build it.",
  },
  {
    q: "Who owns the code and IP? Am I locked in?",
    a: "You own everything. All IP transfers to you when the final invoice is paid: the code, the infra, the docs. We sign NDAs, ours or yours. There is no retainer you cannot leave and no lock-in. When the work is done you can walk away with the whole thing, though most people come back.",
  },
];

/** The Foundry demos the Foundry window can open. All mock data, all public, noindex. */
export const FOUNDRY_PAGES: { id: string; label: string; href: string; blurb: string }[] = [
  { id: "wiki", label: "Your project wiki", href: "/demo/wiki", blurb: "What you log in to: your timeline, requests, releases and docs in one place." },
  { id: "portal", label: "Portal", href: "/demo/portal", blurb: "How we keep every client's platforms, docs, designs and developers in view." },
  { id: "tasks", label: "Board & timeline", href: "/demo/tasks", blurb: "The board, list and Gantt the team ships from." },
  { id: "pulse", label: "Pulse", href: "/demo/pulse", blurb: "Production-readiness checks on a site or a repo." },
  { id: "docs", label: "Proposals", href: "/demo/docs", blurb: "Proposals and contracts, shared and signed online." },
  { id: "hq", label: "Foundry HQ", href: "/demo/hq", blurb: "How the Gitwork team runs delivery day to day." },
];

/** "Things Gitwork doesn't do", from the site's copy. Lives in the Trash and Force Quit. */
export const GOT_RID_OF = [
  { name: "Body-shop billing", note: "Fixed scope, fixed price instead." },
  { name: "Surprise invoices", note: "You see the whole plan before a line of code." },
  { name: "Retainer treadmill", note: "No retainer you cannot leave." },
  { name: "Lock-in", note: "You own the code, the infra and the docs." },
  { name: "Jargon", note: "Four steps. No fluff." },
];
