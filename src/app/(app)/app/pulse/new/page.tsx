import { AppShell } from "@/components/app-shell";
import { PulseNewScanForm } from "@/components/pulse/pulse-new-scan-form";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

async function getPageData() {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: {
      id: true,
      aiProvider: true,
      anthropicApiKey: true,
      anthropicModel: true,
      openaiApiKey: true,
      openaiModel: true,
      geminiApiKey: true,
      geminiModel: true,
      localLlmUrl: true,
      localLlmModel: true,
    },
  });

  const clients = workspace
    ? await prisma.workspaceClient.findMany({
        where: { workspaceId: workspace.id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  type Provider = { id: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; label: string; model: string };
  const configuredProviders: Provider[] = [];

  if (process.env.ANTHROPIC_API_KEY || workspace?.anthropicApiKey) {
    configuredProviders.push({ id: "ANTHROPIC", label: "Claude", model: workspace?.anthropicModel ?? "claude-sonnet-4-6" });
  }
  if (process.env.OPENAI_API_KEY || workspace?.openaiApiKey) {
    configuredProviders.push({ id: "OPENAI", label: "OpenAI", model: workspace?.openaiModel ?? "gpt-4o" });
  }
  if (process.env.GEMINI_API_KEY || workspace?.geminiApiKey) {
    configuredProviders.push({ id: "GEMINI", label: "Gemini", model: workspace?.geminiModel ?? "gemini-2.0-flash" });
  }
  if (workspace?.localLlmUrl) {
    configuredProviders.push({ id: "LOCAL", label: "Local LLM", model: workspace?.localLlmModel ?? "llama3.1" });
  }

  return {
    clients,
    configuredProviders,
    activeProvider: (workspace?.aiProvider ?? "ANTHROPIC") as "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL",
  };
}

export default async function PulseNewScanPage() {
  const { clients, configuredProviders, activeProvider } = await getPageData();

  return (
    <AppShell title="New scan" subtitle="Validate a client project with Gitwork Pulse.">
      <div className="max-w-lg">
        <PulseNewScanForm
          clients={clients}
          configuredProviders={configuredProviders}
          activeProvider={activeProvider}
        />
      </div>
    </AppShell>
  );
}
