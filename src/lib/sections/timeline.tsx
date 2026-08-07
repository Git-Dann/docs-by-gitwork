/** Section type: `timeline` — project phases + milestones. Backed by the parallel
 *  proposal.timelinePhases collection (not section.data) so editing the timeline updates the
 *  proposal as a whole, plus its costing section's durationSummary string.
 */

import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { TimelineEditor } from "@/components/proposals/timeline-editor";
import { asTrimmedText } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import type { CostingSectionData, TimelineSectionData } from "@/types/proposal";

function summarizeTimelineDuration(phases: { duration: string }[]) {
  if (!phases.length) return "";
  const durations = phases.map((phase) => asTrimmedText(phase.duration)).filter(Boolean);
  if (!durations.length) return "";
  return durations.join(" • ");
}

export const timelineSection = defineSection<TimelineSectionData>({
  key: "timeline",
  displayName: "Timeline",
  description: "Project phases, durations, and target milestones.",
  category: "commercials",
  icon: CalendarDaysIcon,
  defaultData: { viewMode: "LIST" },
  defaultTitle: "Timeline",
  defaultDescription: "Project phases and target milestones.",
  recommendedFor: ["PROPOSAL", "SOW", "CO"],
  aiExpandable: false,
  Editor: ({ data, proposal, sectionIndex, onProposalChange }) => {
    const costingSection = proposal.sections.find((entry) => entry.key === "costing");
    const costingData = costingSection?.data as CostingSectionData | undefined;
    return (
      <TimelineEditor
        phases={proposal.timelinePhases}
        paymentSchedule={costingData?.paymentSchedule ?? []}
        viewMode={data.viewMode ?? "LIST"}
        onChange={({ phases, viewMode }) => {
          const timelineDurationSummary = summarizeTimelineDuration(phases);
          onProposalChange({
            ...proposal,
            timelinePhases: phases,
            sections: proposal.sections.map((entry, index) =>
              index === sectionIndex
                ? { ...entry, data: { ...data, viewMode } }
                : entry.key === "costing"
                  ? {
                      ...entry,
                      data: {
                        ...(entry.data as CostingSectionData),
                        durationSummary: timelineDurationSummary,
                      },
                    }
                  : entry,
            ),
          });
        }}
      />
    );
  },
  Preview: ({ data, proposal }) => {
    const phases = [...proposal.timelinePhases].sort((a, b) => a.sortOrder - b.sortOrder);
    if (data.viewMode === "MILESTONE") {
      return (
        // The rule is drawn PER ROW rather than on the container, for two reasons Dan hit:
        //
        //  1. A container `border-l-2` plus a hand-tuned `-left-[1.35rem]` put the dot's centre
        //     ~4px off the rule's centre. The geometry below is derived instead: the marker
        //     column centre is 0.5rem, the dot is 0.625rem wide (so left = 0.1875rem) and the
        //     rule 0.125rem (left = 0.4375rem) — both expressed relative to the card, which sits
        //     at the container's 1.5rem padding.
        //  2. A container border runs the full height, so the stroke carried on past the last
        //     phase into nothing. Drawn per row and skipped on the last, it terminates ON the
        //     final dot, which is what a timeline's end should look like.
        //
        // `-bottom-4` matches the `space-y-4` gap exactly, so each segment reaches the next dot.
        <div className="relative pl-6">
          {phases.map((phase, index) => (
            <div
              key={phase.id ?? phase.name}
              className="proposal-block-avoid relative mt-4 rounded-[10px] border border-[var(--border-2)] bg-white p-4 first:mt-0"
            >
              {index < phases.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute -bottom-4 -left-[1.0625rem] top-[1.0625rem] w-0.5 bg-[var(--border-2)]"
                />
              ) : null}
              <span
                aria-hidden
                className="absolute -left-[1.3125rem] top-3 h-2.5 w-2.5 rounded-full bg-[var(--brand-500)]"
              />
              <p className="text-base font-semibold text-[var(--text-1)]">{phase.name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--text-4)]">{phase.duration}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">{phase.summary}</p>
              <p className="mt-3 text-xs text-[var(--text-3)]">
                Deliverables: {phase.deliverables.join(", ")}
              </p>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {phases.map((phase) => (
          <article
            key={phase.id ?? phase.name}
            className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold text-[var(--text-1)]">{phase.name}</p>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-4)]">{phase.duration}</p>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">{phase.summary}</p>
            <p className="mt-3 text-xs text-[var(--text-3)]">
              Deliverables: {phase.deliverables.join(", ")}
            </p>
          </article>
        ))}
      </div>
    );
  },
});
