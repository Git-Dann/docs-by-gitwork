import { getProjectSnapshots, getWeeklyPersonSummaries, getWeeklyProjectSummaries } from "@/lib/foundry";
import { DatePill, HealthBadge, MetricCard, ScoreBadge, SectionHeading } from "./foundry-shared";

export function PulseWorkspace() {
  const snapshots = getProjectSnapshots();
  const weeklyByProject = getWeeklyProjectSummaries();
  const weeklyByPerson = getWeeklyPersonSummaries();
  const missedUpdates = snapshots.filter((entry) => entry.missedUpdate).length;
  const repeatedBlockers = snapshots.reduce((total, entry) => total + entry.repeatedBlockerCount, 0);
  const noProgress = snapshots.reduce((total, entry) => total + entry.noProgressCount, 0);

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <SectionHeading
          eyebrow="Pulse"
          title="Delivery signal, not another task tracker."
          copy="Pulse should read from updates, tasks, code activity, and communication patterns, then turn that noise into project health, follow-ups, and escalation prompts."
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Projects tracked" value={snapshots.length} detail="Live delivery threads" />
          <MetricCard label="Missed updates" value={missedUpdates} detail="Cadence issues" />
          <MetricCard label="Repeated blockers" value={repeatedBlockers} detail="Recurring issues" />
          <MetricCard label="No-progress notes" value={noProgress} detail="Stalled updates" />
        </div>
      </section>

      <section className="app-table-shell">
        <div className="border-b border-[var(--border-3)] px-5 py-4">
          <SectionHeading
            eyebrow="Project signal"
            title="Health table"
            copy="This is the MVP shape for Pulse: a compact table that surfaces stale comms, repeated blockers, vague updates, and the next question to ask."
          />
        </div>

        <div className="overflow-x-auto">
          <table className="app-table min-w-full">
            <thead>
              <tr>
                <th className="text-left">Project</th>
                <th className="text-left">Health</th>
                <th className="text-left">Signals</th>
                <th className="text-left">Next milestone</th>
                <th className="text-left">Suggested follow-up</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((entry) => (
                <tr key={entry.project.id}>
                  <td>
                    <div>
                      <p className="font-medium text-[var(--text-1)]">{entry.project.name}</p>
                      <p className="mt-1 text-sm text-[var(--text-3)]">{entry.client.name}</p>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <HealthBadge health={entry.health} />
                      <ScoreBadge score={entry.healthScore} />
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {entry.missedUpdate ? <span className="app-chip">Missed update</span> : null}
                      {entry.repeatedBlockerCount ? <span className="app-chip">Repeated blocker</span> : null}
                      {entry.vagueUpdateCount ? <span className="app-chip">Vague update</span> : null}
                      {entry.noProgressCount ? <span className="app-chip">No progress</span> : null}
                    </div>
                  </td>
                  <td>
                    <div className="space-y-1">
                      <p className="font-medium text-[var(--text-1)]">{entry.project.nextMilestone}</p>
                      <DatePill value={entry.project.nextMilestoneDate} />
                    </div>
                  </td>
                  <td className="max-w-[320px] text-sm leading-6 text-[var(--text-3)]">
                    {entry.suggestedFollowUp}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="app-card p-5">
          <SectionHeading eyebrow="Weekly summary" title="By project" />
          <div className="mt-5 space-y-4">
            {weeklyByProject.map((item) => (
              <div key={item.projectId} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
                <p className="font-medium text-[var(--text-1)]">{item.projectName}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{item.summary}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="app-card p-5">
          <SectionHeading eyebrow="Weekly summary" title="By person" />
          <div className="mt-5 space-y-4">
            {weeklyByPerson.map((item) => (
              <div key={item.personId} className="rounded-[10px] border border-[var(--border-2)] bg-white p-4">
                <p className="font-medium text-[var(--text-1)]">{item.name}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{item.summary}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
