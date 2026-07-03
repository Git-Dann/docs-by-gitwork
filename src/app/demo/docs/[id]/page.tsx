import type { Metadata } from "next";
import { DemoDocPreview } from "@/components/demo/demo-doc-preview";

export const metadata: Metadata = {
  title: "Foundry — Document preview",
  robots: { index: false, follow: false },
};

export default async function DemoDocPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DemoDocPreview id={id} />;
}
