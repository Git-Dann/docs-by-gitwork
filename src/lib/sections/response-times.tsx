/** Section type: `response_times` — priority + first-response + resolution table. */

import { ResponseTimesEditor } from "@/components/proposals/legal-editors";
import { defineSection } from "@/lib/sections/types";
import { PrintTable, SectionIntro, Td, Th } from "@/lib/sections/_shared";
import type { ResponseTimesSectionData } from "@/types/proposal";

export const responseTimesSection = defineSection<ResponseTimesSectionData>({
  key: "response_times",
  displayName: "Response & Resolution",
  description: "Time-to-respond and time-to-resolve targets by priority.",
  aiExpandable: false,
  Editor: ({ data, onChange }) => <ResponseTimesEditor data={data} onChange={onChange} />,
  Preview: ({ data }) => (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <PrintTable>
        <thead>
          <tr>
            <Th width="22%">Priority</Th>
            <Th>Definition</Th>
            <Th width="20%">First response</Th>
            <Th width="20%">Resolution</Th>
          </tr>
        </thead>
        <tbody>
          {(data.priorities ?? []).map((p) => (
            <tr key={p.id}>
              <Td strong top>{p.priority}</Td>
              <Td top>{p.definition}</Td>
              <Td strong top>{p.firstResponse}</Td>
              <Td strong top>{p.resolution}</Td>
            </tr>
          ))}
        </tbody>
      </PrintTable>
    </div>
  ),
});
