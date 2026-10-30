"use client";

/**
 * The first-visit tour of Staff for HR: EasyUI's Product Tour over the real page. It opens on
 * its own once (src/lib/staff-tour.ts) and can be replayed from the For HR card.
 */

import { useEffect, useState } from "react";
import { ProductTour, type TourStep } from "@/components/ui/easyui/product-tour";
import { markTourSeen, readTourSeen, shouldAutoOpenStaffTour } from "@/lib/staff-tour";

const STEPS: TourStep[] = [
  {
    title: "Staff, for HR",
    body: "Everyone on the team, employees and contractors, in one place. Five quick stops. ← → and Esc work too.",
  },
  {
    target: '[data-tour="staff-people"]',
    title: "Everyone, grouped",
    body: "Grouped by role. Hover a card to see the clients someone is on, and open it for their full record: employment, personal details, documents and time off.",
  },
  {
    target: '[data-tour="staff-filters"]',
    title: "Find anyone",
    body: "Search by name, filter by department or type, or switch to the org chart. People who've left are under Archived.",
  },
  {
    target: '[data-tour="staff-hr"]',
    title: "What needs you",
    body: "Probation and contract ends, documents expiring and birthdays in the next 60 days, and every record still missing a detail.",
    placement: "top",
  },
  {
    target: '[data-tour="staff-doc-settings"]',
    title: "Documents",
    body: "Choose which documents people can add themselves, and whether files are copied to Google Drive. Both are off until you turn them on.",
  },
  {
    title: "Private by default",
    body: "Personal details stay hidden until you choose to see them, and every look is recorded in that person's access log. Replay this tour from For HR.",
  },
];

export function useStaffHrTour(input: { canManageHr: boolean; archived: boolean; hasPeople: boolean }) {
  const [open, setOpen] = useState(false);
  const { canManageHr, archived, hasPeople } = input;
  useEffect(() => {
    if (shouldAutoOpenStaffTour({ canManageHr, archived, hasPeople, seen: readTourSeen(window.localStorage) })) setOpen(true);
  }, [canManageHr, archived, hasPeople]);
  return {
    open,
    start: () => setOpen(true),
    close: () => {
      markTourSeen(window.localStorage);
      setOpen(false);
    },
  };
}

export function StaffHrTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <ProductTour open={open} steps={STEPS} onClose={onClose} label="Staff tour" />;
}
