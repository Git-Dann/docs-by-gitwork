/**
 * The default onboarding form — today's hand-written 7-step flow expressed as an
 * `OnboardingFormStructure`, with copy lifted verbatim from the original
 * `onboarding-flow.tsx`.
 *
 * Two roles:
 *   1. The public flow's fallback when a `ClientOnboarding` row has no
 *      `formSnapshot` (legacy links) — so they render exactly as before.
 *   2. The seed for the first `OnboardingForm` (isDefault) in `bootstrap.ts`.
 *
 * System-field ids === their column name (so this lines up with existing columns
 * and in-flight links). New forms snapshot a structure of the same shape.
 */

import { systemFieldDef } from "@/lib/onboarding/system-fields";
import type {
  OnboardingFieldDef,
  OnboardingFieldShowIf,
  OnboardingFormStructure,
} from "@/types/onboarding";

/** Constant slugs for the seeded forms (idempotent upsert keys in bootstrap). */
export const DEFAULT_ONBOARDING_FORM_SLUG = "gitwork-onboarding-default";
export const QUICK_ONBOARDING_FORM_SLUG = "gitwork-onboarding-quick";
export const ENTERPRISE_ONBOARDING_FORM_SLUG = "gitwork-onboarding-enterprise";

/** A custom (non-system) field — answer stored in ClientOnboarding.answers JSON. */
function custom(field: OnboardingFieldDef): OnboardingFieldDef {
  return field;
}

/** Resolve a system field def by key (throws in dev if the catalog is out of sync). */
function sys(systemKey: string): OnboardingFieldDef {
  const def = systemFieldDef(systemKey);
  if (!def) throw new Error(`Unknown system field: ${systemKey}`);
  return def;
}

/** A read-only copy block (label = mono sub-heading, body = paragraph). */
function staticField(
  id: string,
  label: string,
  body?: string,
  showIf?: OnboardingFieldShowIf,
): OnboardingFieldDef {
  return { id, type: "static", label, ...(body ? { config: { body } } : {}), ...(showIf ? { showIf } : {}) };
}

const BILLING_VISIBLE: OnboardingFieldShowIf = { fieldId: "billingDiffers", equals: true };

export function getDefaultOnboardingForm(): OnboardingFormStructure {
  return {
    welcome: {
      eyebrow: "Onboarding · ~3 mins",
      heading: "Let's get your project set up.",
      subheading: "A quick walk-through of who you are and what you're building.",
      bullets: [
        "Save and resume anytime — your answers are stored against this private link.",
        "Bank details are encrypted at rest. Only Gitwork staff can see them.",
        "Once you submit, our team will review your details and get back to you shortly.",
      ],
      ctaLabel: "Get started",
    },
    steps: [
      {
        id: "you",
        key: "you",
        title: "About you",
        blurb: "Who's the primary contact for this project? Everything we send goes here first.",
        fields: [
          sys("contactFirstName"),
          sys("contactLastName"),
          sys("contactEmail"),
          sys("contactRole"),
          sys("contactPhone"),
        ],
      },
      {
        id: "company",
        key: "company",
        title: "Company & billing",
        blurb:
          "Where invoices and contracts should be addressed. The legal name lines up with Companies House if you have one.",
        fields: [
          sys("companyName"),
          sys("legalCompanyName"),
          sys("companyNumber"),
          sys("vatNumber"),
          sys("invoiceEmail"),
          staticField("addr-heading", "Registered address"),
          sys("addressLine1"),
          sys("addressLine2"),
          sys("city"),
          sys("county"),
          sys("postcode"),
          sys("country"),
          sys("billingDiffers"),
          staticField("billing-heading", "Billing address", undefined, BILLING_VISIBLE),
          sys("billingAddressLine1"),
          sys("billingAddressLine2"),
          sys("billingCity"),
          sys("billingCounty"),
          sys("billingPostcode"),
          sys("billingCountry"),
        ],
      },
      {
        id: "product",
        key: "product",
        title: "Your product",
        blurb:
          "Tell us about the product. If it's already live, drop the URL — we'll take a quick look. (We don't run any deep scans until you officially come on board.)",
        fields: [sys("productName"), sys("productUrl"), sys("productDescription")],
      },
      {
        id: "goals",
        key: "goals",
        title: "What you're hoping for",
        blurb:
          "What are you hoping Gitwork can help with? Build it from scratch, take it from prototype to production, fix a particular pain point — whatever's most useful for us to know.",
        fields: [sys("projectGoals")],
      },
      {
        id: "bank",
        key: "bank",
        title: "Bank details",
        fields: [sys("bankDetails")],
      },
    ],
    review: {
      blurb: "Quick check before you send. Tap a section to edit.",
      legal:
        "Your service agreement and welcome pack are sent separately once we've reviewed this — nothing to sign here.",
      agreement:
        "By submitting, you confirm the answers above are accurate and you're happy for Gitwork to use them to set up your engagement. You'll still be able to make changes via this link until we move you to active workflow.",
    },
  };
}

/**
 * "Quick start" — a lightweight intro form for small/fast engagements: just who
 * you are, your company name, and what you need. No bank/legal/address (collected
 * later if the project goes ahead).
 */
export function getQuickOnboardingForm(): OnboardingFormStructure {
  return {
    welcome: {
      eyebrow: "Quick start · ~1 min",
      heading: "Let's get the basics down.",
      subheading: "A few quick questions so we can pick up the conversation properly.",
      bullets: [
        "Takes about a minute — your answers save against this private link.",
        "No bank or legal details here; we'll sort those once we're working together.",
      ],
      ctaLabel: "Get started",
    },
    steps: [
      {
        id: "you",
        key: "you",
        title: "About you",
        blurb: "Who's the best person for us to talk to?",
        fields: [
          sys("contactFirstName"),
          sys("contactLastName"),
          sys("contactEmail"),
          sys("contactPhone"),
        ],
      },
      {
        id: "company",
        key: "company",
        title: "Your company",
        blurb: "Just the essentials for now.",
        fields: [sys("companyName"), sys("productUrl")],
      },
      {
        id: "goals",
        key: "goals",
        title: "What you need",
        blurb: "A sentence or two on what you're hoping Gitwork can help with.",
        fields: [sys("projectGoals")],
      },
    ],
    review: {
      blurb: "Quick check before you send.",
      legal: "We'll review this and come straight back to you.",
      agreement:
        "By submitting, you confirm these details are accurate and you're happy for Gitwork to use them to follow up.",
    },
  };
}

/**
 * "Enterprise" — a thorough form for larger engagements. Everything the standard
 * form captures, plus procurement (PO + AP contact), a security & compliance step,
 * and key-stakeholder context (all custom questions stored in answers JSON).
 */
export function getEnterpriseOnboardingForm(): OnboardingFormStructure {
  return {
    welcome: {
      eyebrow: "Onboarding · ~5 mins",
      heading: "Welcome aboard.",
      subheading: "A thorough walk-through so procurement, security and delivery are all set from day one.",
      bullets: [
        "Save and resume anytime — your answers are stored against this private link.",
        "Bank and procurement details are encrypted at rest. Only Gitwork staff can see them.",
        "Once you submit, our team reviews everything and confirms next steps.",
      ],
      ctaLabel: "Get started",
    },
    steps: [
      {
        id: "you",
        key: "you",
        title: "Your details",
        blurb: "Who's the primary contact for this engagement?",
        fields: [
          sys("contactFirstName"),
          sys("contactLastName"),
          sys("contactEmail"),
          sys("contactRole"),
          sys("contactPhone"),
        ],
      },
      {
        id: "company",
        key: "company",
        title: "Company & billing",
        blurb:
          "Where contracts and invoices should be addressed. The legal name lines up with Companies House.",
        fields: [
          sys("companyName"),
          sys("legalCompanyName"),
          sys("companyNumber"),
          sys("vatNumber"),
          sys("invoiceEmail"),
          custom({
            id: "po-number",
            type: "short_text",
            label: "Purchase order (PO) number",
            hint: "If your finance team requires a PO referenced on invoices.",
            config: { maxLength: 60, width: "half" },
          }),
          custom({
            id: "ap-contact",
            type: "email",
            label: "Accounts payable contact",
            placeholder: "accounts@company.com",
            config: { width: "half" },
          }),
          staticField("addr-heading", "Registered address"),
          sys("addressLine1"),
          sys("addressLine2"),
          sys("city"),
          sys("county"),
          sys("postcode"),
          sys("country"),
          sys("billingDiffers"),
          staticField("billing-heading", "Billing address", undefined, BILLING_VISIBLE),
          sys("billingAddressLine1"),
          sys("billingAddressLine2"),
          sys("billingCity"),
          sys("billingCounty"),
          sys("billingPostcode"),
          sys("billingCountry"),
        ],
      },
      {
        id: "security",
        key: "security",
        title: "Security & compliance",
        blurb: "So we can line up any agreements or reviews your organisation needs.",
        fields: [
          custom({
            id: "dpa-required",
            type: "select",
            label: "Do you require a signed Data Processing Agreement (DPA)?",
            options: [
              { id: "yes", label: "Yes" },
              { id: "no", label: "No" },
              { id: "unsure", label: "Not sure yet" },
            ],
          }),
          custom({
            id: "security-questionnaire",
            type: "checkbox",
            label: "We'll need Gitwork to complete a security questionnaire",
          }),
          custom({
            id: "data-residency",
            type: "short_text",
            label: "Data residency requirements",
            hint: "e.g. data must stay in the UK or EU.",
            config: { maxLength: 200 },
          }),
          custom({
            id: "comms-channel",
            type: "select",
            label: "Preferred comms channel",
            options: [
              { id: "email", label: "Email" },
              { id: "slack", label: "Slack" },
              { id: "teams", label: "Microsoft Teams" },
            ],
          }),
        ],
      },
      {
        id: "product",
        key: "product",
        title: "Your product",
        blurb: "Tell us about what we'll be working on.",
        fields: [sys("productName"), sys("productUrl"), sys("productDescription")],
      },
      {
        id: "goals",
        key: "goals",
        title: "Goals & stakeholders",
        blurb: "What you're hoping for, and who's involved on your side.",
        fields: [
          sys("projectGoals"),
          custom({
            id: "stakeholders",
            type: "long_text",
            label: "Key stakeholders & their roles",
            hint: "Who are the decision-makers and reviewers we'll be working with?",
            config: { rows: 3, maxLength: 1000 },
          }),
        ],
      },
      {
        id: "bank",
        key: "bank",
        title: "Bank details",
        fields: [sys("bankDetails")],
      },
    ],
    review: {
      blurb: "Quick check before you send. Tap a section to edit.",
      legal:
        "Your service agreement, DPA and welcome pack are sent separately once we've reviewed this — nothing to sign here.",
      agreement:
        "By submitting, you confirm the answers above are accurate and you're happy for Gitwork to use them to set up your engagement. You'll still be able to make changes via this link until we move you to active workflow.",
    },
  };
}
