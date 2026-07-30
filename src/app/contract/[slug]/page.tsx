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
      {/* Branded Header */}
      <div className="bg-[#111827] text-white px-6 py-4 flex items-center shadow-md">
        <span className="font-semibold text-lg tracking-tight">Gitwork Foundry</span>
        <span className="ml-4 pl-4 border-l border-white/20 text-sm text-gray-300">
          Document Signing
        </span>
      </div>

      {/* Main Content */}
      <div className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col min-h-0">
        {/* DocuSeal Embed Container */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden w-full flex-1 relative">
          <DocusealForm 
            src={`https://docuseal.com/s/${slug}`} 
            style={{ width: "100%", height: "100%" }}
            onComplete={(e) => {
              // The webhook handles the actual backend state update.
              // Optional: redirect to a success page or back to portal
              setTimeout(() => {
                alert("Thank you! Your signature has been securely captured.");
                router.push("/");
              }, 1500);
            }}
          />
        </div>
      </div>
      
      {/* Footer */}
      <div className="py-8 text-center">
         <p className="text-xs text-gray-500">
           Secured by DocuSeal &bull; Powered by Foundry
         </p>
      </div>
    </main>
  );
}
