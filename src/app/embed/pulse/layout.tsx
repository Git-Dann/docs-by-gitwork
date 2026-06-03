import type { Metadata } from "next";
import type { ReactNode } from "react";

// The embed is the widget surface (the indexable marketing page is /pulse-overview).
export const metadata: Metadata = {
  title: "Free Site Health Check — Gitwork Pulse",
  description: "Scan any website for 100+ technical, SEO, security, and compliance checks — free, in seconds.",
  robots: { index: false, follow: false },
};

export default function EmbedPulseLayout({ children }: { children: ReactNode }) {
  return children;
}
