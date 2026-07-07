import type { Metadata } from "next";
import { DemoProviders } from "@/components/demo/demo-providers";
import { VetFlow } from "@/app/vet/[token]/vet-flow";

export const metadata: Metadata = {
  title: "Foundry — DevSignal candidate demo",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Public, no-auth demo of the candidate-facing DevSignal flow (the 8-step
 * funnel). Renders the real `VetFlow` inside DemoProviders, so its `/api/vet/*`
 * calls hit the client-side interceptor — no DB, no login, no side effects. The
 * coding challenge still runs for real in the sandboxed in-browser worker.
 */
export default async function DemoVetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <DemoProviders>
      <VetFlow token={token} />
    </DemoProviders>
  );
}
