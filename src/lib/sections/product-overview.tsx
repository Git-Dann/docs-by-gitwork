/** Section type: `product_overview` — what the platform is, who it's for, value, supported platforms. */

import { defineSection } from "@/lib/sections/types";
import { EditorHint, FormInput, FormTextArea, PlatformSupportField, SimpleForm } from "@/lib/sections/_shared";
import type { ProductOverviewSectionData } from "@/types/proposal";

const PLATFORM_OPTIONS = ["iOS", "Android", "Web", "Cross Platform"] as const;

export const productOverviewSection = defineSection<ProductOverviewSectionData>({
  key: "product_overview",
  displayName: "Product Overview",
  description: "What the platform is, who it's for, and the value it delivers.",
  aiExpandable: true,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <FormTextArea
        label="What the platform is"
        value={data.platformDescription}
        onChange={(platformDescription) => onChange({ ...data, platformDescription })}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <FormInput
          label="Who it is for"
          value={data.audience}
          onChange={(audience) => onChange({ ...data, audience })}
        />
        <FormInput
          label="Key value proposition"
          value={data.valueProposition}
          onChange={(valueProposition) => onChange({ ...data, valueProposition })}
        />
      </div>
      <PlatformSupportField
        label="Platforms supported"
        value={data.platformsSupported}
        onChange={(platformsSupported) => onChange({ ...data, platformsSupported })}
        options={PLATFORM_OPTIONS}
      />
      <EditorHint message="Architecture and workflow visuals are managed in Supporting Links & Assets." />
    </SimpleForm>
  ),
  Preview: ({ data }) => (
    <div className="grid gap-4 md:grid-cols-2">
      <InfoCard title="Platform" content={data.platformDescription} />
      <InfoCard title="Audience" content={data.audience} />
      <InfoCard title="Value" content={data.valueProposition} />
      <InfoCard title="Supported Platforms" content={data.platformsSupported} />
    </div>
  ),
});

function InfoCard({ title, content }: { title: string; content: string }) {
  return (
    <article className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
      <p className="text-xs font-semibold tracking-wide text-[var(--text-4)] uppercase">{title}</p>
      <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">{content || "—"}</p>
    </article>
  );
}
