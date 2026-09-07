/**
 * Privacy policy — boilerplate draft.
 *
 * UK-oriented: written against UK GDPR + the Data Protection Act 2018, which is
 * what applies to a Gitwork client by default. It is a TEMPLATE and the renderer
 * always stamps the red banner saying so.
 *
 * Structured to satisfy the UK GDPR Article 13/14 transparency list, because that
 * is the actual test a policy has to pass: identity of the controller, purposes and
 * lawful basis, recipients, retention, data-subject rights, and the right to
 * complain to the ICO. A policy missing those is not merely thin, it is
 * non-compliant — and both app stores also refuse a submission without a reachable
 * privacy URL, so this doubles as the store requirement.
 */

import type { LegalDocGenerator } from "./types";

export const privacyGenerator: LegalDocGenerator = {
  key: "privacy",
  title: "Privacy policy",
  summary:
    "What personal data you collect, why, and what people can do about it. Legally required in the UK/EU, and both app stores refuse a submission without a working privacy URL.",
  fields: [
    {
      id: "company_name",
      label: "Legal company name",
      type: "short_text",
      helper: "The registered entity that controls the data — this is your \"data controller\".",
      prefillKey: "legalCompanyName",
      required: true,
      width: "half",
    },
    {
      id: "trading_name",
      label: "Trading name",
      type: "short_text",
      helper: "The name your users know you by, if different from the legal entity.",
      prefillKey: "clientName",
      fallbackId: "company_name",
      width: "half",
    },
    {
      id: "registered_address",
      label: "Registered address",
      type: "long_text",
      helper: "Required — a policy has to say where the controller is established.",
      prefillKey: "registeredAddress",
      required: true,
    },
    {
      id: "website_url",
      label: "Website",
      type: "url",
      prefillKey: "website",
      required: true,
      width: "half",
    },
    {
      id: "contact_email",
      label: "Privacy contact email",
      type: "email",
      helper: "Where data requests and privacy questions go. A monitored inbox — this address is a legal commitment.",
      prefillKey: "primaryContactEmail",
      required: true,
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
      id: "effective_date",
      label: "Effective date",
      type: "short_text",
      helper: "The date this version takes effect, e.g. 1 September 2026.",
      required: true,
      width: "half",
    },
    {
      id: "data_collected",
      label: "What personal data you collect",
      type: "long_text",
      helper:
        "One per line. Be specific — \"name, email address, delivery address, order history, IP address\" rather than \"user details\".",
      required: true,
      renderAs: "list",
    },
    {
      id: "purposes",
      label: "What you use it for",
      type: "long_text",
      helper: "One purpose per line, e.g. \"To fulfil and deliver your orders\".",
      required: true,
      renderAs: "list",
    },
    {
      id: "processors",
      label: "Who else processes it",
      type: "long_text",
      helper:
        "One per line — your hosting, analytics, email and payment providers. UK GDPR requires you to name the categories of recipient, and an incomplete list is the commonest defect in a real policy.",
      required: true,
      renderAs: "list",
    },
    {
      id: "retention_period",
      label: "How long you keep it",
      type: "short_text",
      helper: "e.g. \"for as long as you have an account, then 6 years for tax records\".",
      required: true,
    },
    {
      id: "international_transfers",
      label: "Is data transferred outside the UK?",
      type: "select",
      helper:
        "Most stacks do transfer — a US-hosted analytics or email provider counts. If so you need a lawful transfer mechanism, which your lawyer should confirm.",
      options: [
        { id: "no", label: "No — everything stays in the UK/EEA" },
        { id: "yes", label: "Yes — some providers are outside the UK/EEA" },
        { id: "unsure", label: "Not sure" },
      ],
      required: true,
    },
    {
      id: "uses_cookies",
      label: "The site or app sets cookies or similar tracking",
      type: "checkbox",
      helper: "Ticking this adds a cookies section pointing at your cookie policy.",
    },
    {
      id: "children",
      label: "Service is intended for under-18s",
      type: "checkbox",
      helper:
        "Tick only if children are an intended audience — it triggers the ICO's Age Appropriate Design Code, which is a substantial extra obligation and needs specialist advice.",
    },
  ],
  sectionGates: {
    Cookies: "uses_cookies",
    Children: "children",
  },
  template: `# Privacy policy

**{{trading_name}}** ("we", "us") is committed to protecting your personal data. This policy explains what we collect, why we collect it, and the rights you have over it.

This policy is effective from {{effective_date}}.

## Who we are

{{company_name}} is the data controller for the personal data described in this policy.

Company number: {{company_number}}

Our registered address is:

{{registered_address}}

You can reach us about anything in this policy at **{{contact_email}}**, or through our website at {{website_url}}.

## What personal data we collect

We collect the following:

{{data_collected}}

## Why we collect it, and our lawful basis

We use your personal data for these purposes:

{{purposes}}

Under UK GDPR we must have a lawful basis for each purpose. Depending on the activity, we rely on:

- **Contract** — where we need the data to provide the service you have asked for.
- **Legitimate interests** — where processing is necessary to run and improve our business, and does not override your rights.
- **Consent** — where we have asked for your permission, for example for marketing emails or non-essential cookies. You can withdraw consent at any time.
- **Legal obligation** — where the law requires us to keep or disclose the data, for example tax records.

## Who we share it with

We use third-party providers to run our service. Each acts on our instructions under a written agreement, and none is permitted to use your data for its own purposes:

{{processors}}

We may also disclose personal data where we are legally required to, or to establish or defend legal claims.

## Where your data is held

Transfers outside the UK or EEA: {{international_transfers}}

Where personal data is transferred outside the UK, we ensure a lawful transfer mechanism is in place — such as the UK International Data Transfer Agreement, or an adequacy decision covering the destination country.

## How long we keep it

{{retention_period}}

When we no longer need your personal data, we delete it or irreversibly anonymise it.

## How we protect it

We use appropriate technical and organisational measures to protect personal data, including encryption in transit, access controls limiting who can see it, and regular review of our providers. No system is completely secure, so we cannot guarantee absolute security — but we do notify the ICO, and you where required, if a breach is likely to affect your rights.

## Your rights

Under UK GDPR you have the right to:

1. **Be informed** about how your data is used — this policy.
2. **Access** a copy of the personal data we hold about you.
3. **Rectification** of data that is inaccurate or incomplete.
4. **Erasure** of your data, where there is no overriding reason to keep it.
5. **Restrict processing** in certain circumstances.
6. **Data portability** — receive your data in a portable format.
7. **Object** to processing based on legitimate interests, and to direct marketing at any time.
8. **Not be subject** to solely automated decisions with legal or similarly significant effects.

To exercise any of these, email **{{contact_email}}**. We will respond within one month. We do not charge for this, and we may ask you to confirm your identity first.

## Complaints

If you are unhappy with how we have handled your personal data, please contact us first at {{contact_email}} so we can try to put it right.

You also have the right to complain to the Information Commissioner's Office (ICO), the UK's data protection regulator, at [ico.org.uk/make-a-complaint](https://ico.org.uk/make-a-complaint) or on 0303 123 1113. You can complain to the ICO without contacting us first.

## Cookies

Where we set cookies or similar technologies, we explain what they do and ask for your consent to any that are not strictly necessary. See our cookie policy for the detail.

## Children

Our service is not directed at children, and we do not knowingly collect personal data from anyone under 13. If you believe a child has given us personal data, contact {{contact_email}} and we will delete it.

## Changes to this policy

We may update this policy as our service changes. Where a change materially affects your rights, we will tell you directly rather than only updating this page. The effective date at the top always reflects the current version.`,
};
