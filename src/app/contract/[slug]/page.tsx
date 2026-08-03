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
    <main className="h-screen bg-[#f3f4f6] flex flex-col">
      {/* Header matching client portal agreement format */}
      <div className="flex items-center justify-between p-4 bg-[#111827] border-b border-gray-800 text-white shadow-sm">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Sign Agreement</h2>
          <p className="text-sm text-gray-400">Please review and sign the document below.</p>
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
      <div className="flex-1 w-full flex flex-col min-h-0 p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden w-full flex-1 relative">
          <DocusealForm
            src={`https://docuseal.com/s/${slug}`}
            style={{ width: "100%", height: "100%" }}
            backgroundColor="#ffffff"
            withTitle={false}
            onComplete={() => {
              setTimeout(() => {
                alert("Thank you! Your signature has been securely captured.");
                router.push("/app/docs");
              }, 1500);
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="py-3 text-center bg-[#111827] text-gray-400 border-t border-gray-800 text-xs">
        Secured by DocuSeal &bull; Powered by Foundry
      </div>
    </main>
  );
}
