import type { Metadata } from "next";
import { DemoClientPortal } from "@/components/demo/demo-client-portal";

export const metadata: Metadata = {
  title: "Foundry — Client portal demo",
  robots: { index: false, follow: false },
};

/**
 * Public, no-auth demo of a client's portal page — the entry point to the wiki
 * (via the "Wiki →" link in the client header). All data is sample data served
 * by a client-side interceptor (see `DemoClientPortal` / `DemoShell`).
 */
export default function DemoPortalPage() {
  return <DemoClientPortal />;
}
