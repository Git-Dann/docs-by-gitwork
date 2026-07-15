/**
 * wiki-course-feedback.ts — bridge from the Care/support module into the Wedge
 * wiki's Course Requests tracker.
 *
 * Wedge users' course requests arrive as support emails titled
 * "New Feedback from {username}". This lists those conversations as import
 * candidates and turns selected ones into draft ClientCourseRequest rows.
 *
 * Performance: the candidate scan and keyword match use the conversation's own
 * `preview` column (no per-row message join), so it stays cheap even with a
 * large support inbox. Full message bodies are fetched only for the small set
 * actually being imported.
 */

import { prisma } from "@/lib/prisma";
import { addCourseRequest, type CourseRequestRecord } from "@/server/wiki";
import { resolveAiConfig, completeText, parseJsonObject } from "@/server/ai-provider";

const FEEDBACK_SUBJECT = "New Feedback";
const PREVIEW_LEN = 240;
const SCAN_LIMIT = 150;
// AI extraction batching — one completion per chunk, chunks run in parallel.
const AI_CHUNK = 25;
const AI_TEXT_CAP = 700;

export interface CourseFeedbackCandidate {
  conversationId: string;
  username: string;
  subject: string;
  preview: string;
  receivedAt: string;
  alreadyImported: boolean;
}

/**
 * Resolve the Care SupportClient for a Portal WorkspaceClient — by explicit
 * link first, then by a name/slug match (Wedge ↔ "Big Wedge").
 */
async function resolveSupportClient(workspaceClientId: string) {
  const linked = await prisma.supportClient.findFirst({
    where: { workspaceClientId },
    select: { id: true, workspaceId: true },
  });
  if (linked) return linked;

  const wc = await prisma.workspaceClient.findUnique({
    where: { id: workspaceClientId },
    select: { workspaceId: true, slug: true, name: true },
  });
  if (!wc) return null;

  return prisma.supportClient.findFirst({
    where: {
      workspaceId: wc.workspaceId,
      OR: [
        { slug: wc.slug },
        { name: { contains: wc.name, mode: "insensitive" } },
        { name: { contains: "wedge", mode: "insensitive" } },
      ],
    },
    select: { id: true, workspaceId: true },
  });
}

/**
 * Bounded scan of "New Feedback" conversations + their first message body.
 * The `preview` column here is just the subject, so the request text only lives
 * in the message body — fetched via the indexed [conversationId, createdAt]
 * lookup, capped at SCAN_LIMIT rows (cheap for a single call).
 */
async function scanFeedback(supportClientId: string) {
  const convos = await prisma.supportConversation.findMany({
    where: {
      clientId: supportClientId,
      subject: { contains: FEEDBACK_SUBJECT, mode: "insensitive" },
    },
    select: {
      id: true,
      customerLabel: true,
      subject: true,
      preview: true,
      receivedAt: true,
      messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: SCAN_LIMIT,
  });
  return convos.map((c) => ({
    id: c.id,
    customerLabel: c.customerLabel,
    subject: c.subject,
    receivedAt: c.receivedAt,
    // Real request text is the first message body; subject/preview is just the title.
    text: (c.messages[0]?.body ?? c.preview ?? "").trim(),
  }));
}

async function alreadyImportedIds(workspaceClientId: string): Promise<Set<string>> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId: workspaceClientId },
    select: { courseRequests: { select: { sourceConversationId: true } } },
  });
  return new Set(
    (wiki?.courseRequests ?? [])
      .map((r) => r.sourceConversationId)
      .filter((id): id is string => !!id),
  );
}

/** List "New Feedback from …" support conversations as course-request import candidates. */
export async function listCourseFeedbackCandidates(
  workspaceClientId: string,
): Promise<CourseFeedbackCandidate[]> {
  const support = await resolveSupportClient(workspaceClientId);
  if (!support) return [];

  const [convos, imported] = await Promise.all([
    scanFeedback(support.id),
    alreadyImportedIds(workspaceClientId),
  ]);

  return convos.map((c) => ({
    conversationId: c.id,
    username: c.customerLabel,
    subject: c.subject,
    preview: c.text.slice(0, PREVIEW_LEN),
    receivedAt: c.receivedAt.toISOString(),
    alreadyImported: imported.has(c.id),
  }));
}

interface FeedbackItem {
  id: string;
  customerLabel: string;
  subject: string;
  receivedAt: Date;
  text: string;
}

/** Fetch the bodies for a specific set of conversation ids (for explicit-selection imports). */
async function fetchConvoBodies(supportClientId: string, ids: string[]): Promise<FeedbackItem[]> {
  if (ids.length === 0) return [];
  const convos = await prisma.supportConversation.findMany({
    where: { id: { in: ids }, clientId: supportClientId },
    select: {
      id: true,
      customerLabel: true,
      subject: true,
      receivedAt: true,
      preview: true,
      messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } },
    },
  });
  return convos.map((c) => ({
    id: c.id,
    customerLabel: c.customerLabel,
    subject: c.subject,
    receivedAt: c.receivedAt,
    text: (c.messages[0]?.body ?? c.preview ?? "").trim(),
  }));
}

interface AiCourseVerdict {
  isCourseRequest: boolean;
  courseName: string;
  country: string;
}

/**
 * Batched AI extraction: classify each feedback as a golf-course request (add or
 * a correction to a specific named course) vs. an app bug / feature idea / general
 * feedback, and pull out the course name + country. One completion per AI_CHUNK
 * items, chunks run in parallel. Returns a map keyed by conversation id.
 *
 * Graceful: if no AI key is configured or a chunk fails, those items are simply
 * absent from the map (the caller imports them unfilled rather than erroring).
 */
async function aiExtractCourses(
  workspaceClientId: string,
  items: FeedbackItem[],
): Promise<{ verdicts: Map<string, AiCourseVerdict>; aiUsed: boolean }> {
  const verdicts = new Map<string, AiCourseVerdict>();
  if (items.length === 0) return { verdicts, aiUsed: false };

  const wc = await prisma.workspaceClient.findUnique({
    where: { id: workspaceClientId },
    select: {
      workspaceId: true,
      workspace: {
        select: {
          aiProvider: true,
          anthropicApiKey: true,
          anthropicModel: true,
          openaiApiKey: true,
          openaiModel: true,
          geminiApiKey: true,
          geminiModel: true,
          localLlmUrl: true,
          localLlmModel: true,
        },
      },
    },
  });
  if (!wc?.workspace) return { verdicts, aiUsed: false };
  const config = resolveAiConfig(wc.workspace);
  if (!config.apiKey) return { verdicts, aiUsed: false };

  const system =
    "You triage user feedback for the Big Wedge Golf scoring app. A feedback item is a " +
    "COURSE REQUEST only if it asks to add a specific named golf course, or reports that a " +
    "specific named course's data (holes, tees, pars, yardages, layout) is wrong. App bugs " +
    "(sign-in/search/sync errors), feature ideas, praise, and general comments are NOT course " +
    "requests. Extract the golf course's name and the country it is in.";

  const chunks: FeedbackItem[][] = [];
  for (let i = 0; i < items.length; i += AI_CHUNK) chunks.push(items.slice(i, i + AI_CHUNK));

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const list = chunk
        .map((c, i) => `[${i}] ${(c.text || c.subject).slice(0, AI_TEXT_CAP).replace(/\s+/g, " ")}`)
        .join("\n");
      const user =
        `Feedback items:\n${list}\n\n` +
        `Return ONLY JSON: {"results":[{"i":<index>,"isCourseRequest":true|false,` +
        `"courseName":"<name or empty>","country":"<full country name or empty>"}]}. ` +
        `One entry per item. If it is not a course request, set isCourseRequest false and leave ` +
        `courseName/country empty. If a course is named but you cannot tell the country, leave ` +
        `country empty — do not guess.`;
      try {
        // Pure classification (course-request? + name + country) — Haiku-class work.
        // "light" routes to the cheaper model (~3.75× less) with no quality loss here.
        const raw = await completeText({
          config,
          system,
          user,
          maxTokens: 1500,
          tier: "light",
          usageContext: { module: "WIKI", workspaceId: wc.workspaceId, operation: "courseFeedback" },
        });
        const parsed = parseJsonObject<{ results?: Array<{ i: number; isCourseRequest?: boolean; courseName?: string; country?: string }> }>(raw);
        for (const r of parsed?.results ?? []) {
          const item = chunk[r.i];
          if (!item) continue;
          verdicts.set(item.id, {
            isCourseRequest: Boolean(r.isCourseRequest),
            courseName: (r.courseName ?? "").trim(),
            country: (r.country ?? "").trim(),
          });
        }
      } catch {
        // chunk failed — leave its items unfilled
      }
    }),
  );
  void results;

  return { verdicts, aiUsed: verdicts.size > 0 };
}

export interface CourseImportOptions {
  /** Explicit conversations to import (manual triage). */
  conversationIds?: string[];
  /** Keyword filter when scanning all not-yet-imported feedback. */
  keywords?: string[];
  /** Run AI extraction to pre-fill course name + country. Default true. */
  aiExtract?: boolean;
  /** Skip items AI judges not to be course requests. Default: true unless conversationIds given. */
  onlyCourseRequests?: boolean;
}

export interface CourseImportResult {
  created: CourseRequestRecord[];
  skipped: number;
  scanned: number;
  aiUsed: boolean;
}

/**
 * Unified course-feedback import. Resolves which conversations to process
 * (explicit ids, keyword-matched, or all not-yet-imported), runs one batched AI
 * pass to classify + extract course name/country, then creates pre-filled draft
 * requests — skipping non-course feedback when onlyCourseRequests is on.
 */
export async function runCourseFeedbackImport(
  workspaceClientId: string,
  opts: CourseImportOptions,
): Promise<CourseImportResult> {
  const support = await resolveSupportClient(workspaceClientId);
  if (!support) return { created: [], skipped: 0, scanned: 0, aiUsed: false };

  const already = await alreadyImportedIds(workspaceClientId);

  let items: FeedbackItem[];
  if (opts.conversationIds?.length) {
    const ids = opts.conversationIds.filter((id) => !already.has(id));
    items = await fetchConvoBodies(support.id, ids);
  } else {
    const all = await scanFeedback(support.id);
    const needles = (opts.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
    items = all.filter((c) => {
      if (already.has(c.id)) return false;
      if (needles.length === 0) return true;
      const hay = `${c.subject} ${c.text}`.toLowerCase();
      return needles.some((n) => hay.includes(n));
    });
  }

  if (items.length === 0) return { created: [], skipped: 0, scanned: 0, aiUsed: false };

  const aiExtract = opts.aiExtract ?? true;
  const { verdicts, aiUsed } = aiExtract
    ? await aiExtractCourses(workspaceClientId, items)
    : { verdicts: new Map<string, AiCourseVerdict>(), aiUsed: false };

  // Filter to course requests only when asked AND the AI actually ran (so an AI
  // outage can't silently drop everything — it falls back to importing unfilled).
  const onlyCourse = (opts.onlyCourseRequests ?? !opts.conversationIds?.length) && aiUsed;

  const created: CourseRequestRecord[] = [];
  let skipped = 0;
  for (const c of items) {
    const v = verdicts.get(c.id);
    if (onlyCourse && v && !v.isCourseRequest) {
      skipped++;
      continue;
    }
    const date = c.receivedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const notes = `From ${c.customerLabel} (${date}):\n${c.text}`;
    created.push(
      await addCourseRequest(workspaceClientId, {
        courseName: v?.courseName || "",
        country: v?.country || null,
        notes,
        status: "NEW",
        sourceConversationId: c.id,
      }),
    );
  }
  return { created, skipped, scanned: items.length, aiUsed };
}

/**
 * Import all not-yet-imported "New Feedback" conversations whose subject or body
 * mentions any of the given keywords. Thin wrapper over runCourseFeedbackImport.
 */
export async function importMatchingCourseFeedback(
  workspaceClientId: string,
  keywords: string[],
): Promise<CourseRequestRecord[]> {
  if (keywords.length === 0) return [];
  return (await runCourseFeedbackImport(workspaceClientId, { keywords })).created;
}

/** Import explicitly-selected feedback conversations (AI pre-fills, keeps all selected). */
export async function importCourseFeedback(
  workspaceClientId: string,
  conversationIds: string[],
): Promise<CourseRequestRecord[]> {
  if (conversationIds.length === 0) return [];
  return (await runCourseFeedbackImport(workspaceClientId, { conversationIds, onlyCourseRequests: false })).created;
}
