/** Section type: `timeline` — project phases + milestones. Backed by the parallel
 *  proposal.timelinePhases collection (not section.data) so editing the timeline updates the
 *  proposal as a whole, plus its costing section's durationSummary string.
 */

import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { TimelineEditor } from "@/components/proposals/timeline-editor";
import { defineSection } from "@/lib/sections/types";
import type { CostingSectionData, TimelineSectionData } from "@/types/proposal";

function summarizeTimelineDuration(phases: { duration: string }[]) {
  if (!phases.length) return "";
  const durations = phases.map((phase) => phase.duration.trim()).filter(Boolean);
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
        <div className="space-y-4 border-l-2 border-[var(--border-2)] pl-5">
          {phases.map((phase) => (
            <div
              key={phase.id ?? phase.name}
              className="proposal-block-avoid relative rounded-[10px] border border-[var(--border-2)] p-4"
            >
              <span className="absolute -left-[1.35rem] top-3 h-2.5 w-2.5 rounded-full bg-[var(--brand-500)]" />
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
            className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] p-4"
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
