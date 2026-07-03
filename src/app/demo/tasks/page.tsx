import type { Metadata } from "next";
import { DemoTasksExperience } from "@/components/demo/demo-tasks-experience";

export const metadata: Metadata = {
  title: "Foundry — Tasks demo",
  robots: { index: false, follow: false },
};

// ClientTasksWorkspace reads useSearchParams (deep-link to a task); render
// dynamically so the build never needs a Suspense boundary for it.
export const dynamic = "force-dynamic";

export default function DemoTasksPage() {
  return <DemoTasksExperience />;
}
