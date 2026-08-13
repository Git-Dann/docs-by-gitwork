/**
 * Public, signer-facing signature page.
 *
 *   /sign/[token]  → signer reads the document and submits their signature.
 *
 * Gating:
 *   - 404 if the token is unknown
 *   - 410 with a friendly "expired" / "revoked" / "completed" / "declined" message when the
 *     request status no longer accepts new signatures
 *   - SIGNED → "thank you" success state
 *
 * The actual document is rendered from the SignatureRequest.documentSnapshot — the frozen copy
 * taken at SEND time — so any subsequent edits on the workspace side don't change what the
 * signer is signing. The signing UI itself is in the client component below.
 */

import { notFound } from "next/navigation";
import { findSignerByToken } from "@/server/signatures";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import type { ProposalDocument } from "@/types/proposal";
import { SignatureCapturePanel } from "./signature-capture-panel";
import { SignerViewBeacon } from "./signer-view-beacon";
import dynamic from "next/dynamic";
const DocuSealSigner = dynamic(() => import("./docuseal-signer").then((mod) => mod.DocuSealSigner), {
  ssr: false,
});

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;
  return {
    title: "Sign — Gitwork",
    description: "Sign a document prepared by Gitwork.",
    robots: { index: false, follow: false },
    // Keep the token out of the title bar to avoid leaking via screenshots / link previews.
    other: { "X-Robots-Tag": "noindex,nofollow" },
    alternates: { canonical: `/sign/${token.slice(0, 6)}…` },
  };
}

export default async function SignPage({ params }: PageProps) {
  const { token } = await params;

  const found = await findSignerByToken(token);
  if (!found) notFound();

  const { signer, gate } = found;
  const request = signer.request;
  const snapshot = request.documentSnapshot as unknown as ProposalDocument | null;

  // ── Gate states ──────────────────────────────────────────────────────────────────────
  if (gate === "REVOKED") {
    return <NoticePage title="This signing link was revoked" body="Please ask your Gitwork contact for a fresh link." />;
  }
  if (gate === "EXPIRED") {
    return <NoticePage title="This signing link has expired" body="Please ask your Gitwork contact for a fresh link." />;
  }
  if (gate === "DECLINED") {
    return <NoticePage title="This request was declined" body="No further action is required from this link." />;
  }
  if (gate === "COMPLETED") {
    return (
      <NoticePage
        title="This document is already complete"
        body="Thanks for your time — every signer has signed."
        tone="success"
      />
    );
  }
  if (gate === "DRAFT") {
    return <NoticePage title="This link isn't active yet" body="Your contact hasn't sent the request for signature yet." />;
  }

  if (signer.status === "SIGNED") {
    return (
      <NoticePage
        title="Thanks — you've signed"
        body="A copy of the completed document will be sent to you once all signers have signed."
        tone="success"
        signedName={signer.signedName ?? undefined}
      />
    );
  }
  if (signer.status === "DECLINED") {
    return (
      <NoticePage
        title="You've declined this request"
        body="If this was a mistake, contact Gitwork to start a fresh request."
      />
    );
  }

  // ── Active signing flow ─────────────────────────────────────────────────────────────
  const embedSrc = signer.docusealEmbedSrc;
  const iframeSrc = embedSrc
    ? embedSrc.includes("?")
      ? `${embedSrc}&embed=true`
      : `${embedSrc}?embed=true`
    : null;

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <SignerViewBeacon token={token} />

      <div className="border-b border-[var(--border-2)] bg-white">
        <div className="mx-auto flex max-w-[920px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/foundry-logo.png" alt="Foundry by Gitwork" className="h-7 w-auto" />
            <div className="hidden h-6 w-px bg-[var(--border-2)] sm:block" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--brand-700)]">
              {iframeSrc ? "DOCUSEAL EMBEDDED SIGNING" : "OUT FOR SIGNATURE"}
            </span>
          </div>
          <p className="text-xs text-[var(--text-3)]">
            Signing as <span className="font-medium text-[var(--text-1)]">{signer.name}</span>
            {signer.role ? ` · ${signer.role}` : ""}
            {signer.signerType ? ` (${signer.signerType.toUpperCase()})` : ""}
          </p>
        </div>
      </div>

      {/* Full Document Text Preview */}
      <div className="px-4 py-6 sm:px-6 sm:py-8">
        {snapshot ? (
          <ProposalPreview
            proposal={snapshot}
            showTableOfContents={false}
            frame
            className="mx-auto w-full max-w-[880px]"
          />
        ) : null}
      </div>

      {embedSrc ? (
        <div className="mx-auto w-full max-w-[960px] px-4 pb-12 sm:px-6">
          <DocuSealSigner
            src={embedSrc}
            email={signer.email}
            name={signer.name}
            token={token}
          />
        </div>
      ) : (
        <div className="border-t border-[var(--border-2)] bg-white">
          <div className="mx-auto max-w-[920px] px-4 py-10 sm:px-6">
            <SignatureCapturePanel
              token={token}
              signerName={signer.name}
              signerRole={signer.role}
              requestMessage={request.message ?? null}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function NoticePage({
  title,
  body,
  tone = "neutral",
  signedName,
}: {
  title: string;
  body: string;
  tone?: "neutral" | "success";
  signedName?: string;
}) {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center gap-6 px-4 text-center sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/foundry-logo.png" alt="Foundry by Gitwork" className="h-8 w-auto" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--brand-700)]">
          {tone === "success" ? "00 // COMPLETED" : "00 // SIGNING LINK"}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[36px] font-normal leading-[1.15] tracking-[-0.5px] text-[var(--text-1)] sm:text-[44px]">
          {title}
        </h1>
        <p className="max-w-md text-sm leading-7 text-[var(--text-3)]">{body}</p>
        {signedName ? (
          <p className="text-sm text-[var(--text-3)]">
            Signed as <span className="font-medium text-[var(--text-1)]">{signedName}</span>.
          </p>
        ) : null}
      </div>
    </main>
  );
}
