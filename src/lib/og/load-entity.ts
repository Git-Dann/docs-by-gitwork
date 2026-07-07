// Narrow loaders for OG-card generators. Each returns only the fields the card
// needs — name + a short label — so an unfurl never triggers a heavy entity
// fetch. All loaders fail soft: a missing token / id returns null, and the
// caller renders a generic fallback.
//
// These deliberately bypass the existing public resolvers (resolvePublicWiki,
// getPublicTimeline, …) because those return full DTOs. OG cards only need a
// title + bottom-right label.

import { prisma } from "@/lib/prisma";
import { resolvePublicWiki } from "@/server/wiki";

// Wrap a loader so a transient DB blip / missing env doesn't crash the OG
// image render — caller falls back to a generic card.
async function safe<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ─── Document (proposals + SLA/SOW/MSA/NDA/CO/DSA) ─────────────────────────────

const DOC_TYPE_LABEL: Record<string, string> = {
  PROPOSAL: "Proposal",
  SLA: "SLA",
  SOW: "Statement of Work",
  MSA: "MSA",
  NDA: "NDA",
  CO: "Change Order",
  DSA: "Data Sharing Agreement",
  OTHER: "Document",
};

export interface DocumentCardData {
  title: string;
  subtitle: string | null;
  bottomRight: string;
}

export function loadDocumentByToken(token: string): Promise<DocumentCardData | null> {
  return safe(async () => {
    if (!token || token.length < 16) return null;
    const doc = await prisma.document.findFirst({
      where: { shareToken: token, isShared: true, archivedAt: null },
      select: { title: true, clientName: true, documentType: true, documentNumber: true },
    });
    if (!doc) return null;
    return {
      title: doc.title,
      subtitle: doc.clientName ?? null,
      bottomRight: doc.documentNumber ?? DOC_TYPE_LABEL[doc.documentType] ?? "Document",
    };
  });
}

export function loadDocumentById(id: string): Promise<DocumentCardData | null> {
  return safe(async () => {
    if (!id) return null;
    const doc = await prisma.document.findUnique({
      where: { id },
      select: { title: true, clientName: true, documentType: true, documentNumber: true },
    });
    if (!doc) return null;
    return {
      title: doc.title,
      subtitle: doc.clientName ?? null,
      bottomRight: doc.documentNumber ?? DOC_TYPE_LABEL[doc.documentType] ?? "Document",
    };
  });
}

// ─── Pulse scan ────────────────────────────────────────────────────────────────

export interface PulseCardData {
  projectName: string;
  healthScore: number | null;
}

export function loadPulseScanByToken(token: string): Promise<PulseCardData | null> {
  return safe(async () => {
    if (!token || token.length < 16) return null;
    const scan = await prisma.pulseScan.findUnique({
      where: { shareToken: token, isShared: true },
      select: { projectName: true, healthScore: true },
    });
    if (!scan) return null;
    return { projectName: scan.projectName, healthScore: scan.healthScore };
  });
}

export function loadPulseScanById(id: string): Promise<PulseCardData | null> {
  return safe(async () => {
    if (!id) return null;
    const scan = await prisma.pulseScan.findUnique({
      where: { id },
      select: { projectName: true, healthScore: true },
    });
    if (!scan) return null;
    return { projectName: scan.projectName, healthScore: scan.healthScore };
  });
}

// ─── WorkspaceClient (Portal, Timeline, Brand, Wiki) ───────────────────────────

export interface ClientCardData {
  name: string;
}

export function loadClientByTimelineToken(token: string): Promise<ClientCardData | null> {
  return safe(async () => {
    if (!token) return null;
    const client = await prisma.workspaceClient.findFirst({
      where: { timelineShareToken: token, timelineShareEnabled: true },
      select: { name: true },
    });
    return client ? { name: client.name } : null;
  });
}

export function loadClientByBrandToken(token: string): Promise<ClientCardData | null> {
  return safe(async () => {
    if (!token) return null;
    const ds = await prisma.clientDesignSystem.findFirst({
      where: { shareToken: token },
      select: { client: { select: { name: true } } },
    });
    return ds?.client ? { name: ds.client.name } : null;
  });
}

export function loadClientBySlug(slug: string): Promise<ClientCardData | null> {
  return safe(async () => {
    if (!slug) return null;
    const client = await prisma.workspaceClient.findFirst({
      where: { slug },
      select: { name: true },
    });
    return client ? { name: client.name } : null;
  });
}

// Wiki: top-level wiki carries a client name. The same `/wiki/[token]` route
// also accepts per-section share tokens (Design System / documentation pages /
// Changelog / Course Requests).
// Reuse `resolvePublicWiki` so the precedence (whole-wiki then section) stays
// in lockstep with the page itself.
const WIKI_SECTION_LABEL: Record<string, string> = {
  timeline: "Timeline",
  monitors: "Monitors",
  documents: "Documents",
  "code-handover": "Code Handover",
  ia: "IA",
  "dev-guide": "Dev Guide",
  "api-docs": "API Docs",
  architecture: "Architecture",
  runbook: "Runbook",
  "data-model": "Data Model",
  changelog: "Changelog",
  "course-requests": "Course Requests",
  "design-system": "Design System",
};

export interface WikiCardData {
  clientName: string;
  section: string | null;
}

export function loadWikiByToken(token: string): Promise<WikiCardData | null> {
  return safe(async () => {
    if (!token) return null;
    const resolved = await resolvePublicWiki(token);
    if (!resolved) return null;
    return {
      clientName: resolved.wiki.clientName,
      section: resolved.onlySection ? WIKI_SECTION_LABEL[resolved.onlySection] ?? null : null,
    };
  });
}

// ─── Candidate (CodeClear) ─────────────────────────────────────────────────────

export interface CandidateCardData {
  name: string;
  location: string | null;
}

export function loadCandidateById(id: string): Promise<CandidateCardData | null> {
  return safe(async () => {
    if (!id) return null;
    const c = await prisma.candidate.findUnique({
      where: { id },
      select: { name: true, location: true },
    });
    return c ? { name: c.name, location: c.location ?? null } : null;
  });
}

// ─── Study ─────────────────────────────────────────────────────────────────────

export interface StudyCardData {
  title: string;
}

export function loadStudyById(id: string): Promise<StudyCardData | null> {
  return safe(async () => {
    if (!id) return null;
    const s = await prisma.study.findUnique({
      where: { id },
      select: { title: true },
    });
    return s ? { title: s.title } : null;
  });
}

// ─── SupportClient (Care) ──────────────────────────────────────────────────────

export interface SupportClientCardData {
  name: string;
}

export function loadSupportClientById(id: string): Promise<SupportClientCardData | null> {
  return safe(async () => {
    if (!id) return null;
    const c = await prisma.supportClient.findUnique({
      where: { id },
      select: { name: true },
    });
    return c ? { name: c.name } : null;
  });
}
