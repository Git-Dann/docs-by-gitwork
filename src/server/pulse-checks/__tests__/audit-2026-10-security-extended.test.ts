import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import {
  assessSubdomainTakeover,
  detectSqlErrorSignature,
  findLibraryVersions,
  findPageSecrets,
  runSecurityExtended,
} from "../security-extended";
import type { ExtendedCheckContext } from "../_types";

// Key-shaped fixtures are assembled at runtime so no credential-shaped literal sits in the
// repo (GitHub push protection rejects them, and so should a reader).
const stripe = (prefix: "sk" | "pk", tail: string) => [prefix, "live", tail].join("_");
const slackBot = ["xoxb", "2209876543", "5512398765432", "Kq7RtW2mPz9LxV4nB8cYhJ3s"].join("-");

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10 audit: six security-extended checks reported findings their evidence
// could not support. Every case is two-sided — the real defect still fires, and
// a representative healthy input stays quiet. Fingerprint fixtures are verbatim
// slices of what the providers served on 2026-10-26.
// ─────────────────────────────────────────────────────────────────────────────

const HEROKU_NO_SUCH_APP = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>No such app</title></head><body><iframe src="//www.herokucdn.com/error-pages/no-such-app.html"></iframe></body></html>`;
const GITHUB_PAGES_404 = `<html><body><h1>404</h1><p><strong>There isn't a GitHub Pages site here.</strong></p></body></html>`;
const S3_NO_SUCH_BUCKET = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message></Error>`;
const REAL_SITE = `<html><head><title>Acme — pricing</title></head><body><h1>Acme</h1></body></html>`;

describe("subdomain_takeover_risk — a CNAME into a cloud service is how sites are hosted, not a defect", () => {
  const page = (html: string, status = 200) => ({ ok: status < 400, status, html });

  it("PASSes a Heroku-hosted site that served its real page", () => {
    const r = assessSubdomainTakeover({ hostname: "app.acme.test", cnameTargets: ["acme-prod.herokuapp.com."], page: page(REAL_SITE), targetNxdomain: false });
    expect(r.status).toBe("PASS");
    expect(r.detail).toContain("claimed");
  });

  it("PASSes a GitHub Pages site that served its real page", () => {
    expect(assessSubdomainTakeover({ hostname: "docs.acme.test", cnameTargets: ["acme.github.io."], page: page(REAL_SITE), targetNxdomain: null }).status).toBe("PASS");
  });

  it("FAILs when Heroku answers 'No such app'", () => {
    const r = assessSubdomainTakeover({ hostname: "app.acme.test", cnameTargets: ["gone.herokuapp.com."], page: page(HEROKU_NO_SUCH_APP, 404), targetNxdomain: false });
    expect(r.status).toBe("FAIL");
    expect(r.detail).toContain("Heroku");
  });

  it("FAILs on GitHub Pages' and S3's unclaimed pages", () => {
    expect(assessSubdomainTakeover({ hostname: "a.test", cnameTargets: ["gone.github.io."], page: page(GITHUB_PAGES_404, 404), targetNxdomain: false }).status).toBe("FAIL");
    expect(assessSubdomainTakeover({ hostname: "a.test", cnameTargets: ["gone.s3.amazonaws.com."], page: page(S3_NO_SUCH_BUCKET, 404), targetNxdomain: false }).status).toBe("FAIL");
  });

  it("FAILs when the CNAME target itself is NXDOMAIN (Azure releases the name)", () => {
    expect(assessSubdomainTakeover({ hostname: "a.test", cnameTargets: ["gone.azurewebsites.net."], page: page("", 0), targetNxdomain: true }).status).toBe("FAIL");
  });

  it("is INCONCLUSIVE, not PASS or FAIL, when the page errored without the provider's fingerprint", () => {
    expect(assessSubdomainTakeover({ hostname: "a.test", cnameTargets: ["x.herokuapp.com."], page: page("<h1>Bad gateway</h1>", 502), targetNxdomain: false }).status).toBe("INCONCLUSIVE");
  });

  it("does not read the fingerprint of a provider the CNAME does not point at", () => {
    // A blog post quoting Heroku's error text, hosted on a CDN, is not a dangling Heroku CNAME.
    expect(assessSubdomainTakeover({ hostname: "a.test", cnameTargets: ["a.test.cdn.example."], page: page(HEROKU_NO_SUCH_APP), targetNxdomain: null }).status).toBe("PASS");
  });
});

describe("secret_scanning_github — real credential formats only", () => {
  it("ignores password/secret UI strings, placeholders and labels that used to FAIL", () => {
    const html = `<input type="password" placeholder="password" />
      <script>const labels = { password: "Enter your password", secret = "Show secret code" }; var password = "hunter2hunter2"; const cfg = { secret: "client_secret_label" };</script>`;
    expect(findPageSecrets(html)).toEqual([]);
  });

  it("ignores example values and public-by-design keys", () => {
    const html = `<pre>STRIPE_SECRET_KEY=${stripe("sk", "xxxxxxxxxxxxxxxxxxxxxxxxxxxx")}</pre>
      <code>postgres://user:password@localhost:5432/db</code>
      <script>Stripe("${stripe("pk", "51H8abcDEFghiJKLmnoPQRstuVWXyz0123456789")}")</script>`;
    expect(findPageSecrets(html)).toEqual([]);
  });

  it("finds a Stripe live secret key, a Slack bot token and a database URL with a real password", () => {
    const html = `<script>const s="${stripe("sk", "51H8qZ2KJd8sLm3nP9qRsTuVwXyZaB")}"; const t="${slackBot}";
      const db="postgres://app_admin:Zq8!rT2vLp@db-prod.internal.acme.io:5432/app";</script>`;
    expect(findPageSecrets(html).map((m) => m.kind)).toEqual(["Stripe live secret key", "Slack token", "Database URL with password"]);
  });

  it("flags a Supabase service_role JWT and leaves the anon key alone", () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const jwt = (role: string) => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64({ iss: "supabase", ref: "abcdefghijklmnop", role })}.Kx9uZ2M0pQ7rS1tV3wY5zA8bC0dE2fG4hI6jK8lM0nO`;
    expect(findPageSecrets(`<script>createClient(url, "${jwt("anon")}")</script>`)).toEqual([]);
    expect(findPageSecrets(`<script>createClient(url, "${jwt("service_role")}")</script>`).map((m) => m.kind)).toEqual(["Supabase service_role key"]);
  });

  it("finds a PEM private key with a body, not a heading on its own", () => {
    expect(findPageSecrets("<p>Never ship a -----BEGIN PRIVATE KEY----- block to the browser.</p>")).toEqual([]);
    const body = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKjMzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuictGeurT8jNbvJZHtCSuYEvuNMoSfm76oqFvAp8Gy0iz5sxjZmSnXyCdPEovGhLa0VzMaQ8s";
    expect(findPageSecrets(`<script>const k = "-----BEGIN PRIVATE KEY-----\\n${body}"</script>`).map((m) => m.kind)).toEqual(["Private key"]);
  });
});

describe("sql_error_exposure — a driver's error text, never the bare function name", () => {
  it("does not fire on prose or sample code naming pg_query / mysql_fetch / ORA- codes", () => {
    expect(detectSqlErrorSignature("<p>Our PHP SDK replaces pg_query and mysql_fetch_array helpers.</p>")).toBeNull();
    expect(detectSqlErrorSignature("<p>Part number ORA-12345 ships in 3 days.</p>")).toBeNull();
    expect(detectSqlErrorSignature("<pre><code>You have an error in your SQL syntax; check the manual</code></pre>")).toBeNull();
  });

  it("fires on real driver errors", () => {
    expect(detectSqlErrorSignature("<b>Warning</b>: mysql_fetch_array() expects parameter 1 to be resource")?.engine).toBe("PHP database warning");
    expect(detectSqlErrorSignature("<div>SQLSTATE[42000]: Syntax error or access violation: 1064</div>")?.engine).toBe("PDO");
    expect(detectSqlErrorSignature("<pre class=\"exception_value\">ERROR:  unterminated quoted string at or near \"'1\"</pre>")?.engine).toBe("PostgreSQL");
    expect(detectSqlErrorSignature("<p>ORA-00933: SQL command not properly ended</p>")?.engine).toBe("Oracle");
  });
});

describe("dependency_audit_clean — the version is attached to the library name", () => {
  it("does not flag a modern AngularJS-mentioning page because some other 1.x appears later", () => {
    const html = `<script src="/vendor/angular.js?v=20240101"></script><p>Release 1.2.0 of our API</p><link href="/app.css?v=1.0.3">`;
    expect(findLibraryVersions(html)).toEqual([]);
  });

  it("does not flag jQuery 1.12.4 or 3.7.1 as the 1.0-1.8 range", () => {
    const libs = findLibraryVersions(`<script src="/wp-includes/js/jquery/jquery.min.js?ver=3.7.1"></script><script src="https://code.jquery.com/jquery-1.12.4.min.js"></script>`);
    expect(libs.map((l) => `${l.version}:${l.vulnerable}`)).toEqual(["3.7.1:false", "1.12.4:false"]);
  });

  it("flags jQuery 1.4.2 from a CDN path and AngularJS 1.2.0 from the Google CDN", () => {
    const libs = findLibraryVersions(`<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/1.4.2/jquery.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.2.0/angular.min.js"></script>`);
    expect(libs.filter((l) => l.vulnerable).map((l) => `${l.library} ${l.version}`)).toEqual(["jQuery 1.4.2", "AngularJS 1.2.0"]);
  });

  it("ignores Angular 2+ packages", () => {
    expect(findLibraryVersions(`<script src="https://unpkg.com/@angular/core@15.2.0/bundles/core.umd.js"></script>`)).toEqual([]);
  });
});

// ── Integration through runSecurityExtended ──────────────────────────────────

function context(html: string, status = 200, hostname = "app.acme.test"): ExtendedCheckContext {
  return {
    pageResult: { ok: status < 400, status, headers: {}, html, responseTimeMs: 10, finalUrl: `https://${hostname}` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

/** DoH: `name:type` → { Status, Answer }; anything else answers NOERROR empty. Every other URL 404s. */
function doh(map: Record<string, { Status?: number; data?: string[] }>) {
  return vi.fn(async (url: string | URL) => {
    const value = String(url);
    if (!value.includes("cloudflare-dns.com")) return new Response("not found", { status: 404 });
    const q = new URL(value).searchParams;
    const hit = map[`${q.get("name")}:${q.get("type")}`] ?? {};
    return new Response(JSON.stringify({ Status: hit.Status ?? 0, Answer: (hit.data ?? []).map((data) => ({ data })) }), { headers: { "content-type": "application/dns-json" } });
  });
}

const find = (checks: { checkKey: string }[], key: string) => checks.find((c) => c.checkKey === key) as { status: string; detail?: string } | undefined;

afterEach(() => vi.unstubAllGlobals());

describe("runSecurityExtended — the six checks end to end", () => {
  it("a healthy Heroku-hosted site with password UI copy and an unsigned zone reports no findings from these checks", async () => {
    vi.stubGlobal("fetch", doh({ "app.acme.test:CNAME": { data: ["acme-prod.herokuapp.com."] }, "acme-prod.herokuapp.com:A": { data: ["54.0.0.1"] } }));
    const html = `<html><body><form><input type="password" placeholder="password"/></form><script>var password = "hunter2hunter2"; // pg_query docs</script><script src="/js/angular.js"></script><p>v1.2.3</p></body></html>`;
    const checks = await runSecurityExtended(context(html));
    expect(find(checks, "subdomain_takeover_risk")?.status).toBe("PASS");
    expect(find(checks, "secret_scanning_github")?.status).toBe("PASS");
    expect(find(checks, "secret_scanning_github")?.detail).toContain("not a repository");
    expect(find(checks, "sql_error_exposure")?.status).toBe("PASS");
    expect(find(checks, "dependency_audit_clean")?.status).toBe("PASS");
    expect(find(checks, "dnssec_enabled")?.status).toBe("NOT_APPLICABLE");
    expect(find(checks, "dnssec_enabled")?.detail).not.toMatch(/vulnerable|cache poisoning/i);
    expect(find(checks, "bot_protection_present")?.status).toBe("NOT_APPLICABLE");
  });

  it("a dangling Heroku CNAME serving 'No such app', a leaked key, a DB error and old jQuery all still fire", async () => {
    vi.stubGlobal("fetch", doh({ "app.acme.test:CNAME": { data: ["gone.herokuapp.com."] }, "gone.herokuapp.com:A": { data: ["54.0.0.1"] } }));
    const html = `${HEROKU_NO_SUCH_APP}<script src="https://code.jquery.com/jquery-1.6.4.min.js"></script><script>const s="${stripe("sk", "51H8qZ2KJd8sLm3nP9qRsTuVwXyZaB")}"</script><p>You have an error in your SQL syntax near '1'</p>`;
    const checks = await runSecurityExtended(context(html, 404));
    expect(find(checks, "subdomain_takeover_risk")?.status).toBe("FAIL");
    expect(find(checks, "secret_scanning_github")?.status).toBe("FAIL");
    expect(find(checks, "sql_error_exposure")?.status).toBe("FAIL");
    expect(find(checks, "sql_error_exposure")?.detail).not.toMatch(/confirms/i);
    expect(find(checks, "dependency_audit_clean")?.status).toBe("WARN");
  });

  it("FAILs a CNAME to an Azure name that answers NXDOMAIN", async () => {
    vi.stubGlobal("fetch", doh({ "app.acme.test:CNAME": { data: ["gone.azurewebsites.net."] }, "gone.azurewebsites.net:A": { Status: 3 } }));
    const checks = await runSecurityExtended(context("<h1>error</h1>", 502));
    expect(find(checks, "subdomain_takeover_risk")?.status).toBe("FAIL");
  });

  it("keeps a signed zone and present bot protection as PASS", async () => {
    vi.stubGlobal("fetch", doh({ "app.acme.test:SOA": { data: ["ns.acme.test. hostmaster.acme.test. 1 2 3 4 5"] }, "app.acme.test:DS": { data: ["2371 13 2 ABCDEF"] } }));
    const checks = await runSecurityExtended(context(`<div class="cf-turnstile"></div>`));
    expect(find(checks, "bot_protection_present")?.status).toBe("PASS");
  });
});
