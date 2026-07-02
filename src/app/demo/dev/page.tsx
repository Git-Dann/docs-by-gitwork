import type { Metadata } from "next";
import { DemoDevExperience } from "@/components/demo/demo-dev-experience";

export const metadata: Metadata = {
  title: "Foundry — Developer demo",
  robots: { index: false, follow: false },
};

/**
 * Public, no-auth demo of the Foundry developer experience. Not in nav — share
 * the URL directly. All data is sample data served by a client-side interceptor
 * (see `DemoDevExperience`), so it never touches the database or requires login.
 */
export default function DemoDevPage() {
  return <DemoDevExperience />;
}
