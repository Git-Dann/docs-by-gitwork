/**
 * Terms & conditions — boilerplate draft.
 *
 * UK-oriented, and deliberately conservative on the two clauses a template gets
 * wrong most often:
 *
 *   · **Consumer cancellation.** The Consumer Contracts Regulations 2013 give a UK
 *     consumer 14 days to cancel a distance purchase. A template that quietly omits
 *     it, or writes "all sales final", is unenforceable against a consumer and
 *     invites a complaint — so the draft states the right and flags the digital-
 *     content exception rather than pretending the seller can contract out of it.
 *   · **Liability.** Under the Consumer Rights Act 2015 and UCTA 1977 you cannot
 *     exclude liability for death, personal injury or fraud, and cannot exclude the
 *     statutory quality rights at all. The draft caps what can be capped and says
 *     plainly what cannot.
 *
 * TEMPLATE only — the renderer always stamps the red banner.
 */

import type { LegalDocGenerator } from "./types";

export const termsGenerator: LegalDocGenerator = {
  key: "terms",
  title: "Terms & conditions",
  summary:
    "How people may use your site or service, what you promise, and what you are liable for. The document that gets cited when something goes wrong.",
  fields: [
    {
      id: "company_name",
      label: "Legal company name",
      type: "short_text",
      helper: "The entity actually contracting with the customer.",
      prefillKey: "legalCompanyName",
      required: true,
      width: "half",
    },
    {
      id: "trading_name",
      label: "Trading name",
      type: "short_text",
      prefillKey: "clientName",
      fallbackId: "company_name",
      width: "half",
    },
    {
      id: "company_number",
      label: "Company number",
      type: "short_text",
      prefillKey: "companyNumber",
      width: "half",
    },
    {
      id: "vat_number",
      label: "VAT number",
      type: "short_text",
      helper: "Leave blank if not VAT-registered.",
      prefillKey: "vatNumber",
      width: "half",
    },
    {
      id: "registered_address",
      label: "Registered address",
      type: "long_text",
      prefillKey: "registeredAddress",
      required: true,
    },
    {
      id: "website_url",
      label: "Website / service",
      type: "url",
      prefillKey: "website",
      required: true,
      width: "half",
    },
    {
      id: "contact_email",
      label: "Contact email",
      type: "email",
      prefillKey: "primaryContactEmail",
      required: true,
      width: "half",
    },
    {
      id: "effective_date",
      label: "Effective date",
      type: "short_text",
      helper: "e.g. 1 September 2026.",
      required: true,
      width: "half",
    },
    {
      id: "service_description",
      label: "What the service is",
      type: "long_text",
      helper: "A plain description of what customers get. This is the clause a dispute usually turns on, so be concrete.",
      required: true,
    },
    {
      id: "customer_type",
      label: "Who your customers are",
      type: "select",
      helper:
        "This genuinely changes the document. Consumers have statutory rights you cannot contract out of; business customers largely do not.",
      options: [
        { id: "consumers", label: "Consumers (individuals)" },
        { id: "businesses", label: "Businesses only (B2B)" },
        { id: "both", label: "Both" },
      ],
      required: true,
    },
    {
      id: "sells_products",
      label: "You sell goods, services or subscriptions through this site",
      type: "checkbox",
      helper: "Ticking this makes the payment, cancellation and refund clauses apply.",
    },
    {
      id: "pricing_terms",
      label: "Pricing & payment terms",
      type: "long_text",
      helper:
        "How you charge, when payment is taken, whether prices include VAT, and how renewals work for a subscription.",
    },
    {
      id: "refund_policy",
      label: "Refund policy",
      type: "long_text",
      helper:
        "Your actual policy. Note this sits ON TOP of a consumer's statutory 14-day cancellation right — it cannot reduce it.",
    },
    {
      id: "user_accounts",
      label: "Users can create accounts",
      type: "checkbox",
    },
    {
      id: "user_content",
      label: "Users can post or upload content",
      type: "checkbox",
      helper: "Adds an acceptable-use and content-licence clause.",
    },
    {
      id: "governing_law",
      label: "Governing law",
      type: "select",
      options: [
        { id: "england_wales", label: "England & Wales" },
        { id: "scotland", label: "Scotland" },
        { id: "northern_ireland", label: "Northern Ireland" },
      ],
      required: true,
    },
  ],
  sectionGates: {
    "Your account": "user_accounts",
    "Content you post": "user_content",
    "Prices and payment": "sells_products",
    "Cancellation and refunds": "sells_products",
  },
  template: `# Terms & conditions

These terms govern your use of {{website_url}} and anything you buy through it. Please read them — by using the site you agree to them.

Effective from {{effective_date}}.

## Who we are

{{company_name}}, trading as {{trading_name}}, is a company registered in the United Kingdom.

Company number: {{company_number}}

VAT registration number: {{vat_number}}

Our registered address is:

{{registered_address}}

Contact us at **{{contact_email}}**.

## The service

{{service_description}}

We may change or improve the service over time. Where a change materially reduces what you have paid for, we will tell you and you may cancel.

## Who these terms are for

Our customers are: {{customer_type}}

If you are a consumer, nothing in these terms affects your statutory rights. Where any clause here conflicts with those rights, your statutory rights win.

## Your account

Where the service lets you create an account, you agree to give accurate information, keep your password secure, and tell us promptly at {{contact_email}} if you think someone else has accessed it. You are responsible for activity under your account, except where it results from our failure to keep the service secure.

We may suspend or close an account that breaches these terms. Where we do, we will tell you why and give you a chance to respond, unless the breach is serious enough that we cannot.

## Acceptable use

You agree not to:

- Use the service unlawfully, fraudulently, or for any harmful purpose.
- Upload anything unlawful, defamatory, obscene, or infringing someone else's rights.
- Attempt to gain unauthorised access to the service or the systems behind it.
- Introduce malware, or interfere with the service's operation or availability.
- Scrape, copy or resell the service or its content without our written permission.

## Content you post

You keep ownership of anything you post. You grant us a non-exclusive, royalty-free licence to host, store and display it as far as we need to in order to run the service.

You confirm you have the right to post what you post. We may remove content that breaches these terms or the law.

## Prices and payment

{{pricing_terms}}

We take reasonable care to price and describe everything accurately. If we discover a genuine error in a price or description after you have ordered, we will contact you and you may confirm the order at the correct price or cancel it for a full refund.

## Cancellation and refunds

**If you are a consumer**, the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 give you the right to cancel most distance purchases within **14 days**, without giving a reason, and receive a refund. To cancel, email {{contact_email}}.

Two exceptions worth knowing:

1. **Digital content** — where you have asked to access it immediately and acknowledged that doing so ends your cancellation right, that right no longer applies to content already delivered.
2. **Services already performed** — where you asked us to start during the cancellation period, we may charge for what was actually provided before you cancelled.

Our own refund policy, which sits on top of those rights and does not reduce them:

{{refund_policy}}

**If you are a business customer**, cancellation is as set out in your order or agreement with us.

## Availability

We aim to keep the service available and working, but we do not promise it will be uninterrupted or error-free. We may suspend it for maintenance, and will give notice where we reasonably can.

## Our liability

Nothing in these terms limits or excludes our liability for:

- Death or personal injury caused by our negligence;
- Fraud or fraudulent misrepresentation;
- Any other liability that cannot lawfully be limited or excluded.

**If you are a consumer**, we are responsible for loss or damage you suffer that is a foreseeable result of our breaking these terms or failing to use reasonable care and skill. We are not responsible for loss that is not foreseeable. Your statutory rights under the Consumer Rights Act 2015 — that services are performed with reasonable care and skill, and that goods are as described and of satisfactory quality — apply in full and are not affected by anything here.

**If you are a business customer**, we are not liable for loss of profit, loss of business, business interruption, or loss of anticipated savings, and our total liability arising out of or in connection with these terms is limited to the total amount you paid us in the 12 months before the claim arose.

## Intellectual property

We own, or are licensed to use, the service and its content — including its design, text, graphics and software. You may use it for its intended purpose, and may not copy, adapt or redistribute it without our written permission.

## Ending these terms

You may stop using the service at any time. We may end your access if you materially breach these terms and do not put it right after we have asked you to.

## Changes to these terms

We may update these terms. Where a change materially affects you, we will give reasonable notice before it takes effect. Continuing to use the service after that means you accept the updated terms. The effective date at the top always reflects the current version.

## Complaints and disputes

Please contact us first at **{{contact_email}}** — most things are quickest to resolve directly.

These terms are governed by the law of {{governing_law}}, and its courts have exclusive jurisdiction. If you are a consumer resident elsewhere in the UK, you may also bring proceedings in your own courts.`,
};
