/** Section type: `supporting_links_assets` — links, deck refs, supporting graphics. */

import { AssetPicker } from "@/components/proposals/asset-picker";
import { LinkManager } from "@/components/proposals/link-manager";
import { defineSection } from "@/lib/sections/types";
import { FormTextArea, SimpleForm } from "@/lib/sections/_shared";
import type { SupportingLinksSectionData } from "@/types/proposal";

function formatLinkTypeLabel(value: string) {
  switch (value) {
    case "WEBSITE":
      return "Website link";
    case "DECK":
      return "Deck link";
    case "DOCUMENT":
      return "Document link";
    case "EMAIL_LINK":
      return "Email link";
    case "INTERNAL_ROUTE":
      return "Internal page";
    default:
      return value
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (letter) => letter.toUpperCase());
  }
}

export const supportingLinksAssetsSection = defineSection<SupportingLinksSectionData>({
  key: "supporting_links_assets",
  displayName: "Supporting links & assets",
  description: "Decks, docs, graphics, and other supporting material.",
  aiExpandable: false,
  Editor: ({ data, onChange, proposal, onProposalChange }) => (
    <div className="space-y-3">
      <SimpleForm>
        <FormTextArea
          label="Section notes"
          value={data.notes}
          onChange={(notes) => onChange({ ...data, notes })}
        />
      </SimpleForm>
      <LinkManager
        links={proposal.links}
        onChange={(links) => onProposalChange({ ...proposal, links })}
      />
      <AssetPicker
        assets={proposal.assets}
        onChange={(assets) => onProposalChange({ ...proposal, assets })}
      />
    </div>
  ),
  Preview: ({ data, proposal }) => (
    <div className="space-y-4">
      {data.notes ? (
        <p className="max-w-4xl text-sm leading-7 text-[var(--text-2)]">{data.notes}</p>
      ) : null}
      <ul className="space-y-2">
        {proposal.links.map((link) => (
          <li
            key={link.id ?? link.url}
            className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text-1)]">{link.label}</p>
              <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-4)]">
                {formatLinkTypeLabel(link.type)}
              </span>
            </div>
            <a
              href={link.url}
              className="mt-2 inline-flex text-sm leading-6 text-[var(--brand-700)] underline-offset-2 hover:underline"
            >
              {link.url}
            </a>
            {link.notes ? <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{link.notes}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  ),
});
