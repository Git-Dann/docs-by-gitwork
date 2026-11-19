import type { PublicProfile } from "@/server/public-profile";

/** A filled-in profile for /demo/profile and the tests. Fictional. */
export const DEMO_PUBLIC_PROFILE: PublicProfile = {
  slug: "priya-shah",
  name: "Priya Shah",
  pronouns: "she/her",
  headline: "Senior Product Engineer",
  location: "Manchester, UK",
  bio: "I build calm, fast product for teams who'd rather ship than wait. Mostly React, Node and Swift.",
  summary:
    "Eight years building products from first prototype to millions of users.\n\nI care about the boring parts done well: clear data models, fast feedback loops and interfaces that explain themselves.",
  avatarUrl: null,
  company: "Gitwork",
  yearsExperience: 8,
  skills: ["TypeScript", "React", "Node.js", "Swift", "PostgreSQL", "Design systems"],
  achievements: [
    { title: "Led the rebuild of a golf app's round tracking", year: 2026, detail: "Cut sync errors by 90% and shipped to iOS and Android in one release." },
    { title: "Speaker, Manchester Web Meetup", year: 2025, detail: null },
    { title: "Shipped a design system used across six products", year: 2024, detail: "Tokens, components and docs, adopted by every team in a quarter." },
  ],
  links: [
    { label: "LinkedIn", url: "https://www.linkedin.com/in/example" },
    { label: "Portfolio", url: "https://example.com" },
    { label: "GitHub", url: "https://github.com/example" },
  ],
};
