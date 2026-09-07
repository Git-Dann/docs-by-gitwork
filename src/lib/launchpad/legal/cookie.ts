/**
 * Cookie policy — boilerplate draft.
 *
 * UK-oriented: the operative law is the Privacy and Electronic Communications
 * Regulations (PECR), not UK GDPR — which matters because PECR requires consent
 * BEFORE a non-essential cookie is set, and it applies whether or not the cookie
 * carries personal data. That is the single most commonly missed point in a real
 * cookie policy, so the draft states it plainly rather than implying it.
 *
 * TEMPLATE only — the renderer always stamps the red banner.
 */

import type { LegalDocGenerator } from "./types";

export const cookieGenerator: LegalDocGenerator = {
  key: "cookie",
  title: "Cookie policy",
  summary:
    "What cookies you set and how people control them. Required in the UK/EU the moment the site sets any non-essential cookie — analytics counts.",
  fields: [
    {
      id: "company_name",
      label: "Legal company name",
      type: "short_text",
      prefillKey: "legalCompanyName",
      required: true,
      width: "half",
    },
    {
      id: "trading_name",
      label: "Trading name",
      type: "short_text",
      helper: "The name your users know you by, if different.",
      prefillKey: "clientName",
      fallbackId: "company_name",
      width: "half",
    },
    {
      id: "website_url",
      label: "Website this covers",
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
      id: "consent_approach",
      label: "How you handle consent",
      type: "select",
      helper:
        "\"Essential only\" is the one option that needs no banner at all — worth choosing if you can live without analytics.",
      options: [
        { id: "essential_only", label: "Essential cookies only — no consent banner" },
        { id: "banner", label: "Consent banner before non-essential cookies are set" },
        { id: "cmp", label: "Third-party consent management platform" },
      ],
      required: true,
    },
    {
      id: "essential_cookies",
      label: "Essential cookies you set",
      type: "long_text",
      helper:
        "One per line, as `name — what it does — how long it lasts`. These are the ones the site cannot work without: session, login, cart, CSRF token.",
      required: true,
      renderAs: "list",
    },
    {
      id: "analytics_cookies",
      label: "Analytics cookies",
      type: "long_text",
      helper:
        "One per line. Leave blank if you set none. Analytics is NOT essential under PECR, however useful it is to you — it needs consent.",
      renderAs: "list",
    },
    {
      id: "marketing_cookies",
      label: "Marketing / advertising cookies",
      type: "long_text",
      helper:
        "One per line. Leave blank if you set none. Anything from an ad network, a retargeting pixel or an embedded social player belongs here.",
      renderAs: "list",
    },
    {
      id: "third_party_embeds",
      label: "Third-party embeds",
      type: "long_text",
      helper:
        "Embedded YouTube, Maps, chat widgets, social feeds. Each can set its own cookies from its own domain, which you are still responsible for disclosing.",
      renderAs: "list",
    },
  ],
  sectionGates: {
    "Analytics cookies": "analytics_cookies",
    "Marketing cookies": "marketing_cookies",
    "Third-party content": "third_party_embeds",
  },
  template: `# Cookie policy

This policy explains how **{{trading_name}}** uses cookies and similar technologies on {{website_url}}, and how you can control them.

Effective from {{effective_date}}.

The cookies described here are set by {{company_name}}, or by the third parties named below on our behalf.

## What cookies are

A cookie is a small text file a website stores on your device. It lets the site remember things between pages and visits — that you are signed in, what is in your basket, or which language you chose. Some cookies are set by us, and some by third-party services we use.

We also use technologies that work like cookies, such as local storage and pixels. Where we say "cookies" in this policy, we mean all of them.

## Your consent

Under the UK's Privacy and Electronic Communications Regulations (PECR), we may only set cookies that are **strictly necessary** without asking you first. Everything else — including analytics — requires your consent before it is set, not after.

Our approach on this site: {{consent_approach}}

You can change or withdraw your choice at any time using the cookie settings on our site, or by clearing cookies in your browser.

## Strictly necessary cookies

These are required for the site to function. They do not need your consent, and turning them off would break the site.

{{essential_cookies}}

## Analytics cookies

These help us understand how the site is used so we can improve it. They are only set if you consent.

{{analytics_cookies}}

## Marketing cookies

These are used to make advertising more relevant to you, and may track you across sites. They are only set if you consent.

{{marketing_cookies}}

## Third-party content

Some pages include content from other services, which may set their own cookies:

{{third_party_embeds}}

We do not control these cookies. Their own privacy and cookie policies explain what they do, and we recommend reading them if you are concerned.

## How to control cookies

You have three routes:

1. **Our cookie settings** — change your consent choices at any time on our site.
2. **Your browser** — every major browser lets you block or delete cookies. Blocking strictly necessary cookies will stop parts of the site working.
3. **Opt-out tools** — the [Your Online Choices](https://www.youronlinechoices.com/uk/) site lets you opt out of many advertising cookies at once.

## More information

For how we handle personal data generally, see our privacy policy.

Questions about this policy: **{{contact_email}}**.

You can also complain to the Information Commissioner's Office at [ico.org.uk/make-a-complaint](https://ico.org.uk/make-a-complaint).

## Changes

We update this policy when the cookies we use change. The effective date at the top always reflects the current version.`,
};
