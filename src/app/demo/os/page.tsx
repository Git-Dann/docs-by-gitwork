import type { Metadata } from "next";
import { GitworkOs } from "@/components/demo/os/gitwork-os";

export const metadata: Metadata = {
  title: "Gitwork OS — From prompt to production",
  description: "A Mac in your browser that shows what Gitwork does: our work, our plans, and Foundry, the platform every client gets.",
  robots: { index: false, follow: false },
};

/**
 * Gitwork OS — a Labs sales demo (CLAUDE.md §68). Public and noindex like every
 * /demo page. Everything runs in the browser: Foundry's windows show the other
 * /demo pages over sample data, so nothing here reaches a client, a login or the
 * database.
 */
export default function GitworkOsPage() {
  return <GitworkOs />;
}
