/** Section type: `product_overview` — what the platform is, who it's for, value, supported platforms. */

import { CubeIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { EditorHint, PlatformSupportField, SimpleForm } from "@/lib/sections/_shared";
import { RichTextField } from "@/lib/sections/rich-text-lazy";
import { InlineTextArea } from "@/lib/sections/inline-text";
import type { ProductOverviewSectionData } from "@/types/proposal";

const PLATFORM_OPTIONS = ["iOS", "Android", "Web", "Cross Platform"] as const;

const DEFAULT: ProductOverviewSectionData = {
  platformDescription: "",
  audience: "",
  valueProposition: "",
  platformsSupported: "",
  workflowGraphic: "",
};

export const productOverviewSection = defineSection<ProductOverviewSectionData>({
  key: "product_overview",
  displayName: "Product Overview",
  description: "What the platform is, who it's for, and the value it delivers.",
  category: "narrative",
  icon: CubeIcon,
  defaultData: DEFAULT,
  defaultTitle: "Product overview",
  defaultDescription: "Platform, audience, value proposition.",
  recommendedFor: ["PROPOSAL", "SOW"],
  aiExpandable: true,
  inlineEditable: true,
  hasOptions: true,
  // Options = the supported-platforms setting only; the prose cards are edited inline.
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <PlatformSupportField
        label="Platforms supported"
        value={data.platformsSupported}
        onChange={(platformsSupported) => onChange({ ...data, platformsSupported })}
        options={PLATFORM_OPTIONS}
      />
      <EditorHint message="Platform / audience / value are edited inline on the canvas. Architecture and workflow visuals are managed in Supporting Links & Assets." />
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    if (editable && onChange) {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard
            title="Platform"
            content={data.platformDescription}
            onChange={(platformDescription) => onChange({ ...data, platformDescription })}
          />
          <InfoCard
            title="Audience"
            content={data.audience}
            onChange={(audience) => onChange({ ...data, audience })}
          />
          <InfoCard
            title="Value"
            content={data.valueProposition}
            onChange={(valueProposition) => onChange({ ...data, valueProposition })}
          />
          {/* Supported platforms is a multi-select setting → edited via Options, shown read-only here. */}
          <InfoCard title="Supported Platforms" content={data.platformsSupported} />
        </div>
      );
    }
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="Platform" content={data.platformDescription} />
        <InfoCard title="Audience" content={data.audience} />
        <InfoCard title="Value" content={data.valueProposition} />
        <InfoCard title="Supported Platforms" content={data.platformsSupported} />
      </div>
    );
  },
});

function InfoCard({
  title,
  content,
  onChange,
}: {
  title: string;
  content: string;
  onChange?: (next: string) => void;
}) {
  return (
    <article className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
      <p className="text-xs font-semibold tracking-wide text-[var(--text-4)] uppercase">{title}</p>
      {onChange ? (
        <div className="mt-2">
          <RichTextField
            value={content}
            onChange={onChange}
            placeholder={`${title}…`}
            ariaLabel={title}
            className="text-sm leading-7 text-[var(--text-2)]"
          />
        </div>
      ) : (
        <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">{content || "—"}</p>
      )}
    </article>
  );
}
