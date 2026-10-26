import { AppShell } from "@/components/app-shell";
import { PulseProjectPage } from "@/components/pulse/pulse-projects";
import { decodeTargetKey } from "@/lib/pulse-projects";

export default async function PulseProjectRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = decodeTargetKey(slug);
  const title = key ? key.replace(/^(repo|url|name):/, "") : "Project";
  return (
    <AppShell title={title} subtitle="Every scan of this project, how it is trending, and what changed.">
      <PulseProjectPage slug={slug} />
    </AppShell>
  );
}
