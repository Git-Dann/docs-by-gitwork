import { AppShell } from "@/components/app-shell";
import { HandbookArticleView } from "@/components/handbook/handbook-article";

export default async function HandbookArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell title="Handbook" subtitle="Developer knowledgebase.">
      <HandbookArticleView articleId={id} />
    </AppShell>
  );
}
