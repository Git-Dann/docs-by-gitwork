import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const onboardings = (prisma as unknown as {
  clientOnboarding: Prisma.ClientOnboardingDelegate;
}).clientOnboarding;

/**
 * Posts a one-line Slack notification when a client submits their onboarding.
 * Uses the workspace's stored bot token + a channel id pulled from either
 * `channelRoutes["onboarding.submitted"]` or the legacy `slackSummaryChannelId`.
 * Silently no-ops when Slack isn't configured — submission must never fail
 * because of a notification glitch.
 */
export async function notifyOnboardingSubmitted(token: string): Promise<void> {
  const row = await onboardings.findUnique({
    where: { accessToken: token },
    select: {
      contactFirstName: true,
      contactLastName: true,
      contactEmail: true,
      companyName: true,
      productName: true,
      productUrl: true,
      workspace: {
        select: {
          slackBotToken: true,
          slackSummaryChannelId: true,
          channelRoutes: true,
        },
      },
    },
  });
  if (!row) return;
  const ws = row.workspace;
  const botToken = ws.slackBotToken?.trim();
  if (!botToken) return;

  const routes = (ws.channelRoutes as Record<string, string> | null) ?? null;
  const channelId =
    routes?.["onboarding.submitted"] ?? ws.slackSummaryChannelId ?? null;
  if (!channelId) return;

  const company = row.companyName ?? "(no company name)";
  const product = row.productName ? ` — ${row.productName}` : "";
  const contactName = [row.contactFirstName, row.contactLastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  const summaryParts: string[] = [];
  if (contactName) summaryParts.push(`Contact: ${contactName}`);
  if (row.contactEmail) summaryParts.push(`<mailto:${row.contactEmail}|${row.contactEmail}>`);
  if (row.productUrl) summaryParts.push(`<${row.productUrl}|product>`);
  const summary = summaryParts.length ? `\n${summaryParts.join(" · ")}` : "";

  const payload = {
    channel: channelId,
    text: `:memo: New onboarding submitted: *${company}*${product}${summary}\n_Review in Portal → /app/portal_`,
    unfurl_links: false,
    unfurl_media: false,
  };

  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Swallow — notification is best-effort.
  }
}
