import { AppShell } from "@/components/app-shell";
import { ProofWorkspace } from "@/components/proof/proof-workspace";

export default async function ProofPage({
  searchParams,
}: {
  searchParams: Promise<{ brief?: string; scenario?: string }>;
}) {
  const { brief, scenario } = await searchParams;
  const initialBrief = brief ? decodeURIComponent(brief) : undefined;

  return (
    <AppShell
      title="Proof"
      subtitle={
        initialBrief
          ? "Your brief has been pre-filled from the CodeClear match — review it and run the analysis."
          : "Parse a client brief and extract key information — summarised clearly for your team."
      }
    >
      <ProofWorkspace initialBrief={initialBrief} initialScenario={scenario} />
    </AppShell>
  );
}
