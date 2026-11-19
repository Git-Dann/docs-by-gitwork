/**
 * Public profiles (CLAUDE.md §139). A person's shareable page at /u/<handle>.
 *
 * ⚠️ Privacy rules, each enforced here rather than in the page:
 *  - Off until the PERSON switches it on (`saveMyPublicProfile`, their own record only). Someone
 *    managing Staff can switch it OFF (`unpublishProfile`), never on.
 *  - The public read selects an allow-list of fields. Rates, clients, email, HR and personal
 *    details are never selected, so they can't leak through a new field.
 *  - An archived record, or a login whose membership is archived, has no public page.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PROFILE_LIMITS,
  profileCompleteness,
  readAchievements,
  readLinks,
  safeProfileUrl,
  slugProblem,
  suggestSlug,
  type ProfileAchievement,
  type ProfileLink,
} from "@/lib/public-profile";
import { getOwnStaffRecordId, StaffInputError } from "@/server/staff";

export interface PublicProfile {
  slug: string;
  name: string;
  pronouns: string | null;
  headline: string | null;
  location: string | null;
  bio: string | null;
  summary: string | null;
  avatarUrl: string | null;
  company: string;
  yearsExperience: number | null;
  skills: string[];
  achievements: ProfileAchievement[];
  /** LinkedIn, portfolio and GitHub first, then the person's own links. */
  links: ProfileLink[];
}

export interface MyPublicProfile {
  enabled: boolean;
  slug: string;
  suggestedSlug: string;
  headline: string;
  bio: string;
  summary: string;
  location: string;
  linkedinUrl: string;
  portfolioUrl: string;
  achievements: ProfileAchievement[];
  links: ProfileLink[];
  completeness: { percent: number; missing: string[] };
}

const SELECT = {
  id: true,
  name: true,
  preferredName: true,
  pronouns: true,
  jobTitle: true,
  location: true,
  bio: true,
  avatarUrl: true,
  linkedinUrl: true,
  portfolioUrl: true,
  githubHandle: true,
  primaryStack: true,
  techStacks: true,
  yearsExperience: true,
  archivedAt: true,
  profilePublic: true,
  profileSlug: true,
  profileHeadline: true,
  profileSummary: true,
  profileAchievements: true,
  profileLinks: true,
  workspace: { select: { name: true } },
  member: { select: { archivedAt: true, userId: true, user: { select: { avatarUrl: true } } } },
} as const satisfies Prisma.CandidateSelect;

type Row = Prisma.CandidateGetPayload<{ select: typeof SELECT }>;

/** Primary stack first, then the rest, without repeats (case-insensitive), at most 12. */
function skillsOf(r: Row): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [r.primaryStack, ...r.techStacks]) {
    const v = s?.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.slice(0, 12);
}

function linksOf(r: Row): ProfileLink[] {
  const out: ProfileLink[] = [];
  const li = safeProfileUrl(r.linkedinUrl);
  if (li) out.push({ label: "LinkedIn", url: li });
  const site = safeProfileUrl(r.portfolioUrl);
  if (site) out.push({ label: "Portfolio", url: site });
  if (r.githubHandle?.trim()) out.push({ label: "GitHub", url: `https://github.com/${encodeURIComponent(r.githubHandle.trim())}` });
  return [...out, ...readLinks(r.profileLinks)];
}

function avatarOf(r: Row, slug: string): string | null {
  // A login's photo is served by the profile's own route, public only while the page is.
  if (r.member?.userId && r.member.user?.avatarUrl) return `/api/u/${encodeURIComponent(slug)}/avatar`;
  return safeProfileUrl(r.avatarUrl);
}

function isLive(r: Row): boolean {
  return r.profilePublic && !r.archivedAt && (!r.member || !r.member.archivedAt);
}

/** The public page's data, or null for no such page (off, unknown, archived). */
export async function loadPublicProfile(slug: string): Promise<PublicProfile | null> {
  if (slugProblem(slug)) return null;
  const r = await prisma.candidate.findFirst({ where: { profileSlug: slug, profilePublic: true }, select: SELECT });
  if (!r || !isLive(r)) return null;
  return {
    slug,
    name: (r.preferredName?.trim() || r.name).trim(),
    pronouns: r.pronouns?.trim() || null,
    headline: r.profileHeadline?.trim() || r.jobTitle?.trim() || null,
    location: r.location?.trim() || null,
    bio: r.bio?.trim() || null,
    summary: r.profileSummary?.trim() || null,
    avatarUrl: avatarOf(r, slug),
    company: r.workspace.name,
    yearsExperience: r.yearsExperience,
    skills: skillsOf(r),
    achievements: readAchievements(r.profileAchievements),
    links: linksOf(r),
  };
}

/** The login whose photo the public avatar route may serve, or null. */
export async function publicAvatarUserId(slug: string): Promise<string | null> {
  if (slugProblem(slug)) return null;
  const r = await prisma.candidate.findFirst({ where: { profileSlug: slug, profilePublic: true }, select: SELECT });
  return r && isLive(r) ? (r.member?.userId ?? null) : null;
}

function toMine(r: Row): MyPublicProfile {
  const achievements = readAchievements(r.profileAchievements);
  const links = readLinks(r.profileLinks);
  return {
    enabled: r.profilePublic,
    slug: r.profileSlug ?? "",
    suggestedSlug: suggestSlug(r.preferredName?.trim() || r.name),
    headline: r.profileHeadline ?? "",
    bio: r.bio ?? "",
    summary: r.profileSummary ?? "",
    location: r.location ?? "",
    linkedinUrl: r.linkedinUrl ?? "",
    portfolioUrl: r.portfolioUrl ?? "",
    achievements,
    links,
    completeness: profileCompleteness({
      avatar: Boolean(r.member?.user?.avatarUrl || safeProfileUrl(r.avatarUrl)),
      headline: Boolean(r.profileHeadline?.trim() || r.jobTitle?.trim()),
      bio: Boolean(r.bio?.trim()),
      summary: Boolean(r.profileSummary?.trim()),
      location: Boolean(r.location?.trim()),
      achievements: achievements.length > 0,
      links: linksOf(r).length > 0,
      skills: skillsOf(r).length > 0,
    }),
  };
}

async function ownRecord(workspaceId: string, membershipId: string): Promise<Row> {
  const id = await getOwnStaffRecordId(workspaceId, membershipId);
  const r = id ? await prisma.candidate.findFirst({ where: { id, workspaceId }, select: SELECT }) : null;
  if (!r) throw Object.assign(new Error("You don't have a Staff profile yet"), { status: 404 });
  return r;
}

export async function getMyPublicProfile(workspaceId: string, membershipId: string): Promise<MyPublicProfile> {
  return toMine(await ownRecord(workspaceId, membershipId));
}

export interface MyPublicProfileInput {
  enabled?: boolean;
  slug?: string;
  headline?: string;
  bio?: string;
  summary?: string;
  location?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  achievements?: ProfileAchievement[];
  links?: ProfileLink[];
}

const text = (v: string | undefined, max: number) => (v === undefined ? undefined : v.trim().slice(0, max) || null);

function urlField(v: string | undefined, what: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (!v.trim()) return null;
  const url = safeProfileUrl(v);
  if (!url) throw new StaffInputError(`${what} must be a web address (https://…).`);
  return url;
}

/** Someone edits their own public profile. Only their own record. */
export async function saveMyPublicProfile(
  workspaceId: string,
  membershipId: string,
  input: MyPublicProfileInput,
): Promise<MyPublicProfile> {
  const r = await ownRecord(workspaceId, membershipId);
  const data: Prisma.CandidateUpdateInput = {};

  if (input.slug !== undefined) {
    const slug = input.slug.trim().toLowerCase();
    const problem = slugProblem(slug);
    if (problem) throw new StaffInputError(`Handle: ${problem}`);
    const taken = await prisma.candidate.findFirst({ where: { profileSlug: slug, NOT: { id: r.id } }, select: { id: true } });
    if (taken) throw Object.assign(new Error("That handle is taken. Try another."), { status: 409 });
    data.profileSlug = slug;
  }
  const headline = text(input.headline, PROFILE_LIMITS.headline);
  if (headline !== undefined) data.profileHeadline = headline;
  const bio = text(input.bio, PROFILE_LIMITS.bio);
  if (bio !== undefined) data.bio = bio;
  const summary = text(input.summary, PROFILE_LIMITS.summary);
  if (summary !== undefined) data.profileSummary = summary;
  const location = text(input.location, 120);
  if (location !== undefined) data.location = location;
  const li = urlField(input.linkedinUrl, "LinkedIn");
  if (li !== undefined) data.linkedinUrl = li;
  const site = urlField(input.portfolioUrl, "Portfolio");
  if (site !== undefined) data.portfolioUrl = site;
  if (input.achievements !== undefined) {
    data.profileAchievements = readAchievements(input.achievements) as unknown as Prisma.InputJsonValue;
  }
  if (input.links !== undefined) {
    for (const l of input.links) {
      if (l.url.trim() && !safeProfileUrl(l.url)) throw new StaffInputError(`"${l.label || l.url}" isn't a web address (https://…).`);
    }
    data.profileLinks = readLinks(input.links) as unknown as Prisma.InputJsonValue;
  }
  if (input.enabled !== undefined) {
    const slug = (data.profileSlug as string | undefined) ?? r.profileSlug;
    if (input.enabled && !slug) throw new StaffInputError("Choose a handle first: it's the address of your page.");
    data.profilePublic = input.enabled;
  }
  const saved = await prisma.candidate.update({ where: { id: r.id }, data, select: SELECT });
  return toMine(saved);
}

/** Someone managing Staff takes a page down. Switching it back on is only ever the person's own call. */
export async function unpublishProfile(workspaceId: string, recordId: string): Promise<void> {
  const r = await prisma.candidate.findFirst({ where: { id: recordId, workspaceId }, select: { id: true } });
  if (!r) throw Object.assign(new Error("Not found"), { status: 404 });
  await prisma.candidate.update({ where: { id: r.id }, data: { profilePublic: false } });
}
