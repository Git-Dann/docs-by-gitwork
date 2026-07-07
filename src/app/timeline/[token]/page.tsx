import { notFound } from "next/navigation";
import { getPublicTimeline } from "@/server/client-timeline";
import { GanttChart, type GanttBlock } from "@/components/tasks/gantt-chart";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const timeline = await getPublicTimeline(token);
  return {
    title: timeline ? `${timeline.clientName} — Project timeline` : "Timeline",
    robots: { index: false, follow: false },
  };
}

export default async function PublicTimelinePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const timeline = await getPublicTimeline(token);
  if (!timeline) notFound();

  const blocks: GanttBlock[] = timeline.blocks.map((b) => ({
    id: b.id,
    name: b.name,
    startDate: b.startDate,
    endDate: b.endDate,
    color: b.color,
    progress: b.progress,
    tasks: b.tasks,
  }));

  const overall =
    blocks.length === 0
      ? 0
      : Math.round(blocks.reduce((sum, b) => sum + b.progress, 0) / blocks.length);

  return (
    <main className="min-h-[100dvh] bg-[#FAFAF9] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-[1800px]">
        <header className="mb-6">
          <p
            className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            PROJECT TIMELINE
          </p>
          <h1
            className="mt-1 text-[44px] font-normal leading-[1.1] tracking-[-0.03em] text-[var(--text-1)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {timeline.clientName}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-3)]">
            Live delivery roadmap · {overall}% complete · updated {formatDate(timeline.generatedAt)}
          </p>
        </header>

        {/* Client-facing share — no internal "behind schedule" slip overlay. */}
        <GanttChart blocks={blocks} slippage={false} emptyHint="The timeline will appear here once work is scheduled." />

        <footer className="mt-8 flex items-center justify-center gap-1.5 text-xs text-[var(--text-4)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/foundry-logo.svg" alt="" className="h-4 w-auto opacity-60" />
          <span>Powered by Gitwork</span>
        </footer>
      </div>
    </main>
  );
}
