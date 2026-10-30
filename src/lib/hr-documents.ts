/**
 * HR documents (docs/hr-platform.md, Phase 1b): the types, what each engagement must
 * have on file, who may see or add which document, and the settings a business can
 * change. Pure and framework-free, so the server, the profile, Backstage → Me and the
 * demo share exactly the same rules.
 */

import { daysUntil, type ProfileRelation } from "@/lib/hr";

// ── Types ───────────────────────────────────────────────────────────────────────

export const STAFF_DOCUMENT_TYPES = [
  "CONTRACT",
  "NDA",
  "RIGHT_TO_WORK",
  "PHOTO_ID",
  "STARTER_CHECKLIST",
  "FIT_NOTE",
  "CERTIFICATE",
  "PAYSLIP",
  "OTHER",
] as const;
export type StaffDocumentType = (typeof STAFF_DOCUMENT_TYPES)[number];

export const STAFF_DOCUMENT_LABEL: Record<StaffDocumentType, string> = {
  CONTRACT: "Contract",
  NDA: "NDA",
  RIGHT_TO_WORK: "Right to work",
  PHOTO_ID: "Photo ID",
  STARTER_CHECKLIST: "Starter checklist or P45",
  FIT_NOTE: "Fit note",
  CERTIFICATE: "Certificate",
  PAYSLIP: "Payslip or P60",
  OTHER: "Other",
};

/** Types that usually expire, so the form asks for the date. */
export const EXPIRING_TYPES: readonly StaffDocumentType[] = ["RIGHT_TO_WORK", "PHOTO_ID", "CERTIFICATE"];

export function isStaffDocumentType(v: unknown): v is StaffDocumentType {
  return typeof v === "string" && (STAFF_DOCUMENT_TYPES as readonly string[]).includes(v);
}

export const DOCUMENT_STATUSES = ["ON_FILE", "TO_CHECK", "REQUESTED", "REJECTED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_VISIBILITIES = ["PERSON_HR", "HR_ONLY", "MANAGER"] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

export const VISIBILITY_LABEL: Record<DocumentVisibility, string> = {
  PERSON_HR: "Them and HR",
  HR_ONLY: "HR only",
  MANAGER: "Them, HR and their manager",
};

/**
 * What each engagement must have on file, by default (Gitwork's, agreed in the spec). The
 * partner company's agreement and insurance are held on the supplier, not each developer.
 */
export const REQUIRED_DOCUMENTS: Record<string, readonly StaffDocumentType[]> = {
  EMPLOYEE: ["CONTRACT", "NDA", "RIGHT_TO_WORK", "STARTER_CHECKLIST"],
  DIRECTOR: ["CONTRACT", "NDA", "RIGHT_TO_WORK"],
  CONTRACTOR: ["NDA", "PHOTO_ID"],
  FREELANCER: ["NDA"],
};

export function requiredFor(employmentType: string | null): readonly StaffDocumentType[] {
  return (employmentType && REQUIRED_DOCUMENTS[employmentType]) || [];
}

// ── Settings ────────────────────────────────────────────────────────────────────

export interface HrDocumentSettings {
  /** Types a person may upload for themselves (otherwise HR adds them, or requests one). */
  selfUploadTypes: StaffDocumentType[];
  /** Copy every uploaded file to the workspace's Google Drive (a "Foundry HR" folder). */
  driveEnabled: boolean;
}

/** Off by default: HR adds documents, and nothing leaves Foundry until a business turns Drive on. */
export const DEFAULT_HR_DOCUMENT_SETTINGS: HrDocumentSettings = { selfUploadTypes: [], driveEnabled: false };

/** Reads the stored JSON defensively: unknown types are dropped, anything malformed is the default. */
export function parseHrDocumentSettings(raw: unknown): HrDocumentSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const types = Array.isArray(o.selfUploadTypes) ? o.selfUploadTypes.filter(isStaffDocumentType) : [];
  return { selfUploadTypes: [...new Set(types)], driveEnabled: o.driveEnabled === true };
}

// ── Access ──────────────────────────────────────────────────────────────────────

/**
 * Who may see one document. HR sees everything; the person sees everything not marked
 * HR only; their manager sees only what's marked for the manager. Nobody else, whatever
 * Staff permissions they hold: a document is personal.
 */
export function canSeeDocument(input: {
  relation: ProfileRelation;
  canManageHr: boolean;
  visibility: string;
}): boolean {
  if (input.canManageHr) return true;
  if (input.relation === "self") return input.visibility !== "HR_ONLY";
  if (input.relation === "manager") return input.visibility === "MANAGER";
  return false;
}

/**
 * Whether the person may upload a document of this type themselves: HR has allowed the
 * type for everyone, or has asked them for one. HR can always upload.
 */
export function canUploadType(input: {
  relation: ProfileRelation;
  canManageHr: boolean;
  type: StaffDocumentType;
  settings: HrDocumentSettings;
  openRequestTypes: readonly string[];
}): boolean {
  if (input.canManageHr) return true;
  if (input.relation !== "self") return false;
  return input.settings.selfUploadTypes.includes(input.type) || input.openRequestTypes.includes(input.type);
}

// ── What's on file ──────────────────────────────────────────────────────────────

export type RequirementState = "on-file" | "expiring" | "expired" | "to-check" | "requested" | "rejected" | "missing";

export const REQUIREMENT_LABEL: Record<RequirementState, string> = {
  "on-file": "On file",
  expiring: "Expiring",
  expired: "Expired",
  "to-check": "To check",
  requested: "Requested",
  rejected: "Sent back",
  missing: "Missing",
};

export interface DocumentLike {
  type: string;
  status: string;
  expiresOn: string | null;
  createdAt: string;
}

/**
 * One required type's state, from the documents of that type. The best document wins:
 * a valid one on file beats an expiring one, which beats one waiting to be checked,
 * an open request, one sent back, and nothing at all.
 */
export function requirementState(docs: DocumentLike[], today: string, warnDays = 30): RequirementState {
  const rank: RequirementState[] = ["on-file", "expiring", "to-check", "requested", "expired", "rejected", "missing"];
  let best: RequirementState = "missing";
  for (const d of docs) {
    let s: RequirementState;
    if (d.status === "ON_FILE") {
      if (!d.expiresOn) s = "on-file";
      else {
        const left = daysUntil(d.expiresOn, today);
        s = left < 0 ? "expired" : left <= warnDays ? "expiring" : "on-file";
      }
    } else if (d.status === "TO_CHECK") s = "to-check";
    else if (d.status === "REQUESTED") s = "requested";
    else s = "rejected";
    if (rank.indexOf(s) < rank.indexOf(best)) best = s;
  }
  return best;
}

export function requirementsFor(
  employmentType: string | null,
  docs: DocumentLike[],
  today: string,
): Array<{ type: StaffDocumentType; state: RequirementState }> {
  return requiredFor(employmentType).map((type) => ({
    type,
    state: requirementState(
      docs.filter((d) => d.type === type),
      today,
    ),
  }));
}

/** The required types not yet satisfied (anything but on file or expiring): what HR is still waiting for. */
export function outstandingRequired(employmentType: string | null, docs: DocumentLike[], today: string): StaffDocumentType[] {
  return requirementsFor(employmentType, docs, today)
    .filter((r) => r.state !== "on-file" && r.state !== "expiring")
    .map((r) => r.type);
}

// ── Validation ──────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DocumentMetaInput {
  type?: unknown;
  title?: unknown;
  expiresOn?: unknown;
  visibility?: unknown;
}

export interface DocumentMeta {
  type: StaffDocumentType;
  title: string;
  expiresOn: string | null;
  visibility: DocumentVisibility;
}

/** Validates what's typed alongside a document. A blank title becomes the type's label. */
export function normaliseDocumentMeta(input: DocumentMetaInput): { ok: true; value: DocumentMeta } | { ok: false; error: string } {
  if (!isStaffDocumentType(input.type)) return { ok: false, error: "Choose what kind of document it is" };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length > 120) return { ok: false, error: "Title must be 120 characters or fewer" };
  let expiresOn: string | null = null;
  if (input.expiresOn !== undefined && input.expiresOn !== null && input.expiresOn !== "") {
    if (typeof input.expiresOn !== "string" || !DATE_RE.test(input.expiresOn)) {
      return { ok: false, error: "Expiry must be a date (YYYY-MM-DD)" };
    }
    const d = new Date(`${input.expiresOn}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input.expiresOn) {
      return { ok: false, error: "Expiry must be a real date" };
    }
    expiresOn = input.expiresOn;
  }
  const visibility = (DOCUMENT_VISIBILITIES as readonly string[]).includes(String(input.visibility))
    ? (input.visibility as DocumentVisibility)
    : "PERSON_HR";
  return { ok: true, value: { type: input.type, title: title || STAFF_DOCUMENT_LABEL[input.type], expiresOn, visibility } };
}

/**
 * A link to a file already in Google Drive. Only Drive and Docs hosts, only https: the
 * link is shown to people as an anchor, so anything else is refused rather than trusted.
 */
export function safeDriveLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "drive.google.com" && url.hostname !== "docs.google.com") return null;
  if (url.username || url.password) return null;
  return url.toString();
}

// ── The DTO ─────────────────────────────────────────────────────────────────────

export interface StaffDocumentRecord {
  id: string;
  type: StaffDocumentType;
  title: string;
  status: DocumentStatus;
  visibility: DocumentVisibility;
  filename: string | null;
  size: number | null;
  /** A Drive link instead of a file. */
  link: string | null;
  hasFile: boolean;
  expiresOn: string | null;
  note: string | null;
  uploadedBySelf: boolean;
  createdAt: string;
  /** Whether the Drive copy is done, failed, or not needed. HR only; null for everyone else. */
  drive: { state: "copied" | "failed" | "off"; error: string | null } | null;
}

export interface StaffDocumentsView {
  documents: StaffDocumentRecord[];
  required: Array<{ type: StaffDocumentType; state: RequirementState }>;
  /** Types this viewer may upload. */
  uploadTypes: StaffDocumentType[];
  canManage: boolean;
  settings: HrDocumentSettings | null;
}
