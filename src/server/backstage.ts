import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  type EffectiveUser,
  ForbiddenError,
  canApproveBackstage,
} from "@/server/auth/effective-user";
import { isNonWorkingDay, getHolidaysForCountry } from "@/server/backstage-holidays";
import {
  sendWorkspaceEmail,
  listBackstageApproverEmails,
  escapeHtml,
} from "@/server/email";
import type {
  LeaveRequestDTO,
  ExpenseDTO,
  LeaveAllowanceDTO,
  StaffingAlert,
  StaffingAlertsResponse,
  BackstageMember,
  CalendarMonth,
  CalendarDay,
  CalendarLeaveBar,
  LeaveType,
  LeaveStatus,
  ExpenseStatus,
  ExpenseCategory,
} from "@/types/backstage";

// ─── Helpers ─────────────────────────────────────────────────────────────

type LeaveRow = Prisma.LeaveRequestGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true; avatarUrl: true } };
    approvedBy: { select: { id: true; name: true; email: true } };
  };
}>;

type ExpenseRow = Prisma.ExpenseGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true; avatarUrl: true } };
    reviewedBy: { select: { id: true; name: true; email: true } };
  };
}>;

function toIsoDate(d: Date): string {
  return d.toISOString();
}

// Iterate every UTC-midnight day in [start, end] inclusive.
function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur <= last) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// Working days in a leave request: excludes weekends + bank holidays of the
// user's country. Half-day starts/ends each subtract 0.5 day.
function computeWorkingDays(
  startDate: Date,
  endDate: Date,
  halfDayStart: boolean,
  halfDayEnd: boolean,
  countryCode: string,
): number {
  const days = eachDay(startDate, endDate);
  let count = 0;
  for (const d of days) {
    if (!isNonWorkingDay(d, countryCode)) count += 1;
  }
  if (count === 0) return 0;
  if (halfDayStart) count -= 0.5;
  if (halfDayEnd && days.length > 1) count -= 0.5;
  if (halfDayEnd && days.length === 1 && halfDayStart) {
    // Single-day request with both half flags doesn't make sense; clamp at 0.
    count = Math.max(count, 0);
  }
  return Math.max(0, count);
}

function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() ? u.name : u.email;
}

function leaveRowToDTO(row: LeaveRow, countryCode: string): LeaveRequestDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    user: {
      id: row.user.id,
      name: displayName(row.user),
      avatarUrl: row.user.avatarUrl,
    },
    type: row.type as LeaveType,
    startDate: toIsoDate(row.startDate),
    endDate: toIsoDate(row.endDate),
    halfDayStart: row.halfDayStart,
    halfDayEnd: row.halfDayEnd,
    workingDays: computeWorkingDays(
      row.startDate,
      row.endDate,
      row.halfDayStart,
      row.halfDayEnd,
      countryCode,
    ),
    reason: row.reason,
    status: row.status as LeaveStatus,
    approvedBy: row.approvedBy
      ? { id: row.approvedBy.id, name: displayName(row.approvedBy) }
      : null,
    approvedAt: row.approvedAt ? toIsoDate(row.approvedAt) : null,
    rejectionNote: row.rejectionNote,
    createdAt: toIsoDate(row.createdAt),
    updatedAt: toIsoDate(row.updatedAt),
  };
}

function expenseRowToDTO(row: ExpenseRow): ExpenseDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    user: {
      id: row.user.id,
      name: displayName(row.user),
      avatarUrl: row.user.avatarUrl,
    },
    amount: Number(row.amount),
    currency: row.currency,
    category: row.category as ExpenseCategory,
    vendor: row.vendor,
    occurredOn: toIsoDate(row.occurredOn),
    notes: row.notes,
    hasReceipt: Boolean(row.receiptImage || row.receiptThumb),
    receiptResolved: !row.receiptImage && Boolean(row.receiptThumb),
    status: row.status as ExpenseStatus,
    reviewedBy: row.reviewedBy
      ? { id: row.reviewedBy.id, name: displayName(row.reviewedBy) }
      : null,
    reviewedAt: row.reviewedAt ? toIsoDate(row.reviewedAt) : null,
    reviewNote: row.reviewNote,
    createdAt: toIsoDate(row.createdAt),
    updatedAt: toIsoDate(row.updatedAt),
  };
}

// ─── Leave ───────────────────────────────────────────────────────────────

export async function listLeaveRequests(
  user: EffectiveUser,
  opts: {
    scope?: "me" | "team" | "all";
    status?: LeaveStatus;
    limit?: number;
    cursor?: string;
  } = {},
): Promise<LeaveRequestDTO[]> {
  await ensureBaseRecords();
  const scope = opts.scope ?? "me";
  if (scope !== "me" && !canApproveBackstage(user)) {
    // Team/all visibility is allowed for admins + approvers only
    if (scope === "all") {
      throw new ForbiddenError("Cannot view all leave requests");
    }
  }

  const where: Prisma.LeaveRequestWhereInput = { workspaceId: user.workspaceId };
  if (scope === "me") where.userId = user.id;
  if (opts.status) where.status = opts.status;

  const rows = await prisma.leaveRequest.findMany({
    where,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: opts.limit ?? 50,
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });

  // Look up country codes per user in one batch — small workspace, simple query.
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: user.workspaceId, userId: { in: userIds } },
    select: { userId: true, countryCode: true },
  });
  const countryByUser = new Map(members.map((m) => [m.userId, m.countryCode]));

  return rows.map((r) => leaveRowToDTO(r, countryByUser.get(r.userId) ?? "GB"));
}

export async function getLeaveRequest(
  user: EffectiveUser,
  id: string,
): Promise<LeaveRequestDTO> {
  const row = await prisma.leaveRequest.findFirst({
    where: { id, workspaceId: user.workspaceId },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!row) throw new ForbiddenError("Leave request not found");

  // Staff can only fetch their own; approvers/admins can fetch anyone.
  if (row.userId !== user.id && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot view another user's leave");
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: user.workspaceId, userId: row.userId },
    select: { countryCode: true },
  });
  return leaveRowToDTO(row, member?.countryCode ?? "GB");
}

export async function createLeaveRequest(
  user: EffectiveUser,
  input: {
    type: LeaveType;
    startDate: string;
    endDate: string;
    halfDayStart?: boolean;
    halfDayEnd?: boolean;
    reason?: string;
    userId?: string; // admin-only: file on behalf of another user
  },
): Promise<LeaveRequestDTO> {
  await ensureBaseRecords();
  const targetUserId =
    input.userId && input.userId !== user.id
      ? (canApproveBackstage(user)
          ? input.userId
          : (() => {
              throw new ForbiddenError("Cannot file leave for another user");
            })())
      : user.id;

  const row = await prisma.leaveRequest.create({
    data: {
      workspaceId: user.workspaceId,
      userId: targetUserId,
      type: input.type,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      halfDayStart: input.halfDayStart ?? false,
      halfDayEnd: input.halfDayEnd ?? false,
      reason: input.reason,
      status: "PENDING",
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: user.workspaceId, userId: targetUserId },
    select: { countryCode: true },
  });
  const dto = leaveRowToDTO(row, member?.countryCode ?? "GB");
  // Fire-and-forget notification to approvers. Don't block the request on email failures.
  void notifyLeaveSubmitted(user.workspaceId, dto, targetUserId).catch((err) =>
    console.error("[backstage] notifyLeaveSubmitted failed", err),
  );
  return dto;
}

async function notifyLeaveSubmitted(
  workspaceId: string,
  lr: LeaveRequestDTO,
  excludeUserId: string,
): Promise<void> {
  const approvers = await listBackstageApproverEmails(workspaceId, excludeUserId);
  if (approvers.length === 0) return;
  const requester = escapeHtml(lr.user.name ?? "A teammate");
  const dates = `${lr.startDate.slice(0, 10)} → ${lr.endDate.slice(0, 10)}`;
  const reason = lr.reason ? `<p>${escapeHtml(lr.reason)}</p>` : "";
  await sendWorkspaceEmail({
    workspaceId,
    to: approvers,
    subject: `Leave request from ${requester}`,
    html: `
      <p>${requester} requested leave.</p>
      <p><strong>${dates}</strong> · ${lr.workingDays} working ${lr.workingDays === 1 ? "day" : "days"} · ${lr.type.toLowerCase()}</p>
      ${reason}
      <p><a href="/app/backstage">Open Backstage approvals →</a></p>
    `,
  });
}

export async function updateLeaveRequest(
  user: EffectiveUser,
  id: string,
  input: {
    type?: LeaveType;
    startDate?: string;
    endDate?: string;
    halfDayStart?: boolean;
    halfDayEnd?: boolean;
    reason?: string;
  },
): Promise<LeaveRequestDTO> {
  const existing = await prisma.leaveRequest.findFirst({
    where: { id, workspaceId: user.workspaceId },
  });
  if (!existing) throw new ForbiddenError("Leave request not found");
  if (existing.userId !== user.id && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot edit another user's leave");
  }
  if (existing.status !== "PENDING") {
    throw new ForbiddenError("Cannot edit a resolved leave request");
  }

  const row = await prisma.leaveRequest.update({
    where: { id },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
      ...(input.halfDayStart !== undefined ? { halfDayStart: input.halfDayStart } : {}),
      ...(input.halfDayEnd !== undefined ? { halfDayEnd: input.halfDayEnd } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: user.workspaceId, userId: row.userId },
    select: { countryCode: true },
  });
  return leaveRowToDTO(row, member?.countryCode ?? "GB");
}

export async function cancelLeaveRequest(user: EffectiveUser, id: string): Promise<LeaveRequestDTO> {
  const existing = await prisma.leaveRequest.findFirst({
    where: { id, workspaceId: user.workspaceId },
  });
  if (!existing) throw new ForbiddenError("Leave request not found");
  if (existing.userId !== user.id && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot cancel another user's leave");
  }
  if (existing.status === "REJECTED" || existing.status === "CANCELLED") {
    throw new ForbiddenError("Already cancelled or rejected");
  }
  return prisma.leaveRequest
    .update({
      where: { id },
      data: { status: "CANCELLED" },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    })
    .then(async (row) => {
      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: user.workspaceId, userId: row.userId },
        select: { countryCode: true },
      });
      return leaveRowToDTO(row, member?.countryCode ?? "GB");
    });
}

export async function approveLeaveRequest(
  user: EffectiveUser,
  id: string,
  note?: string,
): Promise<LeaveRequestDTO> {
  if (!canApproveBackstage(user)) throw new ForbiddenError("Approval permission required");
  const existing = await prisma.leaveRequest.findFirst({
    where: { id, workspaceId: user.workspaceId },
  });
  if (!existing) throw new ForbiddenError("Leave request not found");
  if (existing.userId === user.id) {
    throw new ForbiddenError("Cannot approve your own leave");
  }
  if (existing.status !== "PENDING") {
    throw new ForbiddenError("Only pending requests can be approved");
  }

  const row = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedById: user.id,
      approvedAt: new Date(),
      rejectionNote: note ?? null,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: user.workspaceId, userId: row.userId },
    select: { countryCode: true },
  });
  return leaveRowToDTO(row, member?.countryCode ?? "GB");
}

export async function rejectLeaveRequest(
  user: EffectiveUser,
  id: string,
  note?: string,
): Promise<LeaveRequestDTO> {
  if (!canApproveBackstage(user)) throw new ForbiddenError("Approval permission required");
  const existing = await prisma.leaveRequest.findFirst({
    where: { id, workspaceId: user.workspaceId },
  });
  if (!existing) throw new ForbiddenError("Leave request not found");
  if (existing.userId === user.id) {
    throw new ForbiddenError("Cannot reject your own leave");
  }
  if (existing.status !== "PENDING") {
    throw new ForbiddenError("Only pending requests can be rejected");
  }

  const row = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      approvedById: user.id,
      approvedAt: new Date(),
      rejectionNote: note ?? null,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: user.workspaceId, userId: row.userId },
    select: { countryCode: true },
  });
  return leaveRowToDTO(row, member?.countryCode ?? "GB");
}

// Annual leave entitlement minus approved days used in the current calendar
// year. Pending days are reported separately and not pre-deducted — a
// rejection mustn't lock up days.
export async function getLeaveAllowance(
  user: EffectiveUser,
  targetUserId?: string,
): Promise<LeaveAllowanceDTO> {
  const userId = targetUserId ?? user.id;
  if (userId !== user.id && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot view another user's allowance");
  }

  const year = new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const [workspace, member, requests] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { defaultAnnualLeaveDays: true },
    }),
    prisma.workspaceMember.findFirst({
      where: { workspaceId: user.workspaceId, userId },
      select: { annualLeaveDays: true, countryCode: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        workspaceId: user.workspaceId,
        userId,
        type: "ANNUAL",
        status: { in: ["APPROVED", "PENDING"] },
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      select: {
        startDate: true,
        endDate: true,
        halfDayStart: true,
        halfDayEnd: true,
        status: true,
      },
    }),
  ]);

  const allocated = member?.annualLeaveDays ?? workspace?.defaultAnnualLeaveDays ?? 25;
  const country = member?.countryCode ?? "GB";

  let used = 0;
  let pending = 0;
  for (const r of requests) {
    // Clamp to current year window
    const start = r.startDate < yearStart ? yearStart : r.startDate;
    const end = r.endDate > yearEnd ? yearEnd : r.endDate;
    const days = computeWorkingDays(start, end, r.halfDayStart, r.halfDayEnd, country);
    if (r.status === "APPROVED") used += days;
    else if (r.status === "PENDING") pending += days;
  }

  return {
    year,
    allocated,
    used,
    pending,
    remaining: Math.max(0, allocated - used),
  };
}

// ─── Expenses ────────────────────────────────────────────────────────────

export async function listExpenses(
  user: EffectiveUser,
  opts: {
    scope?: "me" | "team" | "all";
    status?: ExpenseStatus;
    limit?: number;
  } = {},
): Promise<ExpenseDTO[]> {
  await ensureBaseRecords();
  const scope = opts.scope ?? "me";
  if (scope === "all" && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot view all expenses");
  }

  const where: Prisma.ExpenseWhereInput = { workspaceId: user.workspaceId };
  if (scope === "me") where.userId = user.id;
  if (opts.status) where.status = opts.status;

  const rows = await prisma.expense.findMany({
    where,
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take: opts.limit ?? 50,
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return rows.map(expenseRowToDTO);
}

export async function getExpense(user: EffectiveUser, id: string): Promise<ExpenseDTO> {
  const row = await prisma.expense.findFirst({
    where: { id, workspaceId: user.workspaceId },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!row) throw new ForbiddenError("Expense not found");
  if (row.userId !== user.id && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot view another user's expense");
  }
  return expenseRowToDTO(row);
}

export async function createExpense(
  user: EffectiveUser,
  input: {
    amount: number;
    currency: string;
    category: ExpenseCategory;
    vendor?: string;
    occurredOn: string;
    notes?: string;
    userId?: string;
  },
): Promise<ExpenseDTO> {
  await ensureBaseRecords();
  const targetUserId =
    input.userId && input.userId !== user.id
      ? (canApproveBackstage(user)
          ? input.userId
          : (() => {
              throw new ForbiddenError("Cannot file expenses for another user");
            })())
      : user.id;

  const row = await prisma.expense.create({
    data: {
      workspaceId: user.workspaceId,
      userId: targetUserId,
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      vendor: input.vendor,
      occurredOn: new Date(input.occurredOn),
      notes: input.notes,
      status: "SUBMITTED",
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });
  const dto = expenseRowToDTO(row);
  void notifyExpenseSubmitted(user.workspaceId, dto, targetUserId).catch((err) =>
    console.error("[backstage] notifyExpenseSubmitted failed", err),
  );
  return dto;
}

async function notifyExpenseSubmitted(
  workspaceId: string,
  ex: ExpenseDTO,
  excludeUserId: string,
): Promise<void> {
  const approvers = await listBackstageApproverEmails(workspaceId, excludeUserId);
  if (approvers.length === 0) return;
  const claimant = escapeHtml(ex.user.name ?? "A teammate");
  const vendor = ex.vendor ? ` · ${escapeHtml(ex.vendor)}` : "";
  const notes = ex.notes ? `<p>${escapeHtml(ex.notes)}</p>` : "";
  await sendWorkspaceEmail({
    workspaceId,
    to: approvers,
    subject: `Expense from ${claimant}: ${ex.currency} ${ex.amount.toFixed(2)}`,
    html: `
      <p>${claimant} submitted an expense.</p>
      <p><strong>${ex.currency} ${ex.amount.toFixed(2)}</strong> · ${ex.category.toLowerCase()}${vendor}</p>
      <p>Date: ${ex.occurredOn.slice(0, 10)}</p>
      ${notes}
      <p><a href="/app/backstage">Open Backstage approvals →</a></p>
    `,
  });
}

export async function updateExpense(
  user: EffectiveUser,
  id: string,
  input: Partial<{
    amount: number;
    currency: string;
    category: ExpenseCategory;
    vendor: string;
    occurredOn: string;
    notes: string;
  }>,
): Promise<ExpenseDTO> {
  const existing = await prisma.expense.findFirst({
    where: { id, workspaceId: user.workspaceId },
  });
  if (!existing) throw new ForbiddenError("Expense not found");
  if (existing.userId !== user.id && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot edit another user's expense");
  }
  if (existing.status !== "SUBMITTED") {
    throw new ForbiddenError("Cannot edit a reviewed expense");
  }

  const row = await prisma.expense.update({
    where: { id },
    data: {
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
      ...(input.occurredOn !== undefined ? { occurredOn: new Date(input.occurredOn) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return expenseRowToDTO(row);
}

export async function deleteExpense(user: EffectiveUser, id: string): Promise<void> {
  const existing = await prisma.expense.findFirst({
    where: { id, workspaceId: user.workspaceId },
  });
  if (!existing) throw new ForbiddenError("Expense not found");
  if (existing.userId !== user.id && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot delete another user's expense");
  }
  if (existing.status !== "SUBMITTED") {
    throw new ForbiddenError("Cannot delete a reviewed expense");
  }
  await prisma.expense.delete({ where: { id } });
}

// Attach (or replace) a receipt image on an expense. Bytes are pre-compressed
// by the client (browser-image-compression on web, native compression on iOS).
// Server transcodes HEIC → JPEG via sharp for cross-platform display.
export async function attachReceipt(
  user: EffectiveUser,
  expenseId: string,
  bytes: Buffer,
  mime: string,
): Promise<ExpenseDTO> {
  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, workspaceId: user.workspaceId },
  });
  if (!existing) throw new ForbiddenError("Expense not found");
  if (existing.userId !== user.id && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot attach receipt to another user's expense");
  }

  let storedBytes = bytes;
  let storedMime = mime;

  // Transcode HEIC → JPEG. iOS often uploads as image/heic; browsers can't render it.
  if (mime === "image/heic" || mime === "image/heif") {
    const sharp = (await import("sharp")).default;
    storedBytes = await sharp(bytes)
      .rotate()
      .jpeg({ quality: 85 })
      .toBuffer();
    storedMime = "image/jpeg";
  }

  const row = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      receiptImage: storedBytes,
      receiptMime: storedMime,
      // Clear any stale thumb so the lifecycle is unambiguous.
      receiptThumb: null,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return expenseRowToDTO(row);
}

// Serve receipt bytes. Returns the full image while unresolved, the thumb
// afterwards. Auth: claimant + approvers.
export async function getReceiptBytes(
  user: EffectiveUser,
  expenseId: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const row = await prisma.expense.findFirst({
    where: { id: expenseId, workspaceId: user.workspaceId },
    select: {
      userId: true,
      receiptImage: true,
      receiptThumb: true,
      receiptMime: true,
    },
  });
  if (!row) throw new ForbiddenError("Expense not found");
  if (row.userId !== user.id && !canApproveBackstage(user)) {
    throw new ForbiddenError("Cannot view another user's receipt");
  }
  const bytes = row.receiptImage ?? row.receiptThumb;
  if (!bytes) return null;
  return {
    bytes: Buffer.from(bytes),
    mime: row.receiptMime ?? "image/jpeg",
  };
}

// Review an expense (APPROVED / REJECTED / REIMBURSED). On resolve, if a full
// receipt image is present, generate a small thumb for audit and drop the
// full bytes to keep DB size manageable.
export async function reviewExpense(
  user: EffectiveUser,
  id: string,
  decision: "APPROVED" | "REJECTED" | "REIMBURSED",
  note?: string,
): Promise<ExpenseDTO> {
  if (!canApproveBackstage(user)) throw new ForbiddenError("Approval permission required");
  const existing = await prisma.expense.findFirst({
    where: { id, workspaceId: user.workspaceId },
  });
  if (!existing) throw new ForbiddenError("Expense not found");
  if (existing.userId === user.id) {
    throw new ForbiddenError("Cannot review your own expense");
  }
  if (existing.status === decision) {
    throw new ForbiddenError("Already in that state");
  }

  let thumbBytes: Buffer | null = null;
  if (existing.receiptImage) {
    const sharp = (await import("sharp")).default;
    thumbBytes = await sharp(Buffer.from(existing.receiptImage))
      .resize({ width: 200, height: 200, fit: "inside" })
      .jpeg({ quality: 70 })
      .toBuffer();
  }

  const row = await prisma.expense.update({
    where: { id },
    data: {
      status: decision,
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: note ?? null,
      ...(thumbBytes
        ? { receiptImage: null, receiptThumb: thumbBytes, receiptMime: "image/jpeg" }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return expenseRowToDTO(row);
}

// ─── Team directory ──────────────────────────────────────────────────────

export async function listWorkspaceMembers(user: EffectiveUser): Promise<BackstageMember[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: user.workspaceId },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    countryCode: m.countryCode,
  }));
}

// ─── Staffing alerts (Foundry HQ dashboard) ──────────────────────────────

// Combines approved leave + holiday lookups for the next N days into a single
// alert feed used by both the web dashboard card and the iOS widget.
export async function getStaffingAlerts(
  user: EffectiveUser,
  opts: { windowDays?: number } = {},
): Promise<StaffingAlertsResponse> {
  await ensureBaseRecords();
  const windowDays = opts.windowDays ?? 30;
  const now = new Date();
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const toDate = new Date(fromDate);
  toDate.setUTCDate(toDate.getUTCDate() + windowDays);

  const [members, approvedLeave] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: user.workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        workspaceId: user.workspaceId,
        status: "APPROVED",
        startDate: { lte: toDate },
        endDate: { gte: fromDate },
      },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const alerts: StaffingAlert[] = [];

  // 1) Leave cards — one per upcoming approved leave.
  for (const lr of approvedLeave) {
    alerts.push({
      kind: "leave",
      startDate: toIsoDate(lr.startDate),
      endDate: toIsoDate(lr.endDate),
      type: lr.type as LeaveType,
      user: { id: lr.user.id, name: lr.user.name ?? "Unknown" },
    });
  }

  // 2) Holiday cards — group by (date, country), list affected members.
  const countriesPresent = Array.from(new Set(members.map((m) => m.countryCode)));
  const holidayBuckets = new Map<string, { date: string; name: string; country: string }>();
  for (const cc of countriesPresent) {
    const hols = getHolidaysForCountry(cc, fromDate, toDate);
    for (const h of hols) {
      if (h.type !== "public" && h.type !== "bank" && h.type !== "religious") continue;
      const key = `${h.date}__${h.country}`;
      if (!holidayBuckets.has(key)) {
        holidayBuckets.set(key, { date: h.date, name: h.name, country: h.country });
      }
    }
  }
  for (const h of holidayBuckets.values()) {
    const affected = members
      .filter((m) => m.countryCode === h.country)
      .map((m) => ({ id: m.user.id, name: m.user.name ?? m.user.email }));
    if (affected.length === 0) continue;
    alerts.push({
      kind: "holiday",
      date: new Date(`${h.date}T00:00:00Z`).toISOString(),
      name: h.name,
      country: h.country,
      affectedMembers: affected,
    });
  }

  // 3) Conflict cards — 2+ members off on the same working day.
  const dayToUsers = new Map<string, Array<{ id: string; name: string }>>();
  for (const lr of approvedLeave) {
    const days = eachDay(lr.startDate, lr.endDate);
    for (const d of days) {
      if (d < fromDate || d > toDate) continue;
      const key = d.toISOString().slice(0, 10);
      const list = dayToUsers.get(key) ?? [];
      if (!list.find((u) => u.id === lr.user.id)) {
        list.push({ id: lr.user.id, name: lr.user.name ?? "Unknown" });
      }
      dayToUsers.set(key, list);
    }
  }
  for (const [day, users] of dayToUsers.entries()) {
    if (users.length >= 2) {
      alerts.push({
        kind: "conflict",
        date: new Date(`${day}T00:00:00Z`).toISOString(),
        users,
      });
    }
  }

  // Sort: by primary date asc.
  alerts.sort((a, b) => {
    const da = a.kind === "leave" ? a.startDate : a.date;
    const db = b.kind === "leave" ? b.startDate : b.date;
    return da.localeCompare(db);
  });

  return {
    windowDays,
    generatedAt: now.toISOString(),
    alerts,
  };
}

// ─── HR permission management ────────────────────────────────────────────

export async function setBackstageApprover(
  user: EffectiveUser,
  targetUserId: string,
  canApprove: boolean,
): Promise<void> {
  if (user.role !== "ADMIN") {
    throw new ForbiddenError("Only admins can change Backstage approver status");
  }
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: user.workspaceId, userId: targetUserId },
  });
  if (!member) throw new ForbiddenError("Member not found");

  const current = Array.isArray(member.permissions)
    ? (member.permissions as string[])
    : [];
  const next = canApprove
    ? Array.from(new Set([...current, "backstage.approve"]))
    : current.filter((p) => p !== "backstage.approve");

  await prisma.workspaceMember.update({
    where: { id: member.id },
    data: { permissions: next },
  });
}

// ─── Calendar (Timetastic-style month grid) ──────────────────────────────

// Returns a fully-baked 6×7 grid for the given month, with approved-leave
// bars per cell and a deduplicated holiday list per cell (resolved from each
// workspace member's countryCode). One round-trip per month view — same
// payload will power a future iOS month widget.
export async function getCalendarMonth(
  user: EffectiveUser,
  year: number,
  month: number, // 1–12
): Promise<CalendarMonth> {
  await ensureBaseRecords();

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error("year out of range");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("month out of range");
  }

  // Build a Monday-first 6-week grid (42 days) fully containing the target month.
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const dayOfWeek = firstOfMonth.getUTCDay(); // 0=Sun … 6=Sat
  const mondayOffset = (dayOfWeek + 6) % 7; // Mon=0, Tue=1, …, Sun=6
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(firstOfMonth.getUTCDate() - mondayOffset);

  const gridEnd = new Date(gridStart);
  gridEnd.setUTCDate(gridStart.getUTCDate() + 6 * 7 - 1); // 42 days inclusive
  gridEnd.setUTCHours(23, 59, 59, 999);

  const now = new Date();
  const todayIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);

  const [members, leave] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: user.workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        workspaceId: user.workspaceId,
        status: "APPROVED",
        startDate: { lte: gridEnd },
        endDate: { gte: gridStart },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  // Holidays: compute once per country present in the workspace, index by ISO date.
  const countries = Array.from(new Set(members.map((m) => m.countryCode)));
  const holidayByDate = new Map<string, ReturnType<typeof getHolidaysForCountry>>();
  for (const cc of countries) {
    const hols = getHolidaysForCountry(cc, gridStart, gridEnd);
    for (const h of hols) {
      const list = holidayByDate.get(h.date) ?? [];
      if (!list.some((x) => x.country === h.country && x.name === h.name)) {
        list.push(h);
      }
      holidayByDate.set(h.date, list);
    }
  }

  // Build cells.
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(gridStart);
      cellDate.setUTCDate(gridStart.getUTCDate() + w * 7 + d);
      const iso = cellDate.toISOString().slice(0, 10);

      const cellLeave: CalendarLeaveBar[] = [];
      for (const lr of leave) {
        const lrStart = new Date(
          Date.UTC(
            lr.startDate.getUTCFullYear(),
            lr.startDate.getUTCMonth(),
            lr.startDate.getUTCDate(),
          ),
        );
        const lrEnd = new Date(
          Date.UTC(
            lr.endDate.getUTCFullYear(),
            lr.endDate.getUTCMonth(),
            lr.endDate.getUTCDate(),
          ),
        );
        if (cellDate < lrStart || cellDate > lrEnd) continue;

        const isStartOfLeave = cellDate.getTime() === lrStart.getTime();
        const isEndOfLeave = cellDate.getTime() === lrEnd.getTime();
        const isHalfDayHere =
          (isStartOfLeave && lr.halfDayStart) || (isEndOfLeave && lr.halfDayEnd);

        cellLeave.push({
          leaveRequestId: lr.id,
          userId: lr.user.id,
          userName: lr.user.name?.trim() ? lr.user.name : lr.user.email,
          type: lr.type as LeaveType,
          halfDayStart: lr.halfDayStart,
          halfDayEnd: lr.halfDayEnd,
          isStartOfLeave,
          isEndOfLeave,
          isHalfDayHere,
        });
      }
      cellLeave.sort((a, b) => a.userName.localeCompare(b.userName));

      const dow = cellDate.getUTCDay();
      row.push({
        date: iso,
        isCurrentMonth: cellDate.getUTCMonth() === month - 1,
        isToday: iso === todayIso,
        isWeekend: dow === 0 || dow === 6,
        holidays: holidayByDate.get(iso) ?? [],
        leave: cellLeave,
      });
    }
    weeks.push(row);
  }

  // Legend members: anyone with a leave bar this month. Fall back to ALL
  // workspace members when the month is empty so the legend isn't blank.
  const idsInMonth = new Set<string>();
  weeks
    .flat()
    .forEach((day) => day.leave.forEach((lb) => idsInMonth.add(lb.userId)));
  const legendSource =
    idsInMonth.size === 0
      ? members
      : members.filter((m) => idsInMonth.has(m.user.id));
  const legendMembers: BackstageMember[] = legendSource.map((m) => ({
    id: m.user.id,
    name: m.user.name?.trim() ? m.user.name : m.user.email,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    countryCode: m.countryCode,
  }));

  return {
    year,
    month,
    weeks,
    members: legendMembers,
  };
}
