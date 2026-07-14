import type { Metadata } from "next";
import { DemoHub } from "@/components/demo/demo-hub";

export const metadata: Metadata = {
  title: "Foundry — Demo",
  robots: { index: false, follow: false },
};

/**
 * White-labelled front door: `/demo/<Client Name>` renders the same hub as `/demo`,
 * with the client name pulled from the path so the shared link reads as the client's
 * own. Static module routes (/demo/dev, /demo/docs, …) take precedence over this
 * dynamic segment, so only non-route names land here. The name is read client-side
 * in <DemoHub> (window.location) and persisted for the module pages.
 */
export default function DemoClientHubPage() {
  return <DemoHub />;
}
