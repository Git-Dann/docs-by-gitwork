// Maps each notification event to an icon + a short module label for the feed row.
// The `?? fallback` in eventMeta() means a server-first new event still renders (generic
// bell) rather than crashing the panel.

import {
  ArrowPathRoundedSquareIcon,
  BanknotesIcon,
  BeakerIcon,
  BellIcon,
  CalendarDaysIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckBadgeIcon,
  AtSymbolIcon,
  ClipboardDocumentCheckIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  LifebuoyIcon,
  SignalIcon,
  UserGroupIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import type { NotificationEvent } from "@/types/notifications";

type IconType = typeof BellIcon;
type EventMeta = { icon: IconType; label: string };

export const EVENT_META: Record<NotificationEvent, EventMeta> = {
  "pulse.scan_failed": { icon: ExclamationTriangleIcon, label: "Pulse" },
  "pulse.monitor_drift": { icon: SignalIcon, label: "Pulse" },
  "study.report_ready": { icon: BeakerIcon, label: "Study" },
  "care.ticket_created": { icon: LifebuoyIcon, label: "Care" },
  "care.ticket_escalated": { icon: ExclamationTriangleIcon, label: "Care" },
  "docs.viewed_by_client": { icon: EyeIcon, label: "Docs" },
  "docs.signed": { icon: DocumentCheckIcon, label: "Docs" },
  "docs.accepted": { icon: CheckBadgeIcon, label: "Docs" },
  "docs.declined": { icon: ExclamationTriangleIcon, label: "Docs" },
  "team.member_added": { icon: UserPlusIcon, label: "Team" },
  "tasks.assigned": { icon: ClipboardDocumentCheckIcon, label: "Tasks" },
  "tasks.status_changed": { icon: ArrowPathRoundedSquareIcon, label: "Tasks" },
  "tasks.commented": { icon: ChatBubbleLeftEllipsisIcon, label: "Tasks" },
  "tasks.mentioned": { icon: AtSymbolIcon, label: "Tasks" },
  "backstage.leave_submitted": { icon: CalendarDaysIcon, label: "Backstage" },
  "backstage.leave_decided": { icon: CalendarDaysIcon, label: "Backstage" },
  "backstage.expense_submitted": { icon: BanknotesIcon, label: "Backstage" },
  "backstage.expense_decided": { icon: BanknotesIcon, label: "Backstage" },
  "meetings.notes_ready": { icon: ChatBubbleLeftEllipsisIcon, label: "Scribe" },
  "clients.onboarded": { icon: UserGroupIcon, label: "Portal" },
};

export function eventMeta(event: NotificationEvent): EventMeta {
  return EVENT_META[event] ?? { icon: BellIcon, label: "Foundry" };
}
