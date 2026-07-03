"use client";

/**
 * Standalone Foundry document preview (`/demo/docs/[id]`). Renders the real
 * `ProposalPreview` — the built document a client sees — with a canned document.
 * Reached by clicking a card on the demo Docs list (DemoShell reroutes the
 * card's /app/docs/{id} link here). No auth, no database.
 */

import { ProposalPreview } from "@/components/proposals/proposal-preview";
import type { ProposalDocument } from "@/types/proposal";
import { DemoShell } from "@/components/demo/demo-shell";
import { getDemoDoc } from "@/lib/demo/dev-demo-data";

export function DemoDocPreview({ id }: { id: string }) {
  const doc = getDemoDoc(id) as ProposalDocument | null;
  return (
    <DemoShell
      active="Docs"
      title="Docs"
      subtitle={doc ? `Preview — ${doc.title}` : "Document preview"}
    >
      {doc ? (
        <div className="mx-auto w-full max-w-[920px]">
          <ProposalPreview proposal={doc} showTableOfContents={false} frame />
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-[var(--text-4)]">
          That document isn&apos;t part of the demo.
        </p>
      )}
    </DemoShell>
  );
}
