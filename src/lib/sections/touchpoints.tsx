/** Section type: `touchpoints` — features/deliverables grouped by area. */

import { TouchpointEditor } from "@/components/proposals/touchpoint-editor";
import { defineSection } from "@/lib/sections/types";
import type { TouchpointsSectionData } from "@/types/proposal";

export const touchpointsSection = defineSection<TouchpointsSectionData>({
  key: "touchpoints",
  displayName: "Touchpoints",
  description: "Features or deliverables grouped by area.",
  aiExpandable: true,
  Editor: ({ data, onChange }) => (
    <TouchpointEditor
      items={data.items ?? []}
      onChange={(items) => onChange({ ...data, items })}
    />
  ),
  Preview: ({ data }) => (
    <div className="space-y-4">
      {(data.items ?? []).map((touchpoint) => (
        <article
          key={touchpoint.id}
          className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5"
        >
          <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            {touchpoint.title}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-2)]">{touchpoint.summary}</p>
          {touchpoint.features.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {touchpoint.features.map((feature) => (
                <span
                  key={feature}
                  className="rounded-full border border-[var(--border-2)] bg-white px-3 py-1 text-xs font-medium text-[var(--text-2)]"
                >
                  {feature}
                </span>
              ))}
            </div>
          ) : null}
          {touchpoint.notes ? (
            <p className="mt-4 text-xs uppercase tracking-[0.12em] text-[var(--text-4)]">
              Notes:{" "}
              <span className="normal-case tracking-normal text-[var(--text-3)]">{touchpoint.notes}</span>
            </p>
          ) : null}
          {touchpoint.callout ? (
            <p className="mt-4 rounded-[10px] bg-[var(--surface-brand)] px-4 py-3 text-sm leading-6 text-[var(--brand-700)]">
              {touchpoint.callout}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  ),
});
