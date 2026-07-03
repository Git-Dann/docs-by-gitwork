"use client";

/**
 * Standalone Foundry document builder (`/demo/docs/[id]`). Renders the REAL
 * `ProposalEditorLayout` (the full doc builder + split-screen live preview) with
 * a canned document, so it can be SEEN in the demo. If the editor throws (it's a
 * heavy, evolving component fed by mock data), it falls back to the read-only
 * `ProposalPreview` of the same document — never a white-screen. No auth, no DB.
 */

import { ProposalEditorLayout } from "@/components/proposals/proposal-editor-layout";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import type { ProposalDocument } from "@/types/proposal";
import { DemoShell } from "@/components/demo/demo-shell";
import { DemoErrorBoundary } from "@/components/demo/demo-error-boundary";
import { getDemoDoc } from "@/lib/demo/dev-demo-data";

export function DemoDocPreview({ id }: { id: string }) {
  const doc = getDemoDoc(id) as ProposalDocument | null;
  return (
    <DemoShell
      active="Docs"
      title="Docs"
      subtitle={doc ? `Editing — ${doc.title}` : "Document builder"}
    >
      <DemoErrorBoundary
        fallback={
          doc ? (
            <div className="mx-auto w-full max-w-[920px]">
              <ProposalPreview proposal={doc} showTableOfContents={false} frame />
            </div>
          ) : undefined
        }
      >
        <ProposalEditorLayout proposalId={id} />
      </DemoErrorBoundary>
    </DemoShell>
  );
}
