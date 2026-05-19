import { Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["700", "800", "900"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export default function PulseOverviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${fraunces.variable} ${inter.variable}`}>
      <style>{`
        .pulse-overview h1,
        .pulse-overview h2,
        .pulse-overview h3 {
          font-family: var(--font-fraunces);
        }
      `}</style>
      {children}
    </div>
  );
}
