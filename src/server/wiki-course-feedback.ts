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

const FEEDBACK_SUBJECT = "New Feedback";
const PREVIEW_LEN = 240;
const SCAN_LIMIT = 60;

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

/** Create draft course requests from the given conversations (fetches their bodies). */
async function createFromConversationIds(
  workspaceClientId: string,
  supportClientId: string,
  ids: string[],
): Promise<CourseRequestRecord[]> {
  if (ids.length === 0) return [];
  const convos = await prisma.supportConversation.findMany({
    where: { id: { in: ids }, clientId: supportClientId },
    select: {
      id: true,
      customerLabel: true,
      receivedAt: true,
      preview: true,
      messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } },
    },
  });

  const created: CourseRequestRecord[] = [];
  for (const c of convos) {
    const date = c.receivedAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const body = (c.messages[0]?.body ?? c.preview ?? "").trim();
    const notes = `From ${c.customerLabel} (${date}):\n${body}`;
    created.push(
      await addCourseRequest(workspaceClientId, {
        courseName: "",
        notes,
        status: "NEW",
        sourceConversationId: c.id,
      }),
    );
  }
  return created;
}

/**
 * Import all not-yet-imported "New Feedback" conversations whose subject or
 * preview mentions any of the given keywords (e.g. "course"). One-shot pull.
 */
export async function importMatchingCourseFeedback(
  workspaceClientId: string,
  keywords: string[],
): Promise<CourseRequestRecord[]> {
  const support = await resolveSupportClient(workspaceClientId);
  if (!support) return [];
  const needles = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  if (needles.length === 0) return [];

  const [convos, already] = await Promise.all([
    scanFeedback(support.id),
    alreadyImportedIds(workspaceClientId),
  ]);

  const ids = convos
    .filter((c) => {
      if (already.has(c.id)) return false;
      const hay = `${c.subject} ${c.text}`.toLowerCase();
      return needles.some((n) => hay.includes(n));
    })
    .map((c) => c.id);

  return createFromConversationIds(workspaceClientId, support.id, ids);
}

/** Import explicitly-selected feedback conversations as draft course requests. */
export async function importCourseFeedback(
  workspaceClientId: string,
  conversationIds: string[],
): Promise<CourseRequestRecord[]> {
  if (conversationIds.length === 0) return [];
  const support = await resolveSupportClient(workspaceClientId);
  if (!support) return [];

  const already = await alreadyImportedIds(workspaceClientId);
  const todo = conversationIds.filter((id) => !already.has(id));
  return createFromConversationIds(workspaceClientId, support.id, todo);
}
