import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ADVERTISED_CHECK_COUNT_LABEL } from "@/server/checks-registry";

// The embed is the widget surface (the indexable marketing pages are /pulse-overview
// and /production-ready).
//
// The description claimed "100+" checks while the registry held over 1,600 and every
// other surface said so — an understatement, but really just a number nobody
// maintained. It reads from the registry now, so it cannot drift again.
export const metadata: Metadata = {
  title: "Free Site Health Check — Gitwork Pulse",
  description: `Scan any website against ${ADVERTISED_CHECK_COUNT_LABEL} technical, SEO, security, and compliance checks — free, in seconds.`,
  robots: { index: false, follow: false },
};

export default function EmbedPulseLayout({ children }: { children: ReactNode }) {
  return children;
}
