/** Section type: `service_tiers` — service-tier table for SLAs. */

import { ServerStackIcon } from "@heroicons/react/24/outline";
import { ServiceTiersEditor } from "@/components/proposals/legal-editors";
import { defineSection } from "@/lib/sections/types";
import { PrintTable, SectionIntro, Td, Th } from "@/lib/sections/_shared";
import type { ServiceTiersSectionData } from "@/types/proposal";

export const serviceTiersSection = defineSection<ServiceTiersSectionData>({
  key: "service_tiers",
  displayName: "Services & Service Tiers",
  description: "Services covered, grouped by tier.",
  category: "tables",
  icon: ServerStackIcon,
  defaultData: { intro: "", tiers: [] },
  defaultTitle: "Services & Service Tiers",
  defaultDescription: "Services covered, grouped by tier.",
  recommendedFor: ["SLA"],
  aiExpandable: false,
  Editor: ({ data, onChange }) => <ServiceTiersEditor data={data} onChange={onChange} />,
  Preview: ({ data }) => (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <PrintTable>
        <thead>
          <tr>
            <Th width="22%">Tier</Th>
            <Th>Services included</Th>
            <Th width="14%" align="center">Uptime</Th>
            <Th width="22%">Support hours</Th>
          </tr>
        </thead>
        <tbody>
          {(data.tiers ?? []).map((t) => (
            <tr key={t.id}>
              <Td strong top>{t.name}</Td>
              <Td top>{t.services}</Td>
              <Td align="center" strong top>{t.uptimeTarget}</Td>
              <Td top>{t.supportHours}</Td>
            </tr>
          ))}
        </tbody>
      </PrintTable>
    </div>
  ),
});
