import type { Metadata } from "next";
import { DemoHub } from "@/components/demo/demo-hub";
import { demoMetadata } from "@/lib/demo/demo-metadata";

/**
 * White-labelled front door: `/demo/<Client Name>` renders the same hub as `/demo`,
 * with the client name pulled from the path so the shared link — and its unfurl
 * preview (see generateMetadata) — reads as the client's own. Static module routes
 * (/demo/dev, /demo/docs, …) take precedence over this dynamic segment, so only
 * non-route names land here.
 *
 * ⚠️ The name is passed to <DemoHub> as a PROP. It used to be read client-side only
 * (`window.location`), which returns null on the server — so SSR always painted
 * "Foundry by Gitwork" and the client then swapped in the client's name. That threw a
 * hydration mismatch on every load AND meant a prospect opening a white-labelled sales
 * link saw OUR branding first. The segment is a route param, so the server has it.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ color?: string }>;
}): Promise<Metadata> {
  const { client } = await params;
  const { color } = await searchParams;
  let name = client;
  try {
    name = decodeURIComponent(client);
  } catch {
    /* malformed encoding — use the raw segment */
  }
  return demoMetadata(name, color);
}

export default async function DemoClientHubPage({
  params,
}: {
  params: Promise<{ client: string }>;
}) {
  const { client } = await params;
  let name = client;
  try {
    name = decodeURIComponent(client);
  } catch {
    /* malformed encoding — use the raw segment, as generateMetadata does */
  }
  return <DemoHub initialBrand={name.trim() || null} />;
}
