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
  achievements: 16,
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

export type AchievementKind = "role" | "education" | "award";
export const ACHIEVEMENT_KINDS: { id: AchievementKind; label: string }[] = [
  { id: "role", label: "Role" },
  { id: "education", label: "Education" },
  { id: "award", label: "Achievement" },
];

export interface ProfileAchievement {
  title: string;
  /** The year it started (a role) or happened. */
  year: number | null;
  detail: string | null;
  /** Unset reads as a role, which is what every entry was before kinds existed. */
  kind?: AchievementKind;
  /** When a role ended. */
  endYear?: number | null;
  /** A role still held: drawn as "2025 – Present". */
  current?: boolean;
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
    const y = validYear(r.year) ? (r.year as number) : null;
    const item: ProfileAchievement = { title, year: y, detail: clip(r.detail, PROFILE_LIMITS.achievementDetail) || null };
    if (r.kind === "role" || r.kind === "education" || r.kind === "award") item.kind = r.kind;
    if (validYear(r.endYear)) item.endYear = r.endYear as number;
    if (r.current === true) item.current = true;
    out.push(item);
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

function validYear(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 1950 && v <= 2100;
}

/** "2019 – 2023", "2025 – Present", "2014", or null. */
export function achievementPeriod(a: ProfileAchievement): string | null {
  if (!a.year) return null;
  if (a.current) return `${a.year} – Present`;
  if (a.endYear && a.endYear !== a.year) return `${a.year} – ${a.endYear}`;
  return String(a.year);
}

// ── The rest of a fuller profile: numbers, featured work, recommendations, clients ──

export const EXTRAS_LIMITS = {
  highlights: 6,
  highlightValue: 16,
  highlightLabel: 70,
  featured: 6,
  featuredTitle: 80,
  featuredDetail: 240,
  testimonials: 6,
  quote: 400,
  quoteName: 60,
  quoteRole: 90,
  clients: 24,
  client: 40,
} as const;

export interface ProfileHighlight {
  value: string;
  label: string;
}
export interface ProfileFeatured {
  title: string;
  detail: string | null;
  url: string | null;
}
export interface ProfileTestimonial {
  quote: string;
  name: string;
  role: string | null;
}
export interface ProfileExtras {
  /** Headline numbers: "15 yrs" / "in agency, startup and product". */
  highlights: ProfileHighlight[];
  featured: ProfileFeatured[];
  /** Recommendations, in the person's own words; the page shows what they chose to publish. */
  testimonials: ProfileTestimonial[];
  /** Names of clients and partners worked with. */
  clients: string[];
}

export const EMPTY_EXTRAS: ProfileExtras = { highlights: [], featured: [], testimonials: [], clients: [] };

function rows(raw: unknown, max: number): Record<string, unknown>[] {
  return Array.isArray(raw) ? raw.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object").slice(0, max) : [];
}

/** Whatever is stored (or sent) becomes extras that can be drawn: bad rows are dropped, text clipped. */
export function readExtras(raw: unknown): ProfileExtras {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const L = EXTRAS_LIMITS;
  return {
    highlights: rows(o.highlights, L.highlights * 2)
      .map((r) => ({ value: clip(r.value, L.highlightValue), label: clip(r.label, L.highlightLabel) }))
      .filter((h) => h.value && h.label)
      .slice(0, L.highlights),
    featured: rows(o.featured, L.featured * 2)
      .map((r) => ({
        title: clip(r.title, L.featuredTitle),
        detail: clip(r.detail, L.featuredDetail) || null,
        url: safeProfileUrl(typeof r.url === "string" ? r.url : null),
      }))
      .filter((f) => f.title)
      .slice(0, L.featured),
    testimonials: rows(o.testimonials, L.testimonials * 2)
      .map((r) => ({ quote: clip(r.quote, L.quote), name: clip(r.name, L.quoteName), role: clip(r.role, L.quoteRole) || null }))
      .filter((t) => t.quote && t.name)
      .slice(0, L.testimonials),
    clients: (Array.isArray(o.clients) ? o.clients : [])
      .map((c) => clip(c, L.client))
      .filter(Boolean)
      .filter((c, i, all) => all.indexOf(c) === i)
      .slice(0, L.clients),
  };
}

export function hasExtras(e: ProfileExtras): boolean {
  return Boolean(e.highlights.length || e.featured.length || e.testimonials.length || e.clients.length);
}
