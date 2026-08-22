import { ADVERTISED_CHECK_COUNT_LABEL } from "@/server/checks-registry";
import { PublicScanner } from "@/components/pulse/public-scanner";

/**
 * The embeddable widget — the iframe third parties put on their own site.
 *
 * ⚠️ EXTERNAL CONTRACT. This route is allow-listed for gitwork.co.uk in
 * next.config.ts (`frame-ancestors`) and is the only route exempt from the baseline
 * security headers. Check the live embed before changing anything here.
 *
 * The scanner itself lives in src/components/pulse/public-scanner.tsx because
 * /production-ready renders the same one inline. This file is a SERVER component so
 * the advertised check count can be read from the 135KB check registry without any of
 * it reaching the browser.
 */
export default function EmbedPulsePage() {
  return <PublicScanner variant="embed" checkCountLabel={ADVERTISED_CHECK_COUNT_LABEL} />;
}
