"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { DocusealForm } from "@docuseal/react";
import { DocumentTextIcon, CheckCircleIcon, ClockIcon } from "@heroicons/react/24/outline";

interface Agreement {
  id: string;
  submissionId: string;
  slug: string;
  status: string;
  createdAt: string;
  document: {
    title: string;
    documentType: string;
    createdAt: string;
  };
}

export function WikiAgreementsSection({ token }: { token: string }) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for the embedded signing view
  const [signingSlug, setSigningSlug] = useState<string | null>(null);

  const fetchAgreements = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/wiki/${token}/agreements`);
      const payload = (res as { data?: Agreement[] }).data || (res as Agreement[]);
      setAgreements(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load agreements.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAgreements();
  }, [fetchAgreements]);

  // If the user has selected an agreement to sign, render the DocuSeal embed.
  if (signingSlug) {
    return (
      <div className="flex flex-col h-full bg-[#f3f4f6]">
        <div className="flex items-center justify-between p-4 bg-[#111827] border-b border-gray-800 text-white">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Sign Agreement</h2>
            <p className="text-sm text-gray-400">Please review and sign the document below.</p>
          </div>
          <button
            onClick={() => setSigningSlug(null)}
            className="text-sm font-medium text-gray-300 hover:text-white hover:underline transition-colors"
          >
            &larr; Back to Agreements
          </button>
        </div>
        <div className="flex-1 w-full flex flex-col min-h-0 p-4 sm:p-6 lg:p-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden w-full flex-1 relative">
            <DocusealForm
              src={`https://docuseal.com/s/${signingSlug}`}
              style={{ width: "100%", height: "100%" }}
              onComplete={() => {
                setTimeout(() => {
                  alert("Thank you! Your signature has been securely captured.");
                  setSigningSlug(null);
                  fetchAgreements(); // Refresh the list to show the signed status
                }, 1500);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-1)]">Agreements</h1>
        <p className="mt-2 text-sm text-[var(--text-3)]">
          Review and sign your Master Services Agreements and proposals here.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-600)]" />
        </div>
      ) : error ? (
        <div className="p-4 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      ) : agreements.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-[var(--border-2)] shadow-sm">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">No agreements</h3>
          <p className="mt-1 text-sm text-gray-500">You don&apos;t have any agreements requiring a signature yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--border-2)] shadow-sm overflow-hidden">
          <ul className="divide-y divide-[var(--border-2)]">
            {agreements.map((agreement) => {
              const isPendingClient = agreement.status === "PENDING";
              const isPendingGitwork = agreement.status === "CLIENT_SIGNED";
              const isCompleted = agreement.status === "COMPLETED";

              return (
                <li key={agreement.id} className="p-4 sm:p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${isPendingClient ? 'bg-amber-50' : isPendingGitwork ? 'bg-blue-50' : 'bg-green-50'}`}>
                        {isPendingClient ? (
                          <ClockIcon className={`h-6 w-6 text-amber-600`} />
                        ) : isPendingGitwork ? (
                          <ClockIcon className={`h-6 w-6 text-blue-600`} />
                        ) : (
                          <CheckCircleIcon className={`h-6 w-6 text-green-600`} />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">
                          {agreement.document.title}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                          <span>{agreement.document.documentType}</span>
                          <span>&bull;</span>
                          <span>Issued {new Date(agreement.createdAt).toLocaleDateString()}</span>
                        </div>
                        {isPendingClient && (
                          <span className="mt-2 inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Signature Required
                          </span>
                        )}
                        {isPendingGitwork && (
                          <span className="mt-2 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                            Pending Gitwork Signature
                          </span>
                        )}
                        {isCompleted && (
                          <span className="mt-2 inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                            Completed
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      {isPendingClient && (
                        <button
                          onClick={() => setSigningSlug(agreement.slug)}
                          className="rounded-md bg-[var(--brand-600)] px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--brand-500)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-600)]"
                        >
                          Sign Now
                        </button>
                      )}
                      {isPendingGitwork && (
                        <button
                          disabled
                          className="rounded-md bg-gray-100 px-3.5 py-2 text-sm font-semibold text-gray-400 shadow-sm cursor-not-allowed"
                        >
                          Signed by Client
                        </button>
                      )}
                      {isCompleted && (
                        <button
                          disabled
                          className="rounded-md bg-gray-100 px-3.5 py-2 text-sm font-semibold text-gray-400 shadow-sm cursor-not-allowed"
                        >
                          Signed
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
