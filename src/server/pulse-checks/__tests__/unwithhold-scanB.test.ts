// @vitest-environment node
/**
 * The scanB slice of withheld checks, made to rest on what Pulse observed. Each fix has
 * an input that must produce the finding and a realistic correct input (usually the
 * markup the withheld reason named, e.g. linear.app's) that must not. Absence on a public
 * page is INCONCLUSIVE, or NOT_APPLICABLE for an optional choice, never a WARN/FAIL.
 */
import { describe, expect, it } from "vitest";
import type { ExtendedCheckContext, ProjectContext } from "../_types";
import { runRolesPermissionsChecks } from "../roles-permissions";
import { runAuthExtended } from "../auth-extended";
import { runLegalExtended } from "../legal-extended";
import { runPaymentsExtended } from "../payments-extended";
import { runBusinessOperationsChecks } from "../business-operations";
import { runGlobalDistributionExtended } from "../global-distribution-extended";
import { focusIndicatorVerdict, htmlLangVerdict, inlineContrastVerdict } from "../wcag-page-evidence";
import { imageSitemapVerdict, newsSitemapVerdict } from "../sitemap-reader";
import { pageWeightVerdict, referencedResources } from "../page-weight";
import { hardcodedCredentials, webPushEvidence } from "../page-code-evidence";
import { nonCardPaymentMethods, paymentAssurance, priceCurrencies, stripeUseOnPage, webhookRouteIsLive } from "../payment-page-evidence";
import { socialProofEvidence } from "../page-evidence";
import { adminExposureVerdict, classifyAdminProbes } from "../admin-exposure";
import { detectDataLayer, envFilesVerdict } from "../repo-data-and-env";

const baseProject: ProjectContext = { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" };
function context(html: string, opts: { host?: string; project?: Partial<ProjectContext>; platform?: string } = {}): ExtendedCheckContext {
  const host = opts.host ?? "example.test";
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: `https://${host}/` },
    httpsUrl: `https://${host}`, hostname: host, platform: opts.platform ?? "SAAS",
    ctx: { ...baseProject, ...opts.project }, htmlLower: html.toLowerCase(), catchAll200: false,
  };
}
type Row = { checkKey: string; status: string; detail?: string };
const find = (checks: Row[], key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`no ${key}`);
  return c;
};

describe("roles and permissions read what the page says, never markup", () => {
  // The markup the audit measured on linear.app: ARIA roles, CSS custom properties, class names.
  const linearLike = '<nav role="navigation"></nav><div role="group" aria-label="user"><span>Permission</span></div><style>:root{--token-entity:1}</style><p>Take your skills to the next level with scoped access</p><div class="WorkspaceButton _8fVXdW_editable">Read our privacy policy. We ask for minimal permissions.</div><h2>Meet our team members</h2>';

  it("markup and stray words give INCONCLUSIVE, not PASS", async () => {
    const checks = await runRolesPermissionsChecks(context(linearLike));
    for (const key of ["rbac_signals", "team_management_ui", "permission_matrix_docs", "least_privilege_api_tokens", "role_hierarchy", "read_only_role", "permission_inheritance"]) {
      expect(find(checks, key).status, key).toBe("INCONCLUSIVE");
    }
  });

  it("real feature copy passes, quoting what it read", async () => {
    const html = [
      "<li>Assign roles to every member of your workspace.</li>",
      "<li>Invite teammates and remove them when they leave.</li>",
      "<table><tr><th>Capability</th><th>Owner</th><th>Admin</th><th>Member</th></tr><tr><td>Billing</td><td>Yes</td><td>No</td><td>No</td></tr></table>",
      "<p>Create fine-grained personal access tokens for CI.</p>",
      "<p>Workspaces have Owners, Admins, Members and Guests.</p>",
      "<p>Add read-only users at no cost.</p>",
      "<p>Manage access with user groups synced from your IdP.</p>",
    ].join("");
    const checks = await runRolesPermissionsChecks(context(html));
    for (const key of ["rbac_signals", "team_management_ui", "permission_matrix_docs", "least_privilege_api_tokens", "role_hierarchy", "read_only_role", "permission_inheritance"]) {
      expect(find(checks, key).status, key).toBe("PASS");
    }
    for (const role of ["Owner", "Admin", "Member"]) expect(find(checks, "role_hierarchy").detail).toContain(role);
  });
});

describe("authentication checks", () => {
  it("password strength comes from minlength or a stated rule, not a <strong> tag", async () => {
    const linear = '<strong class="text-base">Sign in</strong><form><input type="email"><input type="password" name="password"></form>';
    expect(find(await runAuthExtended(context(linear)), "password_strength_enforced").status).toBe("INCONCLUSIVE");
    expect(find(await runAuthExtended(context('<input type="password" minlength="12">')), "password_strength_enforced").status).toBe("PASS");
    const weak = find(await runAuthExtended(context('<input type="password" minlength="6">')), "password_strength_enforced");
    expect(weak.status).toBe("WARN");
    expect(weak.detail).toMatch(/only 6 characters/);
    expect(find(await runAuthExtended(context("<p>Your password must be at least 10 characters long.</p>")), "password_strength_enforced").status).toBe("PASS");
  });

  it("a token written to localStorage by an inline script WARNs; otherwise it is never a PASS", async () => {
    const write = find(await runAuthExtended(context('<script>localStorage.setItem("access_token", data.token)</script>')), "jwt_not_in_localstorage");
    expect(write.status).toBe("WARN");
    expect(write.detail).toMatch(/access_token/);
    const theme = find(await runAuthExtended(context('<script>localStorage.setItem("theme","dark")</script><script src="/app.js"></script>')), "jwt_not_in_localstorage");
    expect(theme.status).toBe("INCONCLUSIVE");
  });

  it("refresh rotation and session timeout need the words together in one sentence", async () => {
    const linear = '<p>transform: rotate(90deg)</p><div class="timeline-tail-ui-refresh">x</div><div class="session-panel">The plan expires soon.</div>';
    const neg = await runAuthExtended(context(linear));
    expect(find(neg, "refresh_token_rotation").status).toBe("INCONCLUSIVE");
    expect(find(neg, "session_timeout_configured").status).toBe("INCONCLUSIVE");
    const pos = await runAuthExtended(context("<p>Refresh tokens are rotated on every use.</p><p>Sessions expire after 30 minutes of inactivity.</p>"));
    expect(find(pos, "refresh_token_rotation").status).toBe("PASS");
    expect(find(pos, "session_timeout_configured").status).toBe("PASS");
  });

  it("PKCE and scopes are read from the page's own OAuth authorisation links", async () => {
    const loginOnly = await runAuthExtended(context('<a href="/login">Log in</a><p>full vehicle_state sync</p><p>Access</p>'));
    expect(find(loginOnly, "pkce_oauth_flow").status).toBe("INCONCLUSIVE");
    expect(find(loginOnly, "oauth_minimal_scopes").status).toBe("INCONCLUSIVE");

    const broad = await runAuthExtended(context('<a href="https://github.com/login/oauth/authorize?client_id=Iv1abc&amp;response_type=code&amp;scope=repo%20read:user">GitHub</a>'));
    expect(find(broad, "pkce_oauth_flow").status).toBe("WARN");
    expect(find(broad, "oauth_minimal_scopes").status).toBe("WARN");
    expect(find(broad, "oauth_minimal_scopes").detail).toMatch(/repo/);

    const narrow = await runAuthExtended(context('<a href="https://accounts.google.com/o/oauth2/v2/auth?client_id=1.apps.googleusercontent.com&amp;response_type=code&amp;scope=openid%20email&amp;code_challenge=abc&amp;code_challenge_method=S256">Google</a>'));
    expect(find(narrow, "pkce_oauth_flow").status).toBe("PASS");
    expect(find(narrow, "oauth_minimal_scopes").status).toBe("PASS");
  });

  it("service accounts: not applicable without a hosted backend, stated copy passes", async () => {
    expect(find(await runAuthExtended(context("<p>service account</p>", { project: { isSaas: false } })), "service_account_support").status).toBe("NOT_APPLICABLE");
    expect(find(await runAuthExtended(context("<p>Use service accounts for CI pipelines.</p>")), "service_account_support").status).toBe("PASS");
    expect(find(await runAuthExtended(context("<p>Plans</p>")), "service_account_support").status).toBe("INCONCLUSIVE");
  });
});

describe("legal checks", () => {
  it("HIPAA: a UUID containing 'baa' on a non-healthcare page is not applicable", async () => {
    const linear = '<script type="application/json">{"id":"7e1abaa73f-21"}</script><a href="/healthcheck">status</a><p>Plan your roadmap.</p>';
    expect(find(await runLegalExtended(context(linear)), "hipaa_signals").status).toBe("NOT_APPLICABLE");
    expect(find(await runLegalExtended(context("<p>Built for clinicians. We are HIPAA compliant and sign a BAA.</p>")), "hipaa_signals").status).toBe("PASS");
    expect(find(await runLegalExtended(context("<p>Built for clinicians and their patients.</p>")), "hipaa_signals").status).toBe("INCONCLUSIVE");
  });

  it("PCI scope: own card field WARNs, a hosted checkout passes, no payments is not applicable", async () => {
    const pay = { project: { isPaymentEnabled: true } };
    expect(find(await runLegalExtended(context('<input name="card_number" autocomplete="cc-number">', pay)), "pci_dss_scope_reduction").status).toBe("WARN");
    expect(find(await runLegalExtended(context('<script src="https://js.stripe.com/v3/"></script>', pay)), "pci_dss_scope_reduction").status).toBe("PASS");
    expect(find(await runLegalExtended(context("<p>Plans</p>")), "pci_dss_scope_reduction").status).toBe("NOT_APPLICABLE");
  });

  it("VAT-inclusive prices: '+ VAT' is exclusive and never passes", async () => {
    const pay = { project: { isPaymentEnabled: true }, host: "shop.co.uk" };
    expect(find(await runLegalExtended(context("<p>Pro £49 + VAT per month</p>", pay)), "price_vat_inclusive").status).toBe("INCONCLUSIVE");
    // linear.app: "including changes to initiatives ... VAT" with the greedy pattern.
    expect(find(await runLegalExtended(context("<p>£8 per seat, including changes to initiatives.</p><p>VAT invoices available.</p>", pay)), "price_vat_inclusive").status).toBe("INCONCLUSIVE");
    expect(find(await runLegalExtended(context("<p>Pro £49 inc. VAT</p>", pay)), "price_vat_inclusive").status).toBe("PASS");
  });

  it("cancellation: a newsletter 'unsubscribe' is not a subscription cancellation", async () => {
    const pay = { project: { isPaymentEnabled: true } };
    expect(find(await runLegalExtended(context("<p>£10 per month</p><footer>Unsubscribe from our newsletter</footer>", pay)), "subscription_cancellation_easy").status).toBe("INCONCLUSIVE");
    expect(find(await runLegalExtended(context("<p>£10 per month. Cancel anytime.</p>", pay)), "subscription_cancellation_easy").status).toBe("PASS");
    expect(find(await runLegalExtended(context("<p>Cancel anytime.</p>")), "subscription_cancellation_easy").status).toBe("NOT_APPLICABLE");
  });
});

describe("payments-extended", () => {
  const pay = { project: { isPaymentEnabled: true } };
  it("3DS: initial-scale is not SCA; Stripe Checkout runs it", async () => {
    const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1"><script src="https://js.stripe.com/v3/"></script>';
    expect(find(await runPaymentsExtended(context(viewport, pay)), "three_ds_sca_compliant").status).toBe("INCONCLUSIVE");
    expect(find(await runPaymentsExtended(context('<a href="https://buy.stripe.com/abc123">Buy</a>', pay)), "three_ds_sca_compliant").status).toBe("PASS");
  });
  it("proration applies only to recurring plans", async () => {
    expect(find(await runPaymentsExtended(context("<p>One-off purchase £99</p>", pay)), "subscription_proration").status).toBe("NOT_APPLICABLE");
    expect(find(await runPaymentsExtended(context("<p>£10/month. Upgrades are prorated.</p>", pay)), "subscription_proration").status).toBe("PASS");
    expect(find(await runPaymentsExtended(context("<p>£10/month.</p>", pay)), "subscription_proration").status).toBe("INCONCLUSIVE");
  });
});

describe("business operations", () => {
  it("VAT number: only EU/UK, read from a real identifier", async () => {
    expect(find(await runBusinessOperationsChecks(context("<p>Our VAT policy. Prices $10.</p>", { host: "example.com" })), "vat_number_displayed").status).toBe("NOT_APPLICABLE");
    expect(find(await runBusinessOperationsChecks(context("<footer>USt-IdNr.: DE123456789</footer>", { host: "beispiel.de" })), "vat_number_displayed").status).toBe("PASS");
    expect(find(await runBusinessOperationsChecks(context("<p>Prices from £10</p>", { host: "shop.co.uk" })), "vat_number_displayed").status).toBe("INCONCLUSIVE");
  });
  it("invoices: no payments is not applicable", async () => {
    expect(find(await runBusinessOperationsChecks(context("<p>About us</p>")), "invoice_generation_b2b").status).toBe("NOT_APPLICABLE");
    expect(find(await runBusinessOperationsChecks(context("<p>Download VAT invoices from your billing page.</p>", { project: { isPaymentEnabled: true } })), "invoice_generation_b2b").status).toBe("PASS");
  });
  it("modern slavery: not UK is not applicable, UK without a link is unestablished", async () => {
    expect(find(await runBusinessOperationsChecks(context("<p>Enterprise million</p>", { host: "example.com" })), "modern_slavery_statement").status).toBe("NOT_APPLICABLE");
    expect(find(await runBusinessOperationsChecks(context("<p>Prices from £10</p>", { host: "shop.co.uk" })), "modern_slavery_statement").status).toBe("INCONCLUSIVE");
    expect(find(await runBusinessOperationsChecks(context('<a href="/modern-slavery-statement">Modern Slavery Statement</a>', { host: "shop.co.uk" })), "modern_slavery_statement").status).toBe("PASS");
  });
});

describe("transfer impact assessment", () => {
  it("'tia' inside initial/essential/credential is not a TIA", async () => {
    const neg = await runGlobalDistributionExtended(context("<p>Initial setup is essential; keep credentials safe.</p>"));
    expect(find(neg, "transfer_impact_assessment").status).toBe("INCONCLUSIVE");
    const pos = await runGlobalDistributionExtended(context("<p>We rely on Standard Contractual Clauses for transfers.</p>"));
    expect(find(pos, "transfer_impact_assessment").status).toBe("PASS");
  });
});

describe("accessibility from the page's own markup", () => {
  it(":focus{outline:none} removes the indicator; it is never a PASS", () => {
    expect(focusIndicatorVerdict("<style>a:focus{outline:none}</style><a href=/>x</a>").status).toBe("WARN");
    expect(focusIndicatorVerdict('<link rel="stylesheet" href="/a.css"><style>*:focus{outline:0}</style>').status).toBe("INCONCLUSIVE");
    expect(focusIndicatorVerdict("<style>a:focus-visible{outline:2px solid #1d4ed8}</style>").status).toBe("PASS");
    expect(focusIndicatorVerdict("<style>button:focus:not(:focus-visible){outline:none}</style>").status).toBe("PASS");
  });
  it("contrast is a computed ratio for inline pairs", () => {
    const low = inlineContrastVerdict('<p style="color:#777777;background-color:#888888">x</p>');
    expect(low.status).toBe("WARN");
    expect(low.detail).toMatch(/1\.\d\d:1/);
    expect(inlineContrastVerdict('<p style="color:#000;background:#fff">x</p>').status).toBe("PASS");
    expect(inlineContrastVerdict('<p class="text-gray-500">x</p>').status).toBe("INCONCLUSIVE");
  });
  it("unquoted lang=en is valid HTML", () => {
    expect(htmlLangVerdict("<html lang=en><body></body></html>").status).toBe("PASS");
    expect(htmlLangVerdict("<html><body></body></html>").status).toBe("FAIL");
    expect(htmlLangVerdict('<html lang=""><body></body></html>').status).toBe("FAIL");
  });
});

describe("sitemaps are judged by their bodies", () => {
  const plain = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://x.test/</loc></url></urlset>';
  it("image entries pass; a sitemap without them is optional, not a finding", () => {
    expect(imageSitemapVerdict({ bodies: [plain.replace("</url>", "<image:image><image:loc>https://x.test/a.png</image:loc></image:image></url>")], tried: ["a"], incomplete: false }).status).toBe("PASS");
    expect(imageSitemapVerdict({ bodies: [plain], tried: ["a"], incomplete: false }).status).toBe("NOT_APPLICABLE");
    expect(imageSitemapVerdict({ bodies: [], tried: ["a", "b"], incomplete: false }).status).toBe("INCONCLUSIVE");
  });
  it("news sitemaps apply only to news publishers", () => {
    expect(newsSitemapVerdict({ bodies: [plain], tried: ["a"], incomplete: false }, false).status).toBe("NOT_APPLICABLE");
    expect(newsSitemapVerdict({ bodies: [plain], tried: ["a"], incomplete: false }, true).status).toBe("WARN");
    expect(newsSitemapVerdict({ bodies: [plain], tried: ["a"], incomplete: true }, true).status).toBe("INCONCLUSIVE");
    expect(newsSitemapVerdict({ bodies: [plain.replace("</url>", "<news:news></news:news></url>")], tried: ["a"], incomplete: false }, true).status).toBe("PASS");
  });
});

describe("page weight is measured", () => {
  it("collects scripts, stylesheets and images, absolute", () => {
    const urls = referencedResources('<script src="/a.js"></script><link rel="stylesheet" href="b.css"><img src="https://cdn.test/c.png"><img src="data:image/png;base64,AA">', "https://x.test/page/");
    expect(urls).toEqual(["https://x.test/a.js", "https://x.test/page/b.css", "https://cdn.test/c.png"]);
  });
  it("small HTML with heavy images is over budget; unmeasured is never a PASS", () => {
    expect(pageWeightVerdict({ htmlBytes: 40_000, measuredBytes: 4_000_000, measured: 6, unmeasured: 0, skipped: 0 }).status).toBe("WARN");
    expect(pageWeightVerdict({ htmlBytes: 40_000, measuredBytes: 900_000, measured: 6, unmeasured: 0, skipped: 0 }).status).toBe("PASS");
    expect(pageWeightVerdict({ htmlBytes: 40_000, measuredBytes: 900_000, measured: 6, unmeasured: 3, skipped: 0 }).status).toBe("INCONCLUSIVE");
  });
});

describe("page code evidence", () => {
  it("web push needs push code or an SDK, not 'web' followed by .push(", () => {
    const nextJs = '<p>Built for the web</p><script>(self.__next_f=self.__next_f||[]).push([0])</script>';
    expect(webPushEvidence(nextJs)).toBeNull();
    expect(webPushEvidence('<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>')).toBe("OneSignal SDK");
  });
  it("credentials: a pre-filled password field or a stated pair, not '123456' anywhere", () => {
    const phone = '<input type="password" placeholder="Password"><p>Call 0123456789</p>';
    expect(hardcodedCredentials(phone)).toEqual({ prefilledPassword: null, statedPair: null });
    const filled = hardcodedCredentials('<input type="password" value="hunter2secret">');
    expect(filled.prefilledPassword).toMatch(/value="•+"/);
    expect(filled.prefilledPassword).not.toMatch(/hunter2/);
    expect(hardcodedCredentials("<p>Username: admin Password: admin123</p>").statedPair).toMatch(/^Username: admin Password: •+$/);
  });
});

describe("payment evidence used by pulse-scan.ts", () => {
  it("Stripe is use, not the word", () => {
    expect(stripeUseOnPage('<table class="striped"><tr><td>We moved off Stripe</td></tr></table>')).toBeNull();
    expect(stripeUseOnPage('<script src="https://js.stripe.com/v3/"></script>')).toBe("Stripe.js is loaded");
  });
  it("webhook route: a 404, an auth-walled /api/ prefix, or a failed sibling probe is not a route", () => {
    expect(webhookRouteIsLive(404, 404, null)).toBe(false);
    expect(webhookRouteIsLive(401, 404, 401)).toBe(false);
    expect(webhookRouteIsLive(405, 404, 0)).toBe(false);
    expect(webhookRouteIsLive(405, 404, 404)).toBe(true);
  });
  it("currencies come from prices, not class names or 'claude'", () => {
    const linear = '<div class="gbpgkr kfzpfa_counter">kr </div><p>Ask claude about acad4015031d</p><p>From £12</p>';
    expect(priceCurrencies(linear)).toEqual(["GBP"]);
    expect(priceCurrencies("<p>£12 / €14 / $15</p>")).toEqual(["GBP", "EUR", "USD"]);
    expect(priceCurrencies("<p>CA$20 or R$30</p>")).toEqual(["CAD", "BRL"]);
  });
  it("non-card methods are words or SDKs: 'separate', 'grouping' and 'ideal' are not", () => {
    const linear = '<link rel="stylesheet" href="/homepageseparator.dab6yyb9.css"><p>An ideal tool for grouping work into separate projects.</p>';
    expect(nonCardPaymentMethods(linear)).toEqual([]);
    expect(nonCardPaymentMethods("<p>Pay with iDEAL or SEPA Direct Debit.</p>")).toEqual(["iDEAL", "SEPA"]);
  });
  it("payment assurance is a visible phrase or badge alt text, optional otherwise", () => {
    expect(paymentAssurance('<script>{"copy":"payment security team"}</script><p>Our payment security team is hiring.</p>')).toBeNull();
    expect(paymentAssurance('<img src="/badge.svg" alt="Secure checkout">')).toBe("Secure checkout");
  });
  it("social proof: preview/operating/migrating and a 'Reviews' feature name are not", () => {
    expect(socialProofEvidence("<p>Live preview while operating and migrating.</p><nav><a>Reviews</a></nav>")).toBeNull();
    expect(socialProofEvidence("<h2>Customer stories</h2>")).toContain("Customer stories");
    expect(socialProofEvidence('<script type="application/ld+json">{"@type":"AggregateRating","ratingValue":4.8}</script>')).toBe("AggregateRating / Review markup");
  });
});

describe("no_exposed_admin", () => {
  const wpLogin = '<!DOCTYPE html><html><head><title>Log In &lsaquo; Site &#8212; WordPress</title></head><body class="login wp-core-ui"><form name="loginform" id="loginform" action="https://x.test/wp-login.php" method="post"><input type="text" name="log"><input type="password" name="pwd"></form></body></html>';
  const wpDashboard = '<html><head><title>Dashboard &lsaquo; Site &#8212; WordPress</title></head><body><div id="wpadminbar"></div><h1>Dashboard</h1></body></html>';
  it("a sign-in form at /wp-admin means the admin is protected: PASS, not an exposure", () => {
    const r = classifyAdminProbes(["/admin", "/wp-admin"], [{ status: 404, contentType: "text/html", body: "" }, { status: 200, contentType: "text/html", body: wpLogin }]);
    const v = adminExposureVerdict(r);
    expect(v.status).toBe("PASS");
    expect(v.detail).toMatch(/asks for a sign-in/);
  });
  it("the WordPress dashboard served to an anonymous visitor FAILs", () => {
    const r = classifyAdminProbes(["/wp-admin"], [{ status: 200, contentType: "text/html", body: wpDashboard }]);
    expect(adminExposureVerdict(r).status).toBe("FAIL");
  });
  it("a failed probe is unestablished", () => {
    expect(adminExposureVerdict(classifyAdminProbes(["/admin"], [{ status: 0, contentType: "", body: "" }])).status).toBe("INCONCLUSIVE");
  });
});

describe("repo: data layer and committed .env files", () => {
  it("Prisma in package.json counts even with the schema outside the root", () => {
    const files = new Map([["package.json", JSON.stringify({ dependencies: { "@prisma/client": "5.0.0" }, devDependencies: { prisma: "5.0.0" } })]]);
    expect(detectDataLayer({ paths: ["src/prisma/schema.prisma"], files })).toMatch(/^Prisma/);
    expect(detectDataLayer({ paths: ["src/index.ts"], files: new Map([["package.json", JSON.stringify({ dependencies: { express: "4" } })]]) })).toBeNull();
  });
  it("a Next.js .env of public defaults is not a leaked secret", () => {
    expect(envFilesVerdict([{ path: ".env", text: "NEXT_PUBLIC_SITE_URL=https://example.test\nPORT=3000\n" }]).status).toBe("PASS");
    expect(envFilesVerdict([{ path: ".env.example", text: "STRIPE_SECRET_KEY=" }]).status).toBe("PASS");
  });
  it("a recognised credential FAILs; a secret-named value WARNs; an unread file is unestablished", () => {
    const key = ["sk", "live", "51H8xKqLm2Np4Rt6Vw8Yz0Bc3Df5Gh7Jk9"].join("_");
    const fail = envFilesVerdict([{ path: ".env.production", text: `STRIPE_SECRET_KEY=${key}\n` }]);
    expect(fail.status).toBe("FAIL");
    expect(fail.detail).not.toContain(key);
    expect(envFilesVerdict([{ path: ".env", text: "JWT_SECRET=Qm9sZC1jaGFyYWN0ZXJz\n" }]).status).toBe("WARN");
    expect(envFilesVerdict([{ path: ".env", text: "DATABASE_URL=postgres://postgres:postgres@localhost:5432/dev\n" }]).status).toBe("PASS");
    expect(envFilesVerdict([{ path: ".env.local", text: null }]).status).toBe("INCONCLUSIVE");
  });
});
