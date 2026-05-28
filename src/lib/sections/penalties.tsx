/** Section type: `penalties` — service credit schedule. */

import { PenaltiesEditor } from "@/components/proposals/legal-editors";
import { defineSection } from "@/lib/sections/types";
import { PrintTable, SectionIntro, Td, Th } from "@/lib/sections/_shared";
import type { PenaltiesSectionData } from "@/types/proposal";

export const penaltiesSection = defineSection<PenaltiesSectionData>({
  key: "penalties",
  displayName: "Service Credits",
  description: "Service credits payable when targets are missed.",
  aiExpandable: false,
  Editor: ({ data, onChange }) => <PenaltiesEditor data={data} onChange={onChange} />,
  Preview: ({ data }) => (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <PrintTable>
        <thead>
          <tr>
            <Th>Trigger</Th>
            <Th width="28%">Service credit</Th>
            <Th width="28%">Cap</Th>
          </tr>
        </thead>
        <tbody>
          {(data.tiers ?? []).map((t) => (
            <tr key={t.id}>
              <Td top>{t.trigger}</Td>
              <Td strong top>{t.credit}</Td>
              <Td top>{t.cap || "—"}</Td>
            </tr>
          ))}
        </tbody>
      </PrintTable>
    </div>
  ),
});
