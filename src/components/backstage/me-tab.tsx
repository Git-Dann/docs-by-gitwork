"use client";

/**
 * Backstage → Me (docs/hr-platform.md, Phase 1c): a person's own HR record. It is their
 * Staff profile opened as themselves, so the cards and the rules are exactly the ones HR
 * sees: their details, their personal details (theirs to edit), their documents (what HR
 * has asked for, and the types they may add), time off and activity.
 *
 * Someone HR hasn't set up a record for yet can set one up here; it starts with only their
 * name and email.
 */

import { StaffProfileView } from "@/components/staff/staff-profile";
import { useMyStaffRecord, useSetUpMyRecord } from "@/hooks/use-hr";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";

export function MeTab({ basePath = "/app/staff" }: { basePath?: string }) {
  const me = useMyStaffRecord();
  const setUp = useSetUpMyRecord();

  if (me.isPending) return <p className="text-sm text-[var(--text-3)]">Loading…</p>;
  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--danger-500)]">
        {me.error instanceof Error ? me.error.message : "Could not load your record"}
      </p>
    );
  }
  if (!me.data?.recordId) {
    return (
      <WidgetCard number="01" name="Your record">
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] text-[var(--text-2)]">
            HR hasn&apos;t set up your record yet. Set it up to add your personal details and any documents HR asks for.
          </p>
          <button type="button" className="app-button app-button-primary app-button-sm" onClick={() => setUp.mutate()} disabled={setUp.isPending}>
            {setUp.isPending ? "Setting up…" : "Set up my record"}
          </button>
          {setUp.error ? (
            <p role="alert" className="text-[13px] text-[var(--danger-500)]">
              {setUp.error instanceof Error ? setUp.error.message : "Could not set it up"}
            </p>
          ) : null}
        </div>
      </WidgetCard>
    );
  }
  return <StaffProfileView recordId={me.data.recordId} basePath={basePath} mode="me" />;
}
