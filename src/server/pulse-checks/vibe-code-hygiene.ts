import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { ExtendedCheckContext } from "./_types";
import { headRequest } from "./_types";
import { detectSpaContext } from "@/server/pulse-lite/spa-detect";

const CATEGORY = CATEGORIES.VIBE_HYGIENE;

/** Detect the AI/no-code builder a prototype was made with, from host + HTML signatures. */
export function detectAiBuilder(hostname: string, htmlLower: string): string | null {
  const h = hostname.toLowerCase();
  const sig: Array<[string, boolean]> = [
    ["Lovable", h.endsWith(".lovable.app") || h.endsWith(".lovable.dev") || h.endsWith(".lovableproject.com") || htmlLower.includes("lovable-tagger") || htmlLower.includes("gptengineer") || htmlLower.includes("gpteng.co")],
    ["Bolt (StackBlitz)", h.endsWith(".bolt.new") || h.endsWith(".bolt.host") || h.includes("stackblitz")],
    ["v0 (Vercel)", h.endsWith(".v0.dev") || htmlLower.includes("built with v0") || htmlLower.includes("data-v0-")],
    ["Replit", h.endsWith(".repl.co") || h.endsWith(".replit.app") || h.endsWith(".replit.dev")],
    ["Framer", h.endsWith(".framer.app") || h.endsWith(".framer.website") || htmlLower.includes("framerusercontent.com")],
    ["Webflow", h.endsWith(".webflow.io") || htmlLower.includes("webflow.com") || htmlLower.includes("data-wf-")],
    ["Wix", h.endsWith(".wixsite.com") || htmlLower.includes("static.wixstatic.com") || htmlLower.includes("wix.com")],
    ["Bubble", h.endsWith(".bubbleapps.io") || htmlLower.includes("bubble.io")],
    ["Softr", h.endsWith(".softr.app") || htmlLower.includes("softr.io")],
    ["Carrd", h.endsWith(".carrd.co")],
    ["Glide", h.endsWith(".glide.page") || htmlLower.includes("glideapps.com")],
    ["Squarespace", htmlLower.includes("squarespace.com") || htmlLower.includes("static1.squarespace")],
  ];
  for (const [name, matched] of sig) if (matched) return name;
  return null;
}

const PROTOTYPE_HOSTS = ["Lovable", "Bolt (StackBlitz)", "v0 (Vercel)", "Replit", "Bubble", "Softr", "Glide"];

export async function runVibeCodeHygieneChecks(
  ctx: ExtendedCheckContext,
): Promise<PulseScanCheckInput[]> {
  const { htmlLower, httpsUrl, hostname, pageResult } = ctx;
  const checks: PulseScanCheckInput[] = [];

  // 0. Builder origin — detect Lovable / Bolt / v0 / Replit etc. Informational, but a
  // raw builder-preview host (vs a custom domain) signals a prototype not yet hardened.
  const builder = detectAiBuilder(hostname, htmlLower);
  const onBuilderHost = builder !== null && PROTOTYPE_HOSTS.includes(builder) &&
    (hostname.toLowerCase().includes(builder.split(" ")[0].toLowerCase()) ||
     /\.(lovable\.app|lovable\.dev|lovableproject\.com|bolt\.new|bolt\.host|v0\.dev|repl\.co|replit\.(app|dev)|bubbleapps\.io|softr\.app|glide\.page)$/i.test(hostname));
  checks.push({
    category: CATEGORY,
    checkKey: "vibe_ai_builder",
    label: "Builder / platform origin",
    status: onBuilderHost ? "WARN" : "PASS",
    detail: builder
      ? onBuilderHost
        ? `Built with ${builder} and still served from its preview host — this is a prototype. Production needs a custom domain, real infra, and the hardening checks below.`
        : `Built with ${builder} (deployed to a custom domain).`
      : "No AI/no-code builder fingerprint detected — looks like a custom-coded product.",
    evidence: builder ?? undefined,
  });

  // 0b. Client-rendered SPA — the initial HTML is an empty shell; content only appears after JS
  // runs. This is why static SEO/content checks are skipped for these sites (see spa-detect.ts).
  const { isSpa } = detectSpaContext({
    builder,
    html: pageResult.html,
    contentType: pageResult.headers["content-type"] ?? "",
  });
  checks.push({
    category: CATEGORY,
    checkKey: "spa_client_rendered",
    label: "Content is server-rendered (not a JS-only shell)",
    status: isSpa ? "WARN" : "PASS",
    detail: isSpa
      ? "This is a client-rendered SPA — the initial HTML is an empty shell and content only appears once JavaScript runs. That hurts SEO and answer-engine visibility, and means static scanners can't assess the real content (so the SEO/content checks here are marked not-applicable). Server-render the content and harden for production — see Starters → Ship It."
      : "The initial HTML contains real server-rendered content.",
  });

  // 1. Placeholder / filler content
  const hasLoremIpsum = htmlLower.includes("lorem ipsum");
  const hasExampleEmail =
    htmlLower.includes("example@example.com") ||
    htmlLower.includes("admin@example.com") ||
    htmlLower.includes("test@test.com") ||
    htmlLower.includes("user@user.com") ||
    htmlLower.includes("demo@demo.com");
  const hasTodoMarker =
    /\b(fixme:|hack:)\b/.test(htmlLower) ||
    (htmlLower.includes("todo:") && !htmlLower.includes("todo app") && !htmlLower.includes("to-do list") && !htmlLower.includes("todos"));
  const hasPlaceholderContent = hasLoremIpsum || hasExampleEmail || hasTodoMarker;

  checks.push({
    category: CATEGORY,
    checkKey: "vibe_placeholder_content",
    label: "No placeholder / filler content in production",
    status: hasPlaceholderContent ? "FAIL" : "PASS",
    detail: hasPlaceholderContent
      ? `Placeholder content detected: ${[
          hasLoremIpsum && "lorem ipsum text",
          hasExampleEmail && "example email address",
          hasTodoMarker && "TODO/FIXME marker",
        ]
          .filter(Boolean)
          .join(", ")}. Strong signal of incomplete work shipped to production.`
      : "No placeholder text, lorem ipsum, or TODO/FIXME markers detected.",
  });

  // 2. Placeholder image services
  const hasPlaceholderImages =
    htmlLower.includes("picsum.photos") ||
    htmlLower.includes("placehold.co") ||
    htmlLower.includes("via.placeholder.com") ||
    htmlLower.includes("placeholder.com/") ||
    htmlLower.includes("placeimg.com") ||
    htmlLower.includes("dummyimage.com") ||
    htmlLower.includes("lorempixel.com") ||
    htmlLower.includes("placekitten.com");

  checks.push({
    category: CATEGORY,
    checkKey: "vibe_placeholder_images",
    label: "No placeholder / stock filler images",
    status: hasPlaceholderImages ? "FAIL" : "PASS",
    detail: hasPlaceholderImages
      ? "Placeholder image service detected (Lorem Picsum, via.placeholder.com, etc.). These must be replaced with real product visuals before launch."
      : "No placeholder image services detected.",
  });

  // 3. Debug / development mode signals
  const hasDebugSignals =
    htmlLower.includes("debug: true") ||
    htmlLower.includes("debug=true") ||
    htmlLower.includes("development mode") ||
    htmlLower.includes("__debug__") ||
    htmlLower.includes("node_env=development") ||
    htmlLower.includes("webpack hmr") ||
    htmlLower.includes("hot module replacement") ||
    htmlLower.includes("vite dev server") ||
    htmlLower.includes("[vite]");

  checks.push({
    category: CATEGORY,
    checkKey: "vibe_debug_mode",
    label: "No debug or development mode signals",
    status: hasDebugSignals ? "FAIL" : "PASS",
    detail: hasDebugSignals
      ? "Debug or development mode signals detected in page HTML. These expose internal state and indicate the production build is not properly configured."
      : "No debug or development mode markers detected.",
  });

  // 4. Framework default page title
  const titleMatch = htmlLower.match(/<title[^>]*>([^<]*)<\/title>/);
  const pageTitle = titleMatch?.[1]?.trim() ?? "";
  const isDefaultTitle =
    pageTitle === "vite + react" ||
    pageTitle === "vite + react + ts" ||
    pageTitle === "create next app" ||
    pageTitle === "react app" ||
    pageTitle === "next.js app" ||
    pageTitle === "my app" ||
    pageTitle === "untitled" ||
    pageTitle === "" ||
    pageTitle === "app" ||
    pageTitle.startsWith("localhost");

  checks.push({
    category: CATEGORY,
    checkKey: "vibe_default_title",
    label: "Meaningful page title (not a framework default)",
    status: isDefaultTitle ? "WARN" : "PASS",
    detail: isDefaultTitle
      ? `Page title is "${pageTitle || "(empty)"}" — a framework scaffold default. Every page needs a meaningful, branded title for SEO and user trust.`
      : `Page title is set: "${pageTitle.slice(0, 60)}${pageTitle.length > 60 ? "…" : ""}".`,
  });

  // 5. AI-generated comment markers in source
  const hasAiComments =
    htmlLower.includes("// generated by claude") ||
    htmlLower.includes("// generated by chatgpt") ||
    htmlLower.includes("// generated by ai") ||
    htmlLower.includes("// ai-generated") ||
    htmlLower.includes("<!-- todo") ||
    htmlLower.includes("<!-- fixme") ||
    htmlLower.includes("// todo: implement") ||
    htmlLower.includes("// todo: add error") ||
    htmlLower.includes("// hack:");

  checks.push({
    category: CATEGORY,
    checkKey: "vibe_ai_comment_markers",
    label: "No AI-generated comment markers in page source",
    status: hasAiComments ? "WARN" : "PASS",
    detail: hasAiComments
      ? "AI-generated comment markers or TODO/FIXME comments found in page source — unfinished work shipped to production."
      : "No AI-generated or unresolved TODO comment markers detected in page source.",
  });

  // 6. Hardcoded test credentials visible in HTML
  const hasTestCreds =
    htmlLower.includes("admin@example.com") ||
    htmlLower.includes("password123") ||
    htmlLower.includes("test@test.com") ||
    htmlLower.includes("admin@admin.com") ||
    htmlLower.includes("demo@demo.com") ||
    (htmlLower.includes("password") && htmlLower.includes("123456"));

  checks.push({
    category: CATEGORY,
    checkKey: "vibe_hardcoded_creds_html",
    label: "No hardcoded test credentials in page HTML",
    status: hasTestCreds ? "FAIL" : "PASS",
    detail: hasTestCreds
      ? "Hardcoded test credentials detected in page HTML — remove before launch."
      : "No hardcoded test credentials detected in page HTML.",
  });

  // 7. Custom 404 page (HEAD a non-existent path)
  let custom404Status: PulseScanCheckInput["status"] = "PASS";
  let custom404Detail = "Custom 404 handling confirmed.";
  try {
    const notFoundStatus = await headRequest(`${httpsUrl}/pulse-check-nonexistent-path-404`);
    if (notFoundStatus === 200) {
      custom404Status = "WARN";
      custom404Detail =
        "Missing path returns 200 OK — no custom 404 page. Users reaching broken links see the homepage instead of a clear error.";
    } else if (notFoundStatus === 0) {
      custom404Status = "WARN";
      custom404Detail = "Could not verify 404 handling — request timed out.";
    } else {
      custom404Detail = `Returns ${notFoundStatus} for unknown paths — 404 handling is in place.`;
    }
  } catch {
    custom404Status = "WARN";
    custom404Detail = "Could not verify 404 handling.";
  }

  checks.push({
    category: CATEGORY,
    checkKey: "vibe_no_custom_404",
    label: "Custom 404 page for missing routes",
    status: custom404Status,
    detail: custom404Detail,
  });

  // 8. Images without alt text (basic accessibility signal)
  const imgTagMatches = htmlLower.match(/<img[^>]*>/g) ?? [];
  const emptyAltCount = imgTagMatches.filter(
    (tag) => tag.includes('alt=""') || tag.includes("alt=''") || !tag.includes("alt="),
  ).length;
  const totalImgs = imgTagMatches.length;
  const hasEmptyAlts = totalImgs > 2 && emptyAltCount / totalImgs > 0.6;

  checks.push({
    category: CATEGORY,
    checkKey: "vibe_empty_alt_images",
    label: "Images have descriptive alt text",
    status: hasEmptyAlts ? "WARN" : "PASS",
    detail: hasEmptyAlts
      ? `${emptyAltCount} of ${totalImgs} images are missing alt text — a common AI code generator oversight that fails WCAG 2.1 AA and harms SEO.`
      : totalImgs === 0
        ? "No images detected on the page."
        : `${totalImgs - emptyAltCount} of ${totalImgs} images have alt text.`,
  });

  // 9. Broken internal links (F4) — sample same-site links from the homepage and HEAD-check them.
  try {
    const hrefs = [...pageResult.html.matchAll(/href=["']([^"'#?\s]+)["']/gi)].map((m) => m[1]);
    const internal = new Set<string>();
    for (const href of hrefs) {
      try {
        const u = new URL(href, httpsUrl);
        if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname === hostname) {
          const clean = `${u.origin}${u.pathname}`.replace(/\/$/, "");
          if (clean && clean !== httpsUrl.replace(/\/$/, "")) internal.add(clean);
        }
      } catch { /* skip malformed */ }
    }
    const sample = [...internal].slice(0, 12);
    if (sample.length > 0) {
      const statuses = await Promise.all(sample.map((u) => headRequest(u)));
      const broken = sample.filter((_, i) => {
        const s = statuses[i];
        return s === 0 || (s >= 400 && ![401, 403, 405, 429].includes(s));
      });
      checks.push({
        category: CATEGORY,
        checkKey: "vibe_broken_links",
        label: "Internal links resolve (no broken links)",
        status: broken.length > 0 ? (broken.length > 2 ? "FAIL" : "WARN") : "PASS",
        detail: broken.length > 0
          ? `${broken.length} of ${sample.length} sampled internal links are broken (404/error) — dead links signal unfinished navigation.`
          : `All ${sample.length} sampled internal links resolve.`,
        evidence: broken.length > 0 ? broken.slice(0, 5).join(", ") : undefined,
      });
    }
  } catch { /* best-effort — never break the category */ }

  return checks;
}
