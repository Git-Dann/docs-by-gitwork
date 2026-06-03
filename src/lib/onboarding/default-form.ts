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

/** Constant slug for the seeded default form (idempotent upsert key in bootstrap). */
export const DEFAULT_ONBOARDING_FORM_SLUG = "gitwork-onboarding-default";

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
