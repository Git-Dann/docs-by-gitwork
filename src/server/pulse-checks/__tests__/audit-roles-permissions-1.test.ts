import { describe, expect, it } from "vitest";
import { runRolesPermissionsChecks } from "../roles-permissions";
import type { ExtendedCheckContext } from "../_types";

function context(html: string): ExtendedCheckContext {
  return { pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test/" }, httpsUrl: "https://example.test", hostname: "example.test", platform: "SAAS", ctx: { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" }, htmlLower: html.toLowerCase(), catchAll200: false } as ExtendedCheckContext;
}
const statusOf = (checks: { checkKey: string; status: string }[], key: string) => checks.find((c) => c.checkKey === key)?.status;

// Unrelated tokens spread across a single-line minified page, as observed on flipkart/figma/github/vercel/stripe homepages.
const filler = "<div class=\"x\">" + "lorem ".repeat(200) + "</div>";
const noisyHomepage = [
  '<link rel="preconnect" href="https://cdn.example.com" crossorigin="anonymous"/><meta name="viewport" content="width=device-width">',
  '<a href="/ai-nova-tab/p/itm4mfa702239bd356?otracker=undefined_footer" title="Ai+ Nova Tab">Ai+ Nova Tab</a>',
  '<button class="disabled:cursor-not-allowed">Go</button>',
  '<a href="/partners/directory">Partner directory</a>',
  '<script>{"mkt-ssr.homepage.hero.invite":"Request an invite","mkt-ssr.homepage.hero.title":"Financial infrastructure"}</script>',
  '<script>["/templates/invitation-maker/","/templates/pi-planning/","/templates/skills-matrix-template/"]</script>',
  '<script>window.__flags=["restricted_pushers_warning","user_config_repo","copilot_chat_early_task_provisioning"]</script>',
  filler,
  '<p>Gear up for sports with equipment for cricket, football, badminton</p><svg><clipPath id="a"></clipPath></svg>',
  '<link rel="link" href="/x"><script async src="/app.js"></script><span data-user="1">user</span><p>Data sync</p><div data-radix-toast-viewport></div>',
].join("");

const KEYS = ["mfa_admin_enforced", "guest_anonymous_mode", "ip_allowlisting", "sso_scim_provisioning", "invite_workflow"];

describe("roles-permissions: no PASS from unrelated tokens far apart in minified HTML", () => {
  it("does not pass on markup/flag/URL fragments that merely contain the keywords", async () => {
    const checks = await runRolesPermissionsChecks(context(noisyHomepage));
    for (const key of KEYS) expect(statusOf(checks, key), key).toBe("WARN");
  });

  it("still passes on real feature copy observed on pricing pages", async () => {
    const html = [
      '<li>Require two-factor authentication for all admins</li>',
      '<span class="sc-KOGVz jqlWID">Let guests access multiple teams</span>',
      '<span class="sc-KOGVz jqlWID">IP restrictions</span>',
      '<span class="c-plan-feature-value__text">SCIM user management</span>',
      '<p class="fig-1ab2vcl">Invite as many people as you want to view, comment, and edit</p>',
    ].join("");
    const checks = await runRolesPermissionsChecks(context(html));
    for (const key of KEYS) expect(statusOf(checks, key), key).toBe("PASS");
  });

  it("accepts other real phrasings", async () => {
    const html = '<p>Enterprise Ready features like Single Sign-On, Directory Sync, Audit Logging</p><p>Connect backend services that require IP allowlisting through static egress IPs.</p><p>Share a view-only link</p><p>Workspace members can send guest invite requests</p><p>Enforce MFA for every member</p>';
    const checks = await runRolesPermissionsChecks(context(html));
    for (const key of KEYS) expect(statusOf(checks, key), key).toBe("PASS");
  });
});
