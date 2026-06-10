/**
 * wiki-course-feedback.ts — bridge from the Care/support module into the Wedge
 * wiki's Course Requests tracker.
 *
 * Wedge users' course requests arrive as support emails titled
 * "New Feedback from {username}". This lists those conversations as import
 * candidates and turns selected ones into draft ClientCourseRequest rows.
 */

import { prisma } from "@/lib/prisma";
import { addCourseRequest, type CourseRequestRecord } from "@/server/wiki";

const FEEDBACK_SUBJECT = "New Feedback";
const PREVIEW_LEN = 240;

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

/** List "New Feedback from …" support conversations as course-request import candidates. */
export async function listCourseFeedbackCandidates(
  workspaceClientId: string,
): Promise<CourseFeedbackCandidate[]> {
  const support = await resolveSupportClient(workspaceClientId);
  if (!support) return [];

  const convos = await prisma.supportConversation.findMany({
    where: {
      clientId: support.id,
      subject: { contains: FEEDBACK_SUBJECT, mode: "insensitive" },
    },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 1 } },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  // Which conversations are already imported into this client's wiki?
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId: workspaceClientId },
    select: { courseRequests: { select: { sourceConversationId: true } } },
  });
  const imported = new Set(
    (wiki?.courseRequests ?? [])
      .map((r) => r.sourceConversationId)
      .filter((id): id is string => !!id),
  );

  return convos.map((c) => ({
    conversationId: c.id,
    username: c.customerLabel,
    subject: c.subject,
    preview: (c.messages[0]?.body ?? c.preview ?? "").slice(0, PREVIEW_LEN),
    receivedAt: c.receivedAt.toISOString(),
    alreadyImported: imported.has(c.id),
  }));
}

/**
 * Import selected feedback conversations as draft course requests.
 * Skips conversations already imported. Folds the username + message text into
 * Notes so the team can extract the actual course name/country.
 */
export async function importCourseFeedback(
  workspaceClientId: string,
  conversationIds: string[],
): Promise<CourseRequestRecord[]> {
  if (conversationIds.length === 0) return [];

  const support = await resolveSupportClient(workspaceClientId);
  if (!support) return [];

  // Skip ones already imported.
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId: workspaceClientId },
    select: { courseRequests: { select: { sourceConversationId: true } } },
  });
  const already = new Set(
    (wiki?.courseRequests ?? [])
      .map((r) => r.sourceConversationId)
      .filter((id): id is string => !!id),
  );
  const todo = conversationIds.filter((id) => !already.has(id));
  if (todo.length === 0) return [];

  const convos = await prisma.supportConversation.findMany({
    where: { id: { in: todo }, clientId: support.id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 1 } },
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
