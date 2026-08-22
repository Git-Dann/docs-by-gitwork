import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  analyzeHost,
  boundedDmarcCandidates,
  isApex,
  isPlatformSuffix,
  platformSuffixOf,
  MULTI_LABEL_PUBLIC_SUFFIXES,
  organizationalDomainCandidates,
  publicSuffixOf,
  registrableDomain,
  SINGLE_LABEL_PUBLIC_SUFFIXES,
  subdomainLabels,
} from "../registrable-domain";

/**
 * These are the shapes the false-positive audit actually scanned, so they are
 * pinned rather than sampled. Any change to the curated suffix lists has to keep
 * every row true.
 */
describe("registrableDomain — the scanned target shapes from the audit", () => {
  it.each([
    // [hostname, registrable domain]
    ["www.gov.uk", "gov.uk"],
    ["news.ycombinator.com", "ycombinator.com"],
    ["developer.mozilla.org", "mozilla.org"],
    ["foundry.gitwork.co.uk", "gitwork.co.uk"],
    ["linear.app", "linear.app"],
    ["a.b.c.example.com", "example.com"],
    ["vercel.com", "vercel.com"],
    ["gitwork.co.uk", "gitwork.co.uk"],
    ["mozilla.org", "mozilla.org"],
  ])("%s -> %s", (hostname, expected) => {
    expect(registrableDomain(hostname)).toBe(expected);
  });
});

describe("multi-label public suffixes", () => {
  it("does not stop at the last two labels for a two-label suffix", () => {
    // The whole point: "co.uk" is a public suffix, so the answer is three labels
    // long. Taking the last two would give the suffix itself.
    expect(registrableDomain("foundry.gitwork.co.uk")).toBe("gitwork.co.uk");
    expect(registrableDomain("mail.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("shop.example.com.au")).toBe("example.com.au");
    expect(registrableDomain("www.example.co.nz")).toBe("example.co.nz");
    expect(registrableDomain("www.example.co.jp")).toBe("example.co.jp");
    expect(registrableDomain("www.example.co.za")).toBe("example.co.za");
    expect(registrableDomain("www.example.com.br")).toBe("example.com.br");
    expect(registrableDomain("www.example.co.in")).toBe("example.co.in");
    expect(registrableDomain("www.example.com.sg")).toBe("example.com.sg");
    expect(registrableDomain("www.example.org.uk")).toBe("example.org.uk");
  });

  it("prefers the longest matching suffix over the bare TLD", () => {
    expect(publicSuffixOf("example.co.uk")).toBe("co.uk");
    expect(publicSuffixOf("example.uk")).toBe("uk");
    // A three-label entry has to beat the two-label and one-label candidates.
    expect(publicSuffixOf("bucket.s3.amazonaws.com")).toBe("s3.amazonaws.com");
    expect(registrableDomain("bucket.s3.amazonaws.com")).toBe("bucket.s3.amazonaws.com");
  });

  it("resolves a UK academic host to the institution, not to the namespace", () => {
    // Verified against live DNS (2026-08): _dmarc.ac.uk does not exist, while
    // _dmarc.cam.ac.uk publishes p=reject. "ac.uk" is a registry namespace, so
    // the institution is the organizational domain.
    expect(registrableDomain("www.cam.ac.uk")).toBe("cam.ac.uk");
    expect(registrableDomain("cam.ac.uk")).toBe("cam.ac.uk");
    expect(isApex("cam.ac.uk")).toBe(true);
  });

  it("treats gov.uk as the organizational domain, because that is where its DMARC record lives", () => {
    // Verified against live DNS (2026-08):
    //   _dmarc.gov.uk     -> "v=DMARC1;p=reject;sp=none;np=reject;..."
    //   _dmarc.www.gov.uk -> (nothing)
    // The strict-PSL answer ("gov.uk" is a suffix, so www.gov.uk is itself the
    // organizational domain) finds no record for a p=reject domain — which is
    // exactly the false positive item 3 exists to fix.
    expect(registrableDomain("www.gov.uk")).toBe("gov.uk");
    expect(isApex("gov.uk")).toBe(true);
    expect(isApex("www.gov.uk")).toBe(false);
  });
});

describe("platform / hosting namespaces", () => {
  it("never resolves a customer deploy to the platform's own domain", () => {
    // Without these entries a DMARC or DNS check would query the PLATFORM's
    // records and report them as the customer's — a confident wrong answer.
    expect(registrableDomain("myapp.vercel.app")).toBe("myapp.vercel.app");
    expect(registrableDomain("myapp.netlify.app")).toBe("myapp.netlify.app");
    expect(registrableDomain("docs.pages.dev")).toBe("docs.pages.dev");
    expect(registrableDomain("someone.github.io")).toBe("someone.github.io");
    expect(registrableDomain("myapp.herokuapp.com")).toBe("myapp.herokuapp.com");
    expect(registrableDomain("store.myshopify.com")).toBe("store.myshopify.com");
  });

  it("marks a bare platform deploy host as an apex with no subdomain labels", () => {
    // ⚠️ The comment that was here said this is what stops
    // `backup_domain_configured` looking for `www.myapp.vercel.app`. It is the
    // opposite: `isApex` is TRUE for a platform deploy host, which is precisely
    // why that check treated it as a domain root, spent two lookups on a name the
    // platform will never issue, and advised adding a record to a zone that does
    // not exist. `isApex` is right — the name IS its own registrable domain — and
    // the distinction a caller needs is `platformSuffixOf`, below.
    expect(isApex("myapp.vercel.app")).toBe(true);
    expect(subdomainLabels("myapp.vercel.app")).toEqual([]);
  });

  it("still resolves the platform's own marketing site normally", () => {
    expect(registrableDomain("www.vercel.com")).toBe("vercel.com");
    expect(registrableDomain("vercel.app")).toBeNull(); // the namespace itself
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// platformSuffixOf / isPlatformSuffix
//
// The predicate exists because `isApex` cannot answer the question a caller
// giving ADVICE has to ask. `myapp.vercel.app` is an apex and its own registrable
// domain, and there is still no zone to add a `www` record to — the labels are
// issued one at a time by the platform. `backup_domain_configured` WARNed "add an
// A/CNAME record for www.myapp.vercel.app" on every such host.
// ─────────────────────────────────────────────────────────────────────────────

describe("platformSuffixOf — names the platform a host was issued under", () => {
  it.each([
    // The reproducing hosts, one per platform named in the residual.
    ["myapp.vercel.app", "vercel.app"],
    ["mysite.netlify.app", "netlify.app"],
    ["store.myshopify.com", "myshopify.com"],
    ["myproject.readthedocs.io", "readthedocs.io"],
    ["someuser.github.io", "github.io"],
    ["myapp.herokuapp.com", "herokuapp.com"],
    ["docs.pages.dev", "pages.dev"],
    ["myteam.notion.site", "notion.site"],
    ["myapp.fly.dev", "fly.dev"],
    ["d111111abcdef8.cloudfront.net", "cloudfront.net"],
  ])("%s sits beneath %s", (hostname, expected) => {
    expect(platformSuffixOf(hostname)).toBe(expected);
    expect(isPlatformSuffix(hostname)).toBe(true);
  });

  it("takes the longest namespace when two overlap", () => {
    // Both `railway.app` and `up.railway.app` are in the list; a shortest-match
    // loop would name the wrong one in the decline reason.
    expect(platformSuffixOf("myapp.up.railway.app")).toBe("up.railway.app");
    expect(platformSuffixOf("myapp.railway.app")).toBe("railway.app");
    expect(platformSuffixOf("bucket.s3.amazonaws.com")).toBe("s3.amazonaws.com");
  });

  // ── The other direction: what must NOT be called a platform host ──

  it("does not match the namespace itself, because several are real websites", () => {
    // This is the precision that keeps the predicate from becoming its own false
    // positive. `www.substack.com` and `www.wordpress.com` resolve, so the
    // apex/www question is entirely real for the vendor's own site — answering
    // "platform" here would decline a legitimate check.
    for (const namespace of [
      "substack.com",
      "wordpress.com",
      "squarespace.com",
      "myshopify.com",
      "webflow.io",
      "railway.app",
      "notion.site",
      "vercel.app",
      "github.io",
    ]) {
      expect(platformSuffixOf(namespace), namespace).toBeNull();
      expect(isPlatformSuffix(namespace), namespace).toBe(false);
    }
  });

  // ── FOURTH PASS: the over-correction. The namespace-equality guard above stopped
  // `substack.com` matching, but `www.substack.com` still did — one label to the
  // left of the namespace read as a customer name, so the vendor's own marketing
  // site was declined with "names under substack.com are handed out one label at a
  // time by the platform". `www.substack.com`, `www.wordpress.com` and
  // `www.squarespace.com` all resolve and all serve the vendor's site; the apex/www
  // pair is exactly as assessable there as on any other domain.
  it("does not match the namespace's own www host either", () => {
    for (const host of [
      "www.substack.com",
      "www.wordpress.com",
      "www.squarespace.com",
      "www.myshopify.com",
      "www.webflow.io",
      "www.notion.site",
      "www.railway.app",
    ]) {
      expect(platformSuffixOf(host), host).toBeNull();
      expect(isPlatformSuffix(host), host).toBe(false);
    }
  });

  it("still declines a customer name that carries a www label", () => {
    // The discriminating control for the fix above: `www` is only excused when it
    // is the ONLY label above the namespace. `www.myapp.vercel.app` has a customer
    // label under it, so there is still no zone to add a record to.
    expect(platformSuffixOf("www.myapp.vercel.app")).toBe("vercel.app");
    expect(platformSuffixOf("www.mysite.netlify.app")).toBe("netlify.app");
    expect(platformSuffixOf("www.someuser.github.io")).toBe("github.io");
  });

  it("falls through to a shorter namespace rather than excusing a www host", () => {
    // `up.railway.app` and `railway.app` are both listed. Returning null on the
    // first www-match would have made `www.up.railway.app` — a name under
    // Railway's deploy namespace, not a website of Railway's — look like an
    // ordinary domain with an actionable www record.
    expect(platformSuffixOf("www.up.railway.app")).toBe("railway.app");
    // And the customer form is unchanged.
    expect(platformSuffixOf("myapp.up.railway.app")).toBe("up.railway.app");
  });

  it("leaves every custom domain alone, including one hosted ON a platform", () => {
    // The test is on the NAME. gitwork.co.uk is served by Netlify — its response
    // says `server: Netlify` — and it has its own zone, so its www record is
    // genuinely actionable and must keep getting a real verdict.
    for (const host of [
      "gitwork.co.uk",
      "www.gitwork.co.uk",
      "foundry.gitwork.co.uk",
      "www.gov.uk",
      "news.ycombinator.com",
      "developer.mozilla.org",
      "linear.app",
      "vercel.com",
      "example.com",
      "shop.example.com",
      "example.test",
    ]) {
      expect(platformSuffixOf(host), host).toBeNull();
      expect(isPlatformSuffix(host), host).toBe(false);
    }
  });

  it("normalises case, a trailing dot and a port before deciding", () => {
    expect(platformSuffixOf("MyApp.Vercel.App.")).toBe("vercel.app");
    expect(platformSuffixOf("myapp.vercel.app:443")).toBe("vercel.app");
  });

  it("never throws on hostile or empty input", () => {
    for (const host of [undefined as unknown as string, null as unknown as string, "", ".", "....", "192.0.2.1"]) {
      expect(() => platformSuffixOf(host)).not.toThrow();
      expect(platformSuffixOf(host)).toBeNull();
    }
  });

  it("does not change what registrableDomain answers for the same host", () => {
    // The predicate is additive. If it ever started re-pointing the registrable
    // domain at the platform, the DMARC ladder would query Vercel's records and
    // report them as the customer's — the exact bug the suffix list prevents.
    expect(registrableDomain("myapp.vercel.app")).toBe("myapp.vercel.app");
    expect(publicSuffixOf("myapp.vercel.app")).toBe("vercel.app");
    expect(organizationalDomainCandidates("myapp.vercel.app")).toEqual([]);
  });
});

describe("isApex", () => {
  it.each([
    ["gov.uk", true],
    ["linear.app", true],
    ["gitwork.co.uk", true],
    ["ycombinator.com", true],
    ["www.gov.uk", false],
    ["news.ycombinator.com", false],
    ["foundry.gitwork.co.uk", false],
    ["a.b.c.example.com", false],
  ])("%s -> %s", (hostname, expected) => {
    expect(isApex(hostname)).toBe(expected);
  });

  it("is false — not true — when the registrable domain could not be established", () => {
    // A caller that treats false as "this is a subdomain" would be wrong here,
    // which is why analyzeHost().reason exists.
    expect(isApex("192.0.2.1")).toBe(false);
    expect(isApex("localhost")).toBe(false);
    expect(isApex("example.invalidtld")).toBe(false);
    expect(analyzeHost("example.invalidtld").reason).toBeTruthy();
  });
});

describe("subdomainLabels", () => {
  it.each([
    ["www.gov.uk", ["www"]],
    ["news.ycombinator.com", ["news"]],
    ["developer.mozilla.org", ["developer"]],
    ["foundry.gitwork.co.uk", ["foundry"]],
    ["a.b.c.example.com", ["a", "b", "c"]],
    ["linear.app", []],
    ["gov.uk", []],
  ])("%s -> %j", (hostname, expected) => {
    expect(subdomainLabels(hostname)).toEqual(expected);
  });

  it("returns [] for an unresolvable host, so callers must consult reason", () => {
    expect(subdomainLabels("10.0.0.1")).toEqual([]);
    expect(subdomainLabels("example.invalidtld")).toEqual([]);
  });
});

describe("null cases — the module declines rather than guessing", () => {
  it("returns null for IPv4, IPv6 and bracketed IPv6 literals", () => {
    for (const ip of [
      "192.0.2.1",
      "8.8.8.8",
      "127.0.0.1",
      "::1",
      "2001:db8::1",
      "[2001:db8::1]",
      "[::1]:8080",
      "fe80::1%eth0",
    ]) {
      expect(registrableDomain(ip)).toBeNull();
      expect(analyzeHost(ip).isIpLiteral).toBe(true);
      expect(analyzeHost(ip).reason).toMatch(/IP address/i);
    }
  });

  it("returns null for a single-label host", () => {
    for (const host of ["localhost", "intranet", "uk", "com"]) {
      expect(registrableDomain(host)).toBeNull();
    }
    expect(analyzeHost("localhost").reason).toMatch(/single-label/i);
  });

  it("returns null for a hostname that IS a public suffix", () => {
    for (const suffix of ["co.uk", "com.au", "ac.uk", "vercel.app", "github.io", "co.jp"]) {
      expect(registrableDomain(suffix)).toBeNull();
      expect(publicSuffixOf(suffix)).toBe(suffix);
      expect(analyzeHost(suffix).reason).toMatch(/is itself a public suffix/i);
    }
  });

  it("returns null for an unknown suffix instead of taking the last two labels", () => {
    // The honesty requirement. Guessing here is what would make a DMARC check
    // query the wrong record and report a confident wrong answer.
    for (const host of [
      "example.invalidtld",
      "www.example.zzz",
      "foundry.example.notatld",
      "example.123",
      "site.qqq",
    ]) {
      expect(registrableDomain(host)).toBeNull();
      expect(analyzeHost(host).reason).toMatch(/curated public-suffix list/i);
    }
  });

  it("returns null for a registry that does not permit direct second-level registration", () => {
    // .za / .br / .th have no flat namespace: example.za is not registrable, so
    // the module must not invent it.
    expect(registrableDomain("example.za")).toBeNull();
    expect(registrableDomain("example.br")).toBeNull();
    expect(registrableDomain("example.th")).toBeNull();
    // ...while the hierarchical form resolves normally.
    expect(registrableDomain("example.co.za")).toBe("example.co.za");
    expect(registrableDomain("example.com.br")).toBe("example.com.br");
  });

  it("returns null for malformed and empty input", () => {
    for (const host of [
      "",
      "   ",
      "a..b",
      "example..com",
      "-bad.com",
      "bad-.com",
      "exa mple.com",
      "example.com/path",
      "http://example.com",
      "user@example.com",
      `${"a".repeat(64)}.com`, // label over 63 characters
      `${Array.from({ length: 5 }, () => "a".repeat(60)).join(".")}.com`, // name over 253 characters
    ]) {
      expect(registrableDomain(host)).toBeNull();
      expect(analyzeHost(host).reason).toBeTruthy();
    }
  });

  it("never throws on hostile input", () => {
    for (const host of [
      undefined as unknown as string,
      null as unknown as string,
      ".",
      "....",
      "..com",
      "\u0000.com",
      "🙂.com",
      "xn--.com",
    ]) {
      expect(() => analyzeHost(host)).not.toThrow();
      expect(registrableDomain(host)).toBeNull();
    }
  });

  it("always pairs a null registrable with a reason, and a resolved one with no reason", () => {
    const resolved = analyzeHost("www.gov.uk");
    expect(resolved.registrable).toBe("gov.uk");
    expect(resolved.reason).toBeNull();

    const unresolved = analyzeHost("example.invalidtld");
    expect(unresolved.registrable).toBeNull();
    expect(typeof unresolved.reason).toBe("string");
    expect(unresolved.reason!.length).toBeGreaterThan(20);
  });
});

describe("normalisation", () => {
  it("lowercases", () => {
    expect(registrableDomain("WWW.GOV.UK")).toBe("gov.uk");
    expect(registrableDomain("Foundry.GitWork.Co.Uk")).toBe("gitwork.co.uk");
  });

  it("strips a trailing root dot and any leading dots", () => {
    expect(registrableDomain("www.gov.uk.")).toBe("gov.uk");
    expect(registrableDomain(".www.gov.uk")).toBe("gov.uk");
    expect(registrableDomain(".www.gov.uk.")).toBe("gov.uk");
  });

  it("strips surrounding whitespace and a trailing port", () => {
    expect(registrableDomain("  www.gov.uk  ")).toBe("gov.uk");
    expect(registrableDomain("www.gov.uk:443")).toBe("gov.uk");
    expect(registrableDomain("localhost:3000")).toBeNull();
  });

  it("reports the normalised hostname back to the caller", () => {
    expect(analyzeHost(" WWW.GOV.UK. ").hostname).toBe("www.gov.uk");
  });

  it("treats an IDN in punycode form as an ordinary name", () => {
    expect(registrableDomain("www.xn--bcher-kva.de")).toBe("xn--bcher-kva.de");
  });

  it("accepts a leading-underscore service label", () => {
    // So a caller can hand us the name it is about to query.
    expect(registrableDomain("_dmarc.www.gov.uk")).toBe("gov.uk");
    expect(subdomainLabels("_dmarc.www.gov.uk")).toEqual(["_dmarc", "www"]);
  });
});

describe("organizationalDomainCandidates", () => {
  it("walks from the most specific parent down to the registrable domain", () => {
    expect(organizationalDomainCandidates("a.b.c.example.com")).toEqual([
      "b.c.example.com",
      "c.example.com",
      "example.com",
    ]);
    expect(organizationalDomainCandidates("www.gov.uk")).toEqual(["gov.uk"]);
    expect(organizationalDomainCandidates("foundry.gitwork.co.uk")).toEqual(["gitwork.co.uk"]);
  });

  it("offers the department's own zone before the parent for a .gov.uk host", () => {
    // Verified against live DNS (2026-08): _dmarc.hmrc.gov.uk and
    // _dmarc.dwp.gov.uk both exist, so a caller that walked straight to the
    // registrable domain would report gov.uk's sp=none as the department's own
    // policy. The ladder lets it stop at the first name that answers.
    expect(organizationalDomainCandidates("www.hmrc.gov.uk")).toEqual(["hmrc.gov.uk", "gov.uk"]);
  });

  it("is empty for an apex — there is no parent to fall back to", () => {
    expect(organizationalDomainCandidates("linear.app")).toEqual([]);
    expect(organizationalDomainCandidates("gov.uk")).toEqual([]);
  });

  it("is empty when the registrable domain could not be established", () => {
    expect(organizationalDomainCandidates("192.0.2.1")).toEqual([]);
    expect(organizationalDomainCandidates("www.example.invalidtld")).toEqual([]);
    expect(organizationalDomainCandidates("localhost")).toEqual([]);
  });

  it("ends at the registrable domain and never emits a bare public suffix", () => {
    for (const host of [
      "a.b.example.co.uk",
      "one.two.three.example.com.au",
      "x.y.someone.github.io",
    ]) {
      const candidates = organizationalDomainCandidates(host);
      expect(candidates.at(-1)).toBe(registrableDomain(host));
      for (const candidate of candidates) {
        expect(MULTI_LABEL_PUBLIC_SUFFIXES.has(candidate)).toBe(false);
        expect(SINGLE_LABEL_PUBLIC_SUFFIXES.has(candidate)).toBe(false);
      }
    }
  });
});

describe("curated list integrity", () => {
  it("has no entry in both sets and no malformed entry", () => {
    for (const suffix of MULTI_LABEL_PUBLIC_SUFFIXES) {
      expect(suffix.split(".").length).toBeGreaterThan(1);
      expect(suffix).toMatch(/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$/);
      expect(SINGLE_LABEL_PUBLIC_SUFFIXES.has(suffix)).toBe(false);
    }
    for (const tld of SINGLE_LABEL_PUBLIC_SUFFIXES) {
      expect(tld.split(".").length).toBe(1);
      expect(tld).toMatch(/^[a-z]{2,}$/);
    }
  });

  it("keeps gov.uk out of the multi-label set — the deviation is load-bearing", () => {
    // If this ever flips, registrableDomain("www.gov.uk") becomes "www.gov.uk"
    // and the DMARC org-domain fallback stops finding gov.uk's p=reject record.
    expect(MULTI_LABEL_PUBLIC_SUFFIXES.has("gov.uk")).toBe(false);
    expect(MULTI_LABEL_PUBLIC_SUFFIXES.has("ac.uk")).toBe(true);
    expect(SINGLE_LABEL_PUBLIC_SUFFIXES.has("uk")).toBe(true);
  });

  it("stays small enough for the scan hot path", () => {
    // Not the 15k-line Mozilla PSL. If this trips, the list has grown into one.
    expect(MULTI_LABEL_PUBLIC_SUFFIXES.size).toBeLessThan(500);
    expect(SINGLE_LABEL_PUBLIC_SUFFIXES.size).toBeLessThan(300);
  });
});

describe("purity — safe to import from the AI-free deterministic core", () => {
  const source = readFileSync(new URL("../registrable-domain.ts", import.meta.url), "utf8");

  it("imports nothing but node:net", () => {
    const imports = [...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
    expect(imports).toEqual(["node:net"]);
  });

  it("performs no network or database access", () => {
    // Comments are stripped first: the module header legitimately NAMES the
    // things it must not import ("never import anything from pulse-ai"), and a
    // grep over the raw file would match its own documentation.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(
      /\bfetch\s*\(|\brequire\s*\(|\bimport\s*\(|undici|node:dns|node:http|prisma|pulse-ai|dns\/promises/,
    );
  });

  it("is deterministic and side-effect free across repeated calls", () => {
    const first = analyzeHost("foundry.gitwork.co.uk");
    const second = analyzeHost("foundry.gitwork.co.uk");
    expect(second).toEqual(first);
    // The returned array must not be a shared mutable reference into the module.
    first.subdomainLabels.push("mutated");
    expect(analyzeHost("foundry.gitwork.co.uk").subdomainLabels).toEqual(["foundry"]);
  });
});

describe("boundedDmarcCandidates — the cap must not drop the organizational domain", () => {
  // The bug: a plain .slice(0, 3) caps the WRONG END. On a deeply-nested host it keeps
  // three intermediate parents and discards the organizational domain — the ONE name
  // RFC 7489 §6.6.3 requires a receiver to retry — producing a WARN at HIGH confidence
  // saying no DMARC record exists for a host whose organizational domain publishes one.
  it("keeps the organizational domain even when the ladder is longer than the budget", () => {
    const ladder = organizationalDomainCandidates("a.b.c.d.example.com");
    expect(ladder).toEqual(["b.c.d.example.com", "c.d.example.com", "d.example.com", "example.com"]);
    const bounded = boundedDmarcCandidates(ladder);
    expect(bounded).toHaveLength(3);
    expect(bounded.at(-1)).toBe("example.com");
    // The old behaviour, pinned as what must NOT happen again.
    expect(ladder.slice(0, 3).at(-1)).toBe("d.example.com");
    expect(bounded).not.toEqual(ladder.slice(0, 3));
  });

  it("keeps the nearest parents too, so a department zone is still tried first", () => {
    // hmrc.gov.uk publishes its own p=reject; gov.uk publishes sp=none. Order matters.
    expect(boundedDmarcCandidates(organizationalDomainCandidates("www.hmrc.gov.uk")))
      .toEqual(["hmrc.gov.uk", "gov.uk"]);
  });

  it("passes a short ladder through untouched", () => {
    expect(boundedDmarcCandidates(["gov.uk"])).toEqual(["gov.uk"]);
    expect(boundedDmarcCandidates(organizationalDomainCandidates("www.gov.uk"))).toEqual(["gov.uk"]);
    expect(boundedDmarcCandidates([])).toEqual([]);
  });

  it("honours an explicit budget, and a budget of 1 keeps only the organizational domain", () => {
    const ladder = organizationalDomainCandidates("a.b.c.d.example.com");
    expect(boundedDmarcCandidates(ladder, 2)).toEqual(["b.c.d.example.com", "example.com"]);
    expect(boundedDmarcCandidates(ladder, 1)).toEqual(["example.com"]);
  });
});
