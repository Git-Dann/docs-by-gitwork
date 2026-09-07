/**
 * The default Launchpad template — everything Gitwork needs FROM a client to
 * start and ship, expressed as a `LaunchpadStructure`.
 *
 * Two roles, mirroring `src/lib/onboarding/default-form.ts`:
 *   1. The fallback structure when a `ClientLaunchpad` row has no usable snapshot.
 *   2. The seed for the first `LaunchpadTemplate` (isDefault) in `bootstrap.ts`.
 *
 * House rule for every requirement in here: it carries a `helper` saying WHY we
 * need it and HOW they get it. A checklist of bare nouns ("Privacy nutrition
 * answers") makes the client guess, and guessing is what the back-and-forth this
 * feature exists to remove is made of.
 *
 * ⚠️ `prefillKey` names a key in the server's PREFILL_SOURCES allow-list
 * (`src/server/launchpad.ts`) — NOT a database column. Template JSON is operator-
 * editable, so a key that resolved straight to a column name would let a template
 * edit read anything on the client record, encrypted bank details included.
 */

import type {
  LaunchpadDocKey,
  LaunchpadFieldDef,
  LaunchpadModule,
  LaunchpadStructure,
} from "@/types/launchpad";

/** Constant slug for the seeded template (the idempotent upsert key in bootstrap). */
export const DEFAULT_LAUNCHPAD_TEMPLATE_SLUG = "gitwork-launchpad-default";
export const DEFAULT_LAUNCHPAD_TEMPLATE_NAME = "Gitwork Launchpad";

/** A tracked requirement. Accounts default to client-owned — see `ownedByClient`. */
function req(
  id: string,
  label: string,
  helper: string,
  opts: { ownedByClient?: boolean } = {},
): LaunchpadFieldDef {
  return {
    id,
    type: "checklist_item",
    label,
    helper,
    ...(opts.ownedByClient !== undefined ? { ownedByClient: opts.ownedByClient } : {}),
  };
}

/**
 * An ACCOUNT the client must own. Always `ownedByClient: true`: an App Store or
 * Stripe account in Gitwork's name is a commercial and legal problem for the
 * client the day they want to leave, and unpicking it later means re-submitting an
 * app or re-verifying a merchant. The operator can still flip it per client.
 */
function account(id: string, label: string, helper: string): LaunchpadFieldDef {
  return req(id, label, helper, { ownedByClient: true });
}

function text(
  id: string,
  label: string,
  helper: string,
  opts: {
    type?: LaunchpadFieldDef["type"];
    prefillKey?: string;
    placeholder?: string;
    width?: "full" | "half";
    rows?: number;
  } = {},
): LaunchpadFieldDef {
  return {
    id,
    type: opts.type ?? "short_text",
    label,
    helper,
    ...(opts.prefillKey ? { prefillKey: opts.prefillKey } : {}),
    ...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
    ...(opts.width || opts.rows ? { config: { ...(opts.width ? { width: opts.width } : {}), ...(opts.rows ? { rows: opts.rows } : {}) } } : {}),
  };
}

function link(id: string, label: string, helper: string): LaunchpadFieldDef {
  return { id, type: "link", label, helper, placeholder: "https://…" };
}

function legalDoc(id: string, label: string, docKey: LaunchpadDocKey, helper: string): LaunchpadFieldDef {
  return { id, type: "legal_doc", label, docKey, helper };
}

// ─── Modules ──────────────────────────────────────────────────────────────────

function foundations(): LaunchpadModule {
  return {
    id: "foundations",
    title: "Foundations",
    blurb:
      "The basics every engagement needs, whatever we're building. Start here — a few of these unblock everything else.",
    alwaysOn: true,
    fields: [
      text("legal_entity_name", "Legal entity name", "The registered company name, exactly as it appears at Companies House — contracts and invoices have to match it.", {
        prefillKey: "legalCompanyName",
        placeholder: "Acme Health Ltd",
      }),
      text("company_number", "Company number", "Companies House registration number. We put it on contracts and any legal page we generate for you.", {
        prefillKey: "companyNumber",
        width: "half",
        placeholder: "12345678",
      }),
      text("vat_number", "VAT number", "If you're VAT-registered. Leave blank if not — we'll invoice without VAT.", {
        prefillKey: "vatNumber",
        width: "half",
        placeholder: "GB123456789",
      }),
      text("registered_address", "Registered address", "Your registered office, as filed. This is the address that appears on legal pages and invoices.", {
        type: "long_text",
        prefillKey: "registeredAddress",
        rows: 3,
      }),
      text("primary_contact", "Primary contact", "Who we come to first with questions. One name — a shared inbox slows decisions down.", {
        prefillKey: "primaryContactName",
        width: "half",
      }),
      text("primary_contact_email", "Primary contact email", "Where day-to-day updates go.", {
        type: "email",
        prefillKey: "primaryContactEmail",
        width: "half",
      }),
      text("billing_contact_email", "Billing contact", "Where invoices go, if that's someone else. Leave blank to use the primary contact.", {
        type: "email",
        prefillKey: "invoiceEmail",
        width: "half",
      }),
      text("technical_contact", "Technical contact", "Whoever we ask about existing systems, access and DNS. Leave blank if that's also the primary contact.", {
        width: "half",
      }),
      req("brand_assets", "Brand assets", "Logo files (SVG or PNG with transparency), your colour values and font files or names. Without these the first build carries placeholder branding you'll have to review twice."),
      link("brand_assets_link", "Brand assets link", "A Drive, Dropbox or Figma link is fine — we don't need the files sent over."),
      req("tone_and_content", "Tone & written content", "How you want to sound, plus any copy you already have. We can write to a brief, but rewriting your voice from scratch is slower and rarely lands first time."),
      req("existing_accounts_access", "Access to existing accounts", "A list of systems we'll need into (repos, hosting, analytics, CMS) and who can grant it. Naming them now means one access request instead of five.", { ownedByClient: true }),
      text("credential_channel", "Where we'll share credentials", "Pick a password manager or vault you already use and we'll share through it. Please don't send credentials over Slack or email — anything sent there is in the history permanently and we'd only ask you to rotate it.", {
        placeholder: "1Password / Bitwarden / LastPass shared vault",
      }),
    ],
  };
}

function website(): LaunchpadModule {
  return {
    id: "website",
    title: "Website",
    blurb: "Everything needed to build, host and legally publish the site.",
    fields: [
      account("domain_and_dns", "Domain + DNS access", "The domain and a way to change its DNS records. We need this to point the site at our hosting and to set up email records — it's usually the single longest lead time on a launch, so it's worth starting now."),
      account("hosting_registrar_access", "Hosting / registrar access", "Where the domain is registered and where the current site is hosted, if either already exists."),
      account("analytics_account", "Analytics account", "A Google Analytics (or Plausible / Fathom) property, or tell us to create one. Without it the site launches with no measurement and the first month's traffic is lost."),
      req("website_content", "Content & imagery", "Page copy and any photography you want used. Stock imagery is fine as a fallback but reads generic — real photos of the team or product convert better."),
      account("cms_credentials", "Existing CMS credentials", "Only if you have a current site we're migrating from. Skip this if the build is from scratch."),
      legalDoc("legal_cookie", "Cookie policy", "cookie", "A draft you can fill in and hand to your lawyer. Required in the UK/EU the moment the site sets any non-essential cookie — analytics counts."),
      legalDoc("legal_terms", "Terms & conditions", "terms", "A draft covering how people may use the site or service, and what you're liable for."),
      legalDoc("legal_privacy", "Privacy policy", "privacy", "A draft of what personal data you collect and why. Legally required in the UK/EU, and both app stores refuse a submission without a working privacy URL."),
    ],
  };
}

function payments(): LaunchpadModule {
  return {
    id: "payments",
    title: "Payments",
    blurb:
      "Taking money involves verification that can take days, so start these early — it's the module most likely to hold up a launch.",
    fields: [
      {
        id: "payment_provider",
        type: "select",
        label: "Payment provider",
        helper: "Stripe unless you have a reason otherwise — it's the fastest to verify and what we've integrated most.",
        options: [
          { id: "stripe", label: "Stripe" },
          { id: "paypal", label: "PayPal" },
          { id: "adyen", label: "Adyen" },
          { id: "worldpay", label: "Worldpay" },
          { id: "other", label: "Other / not decided" },
        ],
      },
      account("merchant_account", "Merchant account", "Created in your company's name, with us added as a team member. It has to be yours — payouts go to your bank and the account carries your liability, so an account in Gitwork's name would have to be rebuilt before you could ever leave."),
      req("business_verification", "Business verification documents", "Providers ask for proof of incorporation, a director ID and sometimes proof of address. Gathering them before you apply turns a week of back-and-forth into an afternoon.", { ownedByClient: true }),
      req("bank_details_for_payouts", "Bank details for payouts", "Entered by you directly into the provider — we never need to see them. If we've already got your bank details for invoicing, that's separate and doesn't cover this.", { ownedByClient: true }),
      req("tax_vat_config", "Tax / VAT configuration", "Which countries you sell into and whether prices include VAT. Getting this wrong is a tax problem later, not a bug we can quietly patch."),
      text("refund_policy", "Refund policy", "Your actual policy in a sentence or two — window, conditions, who approves. It goes in the T&Cs and into the checkout flow.", {
        type: "long_text",
        rows: 3,
      }),
      req("live_and_test_keys", "Live and test API keys", "Both sets, shared through the vault above. We build against test keys and only switch to live at launch — sending live keys early means they sit around unused.", { ownedByClient: true }),
    ],
  };
}

function ios(): LaunchpadModule {
  return {
    id: "ios",
    title: "iOS",
    blurb:
      "App Store review rejects a submission for any one of these being missing, and each rejection costs a review cycle.",
    fields: [
      account("apple_developer_account", "Apple Developer account", "Enrolled in your company's name (£79/year), with us invited as developers. Apple ties the app's identity to whoever owns the account, and transferring an app between accounts is a manual process with downtime — so starting in the right account matters more here than almost anywhere else. Enrolment needs a D-U-N-S number, which can take a fortnight."),
      req("ios_app_icon", "App icon — 1024×1024", "PNG, no transparency, no rounded corners (Apple adds those). This exact size is a hard submission requirement."),
      req("ios_screenshots", "Screenshots per device size", "At least one 6.7\" iPhone set; iPad sets too if the app supports iPad. Apple will not accept a submission without them, and they're the main thing people look at on the store page."),
      text("ios_app_name", "App name", "Up to 30 characters, and it has to be unique across the whole App Store — worth checking your first choice is free before we build around it.", { width: "half" }),
      text("ios_subtitle", "Subtitle", "Up to 30 characters, shown under the name. The clearest place to say what the app does.", { width: "half" }),
      text("ios_description", "Description", "Up to 4,000 characters. The first three lines are all most people read before tapping \"more\".", {
        type: "long_text",
        rows: 4,
      }),
      text("ios_keywords", "Keywords", "100 characters total, comma-separated. Don't repeat words already in your name or subtitle — they're indexed anyway, so repeating them wastes the budget.", { width: "half" }),
      req("ios_privacy_answers", "Privacy nutrition answers", "Apple's questionnaire on what data the app collects and whether it's linked to the user. It's your declaration, not ours — we'll tell you exactly what the code collects so you can answer it accurately."),
      link("ios_support_url", "Support URL", "A page where users can get help. Required — a contact page on your site is enough."),
      link("ios_marketing_url", "Marketing URL", "Optional. Your product or home page."),
      req("ios_age_rating", "Age rating", "Apple's content questionnaire. Straightforward for most apps, but user-generated content or unrestricted web access raises the rating and can affect who sees the app."),
      req("ios_iap_setup", "In-app purchases / subscriptions", "Only if the app charges through Apple. Products have to be created and submitted in App Store Connect, and the first subscription needs your banking and tax forms completed — a common cause of a launch slipping.", { ownedByClient: true }),
    ],
  };
}

function android(): LaunchpadModule {
  return {
    id: "android",
    title: "Android",
    blurb: "Play Console blocks a release until the declarations are complete, so these are gating, not paperwork.",
    fields: [
      account("play_console_account", "Google Play Console account", "Registered to your company (one-off $25), with us added. As with Apple, the account owns the app's identity — and Google now requires identity verification for new developer accounts, which takes days."),
      req("android_feature_graphic", "Feature graphic — 1024×500", "PNG or JPEG, no transparency. Play shows it at the top of your store listing and won't publish without it."),
      req("android_adaptive_icon", "Adaptive icon", "Foreground and background layers, 512×512. Android masks the icon to different shapes per device, so a single flat square gets cropped badly."),
      req("android_screenshots", "Screenshots", "At least two phone screenshots; tablet sets if you support tablets."),
      text("android_short_description", "Short description", "Up to 80 characters — this is what shows in search results.", { width: "half" }),
      text("android_full_description", "Full description", "Up to 4,000 characters for the store listing.", {
        type: "long_text",
        rows: 4,
      }),
      req("android_content_rating", "Content rating questionnaire", "Completed by you in Play Console. Leaving it blank means the app shows as \"unrated\", which suppresses it in several markets."),
      req("android_data_safety", "Data safety form", "Google's declaration of what the app collects and shares. Mandatory, publicly shown on your listing, and Google audits it against the app's actual behaviour — we'll give you the technical detail to fill it in correctly."),
      link("android_privacy_url", "Privacy policy URL", "A live, publicly reachable URL. Play rejects a placeholder or a page behind a login — the privacy policy generated in the Website module can be published to satisfy this."),
    ],
  };
}

function compliance(): LaunchpadModule {
  return {
    id: "compliance",
    title: "Compliance",
    blurb: "Decisions that shape how we build, so they're cheaper to make now than to retrofit.",
    fields: [
      text("gdpr_basis", "What personal data you collect, and why", "A plain-English list — names, emails, location, payment details, anything. Under UK GDPR you need a lawful basis for each, and it determines what we have to build (consent flows, deletion, export).", {
        type: "long_text",
        rows: 3,
      }),
      text("gdpr_data_owner", "Who's responsible for data requests", "The person who handles a \"delete my data\" or \"send me my data\" request. It has to be someone at your organisation — we can build the tooling but we can't be your data controller.", {
        width: "half",
      }),
      {
        id: "accessibility_target",
        type: "select",
        label: "Accessibility target",
        helper:
          "WCAG 2.2 AA is the normal commercial standard and what we build to by default. Public-sector work is legally required to meet it. Tell us if you need more.",
        options: [
          { id: "aa", label: "WCAG 2.2 AA (recommended default)" },
          { id: "a", label: "WCAG 2.2 A (minimum)" },
          { id: "aaa", label: "WCAG 2.2 AAA (specialist)" },
          { id: "unsure", label: "Not sure — advise us" },
        ],
      },
      {
        id: "cookie_consent_approach",
        type: "select",
        label: "Cookie consent approach",
        helper:
          "If the site sets any non-essential cookie — analytics included — UK/EU law needs consent BEFORE it's set. \"Essential only\" avoids the banner entirely, which is the cleanest option if you can live without analytics.",
        options: [
          { id: "essential_only", label: "Essential cookies only — no banner needed" },
          { id: "banner_consent", label: "Consent banner (analytics + marketing)" },
          { id: "cmp", label: "Third-party consent platform (we have one)" },
          { id: "unsure", label: "Not sure — advise us" },
        ],
      },
      req("dpa_signed", "Data processing agreement", "We sign a DPA covering how we handle personal data on your behalf. Required by UK GDPR whenever a supplier touches your users' data, so this applies to essentially every build."),
    ],
  };
}

/** The seeded default structure. */
export function getDefaultLaunchpadStructure(): LaunchpadStructure {
  return {
    modules: [foundations(), website(), payments(), ios(), android(), compliance()],
  };
}

/** Modules switched on for a brand-new kit — Foundations is always on anyway, so
 *  a kit starts with just the basics and the operator adds what the project needs. */
export const DEFAULT_ENABLED_MODULES: string[] = [];
