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

  // The rest of the share card. Each of these changes what a post LOOKS like.
  ["social_og_type", "Content type declared (og:type)"],
  ["social_og_url", "Canonical share URL (og:url)"],
  ["social_og_locale", "Language declared for the card"],
  ["social_og_image_absolute", "Share image URL is absolute"],
  ["social_og_image_format", "Share image is a format every scraper reads"],
  ["social_og_image_ratio", "Share image is the shape networks crop to"],
  ["social_og_image_alt", "Share image has alt text"],
  ["social_twitter_site", "Card credits your account"],
  ["social_oembed_discovery", "Others can embed this page"],
  ["social_og_canonical_agree", "og:url and canonical agree"],

  // Rich results — structured data that carries marketing copy into search and AI.
  ["social_faq_schema", "FAQ structured data"],
  ["social_aggregate_rating", "Ratings structured data"],
  ["social_video_object_schema", "Video structured data"],
  ["social_org_logo_schema", "Logo declared for the knowledge panel"],
  ["social_speakable_schema", "Content marked up for voice assistants"],
  ["social_person_schema", "A named person behind the content"],

  // Measurement. You cannot improve a channel you cannot see.
  ["social_ad_pixel", "Ad platform pixel installed"],
  ["social_tag_manager", "Tag manager installed"],
  ["social_event_tracking", "Events tracked, not just page views"],
  ["social_consent_mode", "Consent mode for ad measurement"],
  ["social_campaign_landing", "Campaign traffic lands on one canonical page"],

  // The copy itself, measured rather than judged.
  ["social_headline_specific", "Headline says something"],
  ["social_headline_length", "Headline length"],
  ["social_description_distinct", "Search and social copy are written separately"],
  ["social_hero_subhead", "A supporting line under the headline"],
  ["social_title_length", "Page title length"],

  // Distribution beyond the page.
  ["social_app_store_link", "App store links"],
  ["social_community_link", "A community to join"],
  ["social_review_platform", "Third-party review profile"],
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


/** First `<link rel="x">` href, or null. */
function linkHref(html: string, rel: string): string | null {
  const re = new RegExp(`<link[^>]+rel\\s*=\\s*["'][^"']*\\b${rel}\\b[^"']*["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ?? null;
}

/** Text of the first <h1>, tags stripped. */
function firstH1(html: string): string | null {
  const inner = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (inner === undefined) return null;
  const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

/** Every JSON-LD @type on the page, lowercased. */
function schemaTypes(html: string): Set<string> {
  const types = new Set<string>();
  for (const m of html.matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]*")/gi)) {
    for (const t of m[1].matchAll(/"([^"]+)"/g)) types.add(t[1].toLowerCase());
  }
  return types;
}

const GENERIC_HEADLINES = new Set([
  "home", "welcome", "welcome!", "hello", "index", "untitled", "home page",
  "our website", "welcome to our website", "coming soon", "landing page",
]);

/** Ad-platform pixels, by the request each one makes. */
const AD_PIXELS: Array<[string, RegExp]> = [
  ["Meta", /connect\.facebook\.net|fbq\s*\(/i],
  ["TikTok", /analytics\.tiktok\.com|ttq\s*\./i],
  ["LinkedIn", /snap\.licdn\.com|_linkedin_partner_id/i],
  ["Pinterest", /s\.pinimg\.com\/ct|pintrk\s*\(/i],
  ["Reddit", /redditstatic\.com\/ads|rdt\s*\(/i],
  ["X / Twitter", /static\.ads-twitter\.com|twq\s*\(/i],
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


  // ── The rest of the share card ────────────────────────────────────────────
  const ogType = meta(html, "og:type");
  add(
    "social_og_type",
    "Content type declared (og:type)",
    ogType ? "PASS" : "WARN",
    ogType
      ? `og:type is "${ogType}".`
      : "No og:type. Networks default to a generic link; declaring `website` for a marketing page or `article` for a post is what earns the richer article card, with a byline and a date.",
  );

  const ogUrl = meta(html, "og:url");
  const ogUrlAbsolute = !!ogUrl && /^https?:\/\//i.test(ogUrl);
  add(
    "social_og_url",
    "Canonical share URL (og:url)",
    ogUrlAbsolute ? "PASS" : "WARN",
    ogUrlAbsolute
      ? `og:url is set to ${ogUrl}.`
      : ogUrl
        ? `og:url is "${ogUrl}", which is relative. Scrapers do not resolve it, so the card can end up attributed to the wrong address. Use the full https:// URL.`
        : "No og:url. Every variant of this link — with a utm tag, a trailing slash, a tracking parameter — is then treated as a separate page, so likes and shares fragment across them instead of accumulating on one card.",
  );

  const ogLocale = meta(html, "og:locale");
  add(
    "social_og_locale",
    "Language declared for the card",
    ogLocale ? "PASS" : "WARN",
    ogLocale
      ? `og:locale is ${ogLocale}.`
      : "No og:locale. It costs one line and tells a network which audience the card is for.",
  );

  const imageAbsolute = !ogImage || /^(https?:)?\/\//i.test(ogImage);
  add(
    "social_og_image_absolute",
    "Share image URL is absolute",
    imageAbsolute ? "PASS" : "WARN",
    !ogImage
      ? "No share image to check."
      : imageAbsolute
        ? "The share image is an absolute URL, which is what scrapers need."
        : `og:image is "${ogImage}" — a relative path. Most scrapers do not resolve it against the page, so the preview renders with no image at all. This is the commonest reason a card looks broken while the tag is present.`,
  );

  const ext = ogImage?.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? null;
  const awkward = ext === "webp" || ext === "avif" || ext === "svg";
  add(
    "social_og_image_format",
    "Share image is a format every scraper reads",
    !ogImage || !awkward ? "PASS" : "WARN",
    !ogImage
      ? "No share image to check."
      : !ext
        ? "The image URL has no file extension, so the format could not be established from the page."
        : awkward
          ? `The share image is .${ext}. Browsers handle it; several link scrapers do not, and they fall back to no image rather than to a placeholder. JPG or PNG for this one file.`
          : `.${ext} — read by every network.`,
  );

  // A 1200×1200 square passes the SIZE check and is still wrong: every network
  // centre-crops to roughly 1.91:1, so a headline near the top or bottom is cut off.
  const ratio = sized ? w / h : null;
  const ratioOk = ratio === null || (ratio >= 1.7 && ratio <= 2.1);
  add(
    "social_og_image_ratio",
    "Share image is the shape networks crop to",
    ratioOk ? "PASS" : "WARN",
    ratio === null
      ? "The image dimensions are not declared, so the shape could not be established."
      : ratioOk
        ? `${w}×${h} is ${ratio.toFixed(2)}:1 — inside the 1.91:1 every major network crops to.`
        : `${w}×${h} is ${ratio.toFixed(2)}:1, and networks crop to about 1.91:1. Anything near the top or bottom edge — usually the headline or the logo — gets cut. Design at 1200×630.`,
  );

  const ogImageAlt = meta(html, "og:image:alt") ?? meta(html, "twitter:image:alt");
  add(
    "social_og_image_alt",
    "Share image has alt text",
    !ogImage || ogImageAlt ? "PASS" : "WARN",
    !ogImage
      ? "No share image to describe."
      : ogImageAlt
        ? "og:image:alt is set."
        : "No og:image:alt. On a platform where the image IS the post, a screen-reader user gets nothing from it.",
  );

  const twitterSite = meta(html, "twitter:site") ?? meta(html, "twitter:creator");
  add(
    "social_twitter_site",
    "Card credits your account",
    twitterSite ? "PASS" : "WARN",
    twitterSite
      ? `The card credits ${twitterSite}.`
      : "No twitter:site or twitter:creator. When someone else shares your page the card carries no attribution back to your account, so the reach does not accrue to you.",
  );

  const oembed = /application\/(json|xml)\+oembed/i.test(html);
  add(
    "social_oembed_discovery",
    "Others can embed this page",
    oembed ? "PASS" : "WARN",
    oembed
      ? "An oEmbed endpoint is advertised."
      : "No oEmbed discovery link. With one, Notion, Slack, WordPress and Substack render your page as a proper embed rather than a plain link — which is worth having on anything you want quoted.",
  );

  const canonical = linkHref(html, "canonical");
  const agree =
    !ogUrl || !canonical || ogUrl.replace(/\/+$/, "") === canonical.replace(/\/+$/, "");
  add(
    "social_og_canonical_agree",
    "og:url and canonical agree",
    agree ? "PASS" : "WARN",
    !ogUrl || !canonical
      ? "Only one of og:url and canonical is set, so they cannot disagree."
      : agree
        ? "og:url and the canonical link point at the same address."
        : `og:url says ${ogUrl} and canonical says ${canonical}. Search and social are being told different things about which address is the real one, which splits the page's reputation in two.`,
  );

  // ── Rich results ──────────────────────────────────────────────────────────
  const types = schemaTypes(html);
  const hasType = (...names: string[]) => names.some((n) => types.has(n));

  add(
    "social_faq_schema",
    "FAQ structured data",
    hasType("faqpage", "question") ? "PASS" : "WARN",
    hasType("faqpage", "question")
      ? "FAQPage markup found."
      : "No FAQPage markup. If the page already answers questions, marking them up is what gets them quoted directly in search results and by AI assistants — the same copy, more surface.",
  );

  add(
    "social_aggregate_rating",
    "Ratings structured data",
    hasType("aggregaterating", "review") ? "PASS" : "WARN",
    hasType("aggregaterating", "review")
      ? "Rating or review markup found."
      : "No AggregateRating markup. If you have real ratings, marking them up puts stars beside your result. Only mark up ratings you actually hold — Google penalises invented ones.",
  );

  add(
    "social_video_object_schema",
    "Video structured data",
    hasType("videoobject") ? "PASS" : "WARN",
    hasType("videoobject")
      ? "VideoObject markup found."
      : "No VideoObject markup. If there is a video on the page, this is what makes it eligible for the video carousel and gives it a thumbnail in results.",
  );

  const orgLogo = /"@type"\s*:\s*"Organization"[\s\S]{0,600}?"logo"\s*:/i.test(html);
  add(
    "social_org_logo_schema",
    "Logo declared for the knowledge panel",
    orgLogo ? "PASS" : "WARN",
    orgLogo
      ? "Organization schema declares a logo."
      : "No logo in Organization schema. This is the image Google uses in a knowledge panel and beside your results; without it the slot is filled with whatever it picks.",
  );

  add(
    "social_speakable_schema",
    "Content marked up for voice assistants",
    /"speakable"/i.test(html) ? "PASS" : "WARN",
    /"speakable"/i.test(html)
      ? "speakable markup found."
      : "No speakable markup. It names the sentences an assistant should read aloud — worth a line on anything news- or answer-shaped, and ignored harmlessly everywhere else.",
  );

  add(
    "social_person_schema",
    "A named person behind the content",
    hasType("person") ? "PASS" : "WARN",
    hasType("person")
      ? "Person markup found."
      : "No Person markup. Search engines weigh named, attributable authorship, and so do readers — an unsigned page is the weakest version of the same words.",
  );

  // ── Measurement ───────────────────────────────────────────────────────────
  const pixels = AD_PIXELS.filter(([, re]) => re.test(html)).map(([n]) => n);
  add(
    "social_ad_pixel",
    "Ad platform pixel installed",
    pixels.length > 0 ? "PASS" : "WARN",
    pixels.length > 0
      ? `Pixels found: ${pixels.join(", ")}.`
      : "No ad-platform pixel. If you never intend to run paid social this is correct and you can ignore it — but a pixel installed today is an audience you can retarget in six months, and one installed the day you start advertising is not.",
  );

  const tagManager = /googletagmanager\.com\/gtm\.js|segment\.(com|io)\/analytics\.js|analytics\.js/i.test(html);
  add(
    "social_tag_manager",
    "Tag manager installed",
    tagManager ? "PASS" : "WARN",
    tagManager
      ? "A tag manager was found."
      : "No tag manager. Without one, every new tracking tag is a code change and a deploy, which is the reason marketing tags end up not being added at all.",
  );

  const events = /gtag\s*\(\s*["']event["']|dataLayer\.push|\bposthog\.capture|\bmixpanel\.track|\bplausible\s*\(/i.test(html);
  add(
    "social_event_tracking",
    "Events tracked, not just page views",
    events ? "PASS" : "WARN",
    events
      ? "Event tracking calls were found."
      : "No event tracking on this page — only page views, if anything. Page views cannot tell you which campaign produced a signup, which is the one question the spend depends on.",
  );

  const consentMode = /consent["']\s*,\s*["'](default|update)|gtag\s*\(\s*["']consent/i.test(html);
  add(
    "social_consent_mode",
    "Consent mode for ad measurement",
    !pixels.length || consentMode ? "PASS" : "WARN",
    !pixels.length
      ? "No ad pixel, so consent mode does not apply yet."
      : consentMode
        ? "Consent mode calls were found."
        : "Ad pixels are installed but no consent-mode signal was found. In the EEA and UK, ad platforms need the consent state to model conversions — without it a large share of your measured conversions simply disappear, and the campaign looks worse than it is.",
  );

  const canonicalClean = !canonical || !canonical.includes("?");
  add(
    "social_campaign_landing",
    "Campaign traffic lands on one canonical page",
    canonicalClean ? "PASS" : "WARN",
    canonicalClean
      ? "The canonical URL carries no query string."
      : `The canonical URL includes a query string (${canonical}). Every campaign variant then reads as a different page, so the reputation and the analytics for one landing page are split across all of them.`,
  );

  // ── The copy, measured rather than judged ─────────────────────────────────
  const h1 = firstH1(html);
  const h1Generic = !!h1 && GENERIC_HEADLINES.has(h1.toLowerCase());
  add(
    "social_headline_specific",
    "Headline says something",
    h1 && !h1Generic ? "PASS" : "WARN",
    !h1
      ? "No <h1>. The headline is the one line every visitor reads and the one search engines weight most; a page without one is arguing its case in the subheadings."
      : h1Generic
        ? `The headline is "${h1}", which says nothing about what this is. Name the thing it does — a visitor deciding in two seconds has only this line.`
        : `"${h1.slice(0, 80)}"`,
  );

  const h1Len = h1?.length ?? 0;
  add(
    "social_headline_length",
    "Headline length",
    !h1 || (h1Len >= 12 && h1Len <= 90) ? "PASS" : "WARN",
    !h1
      ? "No headline to measure."
      : h1Len < 12
        ? `The headline is ${h1Len} characters — too short to carry a claim.`
        : h1Len > 90
          ? `The headline is ${h1Len} characters. Past about 90 it stops being a headline and starts being a paragraph, and on a phone it fills the first screen on its own.`
          : `${h1Len} characters.`,
  );

  const metaDesc = meta(html, "description");
  const distinct =
    !metaDesc || !ogDesc || metaDesc.trim() !== ogDesc.trim();
  add(
    "social_description_distinct",
    "Search and social copy are written separately",
    distinct ? "PASS" : "WARN",
    !metaDesc || !ogDesc
      ? "Only one of the meta description and og:description is set, so they cannot be duplicates."
      : distinct
        ? "The search and social descriptions differ."
        : "The meta description and og:description are identical. They are read in different places by people in different frames of mind — one is answering a search, the other is deciding whether to click a link a colleague posted. The same sentence rarely does both well.",
  );

  const subhead = /<h1\b[^>]*>[\s\S]*?<\/h1>\s*(?:<[^>]+>\s*){0,3}<(?:h2|p)\b/i.test(html);
  add(
    "social_hero_subhead",
    "A supporting line under the headline",
    !h1 || subhead ? "PASS" : "WARN",
    !h1
      ? "No headline, so nothing to support."
      : subhead
        ? "A subheading or paragraph follows the headline."
        : "Nothing follows the headline directly. A headline states the claim and the line under it is where the claim gets made specific — without it the page asks the visitor to scroll before it has said anything.",
  );

  const pageTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
  const pageTitleLen = pageTitle?.length ?? 0;
  add(
    "social_title_length",
    "Page title length",
    pageTitle && pageTitleLen >= 15 && pageTitleLen <= 60 ? "PASS" : "WARN",
    !pageTitle
      ? "No <title>. It is the link text in search results, the browser tab, and the fallback headline in a share card."
      : pageTitleLen > 60
        ? `The title is ${pageTitleLen} characters and Google truncates near 60 — so the part that gets cut is the end, which is usually where the brand name sits.`
        : pageTitleLen < 15
          ? `The title is ${pageTitleLen} characters, which is too short to carry both what this is and whose it is.`
          : `${pageTitleLen} characters.`,
  );

  // ── Distribution beyond the page ──────────────────────────────────────────
  const appStore =
    /apps\.apple\.com|itunes\.apple\.com/i.test(html) ||
    /play\.google\.com\/store\/apps/i.test(html);
  add(
    "social_app_store_link",
    "App store links",
    appStore ? "PASS" : "WARN",
    appStore
      ? "App store links found."
      : "No App Store or Play Store link. If there is no app this does not apply — if there is, the website is where most people go looking for it.",
  );

  const community =
    /discord\.(gg|com\/invite)|(?:slack\.com\/join|join\.slack\.com)|t\.me\/|reddit\.com\/r\//i.test(html);
  add(
    "social_community_link",
    "A community to join",
    community ? "PASS" : "WARN",
    community
      ? "A community link was found."
      : "No community link (Discord, Slack, Telegram, a subreddit). Not every product needs one — for a developer tool it is usually the highest-retention channel there is, and it costs nothing to point at.",
  );

  const reviews = /g2\.com\/products|capterra\.|trustpilot\.com|producthunt\.com|getapp\.com|softwareadvice\./i.test(html);
  add(
    "social_review_platform",
    "Third-party review profile",
    reviews ? "PASS" : "WARN",
    reviews
      ? "A third-party review profile is linked."
      : "No link to G2, Capterra, Trustpilot or Product Hunt. A testimonial on your own site is a claim; the same words on a platform you do not control are evidence, and buyers check.",
  );

  return checks;
}
