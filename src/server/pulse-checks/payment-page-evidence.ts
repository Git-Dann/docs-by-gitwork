/**
 * Payment facts read from a page's own markup: which provider's hosted checkout or card
 * fields it loads, whether it collects card numbers in its own form field, and which
 * non-card payment methods it shows. Matched on the provider's own hosts and on
 * word-bounded names in visible copy; "sepa" inside "separate" and "upi" inside "grouping"
 * were what the old substring checks matched (Oct 2026 audit). Pure, no I/O.
 */
import { firstPhrase, visibleCopy } from "./page-evidence";

/** Hosted checkouts and card fields: card numbers are typed into the provider's frame or page. */
const HOSTED_CARD_PROVIDERS: Array<[RegExp, string]> = [
  [/\/\/(?:checkout|buy)\.stripe\.com\//i, "Stripe Checkout"],
  [/\/\/js\.stripe\.com\/v\d/i, "Stripe"],
  [/\/\/(?:js|assets)\.braintreegateway\.com\//i, "Braintree"],
  [/\/\/checkoutshopper-(?:live|test)[\w-]*\.adyen\.com\//i, "Adyen"],
  [/\/\/cdn\.paddle\.com\//i, "Paddle"],
  [/\/\/(?:app|assets)\.lemonsqueezy\.com\//i, "Lemon Squeezy"],
  [/\/\/(?:web\.squarecdn\.com|js\.squareup\.com)\//i, "Square"],
  [/\/\/(?:www\.)?paypal\.com\/sdk\/js/i, "PayPal"],
  [/\/\/js\.chargebee\.com\//i, "Chargebee"],
  [/\/\/checkout\.razorpay\.com\//i, "Razorpay"],
  [/\/\/js\.recurly\.com\//i, "Recurly"],
];

/** Hosted checkouts that run 3D Secure themselves whenever the card issuer asks for it. */
const SCA_HANDLED_BY: ReadonlySet<string> = new Set(["Stripe Checkout", "Paddle", "Lemon Squeezy"]);

const attributeUrls = (html: string) =>
  [...html.matchAll(/\s(?:src|href|action)\s*=\s*["']([^"']{8,600})["']/gi)].map((m) => m[1]);

export function cardDataHandling(html: string): { hostedProvider: string | null; scaHandledBy: string | null; ownCardField: string | null } {
  const urls = attributeUrls(html);
  const providers = HOSTED_CARD_PROVIDERS.filter(([re]) => urls.some((u) => re.test(u))).map(([, name]) => name);
  const ownCardField = (html.match(/<input\b[^>]*>/gi) ?? []).find((input) =>
    /\sautocomplete\s*=\s*["']?cc-number\b/i.test(input) || /\s(?:name|id)\s*=\s*["']?[\w-]*(?:card[-_]?number|cc[-_]?num(?:ber)?|cardnumber)\b/i.test(input));
  return {
    hostedProvider: providers[0] ?? null,
    scaHandledBy: providers.find((p) => SCA_HANDLED_BY.has(p)) ?? null,
    ownCardField: ownCardField ? ownCardField.slice(0, 100) : null,
  };
}

/**
 * Non-card payment methods the page shows: by a provider's SDK host, or by the method's
 * name as a word in the visible copy (alt text included, since these are often logos).
 * iDEAL is matched case-sensitively so the English word "ideal" never counts.
 */
export function nonCardPaymentMethods(html: string): string[] {
  const copy = visibleCopy(html, { withAltText: true });
  const urls = attributeUrls(html).join(" ");
  const found: string[] = [];
  const add = (hit: boolean, name: string) => { if (hit && !found.includes(name)) found.push(name); };
  add(/\/\/(?:www\.)?paypal\.com\/sdk\/js|\/\/(?:www\.)?paypalobjects\.com\//i.test(urls) || /\bPayPal\b/i.test(copy), "PayPal");
  add(/\/\/(?:js\.klarna\.com|x\.klarnacdn\.net)\//i.test(urls) || /\bKlarna\b/i.test(copy), "Klarna");
  add(/\biDEAL\b/.test(copy), "iDEAL");
  add(/\bSEPA\b/.test(copy) || /\bSEPA Direct Debit\b/i.test(copy), "SEPA");
  add(/\bBancontact\b/i.test(copy), "Bancontact");
  add(/\bSofort\b/.test(copy), "Sofort");
  add(/\bAlipay\b/i.test(copy), "Alipay");
  add(/\bWeChat Pay\b/i.test(copy), "WeChat Pay");
  add(/\bUPI\b/.test(copy), "UPI");
  add(/\bPaytm\b/i.test(copy), "Paytm");
  add(/\bPix\b/.test(copy) && /\bBRL\b|R\$\s?\d/.test(copy), "Pix");
  add(/\bBoleto\b/i.test(copy), "Boleto");
  add(/\b(?:Afterpay|Clearpay)\b/i.test(copy), "Afterpay / Clearpay");
  return found;
}

/**
 * Stripe in USE on the page: its JS library, a Checkout / Payment Link / customer-portal
 * link, or a publishable key passed to Stripe(). The word "stripe" (a CSS class such as
 * "striped", an article about Stripe) is not use.
 */
export function stripeUseOnPage(html: string): string | null {
  const urls = attributeUrls(html);
  if (urls.some((u) => /\/\/js\.stripe\.com\//i.test(u))) return "Stripe.js is loaded";
  const link = urls.find((u) => /\/\/(?:checkout|buy|billing)\.stripe\.com\//i.test(u));
  if (link) return `the page links to ${/\/\/([^/]+)/.exec(link)?.[1] ?? "a Stripe-hosted page"}`;
  if (/\bStripe\s*\(\s*["'`]pk_(?:live|test)_/.test(html)) return "the page initialises Stripe with a publishable key";
  return null;
}

/**
 * Does a probe of a webhook path show a real route? It must answer 2xx, or refuse a bare
 * GET the way a POST-only endpoint does (400 / 401 / 405 / 415), and answer differently
 * from both a made-up root path and a made-up path BESIDE it: a 404 is no route, and an
 * /api/ prefix behind auth answers 401 for every path under it. `sibling` null means the
 * sibling has not been probed yet; 0 means that probe failed, so the route is not shown.
 */
export function webhookRouteIsLive(route: number, rootBaseline: number, sibling: number | null): boolean {
  const answers = route !== rootBaseline && ((route >= 200 && route < 300) || [400, 401, 405, 415].includes(route));
  if (!answers || sibling === null) return answers;
  return sibling !== 0 && sibling !== route;
}

/** Currency marks or ISO codes directly attached to an amount. */
const PRICE_PATTERNS: Array<[RegExp, string]> = [
  [/£\s?\d|\bGBP\s?\d|\d\s?GBP\b/, "GBP"],
  [/€\s?\d|\d\s?€|\bEUR\s?\d|\d\s?EUR\b/, "EUR"],
  [/(?<![A-Za-z$])(?:US)?\$\s?\d|\bUSD\s?\d|\d\s?USD\b/, "USD"],
  [/\b(?:CA|C)\$\s?\d|\bCAD\s?\d|\d\s?CAD\b/, "CAD"],
  [/\b(?:AU|A)\$\s?\d|\bAUD\s?\d|\d\s?AUD\b/, "AUD"],
  [/¥\s?\d|\bJPY\s?\d|\d\s?JPY\b/, "JPY"],
  [/₹\s?\d|\bINR\s?\d|\bRs\.?\s?\d/, "INR"],
  [/\bCHF\s?\d|\d\s?CHF\b/, "CHF"],
  [/\b(?:SEK|NOK|DKK)\s?\d|\d\s?(?:SEK|NOK|DKK)\b|\d\s?kr\b/, "SEK / NOK / DKK"],
  [/\bR\$\s?\d|\bBRL\s?\d/, "BRL"],
  [/\bSGD\s?\d|\bS\$\s?\d/, "SGD"],
];

/**
 * The currencies prices are shown in, read from visible copy. "kr " inside a CSS class,
 * "aud" inside "claude" and "cad" inside a hash were what the old substring check matched.
 * A "$" preceded by a letter (CA$, A$, R$) is that currency, not US dollars.
 */
export function priceCurrencies(html: string): string[] {
  const copy = visibleCopy(html);
  return PRICE_PATTERNS.filter(([re]) => re.test(copy)).map(([, code]) => code);
}

/**
 * A payment-security assurance a visitor can see (badge alt text included): whole phrases,
 * where the old check matched "payment security" or "pci dss" anywhere in the raw HTML.
 */
export function paymentAssurance(html: string): string | null {
  return firstPhrase(visibleCopy(html, { withAltText: true }), /\bPCI[- ]DSS\b|\bsecure (?:checkout|payments?)\b|\b256-bit (?:SSL|encryption)\b|\bSSL[- ]secured\b|\b(?:Norton|McAfee) Secured?\b|\bmoney[- ]back guarantee\b|\bpayments? (?:are )?(?:secured|processed securely) by\b/i);
}
