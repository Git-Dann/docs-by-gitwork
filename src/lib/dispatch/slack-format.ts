/**
 * Dispatch in Slack: turning one answer (text, proposed changes, sources) into Block Kit, and
 * marking a proposal decided after its button is pressed. Pure: no DB, no fetch.
 *
 * The answer is written in Markdown for the in-app panel; Slack speaks its own "mrkdwn", so the
 * few constructs Dispatch uses (bold, italics, links, headings, lists) are converted here.
 */

export type SlackBlock = Record<string, unknown>;

export const DISPATCH_SLACK_ACTIONS = {
  CONFIRM: "dispatch.confirm",
  CANCEL: "dispatch.cancel",
} as const;

export function isDispatchSlackAction(actionId: string | undefined): boolean {
  return actionId === DISPATCH_SLACK_ACTIONS.CONFIRM || actionId === DISPATCH_SLACK_ACTIONS.CANCEL;
}

const SECTION_MAX = 2900;
const MAX_ACTIONS = 10;

function escapeMrkdwn(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Markdown → Slack mrkdwn, for the subset Dispatch writes. */
export function markdownToMrkdwn(md: string): string {
  const lines = escapeMrkdwn(md).split("\n");
  let inCode = false;
  const out = lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      return "```";
    }
    if (inCode) return line;
    let l = line;
    const heading = l.match(/^#{1,6}\s+(.*)$/);
    if (heading) l = `*${heading[1].replace(/\*\*/g, "")}*`;
    l = l.replace(/^(\s*)[-*]\s+/, "$1•  ");
    // Links: [label](https://…) → <https://…|label>. Only http(s), so nothing else is linkable.
    l = l.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label: string, url: string) => `<${url}|${label}>`);
    // Bold before italics: **x** → *x*, __x__ → *x*.
    l = l.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/__(.+?)__/g, "*$1*");
    return l;
  });
  return out.join("\n").trim();
}

/** Split long text into section-sized pieces on paragraph, then line, boundaries. */
export function chunkForSections(text: string, max = SECTION_MAX): string[] {
  if (text.length <= max) return text ? [text] : [];
  const chunks: string[] = [];
  let current = "";
  for (const para of text.split(/\n/)) {
    const next = current ? `${current}\n${para}` : para;
    if (next.length <= max) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    // A single line longer than a section is cut hard.
    let rest = para;
    while (rest.length > max) {
      chunks.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    current = rest;
  }
  if (current) chunks.push(current);
  return chunks;
}

export interface SlackActionCard {
  id: string;
  title: string;
  lines: string[];
}

export interface SlackSource {
  label: string;
  /** Absolute URL, when there is one. */
  url?: string;
}

export function buildAssistantReply(input: {
  text: string;
  actions: SlackActionCard[];
  sources: SlackSource[];
  /** The client the answer is about; null for a chat with no client (small talk, §167). */
  clientName: string | null;
  askerSlackId?: string | null;
  notice?: string | null;
}): { text: string; blocks: SlackBlock[] } {
  const blocks: SlackBlock[] = [];
  const body = markdownToMrkdwn(input.text);
  // Slack caps a message at 50 blocks: 15 of text + 3 per proposal (10 max) + notice + footer.
  for (const chunk of chunkForSections(body).slice(0, 15)) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: chunk } });
  }
  if (input.notice) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: escapeMrkdwn(input.notice).slice(0, 2900) }] });
  }

  for (const card of input.actions.slice(0, MAX_ACTIONS)) {
    const detail = card.lines.slice(0, 8).map((l) => `•  ${escapeMrkdwn(l)}`).join("\n");
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      block_id: `dispatch.card.${card.id}`,
      text: { type: "mrkdwn", text: `*${escapeMrkdwn(card.title)}*${detail ? `\n${detail}` : ""}`.slice(0, SECTION_MAX) },
    });
    blocks.push({
      type: "actions",
      block_id: `dispatch.buttons.${card.id}`,
      elements: [
        {
          type: "button",
          action_id: DISPATCH_SLACK_ACTIONS.CONFIRM,
          value: card.id,
          style: "primary",
          text: { type: "plain_text", text: "Confirm" },
        },
        {
          type: "button",
          action_id: DISPATCH_SLACK_ACTIONS.CANCEL,
          value: card.id,
          text: { type: "plain_text", text: "Cancel" },
        },
      ],
    });
  }

  const footer: string[] = [input.clientName ? `*Dispatch* · ${escapeMrkdwn(input.clientName)}` : "*Dispatch*"];
  if (input.actions.length && input.askerSlackId) footer.push(`only <@${input.askerSlackId}> can confirm these`);
  const sources = input.sources.slice(0, 6).map((s) => (s.url ? `<${s.url}|${escapeMrkdwn(s.label)}>` : escapeMrkdwn(s.label)));
  if (sources.length) footer.push(`from ${sources.join(", ")}`);
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: footer.join("  ·  ").slice(0, 2900) }] });

  const plain = input.text.replace(/\s+/g, " ").trim();
  return { text: (plain || "Dispatch").slice(0, 300), blocks };
}

/**
 * The same message with one proposal's buttons replaced by what happened. Everything else in
 * the message is left exactly as posted.
 */
export function markActionDecided(blocks: readonly SlackBlock[], actionId: string, outcome: string): SlackBlock[] {
  return blocks.map((b) =>
    b.block_id === `dispatch.buttons.${actionId}`
      ? { type: "context", block_id: `dispatch.done.${actionId}`, elements: [{ type: "mrkdwn", text: escapeMrkdwn(outcome).slice(0, 2900) }] }
      : b,
  );
}
