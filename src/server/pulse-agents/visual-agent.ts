// Wave D1 — Visual Quality agent.
//
// Takes a viewport screenshot of the page (above-the-fold = the first impression)
// and asks a vision-capable model to score visual polish, value-prop clarity, CTA
// prominence, trust signals and mobile-friendliness.
//
// FULLY best-effort and ISOLATED: any failure (no browser, nav timeout, non-Anthropic
// provider, no key, bad JSON) returns null and never affects the rest of the scan.
// Gated to the ANTHROPIC provider — the only one wired for image input here. Lives in
// pulse-agents (NOT pulse-lite) so the AI-free public embed core stays AI-free.

import Anthropic from "@anthropic-ai/sdk";
import type { VisualAgentInsights } from "@/types/pulse";

type AiConfig = { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null };

const NAV_TIMEOUT_MS = 15_000;
const HARD_TIMEOUT_MS = 24_000;
const VISION_TIMEOUT_MS = 18_000;

const VISION_PROMPT = `You are a senior product designer reviewing the above-the-fold screenshot of a web product's landing page. Score it honestly — be critical, this is for a production-readiness audit, not flattery.

Return ONLY a JSON object (no prose) with exactly these keys:
{
  "visualQuality": 0-100,        // overall design polish & professionalism
  "valuePropClarity": 0-100,     // is it clear what this does within 5 seconds?
  "ctaProminence": 0-100,        // is the primary action obvious and above the fold?
  "trustSignals": 0-100,         // logo, social proof, pricing, professionalism cues present?
  "mobileFriendly": true|false,  // does the layout look intentional / not broken?
  "narrative": "string"          // 1-2 sentences: the single biggest visual win and the single biggest gap
}`;

interface VisionResult {
  visualQuality?: number;
  valuePropClarity?: number;
  ctaProminence?: number;
  trustSignals?: number;
  mobileFriendly?: boolean;
  narrative?: string;
}

function clampScore(n: unknown): number | null {
  if (typeof n !== "number" || Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function captureScreenshot(url: string): Promise<string | null> {
  let browser: import("puppeteer-core").Browser | null = null;
  try {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    browser = await puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    // viewport (above-the-fold) screenshot — the first impression, and keeps the
    // image small for the vision call.
    const buf = await page.screenshot({ type: "png" });
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function analyseScreenshot(base64Png: string, aiConfig: AiConfig): Promise<VisionResult | null> {
  if (!aiConfig.apiKey) return null;
  try {
    const client = new Anthropic({ apiKey: aiConfig.apiKey, timeout: VISION_TIMEOUT_MS, maxRetries: 1 });
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: base64Png } },
          { type: "text", text: VISION_PROMPT },
        ],
      },
    ];
    const response = await client.messages.create({ model: aiConfig.model, max_tokens: 600, messages });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as VisionResult;
  } catch {
    return null;
  }
}

/**
 * Best-effort visual-quality scan. Returns null unless the provider is Anthropic,
 * a screenshot is captured, and the model returns parseable scores.
 */
export async function runVisualAgent(url: string, aiConfig: AiConfig): Promise<VisualAgentInsights | null> {
  if (aiConfig.provider !== "ANTHROPIC" || !aiConfig.apiKey) return null;

  const run = (async (): Promise<VisualAgentInsights | null> => {
    const shot = await captureScreenshot(url);
    if (!shot) return null;
    const r = await analyseScreenshot(shot, aiConfig);
    if (!r) return null;
    return {
      visualQualityScore: clampScore(r.visualQuality),
      valuePropClarity: clampScore(r.valuePropClarity),
      ctaProminence: clampScore(r.ctaProminence),
      trustSignals: clampScore(r.trustSignals),
      mobileFriendly: typeof r.mobileFriendly === "boolean" ? r.mobileFriendly : null,
      visualNarrative: typeof r.narrative === "string" && r.narrative.trim() ? r.narrative.trim() : null,
    };
  })();

  // Hard ceiling so a hung browser/vision call never eats the scan's time budget.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), HARD_TIMEOUT_MS));
  try {
    return await Promise.race([run, timeout]);
  } catch {
    return null;
  }
}
