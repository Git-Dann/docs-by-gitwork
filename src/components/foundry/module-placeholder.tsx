import { SectionHeading } from "./foundry-shared";

export function ModulePlaceholder({
  moduleName,
  eyebrow,
  summary,
  nextSteps,
}: {
  moduleName: string;
  eyebrow: string;
  summary: string;
  nextSteps: string[];
}) {
  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <SectionHeading eyebrow={eyebrow} title={moduleName} copy={summary} />
      </section>

      <section className="app-card p-5">
        <SectionHeading
          eyebrow="Next"
          title="Foundation still needed"
          copy="These are the smallest next steps that would make the module real without introducing unnecessary product sprawl."
        />

        <div className="mt-5 space-y-3">
          {nextSteps.map((step) => (
            <div key={step} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4 text-sm leading-6 text-[var(--text-3)]">
              {step}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
