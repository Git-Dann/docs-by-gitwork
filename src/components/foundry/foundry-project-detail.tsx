import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonStyles } from "@/components/ui/button-styles";
import { getProjectSnapshotBySlug } from "@/lib/foundry";
import { formatDate } from "@/lib/format";
import { DatePill, HealthBadge, ScoreBadge, SectionHeading } from "./foundry-shared";

export function FoundryProjectDetail({ slug }: { slug: string }) {
  const snapshot = getProjectSnapshotBySlug(slug);

  if (!snapshot) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <SectionHeading
          eyebrow={snapshot.client.name}
          title={snapshot.project.name}
          copy={snapshot.project.summary}
        />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <HealthBadge health={snapshot.health} />
          <ScoreBadge score={snapshot.healthScore} />
          <DatePill value={snapshot.project.nextMilestoneDate} />
          <span className="app-chip">{snapshot.project.stage}</span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Owner" value={snapshot.owner.name} />
          <InfoCard label="Timeline" value={`${formatDate(snapshot.project.startDate)} to ${formatDate(snapshot.project.targetDate)}`} />
          <InfoCard label="Next milestone" value={snapshot.project.nextMilestone} />
          <InfoCard label="Suggested follow-up" value={snapshot.suggestedFollowUp} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <article className="app-card p-5">
          <SectionHeading
            eyebrow="Workstreams"
            title="Current delivery shape"
            copy="Projects should be the parent object; workstreams and external tasks should hang off that rather than becoming top-level products."
          />

          <div className="mt-5 space-y-4">
            {snapshot.workstreams.map((workstream) => (
              <div key={workstream.id} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--text-1)]">{workstream.name}</p>
                  <DatePill value={workstream.nextMilestoneDate} />
                </div>
                <p className="mt-1 text-sm text-[var(--text-3)]">{workstream.nextMilestone}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="app-card p-5">
          <SectionHeading
            eyebrow="Risks and blockers"
            title="Open issues"
            copy="Pulse, HQ, and Portal should all be reading the same underlying blocker and risk records."
          />

          <div className="mt-5 space-y-4">
            {[...snapshot.risks, ...snapshot.blockers].map((item) => (
              <div key={item.id} className="rounded-[10px] border border-[var(--border-2)] bg-white p-4">
                <p className="font-medium text-[var(--text-1)]">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                  {"detail" in item ? item.detail : ""}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="app-card p-5">
          <SectionHeading eyebrow="Updates" title="Recent updates" />
          <div className="mt-5 space-y-4">
            {snapshot.updates.map((update) => (
              <div key={update.id} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="app-chip">{update.type}</span>
                  <p className="text-xs text-[var(--text-4)]">{formatDate(update.createdAt)}</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">{update.body}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="app-card p-5">
          <SectionHeading eyebrow="Docs" title="Project outputs" />
          <div className="mt-5 space-y-4">
            {snapshot.documents.map((document) => (
              <div key={document.id} className="rounded-[10px] border border-[var(--border-2)] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--text-1)]">{document.title}</p>
                  <span className="app-chip">{document.template.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{document.summary}</p>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Link href="/app/docs" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                Open Docs
              </Link>
              <Link href="/app/docs" className={buttonStyles({ variant: "tertiary", size: "sm" })}>
                Open legacy builder
              </Link>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">{value}</p>
    </div>
  );
}
