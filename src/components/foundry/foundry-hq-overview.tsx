import Link from "next/link";
import { buttonStyles } from "@/components/ui/button-styles";
import { getProjectSnapshots, getWorkspaceMetrics } from "@/lib/foundry";
import { formatDate } from "@/lib/format";
import { DatePill, HealthBadge, MetricCard, ScoreBadge, SectionHeading } from "./foundry-shared";

export function FoundryHqOverview() {
  const metrics = getWorkspaceMetrics();
  const snapshots = getProjectSnapshots();
  const recentUpdates = snapshots
    .flatMap((entry) => entry.updates.slice(0, 1).map((update) => ({ update, project: entry.project })))
    .sort((left, right) => +new Date(right.update.createdAt) - +new Date(left.update.createdAt))
    .slice(0, 4);
  const pendingApprovals = snapshots.flatMap((entry) =>
    entry.approvals.map((approval) => ({ approval, project: entry.project })),
  );

  return (
    <div className="space-y-6">
      <section className="app-card border-[var(--brand-300)] bg-[linear-gradient(135deg,var(--surface-brand-soft)_0%,#ffffff_48%,var(--surface-brand)_100%)] p-6">
        <SectionHeading
          eyebrow="Foundry HQ"
          title="Active delivery, one operating view."
          copy="Projects, owners, milestones, blockers, approvals, and next actions should read as one joined-up system. This first slice keeps the suite anchored around projects rather than disconnected module data."
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Projects" value={metrics.activeProjects} detail="Active delivery tracks" />
          <MetricCard label="At risk" value={metrics.atRiskProjects} detail="Need intervention" />
          <MetricCard label="Blockers" value={metrics.openBlockers} detail="Open delivery blockers" />
          <MetricCard label="Approvals" value={metrics.pendingApprovals} detail="Waiting for sign-off" />
          <MetricCard label="Missed updates" value={metrics.missedUpdates} detail="Cadence breaches" />
        </div>
      </section>

      <section className="app-table-shell">
        <div className="border-b border-[var(--border-3)] px-5 py-4">
          <SectionHeading
            eyebrow="Projects"
            title="Active projects"
            copy="This should become the main entry point for project-level health, milestones, updates, and linked outputs."
          />
        </div>

        <div className="overflow-x-auto">
          <table className="app-table min-w-full">
            <thead>
              <tr>
                <th className="text-left">Project</th>
                <th className="text-left">Client</th>
                <th className="text-left">Owner</th>
                <th className="text-left">Stage</th>
                <th className="text-left">Next milestone</th>
                <th className="text-left">Health</th>
                <th className="text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((entry) => (
                <tr key={entry.project.id}>
                  <td>
                    <div>
                      <p className="font-medium text-[var(--text-1)]">{entry.project.name}</p>
                      <p className="mt-1 text-sm text-[var(--text-3)]">{entry.project.summary}</p>
                    </div>
                  </td>
                  <td>{entry.client.name}</td>
                  <td>{entry.owner.name}</td>
                  <td>{entry.project.stage}</td>
                  <td>
                    <div className="space-y-1">
                      <p className="font-medium text-[var(--text-1)]">{entry.project.nextMilestone}</p>
                      <DatePill value={entry.project.nextMilestoneDate} />
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <HealthBadge health={entry.health} />
                      <ScoreBadge score={entry.healthScore} />
                    </div>
                  </td>
                  <td>
                    <Link
                      href={`/app/projects/${entry.project.slug}`}
                      className={buttonStyles({ variant: "secondary", size: "xs" })}
                    >
                      Open project
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <article className="app-card p-5">
          <SectionHeading
            eyebrow="Recent updates"
            title="Latest movement"
            copy="Recent updates should be enough to explain what moved, what is blocked, and what needs a response next."
          />

          <div className="mt-5 space-y-4">
            {recentUpdates.map(({ update, project }) => (
              <div key={update.id} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--text-1)]">{project.name}</p>
                  <p className="text-xs text-[var(--text-4)]">{formatDate(update.createdAt)}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{update.body}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="app-card p-5">
          <SectionHeading
            eyebrow="Pending approvals"
            title="Needs sign-off"
            copy="Approvals belong at the project layer so Docs, Portal, and Care can all read the same decision state."
          />

          <div className="mt-5 space-y-4">
            {pendingApprovals.map(({ approval, project }) => (
              <div key={approval.id} className="rounded-[10px] border border-[var(--border-2)] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--text-1)]">{approval.title}</p>
                  <DatePill value={approval.dueAt} />
                </div>
                <p className="mt-1 text-sm text-[var(--text-3)]">{project.name}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">
                  {approval.requestedFrom === "client" ? "Client approval required." : "Internal alignment required."}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
