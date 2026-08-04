"use client"; // DocusealForm requires client-side rendering

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DocusealForm } from "@docuseal/react";

export default function SignDocumentPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [mounted, setMounted] = useState(false);

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
              setTimeout(() => {
                alert("Thank you! Your signature has been securely captured.");
                router.push("/app/docs");
              }, 1500);
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="py-3 text-center bg-[#111827] text-gray-400 border-t border-gray-800 text-xs shrink-0">
        Secured by DocuSeal &bull; Powered by Foundry
      </div>
    </main>
  );
}
