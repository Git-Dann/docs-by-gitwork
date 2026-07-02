import type { Metadata } from "next";
import { DemoWikiExperience } from "@/components/demo/demo-wiki-experience";

export const metadata: Metadata = {
  title: "Foundry — Client wiki demo",
  robots: { index: false, follow: false },
};

/**
 * Public, no-auth demo of the Foundry client wiki. Not in nav — share the URL
 * directly. All data is sample data served by a client-side interceptor (see
 * `DemoWikiExperience` / `DemoShell`), so it never touches the database or login.
 */
export default function DemoWikiPage() {
  return <DemoWikiExperience />;
}
