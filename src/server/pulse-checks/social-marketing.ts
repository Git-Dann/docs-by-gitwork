import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, platformIs, skip } from "./_types";

/**
 * How a page behaves when somebody posts it — and what to change.
 *
 * ── The line this family must not cross ──────────────────────────────────────
 * Pulse's whole claim is that it never asserts what it did not verify (§38, §44).
 * "You should be on TikTok" is not verifiable from a page: whether a business needs a
 * channel depends on who its customers are, which a scanner cannot see. So every check
 * here measures something OBSERVABLE — the preview image's declared size, the card
 * type, which profiles are linked, whether there is short-form video — and the
 * recommendation lives in the `detail`, tied to that observation.
 *
 * That is why nothing here FAILS and why the category is `weighted: false`. A missing
 * Instagram link is a marketing decision someone may have made deliberately; scoring a
 * launch against it would make the readiness number mean something it does not.
 * The strongest status used is WARN, and a test enforces it.
 */

const CATEGORY = CATEGORIES.SOCIAL_MARKETING;

const ALL_CHECKS: Array<[string, string]> = [
  ["social_og_image_present", "Share image (og:image)"],
  ["social_og_image_size", "Share image is large enough"],
  ["social_og_title", "Share headline (og:title)"],
  ["social_og_description", "Share description length"],
  ["social_twitter_card", "Large-image card on X"],
  ["social_profiles_linked", "Social profiles linked from the site"],
  ["social_short_form_video", "Short-form video presence"],
  ["social_schema_sameas", "Profiles declared in structured data"],
  ["social_share_affordance", "Something to share with"],
  ["social_image_alt_coverage", "Images carry alt text"],
];

/** Attribute value for a `<meta property|name="x">`, or null. */
function meta(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
  return content?.trim() ?? null;
}

/** The networks worth naming individually, and how to spot a link to one. */
const NETWORKS: Array<[string, RegExp]> = [
  ["Instagram", /(?:https?:)?\/\/(?:www\.)?instagram\.com\//i],
  ["TikTok", /(?:https?:)?\/\/(?:www\.)?tiktok\.com\//i],
  ["LinkedIn", /(?:https?:)?\/\/(?:[a-z]{2}\.)?linkedin\.com\//i],
  ["YouTube", /(?:https?:)?\/\/(?:www\.)?youtube\.com\/|youtu\.be\//i],
  ["X / Twitter", /(?:https?:)?\/\/(?:www\.)?(?:twitter\.com|x\.com)\//i],
  ["Facebook", /(?:https?:)?\/\/(?:www\.)?facebook\.com\//i],
];

export async function runSocialMarketingChecks(
  ctx: ExtendedCheckContext,
): Promise<PulseScanCheckInput[]> {
  // Nothing here applies to something with no shareable web page.
  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL")) {
    return skip(CATEGORY, ALL_CHECKS, "No public web page to share.");
  }

  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];
  const add = (
    checkKey: string,
    label: string,
    status: "PASS" | "WARN",
    detail: string,
  ) => checks.push({ category: CATEGORY, checkKey, label, status, detail });

  // ── The link preview: what a post of this URL actually looks like ──────────
  const ogImage = meta(html, "og:image");
  add(
    "social_og_image_present",
    "Share image (og:image)",
    ogImage ? "PASS" : "WARN",
    ogImage
      ? `A share image is set (${ogImage.slice(0, 80)}).`
      : "No og:image, so posting this link gives a bare text row on LinkedIn, X, Slack and WhatsApp. A single 1200×630 image is the highest-leverage change on this list — it is what makes a shared link look like a thing worth clicking.",
  );

  // Declared dimensions, when present, are the only size evidence available without
  // fetching the image — so an absent pair is "could not establish", not "too small".
  const w = Number(meta(html, "og:image:width") ?? 0);
  const h = Number(meta(html, "og:image:height") ?? 0);
  const sized = w > 0 && h > 0;
  const bigEnough = w >= 1200 && h >= 630;
  add(
    "social_og_image_size",
    "Share image is large enough",
    !ogImage || !sized || bigEnough ? "PASS" : "WARN",
    !ogImage
      ? "No share image to size."
      : !sized
        ? "og:image:width / og:image:height are not declared, so the size could not be established from the page. Declaring them lets a platform lay the card out before the image downloads."
        : bigEnough
          ? `Declared ${w}×${h} — at or above the 1200×630 that renders sharp on every major network.`
          : `Declared ${w}×${h}, under the 1200×630 the major networks render at, so it will be upscaled and look soft. Export the image at 1200×630.`,
  );

  const ogTitle = meta(html, "og:title") ?? meta(html, "twitter:title");
  const titleLen = ogTitle?.length ?? 0;
  add(
    "social_og_title",
    "Share headline (og:title)",
    ogTitle && titleLen <= 70 ? "PASS" : "WARN",
    !ogTitle
      ? "No og:title, so networks fall back to the <title> tag — usually the SEO version, which reads like a search result rather than something a person wrote."
      : titleLen > 70
        ? `The share headline is ${titleLen} characters and most networks cut around 60–70, so it will trail off mid-sentence. Put the point in the first 60.`
        : `${titleLen} characters — inside the ~60–70 every network shows in full.`,
  );

  const ogDesc = meta(html, "og:description") ?? meta(html, "twitter:description");
  const descLen = ogDesc?.length ?? 0;
  add(
    "social_og_description",
    "Share description length",
    ogDesc && descLen >= 50 && descLen <= 200 ? "PASS" : "WARN",
    !ogDesc
      ? "No og:description, so the preview shows either nothing or whatever text the network scrapes first."
      : descLen < 50
        ? `Only ${descLen} characters — there is room for ~150, and the description is the one line that turns a preview into a click.`
        : descLen > 200
          ? `${descLen} characters; LinkedIn and X truncate near 200. Lead with the benefit so nothing load-bearing is in the part that gets cut.`
          : `${descLen} characters — a good length for every network.`,
  );

  const twitterCard = meta(html, "twitter:card");
  add(
    "social_twitter_card",
    "Large-image card on X",
    twitterCard === "summary_large_image" ? "PASS" : "WARN",
    twitterCard === "summary_large_image"
      ? "summary_large_image — posts render with the full-width image."
      : twitterCard
        ? `twitter:card is "${twitterCard}", which renders a small thumbnail. summary_large_image gives the full-width image and is the reason some links look designed and others look like a footnote.`
        : "No twitter:card, so X falls back to a small thumbnail. Set summary_large_image.",
  );

  // ── Where the audience actually is ─────────────────────────────────────────
  const linked = NETWORKS.filter(([, re]) => re.test(html)).map(([name]) => name);
  const shortForm = linked.filter((n) => n === "TikTok" || n === "Instagram" || n === "YouTube");
  add(
    "social_profiles_linked",
    "Social profiles linked from the site",
    linked.length > 0 ? "PASS" : "WARN",
    linked.length > 0
      ? `Linked: ${linked.join(", ")}.`
      : "No links to any social profile. Whether you need one is your call — but if the accounts exist, linking them from the site is what connects the audience you pay to reach to the place they can follow you for free.",
  );

  add(
    "social_short_form_video",
    "Short-form video presence",
    shortForm.length > 0 ? "PASS" : "WARN",
    shortForm.length > 0
      ? `Linked to ${shortForm.join(", ")} — the short-form channels.`
      : "No TikTok, Instagram or YouTube link found. These are where short-form video reach is, and a demo of the product doing the thing is usually the cheapest asset to make from what you already have.",
  );

  // `sameAs` is what tells Google and the AI crawlers that these accounts are yours —
  // it is the difference between having profiles and being known to have them.
  const sameAs = /"sameAs"\s*:/.test(html);
  add(
    "social_schema_sameas",
    "Profiles declared in structured data",
    sameAs || linked.length === 0 ? "PASS" : "WARN",
    sameAs
      ? "Organization schema declares sameAs — search engines and AI crawlers can tie the profiles to the brand."
      : "Profiles are linked but not declared in schema.org sameAs, so a crawler cannot confirm the accounts are yours. It is a few lines in the Organization JSON-LD you already have.",
  );

  const shareable =
    /(?:https?:)?\/\/(?:www\.)?(?:twitter|x)\.com\/(?:intent|share)/i.test(html) ||
    /linkedin\.com\/shareArticle/i.test(html) ||
    /facebook\.com\/sharer/i.test(html) ||
    /\bnavigator\.share\b/.test(html) ||
    /aria-label\s*=\s*["'][^"']*\bshare\b/i.test(html);
  add(
    "social_share_affordance",
    "Something to share with",
    shareable ? "PASS" : "WARN",
    shareable
      ? "A share control was found."
      : "No share control found. On a page people are meant to pass on — a case study, a report, a post — a share button measurably beats expecting a copied URL.",
  );

  // Alt text is an accessibility duty first; it also decides what a screen reader and
  // an AI crawler make of an image-heavy page, which is why it sits here too.
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const withAlt = imgs.filter((t) => /\balt\s*=\s*["'][^"']+["']/i.test(t)).length;
  const coverage = imgs.length ? Math.round((withAlt / imgs.length) * 100) : 100;
  add(
    "social_image_alt_coverage",
    "Images carry alt text",
    imgs.length === 0 || coverage >= 80 ? "PASS" : "WARN",
    imgs.length === 0
      ? "No <img> tags on the page."
      : `${withAlt} of ${imgs.length} images have alt text (${coverage}%). Below 80% it is worth a pass — alt text is what a screen reader reads out and what an AI crawler uses to understand an image-led page.`,
  );

  return checks;
}
