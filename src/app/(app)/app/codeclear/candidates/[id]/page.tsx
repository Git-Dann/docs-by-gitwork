import { AppShell } from "@/components/app-shell";
import { CodeClearCandidateProfile } from "@/components/codeclear/codeclear-candidate-profile";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export default async function CodeClearCandidateProfilePage({ params }: RouteContext) {
  const { id } = await params;
  return (
    <AppShell title="Code" subtitle="Dev validation profile.">
      <CodeClearCandidateProfile candidateId={id} />
    </AppShell>
  );
}
