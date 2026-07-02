"use client";

import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useAccount } from "@/hooks/use-account";
import { usePermissions } from "@/hooks/use-permissions";
import { useMyDay, useTaskAttention } from "@/hooks/use-tasks";
import { useClientList } from "@/hooks/use-proposals";
import { useStaffingAlerts } from "@/hooks/use-backstage";
import { useDeskCalendar, useDeskHolidays } from "@/hooks/use-desk";
import { cn } from "@/lib/format";
import type { StaffingAlert } from "@/types/backstage";
import type { NextHoliday, DeskTab } from "@/types/desk";
import type { CalendarEvent } from "@/lib/api";
import {
  EditorialRow,
  Stamp,
  DeskTaskRow,
  DeskEmpty,
  DeskSkeleton,
  DeskConnectGoogle,
  RevealList,
} from "./desk-shared";
import { WorldClocks, TeamOverlap, HQ_TZ, TEAM_TZ } from "./desk-time";

type Counterpart = { tz: string; label: string };

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Editorial "Today" tab — Dia-style masthead (mono rails + serif greeting) then
 *  two-column rows. On brand: blue, not yellow. */
export function DeskToday({ onNavigate }: { onNavigate?: (tab: DeskTab) => void }) {
  const account = useAccount();
  const { isAdminOrAbove, canViewClientFinancials } = usePermissions();
  const showStandup = !isAdminOrAbove; // devs/staff push standups; admins & super-admins don't
  const myDay = useMyDay();
  const attention = useTaskAttention({ mine: true });
  const calendar = useDeskCalendar();

  const now = new Date();
  const firstName = (account.data?.name ?? "").trim().split(" ")[0] || "there";
  const dateStr = now
    .toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
  // The "other hub": admins/super-admins (Dan) see Islamabad; devs/staff see Manchester (HQ).
  const counterpart: Counterpart = isAdminOrAbove
    ? { tz: TEAM_TZ, label: "Islamabad" }
    : { tz: HQ_TZ, label: "Manchester" };

  const amPushed = Boolean(myDay.data?.update.amPushedAt);
  const pmPushed = Boolean(myDay.data?.update.pmPushedAt);
  const focus = myDay.data?.doing[0] ?? myDay.data?.upcoming[0] ?? null;

  const todaysEvents = (calendar.data?.events ?? []).filter(
    (ev) => ev.start && new Date(ev.start).toDateString() === now.toDateString(),
  );

  const overdueCount = attention.data?.overdueCount ?? 0;
  const doingCount = attention.data?.doingCount ?? 0;
  const dueSoonCount = attention.data?.dueSoonCount ?? 0;
  const doneToday = myDay.data?.done.length ?? 0;

  return (
    <div>
      {/* Masthead */}
      <div className="mb-2">
        <div className="flex items-center justify-between gap-3">
          <span
            className="text-[11px] uppercase tracking-[1.6px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {dateStr}
          </span>
          <WorldClocks counterpartTz={counterpart.tz} counterpartLabel={counterpart.label} />
        </div>
        <h2
          className="mt-3 text-[40px] leading-[1.05] tracking-[-0.01em] text-[var(--text-1)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {greeting(now.getHours())},{" "}
          <span style={{ fontStyle: "italic" }} className="text-[var(--brand-700)]">
            {firstName}
          </span>
          .
        </h2>
      </div>

      {/* Push your work forward */}
      <EditorialRow
        title="Push your work forward"
        caption={showStandup ? "Your focus and standup for today." : "Your focus for today."}
        stamp={<Stamp label="My tasks" href="/app" />}
      >
        {showStandup ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StandupPill label="AM standup" done={amPushed} />
            <StandupPill label="PM standup" done={pmPushed} />
          </div>
        ) : null}
        <div>
          {myDay.isPending ? (
            <DeskSkeleton />
          ) : focus ? (
            <DeskTaskRow task={focus} />
          ) : (
            <DeskEmpty>Nothing in progress — pick something up from Tasks.</DeskEmpty>
          )}
        </div>
      </EditorialRow>

      {/* Your day — clickable stats + today's agenda */}
      <EditorialRow
        title="Your day"
        caption="Your numbers and today's agenda."
        stamp={<Stamp label="My tasks" href="/app" />}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat n={overdueCount} label="Overdue" danger onClick={() => onNavigate?.("TASKS")} />
          <Stat n={doingCount} label="Doing" onClick={() => onNavigate?.("TASKS")} />
          <Stat n={dueSoonCount} label="Due soon" onClick={() => onNavigate?.("TASKS")} />
          <Stat n={doneToday} label="Done today" good onClick={() => onNavigate?.("TASKS")} />
        </div>
        <div className="mt-4">
          <p
            className="mb-2 text-[10px] uppercase tracking-[1.2px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Today&apos;s agenda
          </p>
          <Agenda
            events={todaysEvents}
            now={now}
            pending={calendar.isPending}
            connected={calendar.data?.connected}
          />
        </div>
      </EditorialRow>

      {/* Around the team — who's off + next UK/PK holiday + working-hours overlap. */}
      <AroundTheTeam counterpart={counterpart} />

      {/* Client cash flow — gated by canViewClientFinancials (which includes the
          workspace showDevRates toggle — off by default, set in Settings → General). */}
      {canViewClientFinancials ? <CashFlowRow /> : null}
    </div>
  );
}

function AroundTheTeam({ counterpart }: { counterpart: Counterpart }) {
  const alerts = useStaffingAlerts();
  const holidays = useDeskHolidays();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const leaves = (alerts.data?.alerts ?? []).filter(
    (a): a is Extract<StaffingAlert, { kind: "leave" }> => a.kind === "leave",
  );
  const offTodayNames = [
    ...new Set(
      leaves.filter((l) => l.startDate <= todayStr && todayStr <= l.endDate).map((l) => l.user.name),
    ),
  ];
  const { weekStart, weekEnd } = isoWeekRange(now);
  const offThisWeek = new Set(
    leaves.filter((l) => l.startDate <= weekEnd && l.endDate >= weekStart).map((l) => l.user.id),
  ).size;

  return (
    <EditorialRow title="Around the team" caption="Who's about, and what's coming up.">
      <p className="text-sm text-[var(--text-2)]">
        {alerts.isPending ? (
          <span className="text-[var(--text-4)]">Checking who&apos;s around…</span>
        ) : offTodayNames.length === 0 ? (
          <>Everyone&apos;s in today.</>
        ) : (
          <>
            <span className="text-[var(--text-4)]">Off today — </span>
            {offTodayNames.join(", ")}
          </>
        )}
        {offThisWeek > 0 ? (
          <span className="text-[var(--text-4)]"> · {offThisWeek} off this week</span>
        ) : null}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <HolidayChip cc="UK" h={holidays.data?.gb} />
        <HolidayChip cc="PK" h={holidays.data?.pk} />
      </div>
      <div className="mt-3">
        <TeamOverlap counterpartTz={counterpart.tz} counterpartLabel={counterpart.label} />
      </div>
    </EditorialRow>
  );
}

function HolidayChip({ cc, h }: { cc: string; h?: NextHoliday }) {
  if (!h) return null;
  const when = h.inDays === 0 ? "today" : h.inDays === 1 ? "tomorrow" : `${h.inDays}d`;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[11px] text-[var(--text-3)]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <span className="font-semibold text-[var(--text-2)]">{cc}</span>
      <span className="max-w-[180px] truncate">{h.name}</span>
      <span className="text-[var(--text-4)]">· {when}</span>
    </span>
  );
}

/** Mon–Sun ISO-date range containing `d` (UTC). */
function isoWeekRange(d: Date): { weekStart: string; weekEnd: string } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (date.getUTCDay() + 6) % 7; // 0 = Monday
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - dow);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { weekStart: start.toISOString().slice(0, 10), weekEnd: end.toISOString().slice(0, 10) };
}

function CashFlowRow() {
  const clients = useClientList();
  const withCost = (clients.data?.clients ?? [])
    .filter((c) => c.monthlyCost && c.monthlyCost.amount > 0)
    .sort((a, b) => (b.monthlyCost?.amount ?? 0) - (a.monthlyCost?.amount ?? 0));

  const totals = new Map<string, number>();
  for (const c of withCost) {
    const mc = c.monthlyCost!;
    totals.set(mc.currency, (totals.get(mc.currency) ?? 0) + mc.amount);
  }
  const dominant = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return (
    <EditorialRow
      title="Client cash flow"
      caption="Monthly dev cost by client."
      stamp={<Stamp label="Portal" href="/app/portal" />}
    >
      {clients.isPending ? (
        <DeskSkeleton />
      ) : withCost.length === 0 ? (
        <DeskEmpty>No priced client work yet.</DeskEmpty>
      ) : (
        <>
          {dominant ? (
            <div className="mb-3 flex items-baseline gap-2">
              <span
                className="text-[30px] leading-none text-[var(--text-1)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {money(dominant[1], dominant[0])}
              </span>
              <span
                className="text-[11px] uppercase tracking-[0.8px] text-[var(--text-4)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                / mo · {withCost.length} {withCost.length === 1 ? "client" : "clients"}
                {totals.size > 1 ? " · mixed" : ""}
              </span>
            </div>
          ) : null}
          <RevealList
            items={withCost}
            initial={6}
            renderItem={(c) => (
              <Link
                key={c.id}
                href={`/app/portal/${c.slug}`}
                className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-2.5 transition hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-1)]">
                  {c.name}
                </span>
                <span
                  className="shrink-0 text-sm text-[var(--text-2)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {c.monthlyCost?.mixedCurrency
                    ? "mixed"
                    : money(c.monthlyCost!.amount, c.monthlyCost!.currency)}
                </span>
              </Link>
            )}
          />
        </>
      )}
    </EditorialRow>
  );
}

/** Compact currency format, whole units. */
function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

function StandupPill({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-xs font-medium",
        done
          ? "border-[var(--border-2)] bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "border-dashed border-[var(--border-2)] text-[var(--text-4)]",
      )}
    >
      {done ? <CheckCircleIcon className="h-3.5 w-3.5" /> : null}
      {label}
      {done ? " pushed" : " pending"}
    </span>
  );
}

function Stat({
  n,
  label,
  danger,
  good,
  onClick,
}: {
  n: number;
  label: string;
  danger?: boolean;
  good?: boolean;
  onClick?: () => void;
}) {
  const color =
    danger && n > 0
      ? "text-[var(--danger-500)]"
      : good && n > 0
        ? "text-[var(--success-500)]"
        : "text-[var(--text-1)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-3 text-center transition hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]"
    >
      <p className={cn("text-[34px] leading-none", color)} style={{ fontFamily: "var(--font-display)" }}>
        {n}
      </p>
      <p
        className="mt-1.5 text-[10px] uppercase tracking-[0.8px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </p>
    </button>
  );
}

/** Dia-style time-rail of today's meetings. */
function Agenda({
  events,
  now,
  pending,
  connected,
}: {
  events: CalendarEvent[];
  now: Date;
  pending: boolean;
  connected?: boolean;
}) {
  if (pending) return <DeskSkeleton />;
  if (connected === false) return <DeskConnectGoogle what="your calendar" />;
  if (events.length === 0) return <DeskEmpty>No meetings today — clear runway.</DeskEmpty>;

  const nextStart = events.find((e) => new Date(e.start) >= now)?.start ?? null;

  return (
    <RevealList
      items={events}
      initial={4}
      renderItem={(ev) => {
        const start = new Date(ev.start);
        const end = new Date(ev.end || ev.start);
        const current = start <= now && now < end;
        const isNext = ev.start === nextStart;
        const upcoming = start >= now;
        return (
          <div
            key={ev.id}
            className={cn(
              "flex items-center gap-3 rounded-[8px] px-3 py-2 transition",
              current
                ? "bg-[var(--surface-brand)] ring-1 ring-inset ring-[var(--brand-400)]"
                : isNext
                  ? "bg-[var(--surface-1)]"
                  : "",
            )}
          >
            <span
              className="w-14 shrink-0 text-[11px] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {fmtAgendaTime(start)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-1)]">
              {ev.summary}
            </span>
            {current ? (
              <span
                className="shrink-0 text-[10px] uppercase tracking-[1px] text-[var(--brand-700)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Now
              </span>
            ) : upcoming && ev.meetLink ? (
              <a
                href={ev.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-medium text-[var(--brand-700)] hover:underline"
              >
                Join →
              </a>
            ) : null}
          </div>
        );
      }}
    />
  );
}

/** "9:15a" compact time label. */
function fmtAgendaTime(d: Date): string {
  return d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" AM", "a")
    .replace(" PM", "p");
}
