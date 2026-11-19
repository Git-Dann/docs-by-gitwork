/**
 * Public profiles (CLAUDE.md §139): every person on Foundry can have a shareable page at
 * /u/<handle>, LinkedIn / link-in-bio style. Pure rules shared by the editor, the routes and the
 * page: the handle, the limits, what a link or achievement may be, and how complete it is.
 */

export const PROFILE_LIMITS = {
  slugMin: 3,
  slugMax: 40,
  headline: 120,
  bio: 280,
  summary: 2000,
  achievements: 12,
  achievementTitle: 120,
  achievementDetail: 300,
  links: 8,
  linkLabel: 40,
  url: 500,
} as const;

/** Paths a handle can't take, because /u/<these> would read as something else. */
const RESERVED = new Set(["admin", "api", "app", "edit", "foundry", "gitwork", "help", "login", "me", "new", "settings", "staff", "support", "u", "www"]);

export function slugProblem(slug: string): string | null {
  if (slug.length < PROFILE_LIMITS.slugMin) return `At least ${PROFILE_LIMITS.slugMin} characters.`;
  if (slug.length > PROFILE_LIMITS.slugMax) return `At most ${PROFILE_LIMITS.slugMax} characters.`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "Lower-case letters, numbers and single hyphens only.";
  if (RESERVED.has(slug)) return "That handle is reserved.";
  return null;
}

/** "Siân Woolridge-Jones" → "sian-woolridge-jones". */
export function suggestSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROFILE_LIMITS.slugMax)
    .replace(/-+$/, "");
}

/** http(s) only, or null. A profile link is drawn as an <a href>, so nothing else may pass. */
export function safeProfileUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v || v.length > PROFILE_LIMITS.url) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface ProfileAchievement {
  title: string;
  year: number | null;
  detail: string | null;
}
export interface ProfileLink {
  label: string;
  url: string;
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Stored achievements, read defensively: anything malformed is dropped, never thrown on. */
export function readAchievements(raw: unknown): ProfileAchievement[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileAchievement[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    const title = clip(r.title, PROFILE_LIMITS.achievementTitle);
    if (!title) continue;
    const y = typeof r.year === "number" && Number.isInteger(r.year) && r.year >= 1950 && r.year <= 2100 ? r.year : null;
    out.push({ title, year: y, detail: clip(r.detail, PROFILE_LIMITS.achievementDetail) || null });
    if (out.length === PROFILE_LIMITS.achievements) break;
  }
  return out;
}

export function readLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileLink[] = [];
  for (const l of raw) {
    if (!l || typeof l !== "object") continue;
    const r = l as Record<string, unknown>;
    const url = safeProfileUrl(typeof r.url === "string" ? r.url : null);
    const label = clip(r.label, PROFILE_LIMITS.linkLabel);
    if (!url || !label) continue;
    out.push({ label, url });
    if (out.length === PROFILE_LIMITS.links) break;
  }
  return out;
}

/** What makes a profile feel finished, each with the words the editor shows when it's missing. */
const COMPLETENESS: { key: keyof ProfileCompletenessInput; label: string }[] = [
  { key: "avatar", label: "a photo" },
  { key: "headline", label: "a headline" },
  { key: "bio", label: "a short bio" },
  { key: "summary", label: "an about section" },
  { key: "location", label: "where you're based" },
  { key: "achievements", label: "an achievement" },
  { key: "links", label: "a link (LinkedIn, portfolio, GitHub…)" },
  { key: "skills", label: "your skills" },
];

export interface ProfileCompletenessInput {
  avatar: boolean;
  headline: boolean;
  bio: boolean;
  summary: boolean;
  location: boolean;
  achievements: boolean;
  links: boolean;
  skills: boolean;
}

export function profileCompleteness(input: ProfileCompletenessInput): { percent: number; missing: string[] } {
  const missing = COMPLETENESS.filter((c) => !input[c.key]).map((c) => c.label);
  return { percent: Math.round(((COMPLETENESS.length - missing.length) / COMPLETENESS.length) * 100), missing };
}
