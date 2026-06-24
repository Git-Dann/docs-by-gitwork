import { type ExtendedCheckContext, type PulseScanCheckInput, skip, platformIs } from "./_types";

export async function runWcagChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { pageResult } = ctx;
  const html = pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP", "DESKTOP_APP")) {
    return skip("Accessibility", [
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
      ["wcag22_consistent_help", "Consistent help mechanism (WCAG 3.3.6)"],
      ["accessibility_statement_eaa", "Accessibility statement (EU Accessibility Act)"],
    ], "Not applicable for non-web interfaces.");
  }

  // Skip to main content
  const hasSkipLink = /href=["']#(main|content|skip|maincontent)/i.test(html) || /skip.*to.*main|skip.*navigation/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "skip_to_main_content", label: "Skip to main content link", status: hasSkipLink ? "PASS" : "WARN", detail: hasSkipLink ? "Skip to main content link detected — keyboard users can bypass repetitive navigation." : "No skip navigation link detected — add a 'Skip to main content' link as the first focusable element (WCAG 2.4.1 Bypass Blocks)." });

  // Image input alt
  const imgInputs = html.match(/<input[^>]+type=["']image["'][^>]*>/gi) ?? [];
  const imgInputsWithAlt = imgInputs.filter((t) => /alt=/i.test(t)).length;
  checks.push({ category: "Accessibility", checkKey: "image_input_alt", label: "<input type=image> has alt text", status: imgInputs.length === 0 || imgInputsWithAlt === imgInputs.length ? "PASS" : "FAIL", detail: imgInputs.length === 0 ? "No <input type=image> elements found." : imgInputsWithAlt === imgInputs.length ? "All image inputs have alt text." : `${imgInputs.length - imgInputsWithAlt} image input(s) missing alt text — WCAG 1.1.1 requires all functional images to have descriptive alternative text.` });

  // Video captions
  const videoEls = html.match(/<video[^>]*>[\s\S]*?<\/video>/gi) ?? [];
  const videosWithCaptions = videoEls.filter((v) => /kind=["']captions["']/i.test(v)).length;
  checks.push({ category: "Accessibility", checkKey: "video_captions", label: "Video has captions track", status: videoEls.length === 0 ? "PASS" : videosWithCaptions >= videoEls.length * 0.8 ? "PASS" : "WARN", detail: videoEls.length === 0 ? "No <video> elements detected." : videosWithCaptions >= videoEls.length ? "All videos have caption tracks." : `${videoEls.length - videosWithCaptions} video(s) missing caption track — WCAG 1.2.2 requires captions for all prerecorded video content.` });

  // Form labels
  const inputs = html.match(/<input(?![^>]+type=["'](hidden|submit|button|reset|image|checkbox|radio)["'])[^>]+id=["']([^"']+)["']/gi) ?? [];
  const labels = html.match(/<label[^>]+for=["'][^"']+["']/gi) ?? [];
  const hasGoodLabels = inputs.length === 0 || labels.length >= inputs.length * 0.8;
  checks.push({ category: "Accessibility", checkKey: "form_labels_present", label: "<label> for every <input>", status: hasGoodLabels ? "PASS" : "WARN", detail: hasGoodLabels ? "Form inputs appear to have associated labels." : `${inputs.length} inputs but only ${labels.length} explicit labels — WCAG 1.3.1 requires programmatic labels for all form controls.` });

  // Form error identification
  const hasForms = /<form[^>]*>/i.test(html);
  const hasErrorMessages = /role=["']alert["']|aria-invalid|aria-describedby.*error|class=["'][^"']*error/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "form_error_identification", label: "Form errors identify the field", status: !hasForms ? "PASS" : hasErrorMessages ? "PASS" : "WARN", detail: !hasForms ? "No forms detected." : hasErrorMessages ? "Error identification signals detected (aria-invalid, role=alert, or error classes)." : "Forms detected but no error identification patterns — WCAG 3.3.1 requires identifying which field caused an error in a text description." });

  // Focus visible
  const hasFocusVisible = /:focus-visible|:focus\s*\{[^}]*outline/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "keyboard_focus_visible", label: ":focus-visible CSS present", status: hasFocusVisible ? "PASS" : "WARN", detail: hasFocusVisible ? ":focus-visible styles detected in page HTML." : "No :focus-visible styles detected — WCAG 2.4.7 requires a visible keyboard focus indicator on all interactive elements." });

  // Touch target size (check for min-height/min-width patterns ≥ 44px)
  const hasTouchTargets = /min-height:\s*(4[4-9]|[5-9]\d|\d{3})px|min-width:\s*(4[4-9]|[5-9]\d|\d{3})px|h-\d+\s+w-\d+/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "touch_target_size", label: "Sufficient touch target sizing", status: hasTouchTargets ? "PASS" : "WARN", detail: hasTouchTargets ? "Touch target size CSS patterns detected." : "No explicit touch target size constraints detected — WCAG 2.5.8 recommends a minimum 24×24px target, Apple HIG recommends 44×44pt." });

  // No autoplay audio
  const hasAutoplayAudio = /<audio[^>]+autoplay/i.test(html) || /<source[^>]*autoplay/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "no_autoplay_audio", label: "No autoplay audio without controls", status: hasAutoplayAudio ? "WARN" : "PASS", detail: hasAutoplayAudio ? "Autoplay audio detected — WCAG 1.4.2 requires providing a mechanism to pause, stop, or control the volume of audio that plays automatically." : "No autoplay audio detected." });

  // No autoplay video
  const hasAutoplayVideo = /<video[^>]+autoplay/i.test(html) && !/<video[^>]+autoplay[^>]+muted/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "no_autoplay_video", label: "No autoplay video without controls", status: hasAutoplayVideo ? "WARN" : "PASS", detail: hasAutoplayVideo ? "Autoplay video without muted attribute detected — WCAG 1.4.2 requires a mechanism to pause or stop autoplaying media." : "No problematic autoplay video detected." });

  // Session timeout warning
  const hasTimeoutWarning = /session.*expir|timeout.*warning|session.*timeout.*warn|you.*be.*logged.*out/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "session_timeout_warning", label: "Session timeout warning", status: ctx.ctx.isAuthEnabled ? (hasTimeoutWarning ? "PASS" : "WARN") : "PASS", detail: ctx.ctx.isAuthEnabled ? (hasTimeoutWarning ? "Session timeout warning detected." : "Authenticated app detected but no session timeout warning — WCAG 2.2.1 requires warning users before a session expires and giving them a way to extend it.") : "Not applicable — no auth detected." });

  // HTML parsing errors (basic check for unclosed tags)
  const unclosedDiv = (html.match(/<div/gi) ?? []).length;
  const closedDiv = (html.match(/<\/div>/gi) ?? []).length;
  const divMismatch = Math.abs(unclosedDiv - closedDiv) > 5;
  checks.push({ category: "Accessibility", checkKey: "valid_html_parsing", label: "No obvious HTML parsing errors", status: divMismatch ? "WARN" : "PASS", detail: divMismatch ? `Significant div tag imbalance detected (${unclosedDiv} open, ${closedDiv} close) — malformed HTML can cause screen readers to misinterpret page structure.` : "HTML tag structure appears balanced." });

  // ARIA landmark roles
  const hasLandmarks = /role=["'](main|navigation|banner|contentinfo|complementary|search|region)["']/i.test(html) || /<main[^>]*>|<nav[^>]*>|<header[^>]*>|<footer[^>]*>/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "aria_roles_valid", label: "ARIA landmark roles used", status: hasLandmarks ? "PASS" : "WARN", detail: hasLandmarks ? "ARIA landmark roles or HTML5 landmark elements detected — screen reader users can navigate by landmarks." : "No ARIA landmark roles detected — WCAG 1.3.6 recommends using landmark roles (main, nav, header, footer) to help screen reader users navigate." });

  // aria-live regions
  const hasAriaLive = /aria-live=["'](polite|assertive)["']/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "aria_live_regions", label: "aria-live for dynamic content", status: hasAriaLive ? "PASS" : "WARN", detail: hasAriaLive ? "aria-live regions detected — dynamic content updates are announced to screen readers." : "No aria-live regions detected — for apps with dynamic content updates (notifications, toasts, form errors), use aria-live=\"polite\" to announce changes to screen reader users." });

  // prefers-reduced-motion
  const hasPrefersReducedMotion = /prefers-reduced-motion/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "prefers_reduced_motion", label: "prefers-reduced-motion CSS media query", status: hasPrefersReducedMotion ? "PASS" : "WARN", detail: hasPrefersReducedMotion ? "prefers-reduced-motion media query detected — animations respect the user's OS motion preference." : "No prefers-reduced-motion media query — users who experience motion sickness or vestibular disorders need a way to reduce animations (WCAG 2.3.3)." });

  // prefers-contrast
  const hasPrefersContrast = /prefers-contrast/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "prefers_high_contrast", label: "prefers-contrast CSS media query", status: hasPrefersContrast ? "PASS" : "WARN", detail: hasPrefersContrast ? "prefers-contrast media query detected — layout adapts to high-contrast OS preference." : "No prefers-contrast media query — consider supporting this CSS media query to improve usability for users with low vision." });

  // Low contrast inline styles (very basic check)
  const hasLowContrastInline = /color:\s*#([0-9a-fA-F]{3,6})\s*;\s*background[^;]*:\s*#([0-9a-fA-F]{3,6})/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "sufficient_colour_contrast", label: "No obvious low-contrast inline styles", status: hasLowContrastInline ? "WARN" : "PASS", detail: hasLowContrastInline ? "Inline colour + background styles detected — verify contrast ratios meet WCAG AA (4.5:1 for normal text, 3:1 for large text)." : "No obvious low-contrast inline styles detected — use an automated tool like Lighthouse or axe to audit colour contrast." });

  // Text spacing
  const hasFixedSpacing = /letter-spacing:\s*0px|word-spacing:\s*0px|line-height:\s*1(?:\.0+)?(?:px|$)/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "text_spacing_supported", label: "Letter/word spacing not fixed", status: hasFixedSpacing ? "WARN" : "PASS", detail: hasFixedSpacing ? "Fixed letter or word spacing styles detected — WCAG 1.4.12 requires content to remain usable when letter/word/line spacing is overridden by the user." : "No problematic fixed spacing styles detected." });

  // Link purpose
  const genericLinks = html.match(/>(?:click here|here|more|read more|learn more|link|go)<\/a>/gi) ?? [];
  checks.push({ category: "Accessibility", checkKey: "link_purpose_clear", label: "Links have descriptive text", status: genericLinks.length === 0 ? "PASS" : "WARN", detail: genericLinks.length === 0 ? "No generic link text detected." : `${genericLinks.length} link(s) with generic text (\"click here\", \"read more\") detected — WCAG 2.4.4 requires link text to describe the destination or purpose.` });

  // Page title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch?.[1] ?? "";
  checks.push({ category: "Accessibility", checkKey: "page_title_unique", label: "Unique page title", status: pageTitle.length > 5 ? "PASS" : "WARN", detail: pageTitle.length > 5 ? `Page title detected: "${pageTitle.trim()}" — descriptive titles help users navigate and understand context.` : "No descriptive page title detected — WCAG 2.4.2 requires every page to have a descriptive, unique title." });

  // Language attribute on html element
  const hasLangAttr = /<html[^>]+lang=["'][a-z]{2}/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "language_attribute_body", label: "lang attribute on <html> element", status: hasLangAttr ? "PASS" : "FAIL", detail: hasLangAttr ? "lang attribute present on <html> element — screen readers use this to select the correct pronunciation engine." : "No lang attribute on <html> — WCAG 3.1.1 requires specifying the page language so screen readers pronounce content correctly." });

  // ─── WCAG 2.2 (2023) new success criteria ────────────────────────────────────

  // 2.5.7 Dragging Movements — drag interactions must have a single-pointer alternative.
  const hasDraggable = /draggable=["']true["']|@dnd-kit|react-beautiful-dnd|sortablejs|use-?draggable|on(drag|DragStart)/i.test(html);
  const hasDragAlternative = /move (up|down)|reorder.*button|use (the )?arrow keys|keyboard.*reorder/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "wcag22_dragging_alternative", label: "Dragging movements have an alternative (WCAG 2.5.7)", status: !hasDraggable ? "PASS" : hasDragAlternative ? "PASS" : "WARN", detail: !hasDraggable ? "No drag-and-drop interactions detected." : hasDragAlternative ? "Drag interactions detected with a single-pointer/keyboard alternative." : "Drag-and-drop detected but no obvious single-pointer alternative — WCAG 2.2 (2.5.7) requires any dragging movement to also be operable with a single pointer (e.g. up/down buttons)." });

  // 3.3.6 Consistent Help — a help mechanism in a consistent location across pages.
  const hasConsistentHelp = /href=["'][^"']*(help|support|contact)[^"']*["']|intercom|crisp\.chat|zendesk|drift|help.*center|live chat|tawk\.to/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "wcag22_consistent_help", label: "Consistent help mechanism (WCAG 3.3.6)", status: hasConsistentHelp ? "PASS" : "WARN", detail: hasConsistentHelp ? "A help/contact mechanism is present — WCAG 2.2 (3.3.6) is satisfied when it appears in a consistent location across pages." : "No help/contact mechanism detected — WCAG 2.2 (3.3.6) expects a consistently located way to get help (contact link, help centre, or chat) on pages that need it." });

  // EU Accessibility Act (in force June 2025) — a published accessibility statement.
  const hasAccessibilityStatement = /accessibility statement|accessibility commitment|href=["'][^"']*accessibility[^"']*["']|we are committed to accessibility|wcag 2\.[12]|en 301 549/i.test(html);
  checks.push({ category: "Accessibility", checkKey: "accessibility_statement_eaa", label: "Accessibility statement (EU Accessibility Act)", status: hasAccessibilityStatement ? "PASS" : "WARN", detail: hasAccessibilityStatement ? "Accessibility statement signals detected — the EU Accessibility Act (in force June 2025) requires a published statement describing conformance and feedback channels." : "No accessibility statement detected — the EU Accessibility Act (in force June 2025) requires covered services to publish an accessibility statement (conformance level, known limitations, feedback contact)." });

  return checks;
}
