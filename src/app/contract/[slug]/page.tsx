"use client"; // DocusealForm requires client-side rendering

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DocusealForm } from "@docuseal/react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export default function SignDocumentPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [mounted, setMounted] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (!slug) return null;

  return (
    <main className="min-h-screen bg-[#f3f4f6] flex flex-col">
      {/* Header matching Gitwork Foundry brand lockup */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-[#111827] border-b border-gray-800 text-white shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg tracking-tight font-[family-name:var(--font-display)] text-white">
            Gitwork Foundry
          </span>
          <span className="h-4 w-px bg-white/20" />
          <span className="text-sm font-medium text-gray-300">
            Document Signing
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-gray-300 hover:text-white hover:underline transition-colors"
        >
          &larr; Back to App
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full flex flex-col p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto overflow-y-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full min-h-[750px] flex-1 relative">
          <DocusealForm
            src={`https://docuseal.com/s/${slug}`}
            style={{ width: "100%", height: "100%", minHeight: "750px" }}
            backgroundColor="#ffffff"
            withTitle={false}
            onComplete={() => {
              void fetch("/api/documents/docuseal/sync", { method: "POST" }).catch(() => undefined);
              setShowSuccessModal(true);
            }}
          />
        </div>
      </div>

      {/* Signature Completion Modal (Foundry Design System) */}
      <Modal open={showSuccessModal} onClose={() => router.push("/app/docs")} panelClassName="w-full max-w-md">
        <div className="widget-header">
          <span className="widget-header-label">01 // SIGNATURE CAPTURED</span>
          <span className="widget-header-right font-mono text-[10px] font-semibold tracking-wider text-emerald-500 uppercase">CONFIRMED</span>
        </div>
        <div className="p-6 space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/30">
            <CheckCircleIcon className="h-6 w-6 text-emerald-500" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-[var(--text-1)]">
              Signature Successfully Recorded
            </h3>
            <p className="text-xs text-[var(--text-3)] leading-relaxed">
              Thank you! Your signature has been securely captured and verified. Document status has been synced with Foundry.
            </p>
          </div>
          <div className="pt-3 border-t border-[var(--border-2)]">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full justify-center"
              onClick={() => router.push("/app/docs")}
            >
              Return to Docs Library
            </Button>
          </div>
        </div>
      </Modal>

      {/* Footer */}
      <div className="py-3 text-center bg-[#111827] text-gray-400 border-t border-gray-800 text-xs shrink-0">
        Secured by DocuSeal &bull; Powered by Foundry
      </div>
    </main>
  );
}
