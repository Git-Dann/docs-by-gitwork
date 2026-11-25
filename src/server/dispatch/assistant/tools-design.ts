/**
 * Dispatch looking at designs and at what was built: the client's Figma files (frames, their
 * words, a picture of one), and a screenshot of a page on the client's own site.
 *
 * - Figma: only files linked as this client's designs in Portal (src/lib/dispatch/figma.ts), read
 *   with the workspace's Figma token (Settings → Dispatch, encrypted with storeSecret).
 * - Pages: only URLs on this client's platforms (production or staging), checked by
 *   assertScannableUrl (no private addresses), and the browser refuses any navigation that
 *   leaves those hosts.
 * - Pictures count against a per-question limit (ToolContext.imagesLeft): each one costs about
 *   as much as a page of text, so a question can't run up dozens.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asSource } from "@/lib/dispatch/prompt";
import {
  cleanNodeId,
  designChoices,
  frameText,
  imageScale,
  listFrames,
  pickDesign,
  type DesignChoice,
  type FigmaNode,
} from "@/lib/dispatch/figma";
import { imageMediaType } from "@/lib/dispatch/images";
import { readSecret } from "@/server/stored-secret";
import type { DispatchScope } from "./scope";
import type { DispatchTool, ToolContext, ToolOutcome } from "./tools";

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

function tool<S extends z.ZodTypeAny>(t: DispatchTool<S>): DispatchTool {
  return t as unknown as DispatchTool;
}

const FIGMA_API = "https://api.figma.com/v1";
const MAX_IMAGE_BYTES = 4_500_000;

const designProp = {
  design: { type: "string", description: "Which design, when the client has more than one: its name as listed in Portal." },
};

async function figmaFor(scope: DispatchScope, wanted: string | undefined): Promise<{ token: string; design: DesignChoice } | ToolOutcome> {
  const [ws, designs] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: scope.user.workspaceId }, select: { figmaToken: true } }),
    prisma.clientDesign.findMany({ where: { clientId: scope.client.id }, select: { name: true, url: true }, orderBy: { name: "asc" } }),
  ]);
  const token = readSecret(ws?.figmaToken);
  if (!token) return { text: "Figma isn't connected to Foundry yet (Settings → Dispatch), so I can't open designs.", isError: true };
  const picked = pickDesign(designChoices(designs), wanted);
  return typeof picked === "string" ? { text: picked, isError: true } : { token, design: picked };
}

async function figmaGet<T>(token: string, path: string): Promise<T | { problem: string }> {
  const res = await fetch(`${FIGMA_API}${path}`, { headers: { "X-Figma-Token": token }, signal: AbortSignal.timeout(20_000), cache: "no-store" }).catch(() => null);
  if (!res) return { problem: "Figma didn't answer just now." };
  if (res.status === 403) return { problem: "Foundry's Figma token can't open that file. It needs to be shared with the account the token belongs to." };
  if (res.status === 404) return { problem: "Figma says that file or frame doesn't exist." };
  if (res.status === 429) return { problem: "Figma is limiting requests right now. Try again in a minute." };
  if (!res.ok) return { problem: `Figma refused the request (${res.status}).` };
  return (await res.json()) as T;
}

const isProblem = (v: unknown): v is { problem: string } => typeof v === "object" && v !== null && "problem" in v;
const figmaLink = (d: DesignChoice, node?: string | null) =>
  `https://www.figma.com/design/${d.fileKey}/${node ? `?node-id=${node.replace(":", "-")}` : ""}`;

const figmaFrames = tool({
  name: "figma_frames",
  description: "The client's Figma design. Without a frame: lists the pages and their frames (screens) with ids. With a frame id: the words on that frame, layer by layer. Use figma_image to see a frame.",
  input_schema: obj({ ...designProp, frame: { type: "string", description: "A frame id from the list, like 12:34." } }),
  schema: z.object({ design: z.string().max(200).optional(), frame: z.string().max(40).optional() }).strict(),
  status: "Opening the Figma design",
  async run(scope, { design, frame }) {
    const f = await figmaFor(scope, design);
    if ("text" in f) return f;
    const node = frame ? cleanNodeId(frame) : null;
    if (frame && !node) return { text: "That isn't a Figma frame id (they look like 12:34).", isError: true };
    if (!node) {
      const file = await figmaGet<{ name: string; document: FigmaNode; lastModified?: string }>(f.token, `/files/${f.design.fileKey}?depth=2`);
      if (isProblem(file)) return { text: file.problem, isError: true };
      const frames = listFrames(file.document);
      const rows = frames.map((x) => `- [${x.id}] ${x.page} / ${x.name}${x.size ? ` (${x.size})` : ""}`);
      return {
        text: asSource("design", f.design.fileKey, `${file.name}${file.lastModified ? ` (edited ${file.lastModified.slice(0, 10)})` : ""}\n${rows.join("\n") || "(no frames)"}`),
        sources: [{ kind: "design", id: f.design.fileKey, label: f.design.name, href: figmaLink(f.design) }],
      };
    }
    const nodes = await figmaGet<{ nodes: Record<string, { document: FigmaNode } | null> }>(f.token, `/files/${f.design.fileKey}/nodes?ids=${encodeURIComponent(node)}`);
    if (isProblem(nodes)) return { text: nodes.problem, isError: true };
    const doc = nodes.nodes[node]?.document;
    if (!doc) return { text: "That frame isn't in this design.", isError: true };
    return {
      text: asSource("design", `${f.design.fileKey}:${node}`, `${doc.name}\n${frameText(doc) || "(no text on this frame)"}`),
      sources: [{ kind: "design", id: `${f.design.fileKey}:${node}`, label: `${f.design.name} / ${doc.name}`, href: figmaLink(f.design, node) }],
    };
  },
});

function takeImageSlot(ctx: ToolContext): ToolOutcome | null {
  if (ctx.imagesLeft <= 0) return { text: "That's the most pictures I can look at for one question. Ask again to see more.", isError: true };
  ctx.imagesLeft -= 1;
  return null;
}

const figmaImage = tool({
  name: "figma_image",
  description: "A picture of one frame from the client's Figma design, so you can see it. Pass the frame id from figma_frames. Limited to a few pictures per question.",
  input_schema: obj({ ...designProp, frame: { type: "string" } }, ["frame"]),
  schema: z.object({ design: z.string().max(200).optional(), frame: z.string().max(40) }).strict(),
  status: "Looking at the design",
  async run(scope, { design, frame }, ctx) {
    const f = await figmaFor(scope, design);
    if ("text" in f) return f;
    const node = cleanNodeId(frame);
    if (!node) return { text: "That isn't a Figma frame id (they look like 12:34).", isError: true };
    const meta = await figmaGet<{ nodes: Record<string, { document: FigmaNode } | null> }>(f.token, `/files/${f.design.fileKey}/nodes?ids=${encodeURIComponent(node)}&depth=1`);
    if (isProblem(meta)) return { text: meta.problem, isError: true };
    const doc = meta.nodes[node]?.document;
    if (!doc) return { text: "That frame isn't in this design.", isError: true };
    const full = takeImageSlot(ctx);
    if (full) return full;
    const scale = imageScale(doc.absoluteBoundingBox);
    const rendered = await figmaGet<{ images: Record<string, string | null>; err?: string | null }>(
      f.token,
      `/images/${f.design.fileKey}?ids=${encodeURIComponent(node)}&format=jpg&scale=${scale}`,
    );
    if (isProblem(rendered)) return { text: rendered.problem, isError: true };
    const url = rendered.images[node];
    if (!url) return { text: "Figma couldn't draw that frame.", isError: true };
    const img = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    const bytes = img?.ok ? new Uint8Array(await img.arrayBuffer()) : null;
    const mediaType = bytes ? imageMediaType(bytes) : null;
    if (!bytes || !mediaType || bytes.byteLength > MAX_IMAGE_BYTES) return { text: "I couldn't load the picture of that frame.", isError: true };
    return {
      text: asSource("design", `${f.design.fileKey}:${node}`, `Picture of "${doc.name}" from ${f.design.name}.`),
      images: [{ mediaType, data: Buffer.from(bytes).toString("base64") }],
      sources: [{ kind: "design", id: `${f.design.fileKey}:${node}`, label: `${f.design.name} / ${doc.name}`, href: figmaLink(f.design, node) }],
    };
  },
});

/** Hostnames of this client's own sites (production and staging). */
async function clientHosts(scope: DispatchScope): Promise<Set<string>> {
  const platforms = await prisma.clientPlatform.findMany({ where: { clientId: scope.client.id }, select: { url: true, stagingUrl: true } });
  const hosts = new Set<string>();
  for (const p of platforms) {
    for (const raw of [p.url, p.stagingUrl]) {
      try {
        if (raw) hosts.add(new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase());
      } catch {
        // not a URL: skip
      }
    }
  }
  return hosts;
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

const capturePage = tool({
  name: "capture_page",
  description: "A screenshot of a page on the client's own website (its production or staging address only), at phone or desktop width, to compare what was built with the design. Limited to a few pictures per question.",
  input_schema: obj({ url: { type: "string" }, device: { type: "string", enum: ["phone", "desktop"] } }, ["url"]),
  schema: z.object({ url: z.string().min(4).max(500), device: z.enum(["phone", "desktop"]).optional() }).strict(),
  status: "Taking a screenshot of the site",
  async run(scope, { url, device }, ctx) {
    const hosts = await clientHosts(scope);
    if (!hosts.size) return { text: "This client has no website address on its platforms, so there's nothing I can screenshot.", isError: true };
    const { assertScannableUrl } = await import("@/server/pulse-lite/url-guard");
    let target: { url: string; hostname: string };
    try {
      target = await assertScannableUrl(url);
    } catch (err) {
      return { text: err instanceof Error ? err.message : "That address can't be opened.", isError: true };
    }
    if (!hosts.has(target.hostname.toLowerCase())) {
      return { text: `I can only screenshot this client's own sites: ${[...hosts].join(", ")}.`, isError: true };
    }
    const full = takeImageSlot(ctx);
    if (full) return full;
    const viewport = device === "desktop" ? { width: 1280, height: 800 } : { width: 390, height: 844 };
    const { launchHeadlessBrowser } = await import("@/server/headless-browser");
    const browser = await launchHeadlessBrowser({ defaultViewport: viewport });
    try {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        let host = "";
        try {
          const u = new URL(req.url());
          if (!/^https?:$/.test(u.protocol) && !/^data:|^blob:/.test(req.url())) return void req.abort();
          host = u.hostname.toLowerCase();
        } catch {
          return void req.abort();
        }
        // The page (and any redirect) must stay on the client's sites; nothing may reach a
        // private address.
        if (host && PRIVATE_HOST.test(host)) return void req.abort();
        if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !hosts.has(host)) return void req.abort();
        void req.continue();
      });
      const res = await page.goto(target.url, { waitUntil: "networkidle2", timeout: 25_000 }).catch(() => null);
      if (!res) return { text: "The page didn't load in time, or it tried to go somewhere else.", isError: true };
      const shot = await page.screenshot({ type: "jpeg", quality: 70 });
      const bytes = new Uint8Array(shot);
      return {
        text: asSource("page", target.url, `Screenshot of ${target.url} at ${device === "desktop" ? "desktop" : "phone"} width (status ${res.status()}).`),
        images: [{ mediaType: "image/jpeg", data: Buffer.from(bytes).toString("base64") }],
        sources: [{ kind: "page", id: target.url, label: target.hostname, href: target.url }],
      };
    } finally {
      await browser.close().catch(() => undefined);
    }
  },
});

export const DESIGN_TOOLS: readonly DispatchTool[] = [figmaFrames, figmaImage, capturePage];
