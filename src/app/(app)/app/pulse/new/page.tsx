import { AppShell } from "@/components/app-shell";
import { PulseNewScanForm } from "@/components/pulse/pulse-new-scan-form";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { auth } from "@/auth";
import { isAtLeast } from "@/types/auth";

export const dynamic = "force-dynamic";

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

  // ⚠️ Scoped to the VIEWER. This used to list every client in the workspace and hand
  // the names to the form, so a guest opening this page saw Gitwork's entire client
  // roster in a dropdown — a disclosure on its own, and an invitation to file their
  // scan against someone else's account.
  //
  // A guest has no assignments, so they get an empty list and the form drops the
  // picker entirely: their scan is theirs, attributed to no client. That is the
  // intended shape, not a degraded one.
  const session = await auth();
  const viewer = session?.user?.id
    ? await prisma.workspaceMember.findFirst({
        where: { userId: session.user.id, workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
        select: { role: true, permissions: true, userId: true, workspaceId: true },
      })
    : null;

  const seesAllClients =
    !!viewer &&
    (isAtLeast(viewer.role, "ADMIN") ||
      ((viewer.permissions as string[]) ?? []).includes("seeAllClients"));

  const clients = !workspace
    ? []
    : seesAllClients
      ? await prisma.workspaceClient.findMany({
          where: { workspaceId: workspace.id },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : viewer
        ? await prisma.workspaceClient.findMany({
            where: {
              workspaceId: workspace.id,
              assignments: { some: { userId: viewer.userId } },
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : [];

  type Provider = { id: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; label: string; model: string };
  const configuredProviders: Provider[] = [];

  if (process.env.ANTHROPIC_API_KEY || workspace?.anthropicApiKey) {
    configuredProviders.push({ id: "ANTHROPIC", label: "Claude", model: workspace?.anthropicModel ?? "claude-sonnet-5" });
  }
  if (process.env.OPENAI_API_KEY || workspace?.openaiApiKey) {
    configuredProviders.push({ id: "OPENAI", label: "OpenAI", model: workspace?.openaiModel ?? "gpt-4o" });
  }
  if (process.env.GEMINI_API_KEY || workspace?.geminiApiKey) {
    configuredProviders.push({ id: "GEMINI", label: "Gemini", model: workspace?.geminiModel ?? "gemini-2.0-flash" });
  }
  if (workspace?.localLlmUrl) {
    const localModel = workspace?.localLlmModel ?? "llama3.1";
    const localLabel = workspace?.localLlmUrl?.includes("ollama") || workspace?.localLlmUrl?.includes("11434")
      ? "Ollama"
      : workspace?.localLlmUrl?.includes("lmstudio") || workspace?.localLlmUrl?.includes("1234")
        ? "LM Studio"
        : "Local LLM";
    configuredProviders.push({ id: "LOCAL", label: localLabel, model: localModel });
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
      <div className="mx-auto w-full max-w-xl px-1 pt-2 sm:pt-6">
        <PulseNewScanForm
          clients={clients}
          configuredProviders={configuredProviders}
          activeProvider={activeProvider}
        />
      </div>
    </AppShell>
  );
}
