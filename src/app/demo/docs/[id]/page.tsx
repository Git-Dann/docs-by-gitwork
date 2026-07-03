import type { Metadata } from "next";
import { DemoDocPreview } from "@/components/demo/demo-doc-preview";

export const metadata: Metadata = {
  title: "Foundry — Document builder",
  robots: { index: false, follow: false },
};

// The editor reads useSearchParams — render dynamically so the build never needs
// a Suspense boundary for it.
export const dynamic = "force-dynamic";

export default async function DemoDocPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DemoDocPreview id={id} />;
}
