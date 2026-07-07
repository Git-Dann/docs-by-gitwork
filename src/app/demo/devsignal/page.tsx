import type { Metadata } from "next";
import { DemoDevSignalExperience } from "@/components/demo/demo-devsignal-experience";

export const metadata: Metadata = {
  title: "Foundry — DevSignal demo",
  robots: { index: false, follow: false },
};

/**
 * Public, no-auth demo of DevSignal (developer vetting). Not in nav — share the
 * URL directly. All data is sample data served by a client-side interceptor, so
 * it never touches the database or requires login.
 */
export default function DemoDevSignalPage() {
  return <DemoDevSignalExperience />;
}
