import type { ReactNode } from "react";

export const metadata = {
  title: "Provenance — the examination office for software | Gitwork",
  description:
    "A signed, expiring attestation of what a piece of software was found to be, and what could not be established. Internal product case.",
  // Internal pitch document with pricing and staging in it — shareable by link, never indexed.
  robots: { index: false, follow: false },
};

export default function ProvenanceOverviewLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <style>{`
        .provenance-overview h1,
        .provenance-overview h2,
        .provenance-overview h3 {
          font-family: var(--font-display), "Times New Roman", Georgia, serif;
          font-weight: 400;
        }
        .provenance-overview .mono {
          font-family: var(--font-mono), "SF Mono", Menlo, Consolas, monospace;
        }
      `}</style>
      {children}
    </div>
  );
}
