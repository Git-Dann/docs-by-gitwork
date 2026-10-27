import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";
import { cardDataHandling } from "./payment-page-evidence";

export async function runPaymentsExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { ctx: pctx } = ctx;
  const html = ctx.pageResult.html;
  // Prose a visitor can read. Scripts, styles, comments and tag markup are not payment
  // claims: "border-collapse:separate" is not SEPA, an RSC ref "$2" or an asset hash is not
  // a price. A tag's alt / aria-label / title text is kept, because a payment-method logo
  // (<img alt="SEPA Direct Debit">) is a claim the visitor sees.
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, (tag) => ` ${[...tag.matchAll(/\b(?:alt|aria-label|title)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]).join(" ")} `)
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&pound;|&#163;|&#xa3;/gi, "£")
    .replace(/&euro;|&#8364;|&#x20ac;/gi, "€")
    .replace(/&dollar;|&#36;|&#x24;/gi, "$")
    .replace(/\s+/g, " ");
  const checks: PulseScanCheckInput[] = [];

  if (!pctx.isPaymentEnabled) {
    return [
      "sepa_bank_transfer", "paypal_integration", "three_ds_sca_compliant",
      "pci_saq_evidence", "regional_payment_methods",
      "subscription_proration", "invoicing_capability", "tax_automation",
      "payment_refund_policy", "payment_recurring_terms", "payment_checkout_provider",
      "payment_billing_support", "payment_price_currency",
    ].map((checkKey) => ({
      category: CATEGORIES.PAYMENTS, checkKey, label: checkKey.replace(/_/g, " "),
      status: "SKIPPED" as const, detail: "Not applicable — no payment processing detected.",
    }));
  }

  const hasSepa = /\bsepa\b|\bbank[\s-]transfers?\b|\bdirect[\s-]debits?\b|\biban\b/i.test(text);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "sepa_bank_transfer", label: "SEPA / bank transfer option (EU)", status: hasSepa ? "PASS" : "WARN", detail: hasSepa ? "SEPA / bank transfer signals detected." : "No SEPA/bank transfer option — EU B2B customers often prefer bank transfer over card. SEPA Direct Debit reduces churn on annual plans." });

  const hasPaypal = /paypal/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "paypal_integration", label: "PayPal integration", status: hasPaypal ? "PASS" : "WARN", detail: hasPaypal ? "PayPal integration detected." : "No PayPal integration — PayPal adds a trusted fallback for customers without credit cards or who distrust card-on-file." });

  // A bare "sca" matched "initial-scale" in the viewport meta, so nearly every page passed.
  // SCA is run by the checkout, so the evidence is a hosted checkout that runs it, or the
  // site saying so in words; a homepage with neither says nothing about the checkout.
  const cardHandling = cardDataHandling(html);
  const scaPhrase = /\b3-?D ?Secure\b|\bStrong Customer Authentication\b|\bPSD2\b/i.exec(text)?.[0];
  checks.push({
    category: CATEGORIES.PAYMENTS, checkKey: "three_ds_sca_compliant", label: "3D Secure / PSD2 SCA compliant",
    ...(cardHandling.scaHandledBy
      ? { status: "PASS" as const, detail: `Payments go through ${cardHandling.scaHandledBy}, whose hosted checkout runs 3D Secure whenever the card issuer requires Strong Customer Authentication.`, evidence: cardHandling.scaHandledBy }
      : scaPhrase
        ? { status: "PASS" as const, detail: `The page says card payments use Strong Customer Authentication ("${scaPhrase}"). Pulse did not test the checkout.`, evidence: scaPhrase }
        : { status: "INCONCLUSIVE" as const, detail: `3D Secure runs inside the checkout, which Pulse did not reach${cardHandling.hostedProvider ? ` (the page loads ${cardHandling.hostedProvider}, which supports it when the integration requests it)` : ""}. Whether card payments meet PSD2 Strong Customer Authentication could not be established.` }),
  });


  const hasPciEvidence = /pci.*compliant|pci.*saq|pci.*dss|pci.*certified|scope.*reduction.*pci/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "pci_saq_evidence", label: "PCI SAQ / scope reduction evidence", status: hasPciEvidence ? "PASS" : "WARN", detail: hasPciEvidence ? "PCI compliance evidence detected." : "No PCI scope reduction evidence — document your PCI DSS approach (SAQ, tokenisation) to reassure enterprise procurement teams." });

  const hasRegionalPayments = /klarna|ideal|sofort|giropay|bancontact|alipay|wechat.*pay|boleto|pix\b|afterpay|clearpay|mollie/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "regional_payment_methods", label: "Regional payment methods (Klarna, iDEAL, etc.)", status: hasRegionalPayments ? "PASS" : "WARN", detail: hasRegionalPayments ? "Regional payment method signals detected." : "No regional payment methods — iDEAL (Netherlands), Klarna (Nordics/Germany), and Boleto (Brazil) can unlock significant local market conversion." });


  const hasSubs = pctx.isSaas;
  // Applies only when the page sells a recurring plan; being "SaaS" is not the same thing,
  // and a non-subscription site used to get a free PASS here.
  const sellsPlans = /\b(?:per|a|\/)\s?(?:month|mo|year|yr)\b|\bbilled (?:monthly|annually|yearly)\b|\b(?:monthly|annual|yearly) plans?\b|\bsubscriptions?\b/i.test(text);
  const prorationPhrase = /\bpro-?rat(?:ed|a|ion|es)\b|\bmid[- ]cycle\b|\bcredit\w*\b[^.!?]{0,40}\b(?:upgrad|downgrad)\w*|\b(?:upgrad|downgrad)\w*\b[^.!?]{0,40}\bcredit\w*/i.exec(text)?.[0];
  checks.push({
    category: CATEGORIES.PAYMENTS, checkKey: "subscription_proration", label: "Subscription plan proration",
    ...(!sellsPlans
      ? { status: "NOT_APPLICABLE" as const, detail: "Not applicable: the scanned page does not sell a recurring plan." }
      : prorationPhrase
        ? { status: "PASS" as const, detail: `The page says how mid-cycle plan changes are charged ("${prorationPhrase.slice(0, 80)}").`, evidence: prorationPhrase.slice(0, 80) }
        : { status: "INCONCLUSIVE" as const, detail: "The page sells a recurring plan but does not say how upgrades and downgrades are charged mid-cycle. That is normally explained on the pricing page or billing docs, which Pulse did not read." }),
  });

  const hasInvoicing = /invoice.*generation|tax.*invoice|generate.*invoice|download.*invoice|billing.*invoice|invoice.*pdf/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "invoicing_capability", label: "Invoice generation for B2B", status: hasInvoicing ? "PASS" : "WARN", detail: hasInvoicing ? "Invoice generation signals detected." : "No invoice generation signals — B2B customers require VAT invoices for expense reporting. Stripe Billing and Paddle handle this automatically." });

  const hasTaxAutomation = /taxjar|avalara|stripe.*tax|tax.*calculation.*automatic|automatic.*tax|vat.*calculation/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "tax_automation", label: "Tax automation (Avalara / Stripe Tax)", status: hasTaxAutomation ? "PASS" : "WARN", detail: hasTaxAutomation ? "Tax automation signals detected." : "No tax automation signals — manual tax calculation is a liability risk. Stripe Tax or Avalara handle US sales tax and EU VAT automatically." });

  const hasRefundPolicy = /refund(?:s| policy)?|money.back|satisfaction guarantee|cancel.*within.*day/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "payment_refund_policy", label: "Refund or cancellation policy is discoverable", status: hasRefundPolicy ? "PASS" : "WARN", detail: hasRefundPolicy ? "Refund/cancellation policy signals detected." : "No refund or cancellation policy found on the scanned payment surface. Make the terms discoverable before checkout so customers and support can resolve disputes consistently." });

  const hasRecurringTerms = /renew(?:s|al|ed)?s+(?:automatically|each|monthly|annually)|recurring (?:billing|charge)|cancel (?:anytime|at any time)|subscription terms/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "payment_recurring_terms", label: "Recurring billing terms are disclosed", status: hasSubs ? (hasRecurringTerms ? "PASS" : "WARN") : "SKIPPED", detail: hasSubs ? (hasRecurringTerms ? "Recurring billing disclosure signals detected." : "No recurring-billing disclosure was found. State renewal cadence, price, and cancellation route before a customer starts a subscription.") : "Not applicable — no subscription product detected." });

  const hasHostedCheckout = /checkout\.stripe\.com|js\.stripe\.com|paypal\.com\/checkout|braintree|adyen|checkout\.paddle\.com|lemon\.squeezy/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "payment_checkout_provider", label: "Checkout provider integration is identifiable", status: hasHostedCheckout ? "PASS" : "WARN", detail: hasHostedCheckout ? "Hosted/tokenized checkout provider signals detected." : "No hosted or tokenized checkout provider signal was found. Do not collect raw card details in your own form unless you deliberately operate within the resulting PCI scope." });

  const hasBillingSupport = /(?:billing|payment|invoice).{0,40}(?:support|help|contact)|href=["'][^"']*(?:billing|support|help|contact)[^"']*["']|mailto:/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "payment_billing_support", label: "Billing support route is discoverable", status: hasBillingSupport ? "PASS" : "WARN", detail: hasBillingSupport ? "Billing support/contact signal detected." : "No billing support route was found on the scanned surface. Make invoice, renewal, and payment-failure help reachable before they become chargebacks." });

  // A currency then an amount, or an amount then a currency code. Not a magnitude:
  // "$100K", "$10M ARR", "$1.5M", "$2 bn" and "$ 5 million" are claims, not prices. A
  // single-letter suffix only counts when attached ("$49 M-F support" is still a price).
  const hasPriceCurrency = /(?:[£€$]\s?|\b(?:USD|EUR|GBP|AUD|CAD)\s?)\d[\d,]*(?:\.\d{1,2})?(?!\d|[.,]\d|(?:k|m|bn?)\b|\s?(?:million|billion|bn)\b)|\b\d[\d,]*(?:\.\d{2})?\s?(?:USD|EUR|GBP|AUD|CAD)\b/i.test(text);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "payment_price_currency", label: "Prices display a currency", status: hasPriceCurrency ? "PASS" : "WARN", detail: hasPriceCurrency ? "A priced amount with a currency indicator was detected." : "No price-and-currency pairing was found on the scanned surface. Where prices are shown, make the currency explicit so international customers are not surprised at checkout." });

  return checks;
}
