/** Section type: `signoff_footer` — closing block with prepared-by + signature placeholders. */

import { IdentificationIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { FormInput, FormTextArea, SimpleForm } from "@/lib/sections/_shared";
import type { SignoffFooterSectionData } from "@/types/proposal";

const DEFAULT: SignoffFooterSectionData = {
  preparedBy: "",
  team: "",
  contactDetails: "",
  footerNote: "",
  showBrandingBlock: true,
  signatureName: "",
  signatureDate: "",
};

export const signoffFooterSection = defineSection<SignoffFooterSectionData>({
  key: "signoff_footer",
  displayName: "Signoff footer",
  description: "Prepared-by line and on-document signature placeholders.",
  category: "closing",
  icon: IdentificationIcon,
  defaultData: DEFAULT,
  defaultTitle: "Signoff footer",
  defaultDescription: "Prepared-by line and on-document signature placeholders.",
  recommendedFor: ["PROPOSAL"],
  aiExpandable: false,
  Editor: ({ data, onChange, proposal }) => (
    <SimpleForm>
      <FormInput
        label="Prepared by"
        value={data.preparedBy}
        onChange={(preparedBy) => onChange({ ...data, preparedBy })}
        placeholder={
          proposal.metadata.owner?.trim()
            ? `${proposal.metadata.owner.trim()} (from the cover)`
            : "Add a name, or set it on the cover"
        }
      />
      <FormInput
        label="Team / department"
        value={data.team}
        onChange={(team) => onChange({ ...data, team })}
      />
      <FormInput
        label="Contact details"
        value={data.contactDetails}
        onChange={(contactDetails) => onChange({ ...data, contactDetails })}
      />
      <FormTextArea
        label="Footer note"
        value={data.footerNote}
        onChange={(footerNote) => onChange({ ...data, footerNote })}
      />
      <div className="@container">
        <div className="grid gap-4 @[26rem]:grid-cols-2">
          <FormInput
            label="Signature name"
            value={data.signatureName ?? ""}
            onChange={(signatureName) => onChange({ ...data, signatureName })}
            placeholder="Dan Lindsay"
          />
          <FormInput
            label="Signature date"
            value={data.signatureDate ?? ""}
            onChange={(signatureDate) => onChange({ ...data, signatureDate })}
            type="date"
          />
        </div>
      </div>
      <div className="@container">
        <div className="grid gap-2 @[26rem]:grid-cols-2">
          <label className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3 text-sm text-[var(--text-2)] shadow-[var(--shadow-xs)]">
          <input
            type="checkbox"
            checked={data.showBrandingBlock}
            onChange={(event) =>
              onChange({ ...data, showBrandingBlock: event.target.checked })
            }
            className="app-checkbox"
          />
          Show Gitwork branding block
          </label>
        </div>
      </div>
    </SimpleForm>
  ),
  Preview: ({ data, proposal }) => (
    <div className="proposal-block-avoid grid gap-4 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-5 md:grid-cols-[minmax(0,1fr)_220px]">
      <div className="space-y-3 text-sm leading-7 text-[var(--text-2)]">
        {/* One source of truth for "prepared by": inherit the cover's owner (metadata.owner)
            when the footer's own field is blank, so the document reads consistently top-to-bottom.
            An explicit footer value still wins as an override. */}
        <p>
          Prepared by:{" "}
          <span className="font-medium text-[var(--text-1)]">
            {data.preparedBy?.trim() || proposal.metadata.owner?.trim() || ""}
          </span>
        </p>
        <p>Team: {data.team}</p>
        <p>Contact: {data.contactDetails}</p>
        {data.footerNote ? (
          <p className="text-sm leading-7 text-[var(--text-3)]">{data.footerNote}</p>
        ) : null}
      </div>
      <div className="space-y-3">
        <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
              Signature
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--text-1)]">
              {data.signatureName?.trim() || "Add signature name"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
              Date
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--text-1)]">
              {data.signatureDate?.trim() || "Add signature date"}
            </p>
          </div>
        </div>
        {data.showBrandingBlock ? (
          <div className="rounded-[10px] bg-[var(--surface-brand)] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-700)]">
            Docs by Gitwork
          </div>
        ) : null}
      </div>
    </div>
  ),
});
