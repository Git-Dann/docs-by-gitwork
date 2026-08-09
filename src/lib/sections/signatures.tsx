/** Section type: `signatures` — signature blocks for each party. */

import { FingerPrintIcon } from "@heroicons/react/24/outline";
import { SignaturesEditor } from "@/components/proposals/legal-editors";
import { asTrimmedText } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import { renderInline } from "@/lib/markdown";
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
 * that carries the captured value just above it. ~34px of clear height keeps the rule signable at
 * print size and stops two fields reading as one.
 */
function SigningField({ label, value }: { label: string; value?: string }) {
  const filled = value?.trim();
  return (
    <div>
      <MonoLabel size={9.5}>{label}</MonoLabel>
      <div
        className="mt-1 flex items-end"
        style={{ minHeight: 34, borderBottom: "1px solid var(--text-1)" }}
      >
        {filled ? (
          <span className="pb-1 text-[13px] leading-tight text-[var(--text-1)]">{filled}</span>
        ) : null}
      </div>
    </div>
  );
}

function SignatureCard({ block }: { block: SignatureBlockItem }) {
  const personal = block.personal === true;
  // Blank lines are kept in the data so the editor's one-line-per-detail textarea stays typable;
  // they're dropped here so they never print as gaps.
  const details = (block.details ?? []).filter((line) => asTrimmedText(line));
  const sigLabel = block.variableName?.trim()
    ? `Signature ({{${block.variableName.trim()}}})`
    : "Signature";
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
          {details.map((line, index) => (
            <p key={index} className="text-[13px] leading-[1.35] text-[var(--text-3)]">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-6 space-y-4">
        <SigningField label={sigLabel} />
        <SigningField label="Name" value={block.signatoryName} />
        {/* A personal signatory is witnessed rather than holding a position in a company. */}
        {personal ? (
          <SigningField label="Witness name" />
        ) : (
          <SigningField label="Position" value={block.signatoryRole} />
        )}
        <SigningField label="Date" value={block.signatureDate} />
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
            {blocks.map((block) => (
              <SignatureCard key={block.id} block={block} />
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
