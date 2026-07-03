import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { BUILT_IN_PERSONAS, getPersonaById } from "@/config/study-personas";
import { generateResearchPlan, generateFollowUps } from "@/server/study-agents/researcher";
import { conductInterview } from "@/server/study-agents/persona";
import { synthesizeTurn, synthesizeSession, generateReport } from "@/server/study-agents/synthesizer";
import type { StudyTurn, SessionTranscript, SessionSynthesis, ResearchPlanOutput } from "@/server/study-agents/types";
import type { AiConfig } from "@/server/pulse-ai";
import { resolveAiConfig as resolveWorkspaceAiConfig } from "@/server/ai-provider";

// ── Serialization ─────────────────────────────────────────────────────────────

export interface StudyListItem {
  id: string;
  title: string;
  problemStatement: string;
  status: string;
  sessionMode: string;
  selectedPersonaIds: string[];
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
  completedSessionCount: number;
  workspaceClientId: string | null;
  workspaceClientName: string | null;
  workspaceClientSlug: string | null;
}

export interface StudyClientSummary {
  id: string;
  title: string;
  problemStatement: string;
  status: string;
  sessionMode: string;
  selectedPersonaIds: string[];
  createdAt: string;
  sessionCount: number;
  completedSessionCount: number;
}

export interface StudyPlanQuestionRecord {
  id: string;
  text: string;
  personaIds: string[];
  turnType: string;
  orderIndex: number;
  rationale: string | null;
}

export interface StudyPlanRecord {
  id: string;
  notes: string | null;
  status: string;
  questions: StudyPlanQuestionRecord[];
}

export interface StudySessionRecord {
  id: string;
  personaId: string;
  personaName: string;
  mode: string;
  status: string;
  transcriptData: SessionTranscript | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface StudyRecord {
  id: string;
  title: string;
  problemStatement: string;
  researchGoals: string[];
  status: string;
  sessionMode: string;
  selectedPersonaIds: string[];
  createdAt: string;
  updatedAt: string;
  plan: StudyPlanRecord | null;
  sessions: StudySessionRecord[];
  report: { payload: unknown } | null;
  workspaceClientId: string | null;
  workspaceClientName: string | null;
  workspaceClientSlug: string | null;
  linkedScanId: string | null;
}

function serializeListItem(s: {
  id: string;
  title: string;
  problemStatement: string;
  status: string;
  sessionMode: string;
  selectedPersonaIds: string[];
  createdAt: Date;
  updatedAt: Date;
  workspaceClientId: string | null;
  workspaceClient: { name: string; slug: string } | null;
  sessions: { status: string }[];
}): StudyListItem {
  return {
    id: s.id,
    title: s.title,
    problemStatement: s.problemStatement,
    status: s.status,
    sessionMode: s.sessionMode,
    selectedPersonaIds: s.selectedPersonaIds,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    sessionCount: s.sessions.length,
    completedSessionCount: s.sessions.filter((sess) => sess.status === "COMPLETED").length,
    workspaceClientId: s.workspaceClientId,
    workspaceClientName: s.workspaceClient?.name ?? null,
    workspaceClientSlug: s.workspaceClient?.slug ?? null,
  };
}

// ── Workspace helper ──────────────────────────────────────────────────────────

async function getWorkspace() {
  const { workspace } = await ensureBaseRecords();
  return workspace;
}

// Delegate to the shared resolver (single source of truth for defaults) — the returned
// ResolvedAiConfig is structurally the AiConfig this module uses.
function resolveAiConfig(workspace: Awaited<ReturnType<typeof getWorkspace>>): AiConfig {
  return resolveWorkspaceAiConfig(workspace);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listStudies(filters?: { workspaceClientId?: string }): Promise<StudyListItem[]> {
  const workspace = await getWorkspace();
  const studies = await prisma.study.findMany({
    where: {
      workspaceId: workspace.id,
      ...(filters?.workspaceClientId !== undefined && { workspaceClientId: filters.workspaceClientId }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      sessions: { select: { status: true } },
      workspaceClient: { select: { name: true, slug: true } },
    },
  });
  return studies.map(serializeListItem);
}

export async function listStudiesForClient(workspaceClientId: string): Promise<StudyClientSummary[]> {
  const studies = await prisma.study.findMany({
    where: { workspaceClientId },
    orderBy: { createdAt: "desc" },
    include: { sessions: { select: { status: true } } },
  });
  return studies.map((s) => ({
    id: s.id,
    title: s.title,
    problemStatement: s.problemStatement,
    status: s.status,
    sessionMode: s.sessionMode,
    selectedPersonaIds: s.selectedPersonaIds,
    createdAt: s.createdAt.toISOString(),
    sessionCount: s.sessions.length,
    completedSessionCount: s.sessions.filter((sess) => sess.status === "COMPLETED").length,
  }));
}

export async function getStudy(studyId: string): Promise<StudyRecord | null> {
  const record = await prisma.study.findUnique({
    where: { id: studyId },
    include: {
      plan: { include: { questions: { orderBy: { orderIndex: "asc" } } } },
      sessions: { orderBy: { createdAt: "asc" } },
      report: true,
      workspaceClient: { select: { name: true, slug: true } },
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    title: record.title,
    problemStatement: record.problemStatement,
    researchGoals: record.researchGoals,
    status: record.status,
    sessionMode: record.sessionMode,
    selectedPersonaIds: record.selectedPersonaIds,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    workspaceClientId: record.workspaceClientId,
    workspaceClientName: record.workspaceClient?.name ?? null,
    workspaceClientSlug: record.workspaceClient?.slug ?? null,
    linkedScanId: record.linkedScanId,
    plan: record.plan
      ? {
          id: record.plan.id,
          notes: record.plan.notes,
          status: record.plan.status,
          questions: record.plan.questions.map((q) => ({
            id: q.id,
            text: q.text,
            personaIds: q.personaIds,
            turnType: q.turnType,
            orderIndex: q.orderIndex,
            rationale: q.rationale,
          })),
        }
      : null,
    sessions: record.sessions.map((s) => ({
      id: s.id,
      personaId: s.personaId,
      personaName: s.personaName,
      mode: s.mode,
      status: s.status,
      transcriptData: s.transcriptData ? (s.transcriptData as unknown as SessionTranscript) : null,
      startedAt: s.startedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
    })),
    report: record.report ? { payload: record.report.payload } : null,
  };
}

export async function createStudy(data: {
  title: string;
  problemStatement: string;
  researchGoals: string[];
  sessionMode: string;
  selectedPersonaIds: string[];
  workspaceClientId?: string | null;
  linkedScanId?: string | null;
}): Promise<StudyRecord> {
  const workspace = await getWorkspace();
  // Only honour a linkedScanId that points at a scan in this workspace, so the back-link
  // can't be pointed at another workspace's scan.
  const linkedScanId =
    data.linkedScanId &&
    (await prisma.pulseScan.findFirst({
      where: { id: data.linkedScanId, workspaceId: workspace.id },
      select: { id: true },
    }))
      ? data.linkedScanId
      : null;
  const study = await prisma.study.create({
    data: {
      workspaceId: workspace.id,
      title: data.title,
      problemStatement: data.problemStatement,
      researchGoals: data.researchGoals,
      sessionMode: data.sessionMode as "ONE_ON_ONE" | "GROUP",
      selectedPersonaIds: data.selectedPersonaIds,
      workspaceClientId: data.workspaceClientId ?? null,
      linkedScanId,
    },
    include: { plan: { include: { questions: true } }, sessions: true, report: true },
  });
  // Mirror the link back onto the scan so the Pulse scan view can surface "View study".
  if (linkedScanId) {
    await prisma.pulseScan.update({
      where: { id: linkedScanId },
      data: { linkedStudyId: study.id },
    });
  }
  return getStudy(study.id) as Promise<StudyRecord>;
}

export async function updateStudy(studyId: string, data: Partial<{
  title: string;
  problemStatement: string;
  researchGoals: string[];
  sessionMode: string;
  selectedPersonaIds: string[];
  status: string;
  workspaceClientId: string | null;
}>): Promise<StudyRecord> {
  await prisma.study.update({
    where: { id: studyId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.problemStatement !== undefined && { problemStatement: data.problemStatement }),
      ...(data.researchGoals !== undefined && { researchGoals: data.researchGoals }),
      ...(data.sessionMode !== undefined && { sessionMode: data.sessionMode as "ONE_ON_ONE" | "GROUP" }),
      ...(data.selectedPersonaIds !== undefined && { selectedPersonaIds: data.selectedPersonaIds }),
      ...(data.status !== undefined && { status: data.status as "DRAFT" | "PLAN_GENERATING" | "PLAN_READY" | "RUNNING" | "COMPLETED" | "FAILED" }),
      ...(data.workspaceClientId !== undefined && { workspaceClientId: data.workspaceClientId }),
    },
  });
  return getStudy(studyId) as Promise<StudyRecord>;
}

export async function deleteStudy(studyId: string): Promise<void> {
  await prisma.study.delete({ where: { id: studyId } });
}

// ── Plan ──────────────────────────────────────────────────────────────────────

export async function triggerPlanGeneration(studyId: string): Promise<void> {
  const workspace = await getWorkspace();
  const study = await prisma.study.findUniqueOrThrow({ where: { id: studyId } });

  const aiConfig = resolveAiConfig(workspace);
  if (!aiConfig.apiKey) throw new Error(`No ${aiConfig.provider} API key configured. Add it in Settings → Integrations.`);

  // Set status to PLAN_GENERATING and ensure plan row exists
  await prisma.study.update({ where: { id: studyId }, data: { status: "PLAN_GENERATING" } });
  await prisma.studyResearchPlan.upsert({
    where: { studyId },
    create: { studyId, status: "GENERATING" },
    update: { status: "GENERATING" },
  });

  try {
    const personas = BUILT_IN_PERSONAS.filter((p) => study.selectedPersonaIds.includes(p.id));
    const result: ResearchPlanOutput = await generateResearchPlan(
      { title: study.title, problemStatement: study.problemStatement, researchGoals: study.researchGoals },
      personas,
      aiConfig,
    );

    // Delete existing questions and replace
    const plan = await prisma.studyResearchPlan.findUniqueOrThrow({ where: { studyId } });
    await prisma.studyPlanQuestion.deleteMany({ where: { planId: plan.id } });

    await prisma.$transaction(
      result.questions.map((q, i) =>
        prisma.studyPlanQuestion.create({
          data: {
            planId: plan.id,
            text: q.text,
            personaIds: q.personaIds,
            turnType: "SINGLE",
            orderIndex: i,
            rationale: q.rationale,
          },
        }),
      ),
    );

    await prisma.studyResearchPlan.update({ where: { studyId }, data: { status: "READY" } });
    await prisma.study.update({ where: { id: studyId }, data: { status: "PLAN_READY" } });
  } catch (err) {
    await prisma.studyResearchPlan.update({ where: { studyId }, data: { status: "DRAFT" } });
    await prisma.study.update({ where: { id: studyId }, data: { status: "DRAFT" } });
    throw err;
  }
}

export async function savePlan(
  studyId: string,
  questions: Array<{ id?: string; text: string; personaIds: string[]; turnType: string; orderIndex: number; rationale?: string }>,
  notes: string | null,
  status: "DRAFT" | "LOCKED",
): Promise<void> {
  const plan = await prisma.studyResearchPlan.upsert({
    where: { studyId },
    create: { studyId, notes, status },
    update: { notes, status },
  });

  // Replace all questions
  await prisma.studyPlanQuestion.deleteMany({ where: { planId: plan.id } });
  if (questions.length > 0) {
    await prisma.$transaction(
      questions.map((q, i) =>
        prisma.studyPlanQuestion.create({
          data: {
            planId: plan.id,
            text: q.text,
            personaIds: q.personaIds,
            turnType: (q.turnType === "SEQUENCED_FLOW" ? "SEQUENCED_FLOW" : "SINGLE") as "SINGLE" | "SEQUENCED_FLOW",
            orderIndex: i,
            rationale: q.rationale ?? null,
          },
        }),
      ),
    );
  }

  if (status === "LOCKED") {
    await prisma.study.update({ where: { id: studyId }, data: { status: "PLAN_READY" } });
  }
}

// ── Study Runner ──────────────────────────────────────────────────────────────

export async function runStudy(studyId: string): Promise<void> {
  const workspace = await getWorkspace();
  const aiConfig = resolveAiConfig(workspace);
  if (!aiConfig.apiKey) throw new Error(`No ${aiConfig.provider} API key configured. Add it in Settings → Integrations.`);

  const study = await prisma.study.findUniqueOrThrow({
    where: { id: studyId },
    include: { plan: { include: { questions: { orderBy: { orderIndex: "asc" } } } } },
  });

  if (!study.plan || study.plan.questions.length === 0) {
    throw new Error("Study has no plan questions. Generate and lock a plan first.");
  }

  const questions = study.plan.questions;

  // Create sessions
  let sessionSpecs: Array<{ personaId: string; personaName: string }>;
  if (study.sessionMode === "GROUP") {
    sessionSpecs = [{ personaId: "group", personaName: "Group Session" }];
  } else {
    sessionSpecs = study.selectedPersonaIds.map((pid) => {
      const persona = getPersonaById(pid);
      return { personaId: pid, personaName: persona?.name ?? pid };
    });
  }

  await prisma.study.update({ where: { id: studyId }, data: { status: "RUNNING" } });

  // Delete any existing sessions from a previous run
  await prisma.studySession.deleteMany({ where: { studyId } });

  const sessions = await prisma.$transaction(
    sessionSpecs.map((spec) =>
      prisma.studySession.create({
        data: {
          studyId,
          personaId: spec.personaId,
          personaName: spec.personaName,
          mode: study.sessionMode as "ONE_ON_ONE" | "GROUP",
          status: "PENDING",
        },
      }),
    ),
  );

  const allSessionSyntheses: SessionSynthesis[] = [];

  for (const session of sessions) {
    await prisma.studySession.update({
      where: { id: session.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const personaDef = getPersonaById(session.personaId);
    const studyTurns: StudyTurn[] = [];
    const sessionHistory: Array<{ question: string; answer: string }> = [];

    // For group mode, iterate over all personas per question; for 1-on-1, use the session's persona
    const personasToInterview = study.sessionMode === "GROUP"
      ? BUILT_IN_PERSONAS.filter((p) => study.selectedPersonaIds.includes(p.id))
      : personaDef ? [personaDef] : [];

    for (const question of questions) {
      const exchanges: StudyTurn["exchanges"] = [];
      const allResponses: Array<{ personaId: string; personaName: string; spoken: string; sentiment: string; painPoints: string[]; delights: string[]; confusionPoints: string[] }> = [];

      for (const persona of personasToInterview) {
        try {
          const response = await conductInterview(persona, study, question.text, sessionHistory, aiConfig);
          exchanges.push({ question: question.text, response, isFollowUp: false, depth: 0 });
          allResponses.push({ personaId: persona.id, personaName: persona.name, ...response });
          sessionHistory.push({ question: question.text, answer: response.spoken });

          // Follow-ups (max depth 2)
          const alreadyAsked: string[] = [];
          for (let depth = 1; depth <= 2; depth++) {
            const lastExchange = exchanges[exchanges.length - 1];
            const fu = await generateFollowUps(
              lastExchange.question,
              persona.name,
              lastExchange.response.spoken,
              depth,
              alreadyAsked,
              aiConfig,
            );
            if (fu.followUps.length === 0) break;
            const followUp = fu.followUps[0];
            alreadyAsked.push(followUp.question);
            const fuResponse = await conductInterview(persona, study, followUp.question, sessionHistory, aiConfig);
            exchanges.push({ question: followUp.question, response: fuResponse, isFollowUp: true, depth });
            sessionHistory.push({ question: followUp.question, answer: fuResponse.spoken });
          }
        } catch {
          // If one persona fails, continue with others
        }
      }

      let synthesis;
      try {
        synthesis = await synthesizeTurn(question.text, allResponses, aiConfig);
      } catch {
        // Non-fatal
      }

      studyTurns.push({ questionText: question.text, exchanges, synthesis });

      // Save progress after each turn
      const transcript: SessionTranscript = {
        sessionId: session.id,
        personaId: session.personaId,
        personaName: session.personaName,
        status: "running",
        turns: studyTurns,
      };
      await prisma.studySession.update({
        where: { id: session.id },
        data: { transcriptData: transcript as object },
      });
    }

    // Session synthesis
    let sessionSynthesis: SessionSynthesis | undefined;
    const primaryPersona = personaDef ?? BUILT_IN_PERSONAS[0];
    try {
      sessionSynthesis = await synthesizeSession(primaryPersona, studyTurns, aiConfig);
      allSessionSyntheses.push(sessionSynthesis);
    } catch {
      // Non-fatal
    }

    const finalTranscript: SessionTranscript = {
      sessionId: session.id,
      personaId: session.personaId,
      personaName: session.personaName,
      status: "completed",
      turns: studyTurns,
      synthesis: sessionSynthesis,
    };

    await prisma.studySession.update({
      where: { id: session.id },
      data: { status: "COMPLETED", completedAt: new Date(), transcriptData: finalTranscript as object },
    });
  }

  // Generate final report
  try {
    const reportPayload = await generateReport(study, allSessionSyntheses, aiConfig);
    await prisma.studyReport.upsert({
      where: { studyId },
      create: { studyId, payload: reportPayload as object },
      update: { payload: reportPayload as object },
    });
  } catch {
    // Non-fatal: study still completes, just without a report
  }

  await prisma.study.update({ where: { id: studyId }, data: { status: "COMPLETED" } });
}
