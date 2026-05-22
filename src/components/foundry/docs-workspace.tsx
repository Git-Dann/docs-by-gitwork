import Link from "next/link";
import { buttonStyles } from "@/components/ui/button-styles";
import { getDocumentTemplates, getProjectSnapshots } from "@/lib/foundry";
import { formatDate } from "@/lib/format";
import { SectionHeading } from "./foundry-shared";

export function DocsWorkspace() {
  const templates = getDocumentTemplates();
  const snapshots = getProjectSnapshots();
  const docs = snapshots.flatMap((entry) =>
    entry.documents.map((document) => ({
      document,
      project: entry.project,
      client: entry.client,
    })),
  );

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <SectionHeading
          eyebrow="Docs"
          title="Turn project signal into usable outputs."
          copy="Docs should sit on top of the project model, not beside it. These templates are the first MVP set for generating useful client and delivery documents from project context."
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {templates.map((template) => (
            <article key={template.key} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
              <p className="app-eyebrow">{template.outputLabel}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                {template.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{template.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="app-card p-5">
          <SectionHeading
            eyebrow="Generated docs"
            title="Stored against projects"
            copy="Until a backend project model exists, this uses a typed in-repo dataset to prove the object shape and page structure."
          />

          <div className="mt-5 space-y-4">
            {docs.map(({ document, project, client }) => (
              <div key={document.id} className="rounded-[10px] border border-[var(--border-2)] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--text-1)]">{document.title}</p>
                  <span className="app-chip">{document.status}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-3)]">
                  {project.name} · {client.name}
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">{document.summary}</p>
                <p className="mt-3 text-xs text-[var(--text-4)]">Updated {formatDate(document.updatedAt)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="app-card p-5">
          <SectionHeading
            eyebrow="Suggested outputs"
            title="Generate from project data"
            copy="The next backend step is a persisted document object with template inputs, generated body, approvals, and share state."
          />

          <div className="mt-5 space-y-4">
            {snapshots.map((entry) => (
              <div key={entry.project.id} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
                <p className="font-medium text-[var(--text-1)]">{entry.project.name}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                  Best next output: {entry.project.stage === "Launch" ? "handover note" : entry.health === "at_risk" ? "client update" : "sprint plan"}.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/app/projects/${entry.project.slug}`} className={buttonStyles({ variant: "secondary", size: "xs" })}>
                    Open project
                  </Link>
                  <Link href="/app/proposals" className={buttonStyles({ variant: "tertiary", size: "xs" })}>
                    Open builder
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/app/proposals" className={buttonStyles({ variant: "primary", size: "sm" })}>
              Proposal builder
            </Link>
            <Link href="/app/templates" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Templates
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
