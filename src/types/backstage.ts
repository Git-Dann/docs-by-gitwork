// Backstage (internal Gitwork ops) — leave + expenses + staffing alerts.
//
// These shapes are the contract for BOTH the web app and the iOS app.
// All dates are ISO-8601 strings in UTC; clients localise for display.

export type LeaveType = "ANNUAL" | "SICK" | "UNPAID" | "OTHER";

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type ExpenseStatus =
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "REIMBURSED";

export type ExpenseCategory =
  | "TRAVEL"
  | "EQUIPMENT"
  | "SOFTWARE"
  | "MEALS"
  | "ACCOMMODATION"
  | "OTHER";

export type BackstageMember = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  countryCode: string;
  assignedClientIds: string[];
};

export type LeaveRequestDTO = {
  id: string;
  workspaceId: string;
  user: { id: string; name: string; avatarUrl: string | null };
  type: LeaveType;
  startDate: string; // ISO date
  endDate: string; // ISO date (inclusive)
  halfDayStart: boolean;
  halfDayEnd: boolean;
  /** Effective length in working days, excluding weekends + public holidays in the user's country. */
  workingDays: number;
  reason: string | null;
  status: LeaveStatus;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseDTO = {
  id: string;
  workspaceId: string;
  user: { id: string; name: string; avatarUrl: string | null };
  amount: number;
  currency: string;
  category: ExpenseCategory;
  vendor: string | null;
  occurredOn: string;
  notes: string | null;
  /** True when receipt bytes exist on the server (full or thumb). The image is served via a separate route. */
  hasReceipt: boolean;
  /** When the expense is resolved, the full image is dropped — clients should show the thumb. */
  receiptResolved: boolean;
  status: ExpenseStatus;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeaveAllowanceDTO = {
  year: number;
  /** Total annual entitlement: WorkspaceMember.annualLeaveDays ?? Workspace.defaultAnnualLeaveDays. */
  allocated: number;
  /** Sum of approved leave (working days only) in the current calendar year. */
  used: number;
  /** Sum of pending leave (working days only) — informational, not deducted from `remaining`. */
  pending: number;
  /** allocated − used. Pending requests are NOT pre-deducted so a rejection doesn't lock up days. */
  remaining: number;
};

export type StaffingAlert =
  | {
      kind: "leave";
      startDate: string;
      endDate: string;
      type: LeaveType;
      user: { id: string; name: string };
    }
  | {
      kind: "holiday";
      date: string;
      name: string;
      country: string;
      affectedMembers: Array<{ id: string; name: string }>;
    }
  | {
      kind: "conflict";
      date: string;
      users: Array<{ id: string; name: string }>;
    };

export type StaffingAlertsResponse = {
  windowDays: number;
  generatedAt: string;
  alerts: StaffingAlert[];
};

export type Holiday = {
  date: string; // ISO date
  name: string;
  type: string; // "public" | "religious" | "observance" | "school" | "optional"
  country: string;
};

// ─── Calendar (Timetastic-style month grid) ──────────────────────────────

export type CalendarLeaveBar = {
  leaveRequestId: string;
  userId: string;
  userName: string;
  type: LeaveType;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  /** True only on the first cell of the leave range — used to render rounded-left pill. */
  isStartOfLeave: boolean;
  /** True only on the last cell of the leave range. */
  isEndOfLeave: boolean;
  /** True when THIS cell is the half-day (start or end of the leave). */
  isHalfDayHere: boolean;
};

export type CalendarDay = {
  date: string; // YYYY-MM-DD (UTC)
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holidays: Holiday[];
  /** Approved leave overlapping this day, ordered alphabetically by user name. */
  leave: CalendarLeaveBar[];
};

export type CalendarMonth = {
  year: number;
  /** 1–12. */
  month: number;
  /** Always 6 rows of 7 days (full month + spillover before/after for a clean grid). */
  weeks: CalendarDay[][];
  /** Members with at least one leave bar in this month — used by the legend. */
  members: BackstageMember[];
  /** ISO-3166-1 alpha-2 country codes whose holidays are included this month (workspace-wide, UK + PK by default). Drives the calendar's country toggle. */
  holidayCountries: string[];
};
