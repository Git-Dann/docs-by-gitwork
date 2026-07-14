import type { Metadata } from "next";
import { DemoHub } from "@/components/demo/demo-hub";
import { demoMetadata } from "@/lib/demo/demo-metadata";

/**
 * White-labelled front door: `/demo/<Client Name>` renders the same hub as `/demo`,
 * with the client name pulled from the path so the shared link — and its unfurl
 * preview (see generateMetadata) — reads as the client's own. Static module routes
 * (/demo/dev, /demo/docs, …) take precedence over this dynamic segment, so only
 * non-route names land here. The name is read client-side in <DemoHub>
 * (window.location) and persisted for the module pages.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ client: string }>;
}): Promise<Metadata> {
  const { client } = await params;
  let name = client;
  try {
    name = decodeURIComponent(client);
  } catch {
    /* malformed encoding — use the raw segment */
  }
  return demoMetadata(name);
}

export default function DemoClientHubPage() {
  return <DemoHub />;
}
