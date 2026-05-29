"use client";

import { Button } from "@/components/ui/button";

const RETENTION_ROWS = [
  {
    domain: "Pulse scans",
    retention: "Indefinite",
    notes: "Drift over time matters for monitoring — kept until the workspace is deleted.",
  },
  {
    domain: "Study sessions",
    retention: "Indefinite",
    notes: "Research transcripts and reports.",
  },
  {
    domain: "Care conversations",
    retention: "Indefinite",
    notes: "Customer comms; retention policy not yet enforced.",
  },
  {
    domain: "Audit log",
    retention: "12 months",
    notes: "Will be enforced once the audit log model is in production.",
  },
  {
    domain: "Authentication sessions",
    retention: "30 days",
    notes: "JWT max-age when 'remember me' is enabled.",
  },
];

export function PrivacySection() {
  return (
    <div className="proposal-form-theme space-y-6">
      <section className="app-card p-6">
        <p className="app-eyebrow">Data export</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Export workspace data
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Export every workspace record as JSON — clients, proposals, Pulse scans, Study reports,
          Care conversations, rate cards, settings. Useful for GDPR, audits, or moving data
          between Gitwork workspaces.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Button type="button" variant="primary" disabled>
            Export workspace JSON
          </Button>
          <span className="text-xs text-[var(--text-4)]">Wired up in the next release.</span>
        </div>
      </section>

      <section className="app-card p-6">
        <p className="app-eyebrow">Retention</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Retention policy
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          What we keep, and for how long. Per-domain retention windows aren&apos;t enforced yet —
          this table shows what&apos;s coming.
        </p>

        <div className="mt-5 overflow-hidden rounded-[10px] border border-[var(--border-2)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-1)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-4)]">
              <tr>
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Retention</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-3)]">
              {RETENTION_ROWS.map((row) => (
                <tr key={row.domain}>
                  <td className="px-4 py-3 font-medium text-[var(--text-1)]">{row.domain}</td>
                  <td className="px-4 py-3 text-[var(--text-2)]">{row.retention}</td>
                  <td className="px-4 py-3 text-[var(--text-3)]">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="app-card border-[var(--danger-200)] bg-[var(--danger-50)] p-6">
        <p className="app-eyebrow text-[var(--danger-600)]">Danger zone</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Delete workspace
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Permanently removes every record in this workspace — proposals, clients, Pulse scans,
          Study reports, Care conversations, rate cards, team. Cannot be undone. Sign-in is
          revoked for all members.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Button type="button" variant="danger" disabled>
            Delete workspace…
          </Button>
          <span className="text-xs text-[var(--text-4)]">
            Workspace deletion ships once multi-workspace lands.
          </span>
        </div>
      </section>
    </div>
  );
}
