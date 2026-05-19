import type { ReactNode } from "react";

export default function PulseOverviewLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <style>{`
        .pulse-overview h1,
        .pulse-overview h2,
        .pulse-overview h3 {
          font-family: var(--font-display), "Times New Roman", Georgia, serif;
        }
      `}</style>
      {children}
    </div>
  );
}
