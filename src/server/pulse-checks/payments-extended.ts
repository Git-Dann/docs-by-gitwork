import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";

export async function runPaymentsExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { ctx: pctx } = ctx;
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (!pctx.isPaymentEnabled) {
    return [
      "sepa_bank_transfer", "paypal_integration", "three_ds_sca_compliant",
      "fraud_detection_tool", "pci_saq_evidence", "regional_payment_methods",
      "chargeback_prevention", "subscription_proration", "invoicing_capability", "tax_automation",
    ].map((checkKey) => ({
      category: CATEGORIES.PAYMENTS, checkKey, label: checkKey.replace(/_/g, " "),
      status: "SKIPPED" as const, detail: "Not applicable — no payment processing detected.",
    }));
  }

  const hasSepa = /sepa|bank.*transfer|direct.*debit|iban/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "sepa_bank_transfer", label: "SEPA / bank transfer option (EU)", status: hasSepa ? "PASS" : "WARN", detail: hasSepa ? "SEPA / bank transfer signals detected." : "No SEPA/bank transfer option — EU B2B customers often prefer bank transfer over card. SEPA Direct Debit reduces churn on annual plans." });

  const hasPaypal = /paypal/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "paypal_integration", label: "PayPal integration", status: hasPaypal ? "PASS" : "WARN", detail: hasPaypal ? "PayPal integration detected." : "No PayPal integration — PayPal adds a trusted fallback for customers without credit cards or who distrust card-on-file." });

  const has3ds = /3d.*secure|3ds|psd2|sca|strong.*customer.*authentication/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "three_ds_sca_compliant", label: "3D Secure / PSD2 SCA compliant", status: has3ds ? "PASS" : "WARN", detail: has3ds ? "3D Secure / SCA signals detected." : "No 3D Secure / SCA signals — EU PSD2 requires Strong Customer Authentication for most online card payments. Non-compliant payments are declined." });

  const hasFraudDetection = /stripe.*radar|kount|signifyd|forter|fraud.*detection|fraud.*prevention|risk.*score/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "fraud_detection_tool", label: "Fraud detection (Stripe Radar / Kount)", status: hasFraudDetection ? "PASS" : "WARN", detail: hasFraudDetection ? "Fraud detection tool signals detected." : "No fraud detection signals — implement Stripe Radar or a dedicated fraud tool to prevent chargebacks and card testing attacks." });

  const hasPciEvidence = /pci.*compliant|pci.*saq|pci.*dss|pci.*certified|scope.*reduction.*pci/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "pci_saq_evidence", label: "PCI SAQ / scope reduction evidence", status: hasPciEvidence ? "PASS" : "WARN", detail: hasPciEvidence ? "PCI compliance evidence detected." : "No PCI scope reduction evidence — document your PCI DSS approach (SAQ, tokenisation) to reassure enterprise procurement teams." });

  const hasRegionalPayments = /klarna|ideal|sofort|giropay|bancontact|alipay|wechat.*pay|boleto|pix\b|afterpay|clearpay|mollie/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "regional_payment_methods", label: "Regional payment methods (Klarna, iDEAL, etc.)", status: hasRegionalPayments ? "PASS" : "WARN", detail: hasRegionalPayments ? "Regional payment method signals detected." : "No regional payment methods — iDEAL (Netherlands), Klarna (Nordics/Germany), and Boleto (Brazil) can unlock significant local market conversion." });

  const hasChargeback = /chargeback.*prevention|dispute.*protection|dispute.*tool|chargeback.*dispute|friendly.*fraud/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "chargeback_prevention", label: "Chargeback prevention tools", status: hasChargeback ? "PASS" : "WARN", detail: hasChargeback ? "Chargeback prevention signals detected." : "No chargeback prevention signals — chargebacks above 1% trigger card network scrutiny. Use Stripe Radar, chargeback alerts, or Chargeback911." });

  const hasProration = /proration|prorat|upgrade.*credit|credit.*upgrade|mid.cycle|plan.*change.*credit/i.test(html);
  const hasSubs = pctx.isSaas;
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "subscription_proration", label: "Subscription plan proration", status: hasSubs ? (hasProration ? "PASS" : "WARN") : "PASS", detail: hasSubs ? (hasProration ? "Proration signals detected — mid-cycle plan changes are handled fairly." : "No proration signals — clearly handle and communicate credits when users upgrade or downgrade mid-billing-cycle.") : "Not applicable." });

  const hasInvoicing = /invoice.*generation|tax.*invoice|generate.*invoice|download.*invoice|billing.*invoice|invoice.*pdf/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "invoicing_capability", label: "Invoice generation for B2B", status: hasInvoicing ? "PASS" : "WARN", detail: hasInvoicing ? "Invoice generation signals detected." : "No invoice generation signals — B2B customers require VAT invoices for expense reporting. Stripe Billing and Paddle handle this automatically." });

  const hasTaxAutomation = /taxjar|avalara|stripe.*tax|tax.*calculation.*automatic|automatic.*tax|vat.*calculation/i.test(html);
  checks.push({ category: CATEGORIES.PAYMENTS, checkKey: "tax_automation", label: "Tax automation (Avalara / Stripe Tax)", status: hasTaxAutomation ? "PASS" : "WARN", detail: hasTaxAutomation ? "Tax automation signals detected." : "No tax automation signals — manual tax calculation is a liability risk. Stripe Tax or Avalara handle US sales tax and EU VAT automatically." });

  return checks;
}
