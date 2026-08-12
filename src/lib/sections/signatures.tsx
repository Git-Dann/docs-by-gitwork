/** Section type: `signatures` — signature blocks for each party. */

import { FingerPrintIcon } from "@heroicons/react/24/outline";
import { SignaturesEditor } from "@/components/proposals/legal-editors";
import { asTrimmedText } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import { renderInline } from "@/lib/markdown";
import { getDocusealBlocksMeta } from "@/lib/docuseal-block-meta";
import type { DocusealBlockMeta } from "@/lib/docuseal-block-meta";
import type { ReactNode } from "react";
import type { SignatureBlockItem, SignaturesSectionData } from "@/types/proposal";

/** Max cards per row. 4–5 signatories wrap to a second row rather than squashing to slivers. */
const MAX_COLUMNS = 3;

/** Mono uppercase label, the doc's own eyebrow grammar. Accent when it heads a card. */
function MonoLabel({
  children,
  accent,
  size = 10,
}: {
  children: ReactNode;
  accent?: boolean;
  size?: number;
}) {
  return (
    <p
      className="font-mono font-semibold uppercase"
      style={{
        fontSize: size,
        letterSpacing: "0.14em",
        color: accent ? "var(--doc-accent)" : "var(--text-4)",
      }}
    >
      {children}
    </p>
  );
}

/**
 * One ruled signing field: a mono caps label over a hairline the signatory writes on (wet ink) or
 * that carries the captured signature payload / value just above it.
 */
function SigningField({
  label,
  value,
  payload,
  signed,
  signedName,
  docusealTag,
}: {
  label: string;
  value?: string;
  payload?: string;
  signed?: boolean;
  signedName?: string;
  docusealTag?: string;
}) {
  const filled = value?.trim();
  const isImagePayload = payload?.startsWith("data:image/");

  return (
    <div>
      <MonoLabel size={9.5}>{label}</MonoLabel>
      <div
        className="mt-1 flex items-end overflow-hidden"
        style={{ minHeight: 38, borderBottom: "1px solid var(--text-1)" }}
      >
        {isImagePayload ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={payload}
            alt="Signature"
            className="max-h-12 object-contain pb-0.5"
            style={{ maxHeight: "44px" }}
          />
        ) : signed || payload ? (
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <span className="font-serif italic text-[15px] font-semibold text-[var(--brand-900)]">
              {signedName || value || "Digitally Signed"}
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-emerald-700 border border-emerald-200">
              ✓ Verified Signature
            </span>
          </div>
        ) : filled ? (
          <span className="pb-1 text-[13px] leading-tight text-[var(--text-1)]">{filled}</span>
        ) : docusealTag ? (
          <span className="pb-1 text-[11px] font-mono text-[var(--text-4)] opacity-80 select-none">
            {docusealTag}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * `meta` is computed once for ALL blocks by the parent `Preview` via
 * `getDocusealBlocksMeta`, guaranteeing the tags printed in the PDF are
 * identical to what `route.ts` registers with the DocuSeal API.
 */
function SignatureCard({
  block,
  meta,
}: {
  block: SignatureBlockItem;
  meta: DocusealBlockMeta;
}) {
  const personal = block.personal === true;
  // Blank lines are kept in the data so the editor's one-line-per-detail textarea stays typable;
  // they're dropped here so they never print as gaps.
  const details = (block.details ?? []).filter((line) => asTrimmedText(line));

  const { sigTag: docusealSigTag, dateTag: docusealDateTag } = meta;

  return (
    <div
      className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white"
      style={{ padding: 24 }}
    >
      <div className="flex items-center justify-between gap-2">
        <MonoLabel accent>{personal ? "Signed personally by" : "For and on behalf of"}</MonoLabel>
        {block.type ? (
          <span className="rounded bg-[var(--bg-3)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            {block.type}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-[family-name:var(--font-display)] text-[19px] font-normal leading-tight text-[var(--text-1)]">
        {block.partyName || "—"}
      </p>
      {details.length ? (
        <div className="mt-2 space-y-0.5">
          {details.map((line, idx) => (
            <p key={idx} className="text-[13px] leading-[1.35] text-[var(--text-3)]">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-6 space-y-4">
        <SigningField
          label="SIGNATURE"
          payload={block.signaturePayload}
          signed={block.signed}
          signedName={block.signedName}
          docusealTag={docusealSigTag}
        />
        <SigningField label="Name" value={block.signatoryName} />
        {/* A personal signatory is witnessed rather than holding a position in a company. */}
        {personal ? (
          <SigningField label="Witness name" />
        ) : (
          <SigningField label="Position" value={block.signatoryRole} />
        )}
        <SigningField
          label="Date"
          value={block.signatureDate}
          signed={block.signed}
          docusealTag={docusealDateTag}
        />
      </div>
    </div>
  );
}

export const signaturesSection = defineSection<SignaturesSectionData>({
  key: "signatures",
  displayName: "Signatures",
  description: "Authorised signatories for each party.",
  category: "people",
  icon: FingerPrintIcon,
  defaultData: { intro: "", blocks: [] },
  defaultTitle: "Signatures",
  defaultDescription: "Authorised signatories for each party.",
  recommendedFor: ["SLA", "SOW", "MSA", "NDA", "CO"],
  aiExpandable: false,
  Editor: ({ data, onChange }) => <SignaturesEditor data={data} onChange={onChange} />,
  Preview: ({ data }) => {
    const blocks = data.blocks ?? [];
    // Adapts to the signatory count: 1–3 sit on one row, 4–5 wrap. Never more than 3 across.
    const columns = Math.min(Math.max(blocks.length, 1), MAX_COLUMNS);
    const note = data.note?.trim();

    // Compute DocuSeal metadata for ALL blocks in one pass so every card
    // gets the exact role + field names that route.ts will send to the API.
    const blocksMeta = getDocusealBlocksMeta(blocks);

    return (
      <div className="space-y-5">
        <div>
          <MonoLabel>Execution</MonoLabel>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-[30px] font-normal leading-[1.15] text-[var(--text-1)]">
            Signed by the parties<span style={{ color: "var(--doc-accent)" }}>.</span>
          </h2>
        </div>
        {data.intro?.trim() ? (
          <p className="text-[15px] leading-7 text-[var(--text-2)]">
            {renderInline(data.intro, "signatures-intro")}
          </p>
        ) : null}
        {blocks.length ? (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
          >
            {blocks.map((block, index) => (
              <SignatureCard key={block.id} block={block} meta={blocksMeta[index]} />
            ))}
          </div>
        ) : null}
        {note ? (
          <div
            className="proposal-block-avoid rounded-[10px] bg-white px-5 py-4"
            style={{ borderLeft: "3px solid var(--doc-accent)" }}
          >
            <MonoLabel accent>Note on signing</MonoLabel>
            <p className="mt-2 text-[14px] leading-6 text-[var(--text-2)]">
              {renderInline(note, "signatures-note")}
            </p>
          </div>
        ) : null}
      </div>
    );
  },
});
