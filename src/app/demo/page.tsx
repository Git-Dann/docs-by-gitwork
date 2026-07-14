import type { Metadata } from "next";
import { DemoHub } from "@/components/demo/demo-hub";
import { demoMetadata } from "@/lib/demo/demo-metadata";

/**
 * Front door for the demo suite. The canonical white-labelled link is
 * `/demo/<Client>` (see the [client] route); this base route also honours the
 * `?client=` fallback used when a client name collides with a module route
 * segment, so its unfurl preview still reflects the client.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; color?: string }>;
}): Promise<Metadata> {
  const { client, color } = await searchParams;
  return demoMetadata(client, color);
}

export default function DemoHubPage() {
  return <DemoHub />;
}
