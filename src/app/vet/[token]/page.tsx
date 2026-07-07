import type { Metadata } from "next";
import { VetFlow } from "./vet-flow";

// Public candidate assessment — token in the URL is its own auth. Not indexed.
export const metadata: Metadata = {
  title: "DevSignal assessment · Gitwork",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VetFlow token={token} />;
}
