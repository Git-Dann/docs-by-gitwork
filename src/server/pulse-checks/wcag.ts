import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, skip, platformIs } from "./_types";
import { focusIndicatorVerdict, htmlLangVerdict, inlineContrastVerdict } from "./wcag-page-evidence";

/** Blank every quoted attribute value, so text inside a value ("Intro, muted by default", class="hidden")
 *  is never read as an attribute name. `alt="x"` becomes `alt=`. */
export function attributeNames(tag: string): string {
  return tag.replace(/=\s*("[^"]*"|'[^']*')/g, "=");
}

/** True when the tag carries the boolean/valued attribute `name` itself (not `data-name`, not inside a value). */
export function hasAttribute(tag: string, name: string): boolean {
  return new RegExp(`\\s${name}(?=[\\s>=/])`, "i").test(attributeNames(tag));
}

/** The value of attribute `name` on the tag, or null when absent. `\s` prefix so data-<name> does not count. */
function attributeValue(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, "i"));
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

/** A non-empty aria-label / aria-labelledby / (optionally) title on the tag. */
function hasProgrammaticName(tag: string, includeTitle = false): boolean {
  const filled = (name: string) => (attributeValue(tag, name) ?? "").trim().length > 0;
  return filled("aria-label") || filled("aria-labelledby") || (includeTitle && filled("title"));
}

/** The tag's inline style hides it (display:none / visibility:hidden), matched at a property boundary
 *  so a custom property such as `--m-display:none` does not count. */
export function inlineStyleHides(tag: string): boolean {
  const style = attributeValue(tag, "style");
  if (!style) return false;
  return /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(style);
}

function isAriaHidden(tag: string): boolean {
  return (attributeValue(tag, "aria-hidden") ?? "").trim().toLowerCase() === "true";
}

/** True when any <video> autoplays without `muted`, judged per tag with attributes in any order. */
export function hasUnmutedAutoplayVideo(html: string): boolean {
  const tags = html.match(/<video\b[^>]*>/gi) ?? [];
  return tags.some((t) => hasAttribute(t, "autoplay") && !hasAttribute(t, "muted"));
}

/**
 * Links whose whole visible text is generic ("read more", "here") AND that carry no
 * aria-label / aria-labelledby. A non-empty aria-label replaces the visible text as the
 * accessible name, so `<a aria-label="Read more about pricing">Read more</a>` is fine.
 */
export function genericLinkTexts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>\s*(click here|here|more|read more|learn more|link|go)\s*<\/a>/gi)) {
    if (hasProgrammaticName(`<a ${m[1]}>`)) continue;
    out.push(m[2]);
  }
  return out;
}

/** Titles scaffolding tools ship with — identical across every page that keeps them. */
const PLACEHOLDER_TITLES = /^(react app|vite \+ react( \+ ts)?|vite app|document|untitled|home|index|my app|create next app|next\.js|welcome to nginx!?|new tab)$/i;

/**
 * page_title_unique. Uniqueness needs the site's OTHER pages, which a one-page scan has
 * not read — so a real-looking title is INCONCLUSIVE, never a PASS. Only what this page
 * proves on its own is a verdict: no title at all, or a scaffolding placeholder that is,
 * by construction, the same on every page.
 */
export function pageTitleVerdict(rawTitle: string): { status: "WARN" | "INCONCLUSIVE"; detail: string } {
  const title = rawTitle.replace(/\s+/g, " ").trim();
  if (!title) return { status: "WARN", detail: "No page title — WCAG 2.4.2 requires every page to have a title that describes its topic or purpose." };
  if (PLACEHOLDER_TITLES.test(title)) {
    return { status: "WARN", detail: `The page title is a framework placeholder ("${title}"), so it is the same on every page that keeps it — WCAG 2.4.2 requires a title that describes this page.` };
  }
  return { status: "INCONCLUSIVE", detail: `Page title: "${title}". Whether it is unique needs the site's other pages, which a single-page scan does not read.` };
}

export async function runWcagChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { pageResult } = ctx;
  const html = pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "DESKTOP_APP")) {
    return skip(CATEGORIES.ACCESSIBILITY, [
      ["skip_to_main_content", "Skip to main content link"],
      ["image_input_alt", "<input type=image> has alt text"],
      ["video_captions", "Video has captions track"],
      ["form_labels_present", "<label> for every <input>"],
      ["form_error_identification", "Form errors identify the field"],
      ["keyboard_focus_visible", ":focus-visible CSS present"],
      ["touch_target_size", "Sufficient touch target sizing"],
      ["no_autoplay_audio", "No autoplay audio without controls"],
      ["no_autoplay_video", "No autoplay video without controls"],
      ["session_timeout_warning", "Session timeout warning"],
      ["valid_html_parsing", "No obvious HTML parsing errors"],
      ["aria_roles_valid", "ARIA landmark roles used"],
      ["aria_live_regions", "aria-live for dynamic content"],
      ["prefers_reduced_motion", "prefers-reduced-motion CSS"],
      ["prefers_high_contrast", "prefers-contrast CSS"],
      ["sufficient_colour_contrast", "No obvious low-contrast inline styles"],
      ["text_spacing_supported", "Letter/word spacing not fixed"],
      ["link_purpose_clear", "Links have descriptive text"],
      ["page_title_unique", "Unique page title"],
      ["language_attribute_body", "lang attribute on <html> element"],
      ["wcag22_dragging_alternative", "Dragging movements have an alternative (WCAG 2.5.7)"],
      ["wcag22_consistent_help", "Consistent help mechanism (WCAG 3.2.6)"],
      ["accessibility_statement_eaa", "Accessibility statement (EU Accessibility Act)"],
      ["images_have_alt", "Informative images have alternative text"],
      ["buttons_have_names", "Buttons have accessible names"],
      ["iframes_have_titles", "Embedded frames have descriptive titles"],
      ["dialogs_have_names", "Dialogs have accessible names"],
      ["aria_hidden_not_focusable", "aria-hidden content contains no focusable controls"],
    ], "Not applicable for non-web interfaces.");
  }

  // Decorative images may deliberately use alt=""; every other image needs a
  // programmatic alternative (WCAG 1.1.1).
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  // A bare `alt` is an empty alt; `data-alt` is not an alt. Images removed from the accessibility
  // tree (aria-hidden, role=presentation/none, display:none / visibility:hidden tracking pixels)
  // or named by a non-empty aria-label/aria-labelledby need no alt attribute.
  const imagesWithoutAlt = images.filter((image) =>
    !hasAttribute(image, "alt")
    && !hasProgrammaticName(image)
    && !isAriaHidden(image)
    && !/^(?:presentation|none)$/i.test((attributeValue(image, "role") ?? "").trim())
    && !inlineStyleHides(image));
  checks.push({
    category: CATEGORIES.ACCESSIBILITY, checkKey: "images_have_alt", label: "Informative images have alternative text",
    status: imagesWithoutAlt.length === 0 ? "PASS" : "FAIL",
    detail: imagesWithoutAlt.length === 0 ? (images.length === 0 ? "No image elements detected." : `All ${images.length} image element(s) declare an alt attribute.`) : `${imagesWithoutAlt.length} of ${images.length} image element(s) have no alt attribute. Add meaningful alternatives for informative images and alt=\"\" only for decoration (WCAG 1.1.1).`,
    evidence: imagesWithoutAlt.length ? imagesWithoutAlt.slice(0, 3).join("\n").slice(0, 500) : undefined,
  });

  // Icon-only controls are especially easy to ship without an accessible name.
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? [];
  const unnamedButtons = buttons.filter((button) => {
    // An aria-hidden button is outside the accessibility tree and needs no name; whether it is
    // focusable is reported separately by aria_hidden_not_focusable.
    if (isAriaHidden(button.match(/^<button\b[^>]*>/i)?.[0] ?? "")) return false;
    if (/\baria-(?:label|labelledby)\s*=|\btitle\s*=/i.test(button)) return false;
    return button.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").trim().length === 0;
  });
  checks.push({
    category: CATEGORIES.ACCESSIBILITY, checkKey: "buttons_have_names", label: "Buttons have accessible names",
    status: unnamedButtons.length === 0 ? "PASS" : "FAIL",
    detail: unnamedButtons.length === 0 ? (buttons.length === 0 ? "No button elements detected." : "Every button has visible text or an explicit accessible name.") : `${unnamedButtons.length} button(s) contain no text, aria-label, aria-labelledby, or title. Give icon-only controls a programmatic name (WCAG 4.1.2).`,
    evidence: unnamedButtons.length ? unnamedButtons.slice(0, 3).join("\n").slice(0, 500) : undefined,
  });

  const frames = html.match(/<iframe\b[^>]*>/gi) ?? [];
  // Frames that are display:none / visibility:hidden / aria-hidden (e.g. the GTM <noscript> iframe)
  // are never exposed to assistive technology and need no title.
  const untitledFrames = frames.filter((frame) => !(attributeValue(frame, "title") ?? "").trim() && !isAriaHidden(frame) && !inlineStyleHides(frame));
  checks.push({
    category: CATEGORIES.ACCESSIBILITY, checkKey: "iframes_have_titles", label: "Embedded frames have descriptive titles",
    status: untitledFrames.length === 0 ? "PASS" : "WARN",
    detail: untitledFrames.length === 0 ? (frames.length === 0 ? "No iframe elements detected." : "Every embedded frame has a non-empty title.") : `${untitledFrames.length} embedded frame(s) have no descriptive title. Screen-reader users need the title to decide whether to enter an embedded document (WCAG 4.1.2).`,
    evidence: untitledFrames.length ? untitledFrames.slice(0, 3).join("\n").slice(0, 500) : undefined,
  });

  const dialogs = html.match(/<(?:dialog\b|[^>]+\brole=["']dialog["'][^>]*)>/gi) ?? [];
  const unnamedDialogs = dialogs.filter((dialog) => !/\baria-(?:label|labelledby)\s*=|\btitle\s*=/i.test(dialog));
  checks.push({
    category: CATEGORIES.ACCESSIBILITY, checkKey: "dialogs_have_names", label: "Dialogs have accessible names",
    status: unnamedDialogs.length === 0 ? "PASS" : "FAIL",
    detail: unnamedDialogs.length === 0 ? (dialogs.length === 0 ? "No dialog elements detected." : "Every dialog has an accessible name.") : `${unnamedDialogs.length} dialog(s) have no aria-label, aria-labelledby, or title. A modal must announce its purpose before a user can decide how to proceed (WCAG 4.1.2).`,
    evidence: unnamedDialogs.length ? unnamedDialogs.slice(0, 3).join("\n").slice(0, 500) : undefined,
  });

  const hiddenBlocks = html.match(/<([a-z][\w-]*)\b[^>]*\saria-hidden\s*=\s*(?:"\s*true\s*"|'\s*true\s*'|true(?=[\s/>]))[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  const hiddenFocusable = hiddenBlocks.filter((block) => {
    const openingTag = block.match(/^<[^>]*>/)?.[0] ?? "";
    // A hidden / inert / display:none container takes its descendants out of the tab order too.
    if (hasAttribute(openingTag, "hidden") || hasAttribute(openingTag, "inert") || inlineStyleHides(openingTag)) return false;
    const focusableTags = block.match(/<(?:a\b[^>]*\bhref\s*=|button\b|input\b(?![^>]*\btype=["']hidden)|select\b|textarea\b|[a-z][\w-]*\b[^>]*\btabindex\s*=\s*["']?\d)[^>]*>/gi) ?? [];
    return focusableTags.some((tag) => {
      // tabindex="-1" cannot be reached with Tab.
      if (/^-\d/.test((attributeValue(tag, "tabindex") ?? "").trim())) return false;
      // `disabled` only removes form controls from the tab order; on <a> or a tabindex element it does nothing.
      if (/^<(?:button|input|select|textarea)\b/i.test(tag) && hasAttribute(tag, "disabled")) return false;
      return true;
    });
  });
  checks.push({
    category: CATEGORIES.ACCESSIBILITY, checkKey: "aria_hidden_not_focusable", label: "aria-hidden content contains no focusable controls",
    status: hiddenFocusable.length === 0 ? "PASS" : "FAIL",
    detail: hiddenFocusable.length === 0 ? "No focusable control was found inside aria-hidden content." : `${hiddenFocusable.length} aria-hidden region(s) contain controls that are focusable in the page markup. Unless a stylesheet hides them (display:none or visibility:hidden), keyboard users can land on controls that screen readers are instructed to ignore; remove the control from tab order or do not hide its parent (WCAG 4.1.2).`,
    evidence: hiddenFocusable.length ? hiddenFocusable.slice(0, 2).join("\n").slice(0, 500) : undefined,
  });

  // Skip to main content
  const hasSkipLink = /href=["']#(main|content|skip|maincontent)/i.test(html) || /skip.*to.*main|skip.*navigation/i.test(html)
    // Any in-page anchor whose text starts with "Skip" (e.g. WordPress: href="#wp--skip-link--target">Skip to content).
    || /<a\b[^>]*\bhref=["']#[^"']+["'][^>]*>\s*(?:<[^>]+>\s*)*skip\b/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "skip_to_main_content", label: "Skip to main content link", status: hasSkipLink ? "PASS" : "WARN", detail: hasSkipLink ? "Skip to main content link detected — keyboard users can bypass repetitive navigation." : "No skip navigation link detected — add a 'Skip to main content' link as the first focusable element (WCAG 2.4.1 Bypass Blocks)." });

  // Image input alt
  const imgInputs = html.match(/<input[^>]+type=["']image["'][^>]*>/gi) ?? [];
  const imgInputsWithAlt = imgInputs.filter((t) => /alt=/i.test(t)).length;
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "image_input_alt", label: "<input type=image> has alt text", status: imgInputs.length === 0 || imgInputsWithAlt === imgInputs.length ? "PASS" : "FAIL", detail: imgInputs.length === 0 ? "No <input type=image> elements found." : imgInputsWithAlt === imgInputs.length ? "All image inputs have alt text." : `${imgInputs.length - imgInputsWithAlt} image input(s) missing alt text — WCAG 1.1.1 requires all functional images to have descriptive alternative text.` });

  // Video captions
  // WCAG 1.2.2 covers media with audio. A video that is muted and offers no controls exposes no
  // audio to the user (decorative hero loops), so there is nothing to caption — unless the page
  // has its own mute/sound/volume control, in which case audio may be reachable and every video stays in scope.
  const allVideoEls = html.match(/<video[^>]*>[\s\S]*?<\/video>/gi) ?? [];
  const controlMarkup = [...buttons, ...(html.match(/<[a-z][\w-]*\b[^>]*\srole=["']button["'][^>]*>/gi) ?? [])].join("\n");
  // Script-built players (video.js, Plyr, MediaElement, JW Player…) render their mute/volume controls at
  // runtime, so they are absent from the HTML; an unmute/volume hook anywhere in the markup counts too.
  const pageHasSoundControl = /\b(?:un-?mute|mute|sound|volume|audio)\b/i.test(controlMarkup)
    || /\b(?:un-?mute|volume)\b/i.test(html)
    || /video[.-]?js|\bvjs-|\bplyr\b|mediaelement|jwplayer|\bmux-player\b|\bmedia-chrome\b/i.test(html);
  const videoEls = pageHasSoundControl ? allVideoEls : allVideoEls.filter((v) => {
    const open = v.match(/<video\b[^>]*>/i)?.[0] ?? "";
    return !(hasAttribute(open, "muted") && !hasAttribute(open, "controls"));
  });
  const silentVideoCount = allVideoEls.length - videoEls.length;
  const videosWithCaptions = videoEls.filter((v) => /kind=["']captions["']/i.test(v)).length;
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "video_captions", label: "Video has captions track", status: videoEls.length === 0 ? "PASS" : videosWithCaptions >= videoEls.length * 0.8 ? "PASS" : "WARN", detail: videoEls.length === 0 ? (silentVideoCount > 0 ? `${silentVideoCount} muted video(s) without a controls attribute and no mute/volume control in the page markup — these appear decorative, so captions (WCAG 1.2.2) were not required. If script adds an unmute control, the video needs captions.` : "No <video> elements detected.") : videosWithCaptions >= videoEls.length ? "All videos have caption tracks." : `${videoEls.length - videosWithCaptions} video(s) missing caption track — WCAG 1.2.2 requires captions for all prerecorded video content.` });

  // Form labels
  const inputs = html.match(/<input(?![^>]+type=["'](hidden|submit|button|reset|image|checkbox|radio)["'])[^>]+id=["']([^"']+)["'][^>]*>/gi) ?? [];
  // A <label for> only labels the input whose id it names; an input nested inside a <label> is labelled
  // implicitly; a non-empty aria-label / aria-labelledby / title is a programmatic label as well.
  const labelledIds = new Set(Array.from(html.matchAll(/<label\b[^>]*\sfor=["']([^"']+)["']/gi), (match) => match[1]));
  const implicitlyLabelled = new Set((html.match(/<label\b[^>]*>[\s\S]*?<\/label>/gi) ?? []).flatMap((label) => label.match(/<input\b[^>]*>/gi) ?? []));
  const unlabelledInputs = inputs.filter((input) => !hasProgrammaticName(input, true)
    && !labelledIds.has(attributeValue(input, "id") ?? "")
    && !implicitlyLabelled.has(input));
  const hasGoodLabels = inputs.length === 0 || unlabelledInputs.length <= inputs.length * 0.2;
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "form_labels_present", label: "<label> for every <input>", status: hasGoodLabels ? "PASS" : "WARN", detail: hasGoodLabels ? "Form inputs appear to have associated labels." : `${unlabelledInputs.length} of ${inputs.length} input(s) have no matching <label for>, wrapping <label>, aria-label, aria-labelledby, or title — WCAG 1.3.1 requires programmatic labels for all form controls.` });

  // Form error identification
  const hasForms = /<form[^>]*>/i.test(html);
  const hasErrorMessages = /role=["']alert["']|aria-invalid|aria-describedby.*error|class=["'][^"']*error/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "form_error_identification", label: "Form errors identify the field", status: !hasForms ? "PASS" : hasErrorMessages ? "PASS" : "WARN", detail: !hasForms ? "No forms detected." : hasErrorMessages ? "Error identification signals detected (aria-invalid, role=alert, or error classes)." : "Forms detected but no error identification patterns — WCAG 3.3.1 requires identifying which field caused an error in a text description." });

  // Focus visible
  // Reads what the page's CSS does to focus: `:focus{outline:none}` REMOVES the indicator
  // and used to pass because it contains "outline" (see wcag-page-evidence.ts).
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "keyboard_focus_visible", label: "Visible keyboard focus indicator", ...focusIndicatorVerdict(html) });

  // Touch target size (check for min-height/min-width patterns ≥ 44px)
  const hasTouchTargets = /min-height:\s*(4[4-9]|[5-9]\d|\d{3})px|min-width:\s*(4[4-9]|[5-9]\d|\d{3})px|h-\d+\s+w-\d+/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "touch_target_size", label: "Sufficient touch target sizing", status: hasTouchTargets ? "PASS" : "WARN", detail: hasTouchTargets ? "Touch target size CSS patterns detected." : "No explicit touch target size constraints detected — WCAG 2.5.8 recommends a minimum 24×24px target, Apple HIG recommends 44×44pt." });

  // No autoplay audio
  const hasAutoplayAudio = /<audio[^>]+autoplay/i.test(html) || /<source[^>]*autoplay/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "no_autoplay_audio", label: "No autoplay audio without controls", status: hasAutoplayAudio ? "WARN" : "PASS", detail: hasAutoplayAudio ? "Autoplay audio detected — WCAG 1.4.2 requires providing a mechanism to pause, stop, or control the volume of audio that plays automatically." : "No autoplay audio detected." });

  // No autoplay video
  // Per <video> tag, attributes in any order: `<video muted autoplay>` is as muted as
  // `<video autoplay muted>` (the old test only accepted the second).
  const hasAutoplayVideo = hasUnmutedAutoplayVideo(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "no_autoplay_video", label: "No autoplay video without controls", status: hasAutoplayVideo ? "WARN" : "PASS", detail: hasAutoplayVideo ? "Autoplay video without muted attribute detected — WCAG 1.4.2 requires a mechanism to pause or stop autoplaying media." : "No problematic autoplay video detected." });

  // Session timeout warning
  const hasTimeoutWarning = /session.*expir|timeout.*warning|session.*timeout.*warn|you.*be.*logged.*out/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "session_timeout_warning", label: "Session timeout warning", status: ctx.ctx.isAuthEnabled ? (hasTimeoutWarning ? "PASS" : "WARN") : "PASS", detail: ctx.ctx.isAuthEnabled ? (hasTimeoutWarning ? "Session timeout warning detected." : "Authenticated app detected but no session timeout warning — WCAG 2.2.1 requires warning users before a session expires and giving them a way to extend it.") : "Not applicable — no auth detected." });

  // HTML parsing errors (basic check for unclosed tags)
  const unclosedDiv = (html.match(/<div/gi) ?? []).length;
  const closedDiv = (html.match(/<\/div>/gi) ?? []).length;
  const divMismatch = Math.abs(unclosedDiv - closedDiv) > 5;
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "valid_html_parsing", label: "No obvious HTML parsing errors", status: divMismatch ? "WARN" : "PASS", detail: divMismatch ? `Significant div tag imbalance detected (${unclosedDiv} open, ${closedDiv} close) — malformed HTML can cause screen readers to misinterpret page structure.` : "HTML tag structure appears balanced." });

  // ARIA landmark roles
  const hasLandmarks = /role=["'](main|navigation|banner|contentinfo|complementary|search|region)["']/i.test(html) || /<main[^>]*>|<nav[^>]*>|<header[^>]*>|<footer[^>]*>/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "aria_roles_valid", label: "ARIA landmark roles used", status: hasLandmarks ? "PASS" : "WARN", detail: hasLandmarks ? "ARIA landmark roles or HTML5 landmark elements detected — screen reader users can navigate by landmarks." : "No ARIA landmark roles detected — WCAG 1.3.6 recommends using landmark roles (main, nav, header, footer) to help screen reader users navigate." });

  // aria-live regions
  const hasAriaLive = /aria-live=["'](polite|assertive)["']/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "aria_live_regions", label: "aria-live for dynamic content", status: hasAriaLive ? "PASS" : "WARN", detail: hasAriaLive ? "aria-live regions detected — dynamic content updates are announced to screen readers." : "No aria-live regions detected — for apps with dynamic content updates (notifications, toasts, form errors), use aria-live=\"polite\" to announce changes to screen reader users." });

  // prefers-reduced-motion
  const hasPrefersReducedMotion = /prefers-reduced-motion/i.test(html);
  // Only the page HTML is read. CSS in linked or @import-ed stylesheets is not fetched, so an absence
  // in the HTML alone is not evidence that the media query is missing.
  const hasExternalCss = /<link\b[^>]*\srel=["']?[^"'>]*\bstylesheet\b/i.test(html) || /<link\b[^>]*\sas=["']?style\b/i.test(html) || /@import\s+(?:url\(|["'])/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "prefers_reduced_motion", label: "prefers-reduced-motion CSS media query", status: hasPrefersReducedMotion ? "PASS" : hasExternalCss ? "INCONCLUSIVE" : "WARN", detail: hasPrefersReducedMotion ? "prefers-reduced-motion media query detected — animations respect the user's OS motion preference." : hasExternalCss ? "No prefers-reduced-motion media query in the page HTML; linked or imported stylesheets were not inspected, so support for the OS reduced-motion preference could not be determined (WCAG 2.3.3)." : "No prefers-reduced-motion media query — users who experience motion sickness or vestibular disorders need a way to reduce animations (WCAG 2.3.3)." });

  // prefers-contrast
  const hasPrefersContrast = /prefers-contrast/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "prefers_high_contrast", label: "prefers-contrast CSS media query", status: hasPrefersContrast ? "PASS" : "WARN", detail: hasPrefersContrast ? "prefers-contrast media query detected — layout adapts to high-contrast OS preference." : "No prefers-contrast media query — consider supporting this CSS media query to improve usability for users with low vision." });

  // Low contrast inline styles (very basic check)
  // Computes the WCAG ratio for colour pairs set inline; stylesheet colours need a render.
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "sufficient_colour_contrast", label: "Inline colour pairs meet 4.5:1 contrast", ...inlineContrastVerdict(html) });

  // Text spacing
  // Authored spacing values (letter-spacing:0px is simply the default) do not fail 1.4.12. The only
  // static signal that hinders a user override is inline !important spacing, which text-spacing
  // bookmarklets/extensions cannot beat.
  const hasFixedSpacing = /\bstyle\s*=\s*["'](?:[^"']*[;\s])?(?:letter-spacing|word-spacing|line-height)\s*:[^;"']*!important/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "text_spacing_supported", label: "Letter/word spacing not fixed", status: hasFixedSpacing ? "WARN" : "PASS", detail: hasFixedSpacing ? "Inline !important letter/word/line spacing detected — text-spacing adjustments applied by browser extensions or bookmarklets cannot override these elements (WCAG 1.4.12)." : "No inline !important spacing that would block user text-spacing overrides detected." });

  // Link purpose
  const genericLinks = genericLinkTexts(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "link_purpose_clear", label: "Links have descriptive text", status: genericLinks.length === 0 ? "PASS" : "WARN", detail: genericLinks.length === 0 ? "No generic link text detected." : `${genericLinks.length} link(s) with generic text (\"here\", \"read more\") detected — this meets WCAG 2.4.4 (AA) only if the surrounding sentence, paragraph or list item explains the destination; link text that describes its purpose on its own is WCAG 2.4.9 (AAA).` });

  // Page title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch?.[1] ?? "";
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "page_title_unique", label: "Unique page title", ...pageTitleVerdict(pageTitle) });

  // Language attribute on html element
  // Unquoted `lang=en` is valid HTML and used to FAIL here.
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "language_attribute_body", label: "lang attribute on <html> element", ...htmlLangVerdict(html) });

  // ─── WCAG 2.2 (2023) new success criteria ────────────────────────────────────

  // 2.5.7 Dragging Movements — drag interactions must have a single-pointer alternative.
  const hasDraggable = /draggable=["']true["']|@dnd-kit|react-beautiful-dnd|sortablejs|use-?draggable|on(drag|DragStart)/i.test(html);
  const hasDragAlternative = /move (up|down)|reorder.*button|use (the )?arrow keys|keyboard.*reorder/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "wcag22_dragging_alternative", label: "Dragging movements have an alternative (WCAG 2.5.7)", status: !hasDraggable ? "PASS" : hasDragAlternative ? "PASS" : "WARN", detail: !hasDraggable ? "No drag-and-drop interactions detected." : hasDragAlternative ? "Drag interactions detected with a single-pointer/keyboard alternative." : "Drag-and-drop detected but no obvious single-pointer alternative — WCAG 2.2 (2.5.7) requires any dragging movement to also be operable with a single pointer (e.g. up/down buttons)." });

  // 3.2.6 Consistent Help — a help mechanism in a consistent location across pages.
  const hasConsistentHelp = /href=["'][^"']*(help|support|contact)[^"']*["']|intercom|crisp\.chat|zendesk|drift|help.*center|live chat|tawk\.to/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "wcag22_consistent_help", label: "Consistent help mechanism (WCAG 3.2.6)", status: hasConsistentHelp ? "INCONCLUSIVE" : "NOT_APPLICABLE", detail: hasConsistentHelp ? "A help/contact mechanism is present — WCAG 2.2 (3.2.6) is satisfied when it appears in the same relative location on every page that repeats it; cross-page placement is not verified from a single page." : "Not applicable — no help/contact mechanism detected on this page. WCAG 2.2 (3.2.6) only governs where help appears when it is provided; it does not require one." });

  // EU Accessibility Act (in force June 2025) — a published accessibility statement.
  const hasAccessibilityStatement = /accessibility statement|accessibility commitment|href=["'][^"']*accessibility[^"']*["']|we are committed to accessibility|wcag 2\.[12]|en 301 549/i.test(html);
  checks.push({ category: CATEGORIES.ACCESSIBILITY, checkKey: "accessibility_statement_eaa", label: "Accessibility statement (EU Accessibility Act)", status: hasAccessibilityStatement ? "PASS" : "WARN", detail: hasAccessibilityStatement ? "Accessibility statement signals detected — the EU Accessibility Act (in force June 2025) requires a published statement describing conformance and feedback channels." : "No accessibility statement detected — the EU Accessibility Act (in force June 2025) requires covered services to publish an accessibility statement (conformance level, known limitations, feedback contact)." });

  return checks;
}
