# Pulse false-positive audit — August 2026

**How this was produced.** Six real sites were scanned by Pulse, then every P1/P2
finding was verified INDEPENDENTLY of Pulse — `curl`, `dig`, DNS-over-HTTPS, `openssl`
and headless Chrome against the live sites. Nothing below rests on Pulse's own output,
which is the point: a scanner's report is not evidence about the scanner.

**Result: 88 actionable findings checked, 38 defective, deduplicating to 19 root causes.
No site produced zero false positives.** Two of the six were told their P1 launch
blockers were legal documents linked from the footer of the page Pulse had just parsed.

This document is the evidence base for the fixes in CLAUDE.md's false-positive section.
It is kept because the reproductions are the expensive part — if a fix is ever
questioned or reverted, the command that proves the bug is here.

Three items were additionally reproduced by hand afterwards, and that pass found a
20th root cause the audit missed (a brand-prefixed legal path such as
`github-terms-of-service`) plus a false NEGATIVE in the secret scanner (`sk-[a-zA-Z0-9]`
has no hyphen in its class, so it cannot match a modern `sk-proj-…` OpenAI key).

---

# Pulse false-positive audit — consolidated fix list

**Corpus:** 6 sites, 1 scan each, 88 actionable (P1/P2) findings verified independently with `curl`/`dig`/DoH/`openssl`/headless Chrome. 38 finding-instances were defective, deduplicating to **19 root causes** (+3 hygiene items). All file:line references below re-verified against `/tmp/pulse-sales` while writing this list.

**No site produced zero false positives.** That is a result, not a gap in the audit:

| Site | Score | Actionable | Defective | Worst |
|---|---|---|---|---|
| gov.uk | 78 | 11 | **7** | both P1s wrong |
| news.ycombinator.com | 74 | 19 | 8 | both P1s wrong |
| gitwork.co.uk | 71 | 21 | 6 | one P1 wrong |
| developer.mozilla.org | 80 | 14 | 7 | 3 outright false |
| vercel.com | 87 | 13 | 6 | self-contradicting headline |
| linear.app | 90 | 10 | 4 | browser-disproved security claim |

Two of the six reports told the visitor their **P1 launch blockers** were missing legal documents that are linked from the footer of the page Pulse just parsed.

---

## FIX LIST — ranked by (visibility × wrongness)

### 1. `privacy_policy` / `terms_of_service` — link matcher misses two extremely common footer shapes
**`src/server/pulse-scan.ts:1231` (`linksTo`), `:1237` (privacy), `:1251` (ToS)**
Reproduced on **gov.uk** and **news.ycombinator.com** — different shapes, same matcher.

`linksTo` requires the token to sit between a `/` and a terminator (`/|["'#?]|$`), plus one fallback requiring the word inside the href *after* `/legal/`. Two real-world forms miss:

- **Hyphenation variant.** `href="/help/terms-conditions"` (standard UK form, used across GOV.UK): "terms" is followed by `-` (not a terminator), "conditions" is preceded by `-` (not `/`). Both alternatives miss.
  ```
  $ grep -o -iE 'href="[^"]*(terms|conditions)[^"]*"' /tmp/govuk.html  ->  href="/help/terms-conditions"
  $ curl -sS -o /tmp/tc.html -w 'HTTP %{http_code}\n' https://www.gov.uk/help/terms-conditions  ->  HTTP 200, H1: Terms and conditions
  ```
- **Legal hub link.** `href="https://www.ycombinator.com/legal/"` — a bare hub holding both documents. The `/legal/…privacy` fallback requires the word *in the href*, so it misses.
  ```
  $ curl -sSL -w 'HTTP %{http_code}\n' https://www.ycombinator.com/legal/  ->  HTTP 200
  $ grep -oiE '<h[1-3][^>]*>[^<]{0,90}' /tmp/yclegal.html | sed 's/<[^>]*>//' | head -4
  Legal / Privacy Policy / Terms of Use
  ```

**Smallest fix:** (a) add `terms-conditions`, `terms-and-privacy`, `policies` to the token lists and allow `-` as an internal separator between the two words; (b) when the page links a bare `/legal`, `/legal/`, `/policies` hub and no direct match was found, fetch it once and content-verify with the **existing `fileServed(url, predicate)` helper** (`pulse-scan.ts:1909` already does exactly this for `security.txt`) rather than trusting the href.

⚠️ **FALSE-NEGATIVE RISK — high, and this is a legal check.** Loosening the regex alone (matching a bare `/legal/` link as proof) would PASS a site that links a Legal page containing no privacy policy at all. Both keys are in `LAUNCH_BLOCKING_ONLY` (`priority.ts:40`) and `blockingKeys` (`release-decision.ts:106,118`), so a false PASS silently unblocks a release gate. **The content-verify is not optional** — do (b) or don't do (a).

⚠️ **The test suite structurally cannot catch this.** `src/server/pulse-checks/__tests__/legal-link-detection.test.ts:24` builds its fixtures from the same token array the implementation matches on, so it is self-confirming. Rebuild the fixtures from real observed footers (`/help/terms-conditions`, `/legal/`, `/legal/terms-and-conditions`, `/en-gb/terms`).

---

### 2. `no_api_keys_in_html` — P1 "CRITICAL … rotate credentials immediately" fires on `mask-icon`
**`src/server/pulse-checks/security-extended.ts:164`**
Reproduced on **gov.uk**.

```ts
const apiKeyPatterns = /AIza[0-9A-Za-z\-_]{35}|sk-[a-zA-Z0-9]{32,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}/;
```
The `sk-` alternative has **no left word boundary and no upper length bound**, so it matches mid-token inside a fingerprinted asset filename. The match on gov.uk is the letters `ma‑sk‑` from `mask-icon` plus a public SHA-256 content digest:

```
MATCH -> 'sk-cdf4265165f8d7f9eec54aa2c1dfbb3d8b6d297c5d7919f0313e0836a5804bb6'
CONTEXT: <link rel="mask-icon" href="/assets/frontend/govuk-icon-mask-cdf42651….svg">
$ curl -sI ".../govuk-icon-mask-cdf42651….svg" | head -3   ->  HTTP/2 200, content-type: image/svg+xml, server: AmazonS3
Collision class: mask-/task-/disk-/desk-/risk-/kiosk-/flask- + 32 hex chars all match.
```
`<link rel="mask-icon">` is standard head boilerplate and filename fingerprinting is default in Rails/webpack/Vite, so this misfires on a large share of scanned sites — always at P1 CRITICAL, always telling the owner to rotate a credential that does not exist.

**Smallest fix:** anchor the alternative — `(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{32,}` — and require the mixed-case/underscore alphabet a real `sk-` key uses (reject an all-lowercase-hex tail).

⚠️ **False-negative risk: low but real.** Requiring mixed case would miss a hypothetical all-lowercase key. Accept it: a CRITICAL "rotate now" verdict must not fire on a content hash, and the other three alternatives (`AIza`, `AKIA`, `ghp_`) are already well-anchored by their prefixes.

---

### 3. `dmarc_record` — single exact-name lookup, so DMARC's own discovery algorithm is not implemented
**`src/server/pulse-scan.ts:2626`** (duplicated at `src/server/pulse-checks/email-deliverability.ts:56`)
Reproduced on **developer.mozilla.org**, **news.ycombinator.com**, **www.gov.uk** — 3 of 6 sites.

```ts
checkDnsRecord(`_dmarc.${hostname}`, "TXT")   // one query, no organizational-domain fallback
```
RFC 7489 §6.6.3 **requires** a receiver finding no record at the DNS domain to retry at the Organizational Domain. Pulse queries once and stops, so every subdomain of every DMARC-protected org reports "No DMARC record":

```
$ curl -sS -H 'Accept: application/dns-json' '…?name=_dmarc.www.gov.uk&type=TXT'   -> Status 3 (NXDOMAIN)   [what Pulse asked]
$ dig +short TXT _dmarc.gov.uk       -> "v=DMARC1;p=reject;sp=none;np=reject;adkim=s;aspf=s;fo=1;rua=…"
$ dig +short TXT _dmarc.mozilla.org  -> "v=DMARC1; p=reject; pct=100; adkim=r; aspf=r; rua=…"
$ dig +short TXT _dmarc.ycombinator.com -> "v=DMARC1; p=none; pct=100; sp=none; …"
```
gov.uk and mozilla.org run **`p=reject`** — the strictest policy DMARC defines — and are told they have no impersonation protection.

**Smallest fix:** on an empty answer, retry at the registrable domain and honour the `sp=`/`np=` tags. **No public-suffix helper exists in the codebase** — `grep -rn "registrableDomain|apexDomain|organizationalDomain|publicSuffix|rootDomain" src/server/` returns **zero hits** — so this is one shared primitive that also fixes item 5.

⚠️ **False-negative risk — real, and it is in the `sp=` tag.** A blanket "org record found ⇒ PASS" would wrongly reassure a subdomain whose parent publishes `sp=none` (HN's does, gov.uk's does). Report the inherited policy *and* the effective subdomain policy.

⚠️ **DO NOT apply the same fallback to `spf_record` (`pulse-scan.ts:2625`).** SPF is evaluated at the RFC5321.MailFrom domain and RFC 7208 §3.1 makes it explicitly non-inheriting. The HN audit proved this the hard way: `news.ycombinator.com` has no SPF and `ycombinator.com`'s `v=spf1 … -all` genuinely does **not** cover it, so that finding is correct and an org fallback would convert it into a false negative on an email-spoofing check. The SPF work is **wording only** (item 15).

---

### 4. `cors_policy` — absence of `Access-Control-Allow-Origin` warned as a defect, and any explicit origin scored PASS
**`src/server/pulse-scan.ts:1895-1907`**
Reproduced on **all six sites** — the strongest reproduction in the corpus.

```ts
status: hasWildcardCors ? "WARN" : corsHeader ? "PASS" : "WARN",
detail: … : "No CORS header — verify cross-origin policy is correctly configured for API routes.",
```
Two independent defects in one expression:
- **Absence warns.** No ACAO on an HTML document is the locked-down state. Every site was verified to be genuinely header-less (`grep -ci '^access-control-allow-origin' → 0`) and every one was told to go fix it. Pulse's own newer check says the opposite about identical evidence — `api-behaviour.ts:181`: *"No CORS headers returned — the API is same-origin only, which is the safest default."*
- **A live false negative.** `corsHeader ? "PASS"` means a homepage returning `Access-Control-Allow-Origin: https://attacker.example` is **upgraded** from WARN to PASS. Only the literal `*` is caught.
- The advice names "API routes" that were never probed; on linear.app the API it points at **does** have CORS configured (`OPTIONS https://api.linear.app/graphql` → `204` + `access-control-allow-origin: https://evil.example`).

**Smallest fix:** absent ⇒ `SKIPPED` with a reason, using the pattern **eight lines above in the same file** — `secure_cookie_attributes` (`pulse-scan.ts:1887`) already emits *"Not assessed — this response set no cookies, so there are no cookie attributes to check."* Keep WARN for `*`, add WARN for a reflected/unexpected explicit origin, and let the probed `api-behaviour.ts` family own the API verdict.

⚠️ Fixing only the absence branch and leaving `corsHeader ? "PASS"` makes the check net-worse: it would go quiet on the safe case while still rubber-stamping origin reflection. Fix both branches together.

---

### 5. `backup_domain_configured` — `www.` concatenated onto the scanned hostname unconditionally
**`src/server/pulse-checks/infrastructure-extended.ts:66-68`**
Reproduced on **news.ycombinator.com**, **developer.mozilla.org**, **www.gov.uk**.

```ts
const wwwCname = await resolveDnsRecord(`www.${hostname}`, "CNAME");
const wwwA     = await resolveDnsRecord(`www.${hostname}`, "A");
```
No apex guard and no leading-`www.` strip, so the check queries names that cannot exist:
```
$ dig +noall +comments www.www.gov.uk A | grep -i status   ->  status: NXDOMAIN
$ dig +noall +comments www.news.ycombinator.com A | grep status -> NXDOMAIN
# meanwhile the property the check claims to measure is satisfied:
$ dig +short A ycombinator.com -> 99.86.12.82 …   $ dig +short A www.ycombinator.com -> 104.20.46.159 …
$ curl -sS -o /dev/null -w 'HTTP %{http_code} ip=%{remote_ip}\n' https://www.gov.uk -> HTTP 200 ip=151.101.192.144
```
The check is **structurally incapable of passing on any non-apex host** — `news.*`, `app.*`, `api.*`, `docs.*` are a large share of real targets, and `www.` inputs are the commonest form a prospect pastes. Note the file's probe-honesty guard does not save it: NXDOMAIN returns resolver HTTP 200 with no Answer, so `resolveDnsRecord` correctly reports `{ok:true, records:[]}` and `probe-honesty.test.ts:171` passes while the check is wrong — **the bug is the query name, not the transport.**

**Smallest fix:** strip a leading `www.` before prefixing; if the scanned host **is** the www host, PASS; if the scanned host carries any other subdomain label (compare against the registrable domain from item 3's helper), `SKIPPED` with a reason.

---

### 6. `cdn_detected` / `load_balancer_detected` — closed vendor fingerprint lists, reported as directly-observed absence
**`src/server/pulse-scan.ts:940`** and **`src/server/pulse-checks/infrastructure-extended.ts:26`**
`load_balancer_detected` reproduced on **vercel.com** and **gitwork.co.uk**; `cdn_detected` on **gitwork.co.uk**.

```ts
const cdnHeaders = ["x-vercel-id","cf-ray","x-amz-cf-id","x-cache","x-fastly-request-id"];
const hasLb = !!h["x-envoy-upstream-service-time"] || !!h["via"] || /cloudflare|nginx|haproxy|aws.*elb|alb.*upstream|load.balanc/i.test(JSON.stringify(h));
```
Neither reads the **standards-defined, vendor-neutral** signals that actually prove an intermediary — RFC 9211 `Cache-Status` (with `fwd`/`fwd-status`) and RFC 9111 `Age`:
```
# gitwork.co.uk — a proxy's own machine-readable account of forwarding the request:
$ curl -sSI https://gitwork.co.uk | grep -iE 'server|cache-status|x-nf'
cache-status: "Netlify Edge"; fwd=miss; fwd-status=200; stored
server: Netlify
x-nf-request-id: 01M0MCNA79ASQ9BBW81EEBK2FZ
$ for i in 1 2; do curl -sS -o /dev/null -D - https://gitwork.co.uk/ | grep -i '^age'; sleep 2; done -> age: 317 / age: 319

# vercel.com — multi-hop proxy + rotating DNS pool, told it has no load balancer:
$ curl -sI https://vercel.com | grep -iE '^(server|age|x-vercel-cache|x-vercel-id):'
server: Vercel / age: 243 / x-vercel-cache: HIT / x-vercel-id: lhr1::iad1::7d86s-…
$ for r in 8.8.8.8 1.1.1.1 9.9.9.9; do dig @$r +short A vercel.com | tr '\n' ' '; echo; done
64.239.109.193 64.239.123.65 / 64.239.109.1 64.239.109.193 / 64.239.123.65 64.239.109.129
```
The CDN list also carries the **legacy** `x-cache` but not the standardised `cache-status`, so any CDN that migrated to the RFC header is invisible — a systematic blind spot, not one missing vendor. `pulse-scan.ts:929` already knows about Netlify (`platformSuffixes`); only the CDN list was never updated.

**Smallest fix:** test RFC 9211 `Cache-Status`, RFC 9111 `Age` and `Via` **before** any vendor fingerprint, and add `server: Netlify|Vercel|Fastly|Akamai|Caddy|Traefik` to the list. This fixes both checks for every host at once. Also stop matching `/cloudflare|nginx|…/` against `JSON.stringify(h)` — it will PASS on any site whose unrelated header value happens to contain one of those strings.

---

### 7. The `infrastructure-extended.ts` prose-regex family — page copy standing in for an infrastructure measurement
**`src/server/pulse-checks/infrastructure-extended.ts:22`** (`multi_region_signals`) and nine siblings at `:29, :32, :35, :38, :41, :44, :47, :50, :62`
`multi_region_signals` reproduced actionable on **developer.mozilla.org**, **gitwork.co.uk**, **www.gov.uk**.

```ts
const hasMultiRegion = /multi.region|…|eu.west|us.east|ap.southeast|edge.*network|cdn.*region/i.test(html);
```
It greps the **page body** for marketing phrases and then asserts a fact about the deployment ("single-region deployments have geographic latency and no availability failover"), while `ctx.pageResult.headers` — which holds the answer — is in scope as `h`. Both MDN and gov.uk are on Fastly's global anycast network and were advised to "consider … a global CDN":
```
# gov.uk — serving IP inside Fastly's own published anycast list, POP named in the response:
$ curl -sS https://api.fastly.com/public-ip-list | python3 -c "…151.101.192.144…"  ->  ['151.101.0.0/16']
$ curl -sI https://www.gov.uk | grep -iE 'x-served-by|x-cache|fastly|via'
via: 1.1 router, 1.1 varnish / fastly-backend-name: origin / x-served-by: cache-lcy-egml8630025-LCY / x-cache: HIT
# MDN — three Varnish tiers, two POPs (Paris + London) in one response:
x-served-by: cache-par-lfpb1150054-PAR, …, cache-lcy-egml8630050-LCY
```
**The self-contradiction is inside one file:** `cdn_custom_caching_rules` at `:86-88` reads `x-cache` and reports *"CDN caching active"* on the very same response this check uses to recommend adopting a CDN. The check is also trivially spoofed in the passing direction — writing "edge network" in hero copy PASSes a single VPS. On HN, one user-submitted headline flips the verdict:
```
$ node -e '<the :22 regex on three inputs>'
WARN <- HN front page today
PASS <- same page + one story title "Post-mortem: the us-east-1 outage"
```
**Smallest fix:** emit `SKIPPED` with a reason for the whole prose-regex group ("not observable from a single external vantage point"), per the §37 rule that a probe which cannot answer returns SKIPPED and never a verdict. If `multi_region_signals` is worth keeping, rebuild it on headers/DNS (CDN vendor + POP identifiers, multi-A/anycast topology) — never on `html`.

⚠️ **No false-negative risk:** these ten checks were never measuring the property they name, so removing their verdicts removes noise, not signal.

---

### 8. `content_security_policy_nonce` — dead variable, whole-header substring test, no hash support
**`src/server/pulse-checks/security-extended.ts:238-240`**
Reproduced on **developer.mozilla.org** — the canonical reference documentation for CSP, told its hash-pinned strict CSP uses unrestricted inline scripts.

```ts
const hasCspNonce = csp.includes("nonce-") || /nonce=["'][^"']+["']/i.test(pageResult.html);
const hasUnsafeInline = csp.includes("unsafe-inline");
status: hasCspNonce ? "PASS" : hasUnsafeInline ? "WARN" : "WARN",     // two identical branches
detail: hasCspNonce ? "…" : csp ? "CSP present but uses unsafe-inline …" : "…",
```
Three defects: **(a)** `hasUnsafeInline` is computed and never consulted by `detail`, so the sentence is emitted for a CSP containing no `unsafe-inline` at all; **(b)** the test is over the whole header, so it cannot tell `script-src` from `style-src`; **(c)** CSP Level 3 hashes are not recognised as strict CSP.
```
$ curl -sS -o /dev/null -D - https://developer.mozilla.org/en-US/ | grep -i '^content-security-policy:' | tr ';' '\n' | grep -E 'script-src|style-src'
script-src      'report-sample' 'self' 'wasm-unsafe-eval' … 'sha256-XNBp89FG…' 'sha256-YCNoU9DN…' 'sha256-PZjP7OR6…'
script-src-elem 'report-sample' 'self' … (same three hashes)
style-src       'report-sample' 'self' 'unsafe-inline' transcend-cdn.com     <-- the ONLY unsafe-inline
$ node -e '…detailFor("default-src \'self\'; script-src \'self\'","")…'
{ status: "WARN", detail: "CSP present but uses unsafe-inline…", hasUnsafeInline: false }   <-- claims it while the flag is false
```
**Smallest fix:** parse per-directive; treat `nonce-` **or** `sha256-/sha384-/sha512-` in `script-src`/`script-src-elem` as satisfying strict CSP; gate the "uses unsafe-inline" sentence on `unsafe-inline` actually being in the script directive.

⚠️ **False-negative risk — mind the CSP L3 rule:** `unsafe-inline` is only neutralised by a nonce/hash **in the same directive**. Do not PASS a `script-src` that has `unsafe-inline` and no nonce/hash just because `style-src` carries one. (Verified genuine on **linear.app** — `script-src 'unsafe-inline' 'self' blob:` with zero `nonce-`/`sha256-` in the whole policy. That finding is correct and must survive the fix.)

---

### 9. `csp_report_directive` — cannot see the two headers that constitute a working CSP report pipeline
**`src/server/pulse-checks/security-extended.ts:60-62`**
Reproduced on **vercel.com**.

```ts
const csp = h["content-security-policy"] ?? "";
const hasReportUri = csp.includes("report-uri") || csp.includes("report-to");
```
Reporting is conventionally attached to a **report-only** policy, and since Chrome 96 `report-to` requires a companion **`reporting-endpoints`** response header to resolve the group name at all. Both are invisible here — a tree-wide grep finds line 61 as the only reference to any of the three headers.
```
$ for i in $(seq 1 25); do out=$(curl -sI https://vercel.com); echo "$out" | grep -qi '^reporting-endpoints:' && { echo "$out" | grep -iE '^(reporting-endpoints|report-to|content-security-policy-report-only):'; break; }; done
report-to: {"group":"vercel-page-integrity-csp","endpoints":[{"url":"https://vercel.com/vc-ap-…/csp-report?t=…"}]}
reporting-endpoints: vercel-page-integrity-csp="https://vercel.com/vc-ap-…/csp-report?t=…"
content-security-policy-report-only: script-src 'none'; … report-uri /vc-ap-…/csp-report?t=…; report-to vercel-page-integrity-csp
$ curl -sI https://vercel.com/vc-ap-…/.well-known/vercel/csp-report -o /dev/null -w '%{http_code}\n'  ->  405   (POST-only collector, live)
```
**Smallest fix:** union the enforced CSP with `content-security-policy-report-only`, and accept `reporting-endpoints` as evidence of a configured endpoint.
*Note:* Vercel samples these headers (present on ~2 of 14 requests), so a single-shot scan may still miss them — hedge to MEDIUM confidence rather than asserting absence at HIGH (item 17).

---

### 10. `x_frame_options` — a header-presence test labelled as a posture claim, ignoring CSP `frame-ancestors`
**`src/server/pulse-scan.ts:1056-1064`**
Reproduced on **linear.app**, proved by driving a real browser.

```ts
status: xfo ? "PASS" : "WARN",   detail: xfo ? … : "No X-Frame-Options header.",   label: "Clickjacking protection"
```
CSP Level 2 `frame-ancestors` obsoletes XFO and is honoured by every modern browser. Framing from a foreign origin is refused:
```
$ node frametest.mjs https://linear.app     # attacker page at http://127.0.0.1:56093, puppeteer-core + real Chrome
browser CSP/XFO refusal: ["Framing 'https://linear.app/' violates … \"frame-ancestors 'self' https://cms.linear.app\". The request has been blocked."]
VERDICT: FRAMING BLOCKED
$ node frametest.mjs https://example.com    # discriminating control
browser CSP/XFO refusal: (none)  ->  VERDICT: framing was NOT blocked
```
**The same scan contradicts itself:** `csp_frame_ancestors` (`security-extended.ts:193-196`) PASSes on the identical response with *"clickjacking protection via CSP (supersedes X-Frame-Options)"*. Both run on the same response inside `runUrlChecks`.

**Smallest fix:** rename the label to `X-Frame-Options header` (it is a header check), and PASS when the CSP carries `frame-ancestors` — the supersession logic already exists in `security-extended.ts:193-196`.

---

### 11. `permissions_policy` — "unrestricted" is the opposite of the browser default, and legacy `Feature-Policy` is invisible
**`src/server/pulse-scan.ts:1517-1521`**
Reproduced on **linear.app** (PROVEN) and **vercel.com** (LIKELY).

The absent-header detail hardcodes *"browser features (camera, microphone, geolocation) are unrestricted."* The Permissions Policy default allowlist for all three is **`self`**, so with no header they are restricted to the document's own origin. Asked directly:
```
$ node pptest.mjs      # https://linear.app in real Chrome, document.featurePolicy
camera      self=true  foreign-origin=false  allowlist=["https://linear.app"]
microphone  self=true  foreign-origin=false  allowlist=["https://linear.app"]
geolocation self=true  foreign-origin=false  allowlist=["https://linear.app"]
```
On vercel.com the one feature the sentence names by example is explicitly denied by the predecessor header, which Pulse never reads anywhere (`grep -rn 'feature-policy' src/` → no matches):
```
$ curl -sI https://vercel.com | grep -iE '^(permissions-policy|feature-policy):'
feature-policy: fullscreen 'self'; camera 'none'          (no permissions-policy line)
```
**Smallest fix:** reword to what was observed — *"No Permissions-Policy header — the spec defaults apply (`self` for camera/microphone/geolocation); set an explicit policy to restrict features in embedded third-party frames"* — and add a `feature-policy` fallback read so the detail can say "legacy Feature-Policy present: … — migrate, it is deprecated."

---

### 12. `session_cookie_httponly` — every cookie treated as a session cookie, tested against the joined header
**`src/server/pulse-checks/security-extended.ts:188-190`**
Reproduced on **vercel.com**.

```ts
const setCookie = h["set-cookie"] ?? "";
const hasHttpOnly = /httponly/i.test(setCookie);
```
No name filter and no per-cookie parsing. vercel.com sets no session cookie at all — three consent/analytics cookies that **must** be JS-readable to do their job — and is told its session cookies are exposed to XSS theft:
```
$ curl -s -D - -o /dev/null https://vercel.com | grep -i '^set-cookie'
_v-consent={"essential":true,"analytics":false,…}; SameSite=Lax; Secure; Domain=.vercel.com
_v-anonymous-id=va3CHBAksnv4…; SameSite=Lax; Secure
_v-anonymous-id-renewed=1; SameSite=Lax; Secure
$ curl -s -D - -o /dev/null -L https://vercel.com/login | grep -i '^set-cookie'   ->  the same three, no auth cookie
```
⚠️ **The same line hides an existing FALSE NEGATIVE, which is the more damaging direction:** because the test runs over the joined header value, **one** HttpOnly cookie among ten makes the whole set PASS. A site with a genuinely exposed session cookie alongside one hardened cookie is reported clean.

**Smallest fix:** split `set-cookie` per cookie; evaluate each independently; only WARN on cookies whose name matches a session pattern (`sess|sid|auth|token|jwt|connect.sid|_csrf`), and SKIP with a reason when no candidate session cookie is present — the `secure_cookie_attributes` wording at `pulse-scan.ts:1887` is the model.

---

### 13. `rate_limiting_headers` — an API convention graded on an HTML document
**`src/server/pulse-checks/security-extended.ts:65`**
Reproduced on **gitwork.co.uk**, **news.ycombinator.com**, **linear.app**; noted on **www.gov.uk** and **developer.mozilla.org**.

The header is genuinely absent everywhere, but it is asked of a cached `text/html` response and then advised "to API responses", which the check never probed. `Retry-After` is a 429/503 header and `X-RateLimit-*` is an API convention, so this **cannot pass on any non-API surface** — pure noise on every static site. Two of the targets demonstrably do throttle:
```
$ curl -sSI https://linear.app | grep -iE 'content-type|x-nextjs-cache'  ->  text/html; charset=utf-8 | HIT
$ curl -sS https://news.ycombinator.com/robots.txt   ->  User-Agent: * / Crawl-delay: 30
$ curl -sS https://gitwork.co.uk/assets/index-*.js | grep -oE 'path:"[^"]*"' | sort -u   ->  12 marketing routes, no API
```
**Smallest fix:** `SKIPPED` on a non-API response class; let `api_rate_limit_headers` (`api-behaviour.ts:281-296`, already appropriately careful — *"A header alone is not proof of a limit"*) own this against a real API probe. This is duplicate-check drift, not missing capability — the correct implementation already exists and the defective homepage copy is the one that reaches the free report.

---

### 14. `no_x_powered_by` — headline asserts the opposite of its own evidence line
**`src/server/pulse-scan.ts:2788-2797`** (label duplicated at `src/server/checks-registry.ts:557`)
Reproduced on **vercel.com**.

The label is the fixed string `"X-Powered-By header absent"` — phrased as the PASS state — while `status` flips to FAIL and `detail` flips to the opposite meaning. The public triage view renders `label` as the finding headline, so a prospect reads:

> **X-Powered-By header absent** — X-Powered-By is set to "Next.js, Payload"

```
$ curl -sI https://vercel.com | grep -i '^x-powered-by'   ->  x-powered-by: Next.js, Payload   (stable across front-ends)
```
The underlying finding is sound; the presentation makes it unusable. **Smallest fix:** rename the label to the neutral subject (`X-Powered-By header`). Worth a grep for other PASS-phrased labels — any check whose label states the desired state reads as inverted whenever it fails.

---

### 15. Wording that overreaches the probe — `security_txt`, `spf_record`
**`src/server/pulse-scan.ts:1917-1924`** and **`:2625-2633`**
`security_txt` reproduced on **news.ycombinator.com** (PROVEN) and **developer.mozilla.org** (LIKELY); `spf_record` on **developer.mozilla.org** and **www.gov.uk**.

In both cases the *probe is correct and the sentence is not.* Credit where due: the `security.txt` probe content-verifies against `text/plain` or `contact:|expires:` (`:1909`), so a catch-all HTML 404 shell is not mistaken for a disclosure file — the defect is purely the detail string, which converts "this host does not serve the RFC 9116 file" into *"security researchers have no official path to report vulnerabilities."*
```
$ for p in /.well-known/security.txt /security.txt /security.html; do curl -sS -o /dev/null -w "$p %{http_code}\n" https://news.ycombinator.com$p; done
/.well-known/security.txt 404 / /security.txt 404 / /security.html 200
$ curl -sS https://news.ycombinator.com/security.html | sed 's/<[^>]*>/ /g' | head -3
Hacker News Security — If you find a security hole, please let us know at security@ycombinator.com …
$ tail -c 1200 /tmp/hn.html | grep -o 'href="security.html">Security<'   ->  linked from the footer Pulse parsed
$ curl -sSL https://www.mozilla.org/.well-known/security.txt   ->  Email: security@mozilla.org / Bounty program: …
```
For SPF the absence is real, but on `www.gov.uk` the record lives where every SPF record for a `www.` site lives, and it is stronger than what the finding asks for — and on MDN no TXT record **can** be published at the scanned name (RFC 1034 §3.6.2 forbids any other RR type at a CNAME owner):
```
$ dig +short TXT gov.uk | grep spf   ->  "v=spf1 -all"        # strictest possible: this domain sends no mail
$ curl -sS -H 'Accept: application/dns-json' '…?name=developer.mozilla.org&type=TXT'
"Answer":[{"type":5,"data":"mozilla.map.fastly.net."}]         # CNAME — no TXT possible here
$ dig +short MX developer.mozilla.org  ->  mozilla.map.fastly.net.   # no MX: this host receives no mail
```
**Smallest fix (wording only, no logic change):** name the missing artefact and its benefit, not an absence of process — *"No security.txt at this host — add the machine-readable RFC 9116 file so scanners and bug-bounty tooling can auto-discover your existing disclosure contact."* For SPF: state the observation, and when the scanned name is a CNAME or has no MX, reword to the non-sending-host case (`v=spf1 -all` at a name that can hold it) instead of asserting "anyone can spoof your domain."

---

### 16. Jurisdiction inference matches a language-switcher label — and it switches real compliance checks OFF
**`src/server/pulse-checks/jurisdictions.ts:201`**
Reproduced on **developer.mozilla.org**.

`htmlLower.includes("brasil")` matched a locale-picker option inside MDN's own JSON payload, so the only market inferred for a US-headquartered, `lang="en-US"` site was **Brazil** — and the report then dismissed **CCPA and EU VAT** as *"Not applicable to your selected markets (BR)"*.
```
$ grep -o -i '.\{60\}brasil.\{40\}' mdn.html
…&quot;native&quot;:&quot;Português (do Brasil)&quot;},{&quot;locale&quot;:&quot;ru…
```
⚠️ **This is a FALSE NEGATIVE, the more damaging direction, and it is invisible on the report** — the checks do not appear as wrong, they appear as inapplicable. Silently dropping GDPR/CCPA on a global site is the miss that costs a sale.

**Smallest fix:** exclude matches inside `<script>`/JSON payloads and `hreflang`/locale-switcher markup, and require corroboration (`lang=`, a `.br` domain, currency, address) before *narrowing* the market set. A language switcher enumerating ten locales is evidence of breadth — it should never reduce the market set to one. Same class as §34.3's "comments were matched as code": a string found in the wrong context.

---

### 17. `HIGH` confidence granted to absence-derived verdicts
**`src/server/pulse-checks/confidence.ts:27-45`**
Cross-cutting; observed on **vercel.com** and **gitwork.co.uk**, and it is what removed the hedge from items 3, 4, 6, 7, 9, 12, 13.

`HIGH_CONFIDENCE_KEYS` (verified at `:32`, `:36`, `:38-39`) contains `load_balancer_detected`, `multi_region_signals`, `cdn_detected`, `cors_policy`, `csp_report_directive`, `session_cookie_httponly`, `rate_limiting_headers`, `backup_domain_configured`, `dmarc_record` — every one of which concludes from the absence of a specific string it knows how to look for. Several emitted `status: WARN, confidence: HIGH, evidence: undefined`. HIGH's contract is *"directly observed — if we say it, we saw it."*

**Smallest fix:** reserve HIGH for a header/record that was **read**; a verdict derived from an absence is MEDIUM, or SKIPPED where the response class cannot answer. `score-breakdown.ts` already excludes LOW-confidence adverse checks, so downgrading keeps a partially-detected absence out of the score and out of the actionable list until detection is complete. This is the §35 rule ("we couldn't look" → "it isn't there") reappearing on the URL side of the scanner.

---

### 18. Entailed CSP findings counted four times
**`src/server/pulse-scan.ts` (`csp_header`) + `security-extended.ts:61, 194, 239`**
Reproduced on **gitwork.co.uk** (4 of 21 actionable items were one fact) and **www.gov.uk**.

`csp_report_directive`, `csp_frame_ancestors` and `content_security_policy_nonce` are all logically entailed by `csp_header` being absent — you cannot have a `report-uri`, a `frame-ancestors` or a nonce in a policy that does not exist, and the last one's own text admits it (*"No CSP detected — implement a nonce-based CSP"*). Inflates the fix list by 3 and reads to a prospect as four problems where a practitioner sees one.

**Smallest fix:** when no CSP header is present, emit the three dependents as `SKIPPED` referencing the parent. Same risk exists for `cdn_detected`/`load_balancer_detected`/`multi_region_signals`, which on gitwork.co.uk were one fact: "it's on Netlify."

---

### 19. `privacy_policy` / `terms_of_service` excluded from SPA reclassification on a false premise
**`src/server/pulse-lite/spa-detect.ts:34` and the docblock at `:122-124`**
Reproduced on **gitwork.co.uk**.

The comments read *"HTTP-fetched checks (robots/sitemap/SSL/privacy/terms) are deliberately excluded … which are fetched rather than parsed and whose failures are real on a shell."* **privacy/terms are not fetched — they are parsed** (`pulse-scan.ts:1231`, a regex over static HTML). `ssl_valid` and `robots` really are fetched, so the sentence is true of two of the four keys it names and false of the other two, which is how this survived. Proof the reclassifier ran and stepped over it: in the same scan `canonical_url`, `h1_present` and `image_alt_coverage` are all INCONCLUSIVE with the SPA prefix while `privacy_policy` is FAIL.
```
$ curl -sS https://gitwork.co.uk | wc -c   ->  2687      # body is only <div id="root"></div>
$ node render.mjs                          # headless Chrome, then Pulse's OWN regex from :1237
/privacy :: Privacy Policy
Pulse privacy regex on RENDERED html: true      Pulse terms regex on RENDERED html: false
$ node render2.mjs   ->  /privacy H1: "Privacy Policy … Gitwork Group Ltd (company number 15756347) … Last updated: 21 July 2026"
```
**Smallest fix:** add `privacy_policy` and `terms_of_service` to `HTML_RENDER_DEPENDENT_CHECK_KEYS` and correct both comments.

⚠️ **FALSE-NEGATIVE RISK — and it is a launch-gate legal check.** This converts a genuinely policy-less SPA from FAIL to INCONCLUSIVE, defeating the `privacy_policy` hard cap and the release-gate blocking key. Do this **together with item 1's content-verify**: on a detected SPA shell, fetch `/privacy` and `/terms` directly and verify content, so the verdict becomes evidence-based rather than either falsely-failed or silently-excused.

⚠️ Note `terms_of_service` on gitwork.co.uk was **correct by luck, not by method** — the site genuinely has no terms page (no `/terms` route in its bundle, no "terms of service" string in 616KB). Do not close item 19 on the grounds that its verdict happened to be right there.

---

### Hygiene (cheap, and one of them is actively suppressing this work)

**H1 — Delete the stale all-clear in `src/server/pulse-lite/public-scan.ts:149-152.**
It records as settled fact: *"verified: Stripe's top 12 are privacy policy, terms, http_redirect, permissions_policy, secure_cookie_attributes, cors_policy, COEP/CORP and rate-limit headers — every one real and defensible."* Of the items named, `secure_cookie_attributes` was later found wrong and fixed (its own comment at `pulse-scan.ts:1880-1882` says *"stripe.com/gb sets zero cookies and was warned anyway"*), and this audit proves three more defective (`permissions_policy`, `cors_policy`, `rate_limiting_headers`). **Four of eight items certified "real and defensible" were not.** The comment sits in the file that gates the free report and is cited as prior verification, so it suppresses exactly this re-examination.

**H2 — `cross_origin_opener_policy` detail is grammatically inverted** (`security-extended.ts:49`): *"No COOP header — prevents cross-origin window attacks (Spectre)."* As written, the absence prevents the attack.

**H3 — Rebuild `legal-link-detection.test.ts:24` fixtures from real observed footers** (see item 1). A test whose fixtures come from the implementation's own allow-list cannot catch a missing variant.

---

## Findings verified CORRECT — do not "fix" these

Each looked like a false positive and survived independent checking. The inverse error was the specific thing being guarded against:

- **`spf_record` on news.ycombinator.com** — NOERROR/EMPTY at the scanned name on Pulse's own resolver, and RFC 7208 §3.1 makes SPF non-inheriting, so `ycombinator.com`'s record does not cover it. **This is the counter-example that must constrain item 3.**
- **`cdn_detected` on news.ycombinator.com** — genuinely no CDN. Tempting to call wrong because `www.ycombinator.com` *is* on Cloudflare; `news.` is not (single A record 209.216.230.207, American Internet Services colo, no CNAME).
- **`content_security_policy_nonce` on linear.app and news.ycombinator.com** — both *do* send a CSP, both contain `unsafe-inline` with no nonce and no hash. Genuinely actionable.
- **`cookie_consent_granular` on gitwork.co.uk** — the privacy policy prose claims "a consent banner (provided by consentmanager)" and **no CMP is loaded**; GTM, doubleclick and google.co.uk all fire ungated. Pulse is right and the site's own policy is wrong.
- **COOP / CORP / COEP** — genuinely absent on gov.uk, MDN, vercel.com, linear.app, gitwork.co.uk. Real, useful gaps.
- **`caa_dns_record`, `dnssec_enabled`** — verified absent on every site reporting them, with discriminating controls (google.com returns `0 issue "pki.goog"`; cloudflare.com returns a DS record and the `ad` flag).
- **`security_txt` on gitwork.co.uk** — the site is a catch-all 200 (both RFC paths return the SPA shell with the homepage's etag) and the content-verify at `pulse-scan.ts:1909` was **not** fooled. Credit to the probe.
- **`has_heading_hierarchy` on news.ycombinator.com** — literally zero `<h1>`–`<h6>` in 34,489 bytes.
- MDN's 139-item and vercel.com's 80-item "could not establish" lists are the §34/§37 discipline working correctly: catch-all-200 hosts decline to answer and name the reason rather than reporting "no contact page".

---

## Needs more evidence (deliberately NOT in the fix list)

1. **Is `news.ycombinator.com` actually single-region?** Not establishable from one vantage point (single A record in one US colo is *consistent with* single-region). Does not block item 7 — that fix stands on the method being a prose regex, proven on MDN and gov.uk.
2. **Does current Chrome still enforce legacy `Feature-Policy`?** Affects only how item 11's wording should credit vercel.com's `camera 'none'`, not whether the "unrestricted" claim is wrong (that is PROVEN on linear.app via `document.featurePolicy`).
3. **Do linear.app's / vercel.com's authenticated APIs emit `X-RateLimit-*`?** Untestable without a token (unauthenticated POST → 401 with no rate-limit headers). Item 13 is about the misattributed measurement, which is proven, not about the API's real behaviour.
4. **`mx_record` on `www.gov.uk`** — suspected to misfire from the same missing registrable-domain primitive (gov.uk publishes no apex MX precisely because `v=spf1 -all` declares it sends no mail), but not independently verified. Check it when building item 3's helper, along with `dkim_record_present`, `spf_hardfail`, `mta_sts_policy`, `tls_rpt_record`.
5. **Whether ~600 gated advisory checks and the 390-item Standards Verification category are accurate** — not sampled by any of the six audits. Nothing here speaks to them.

---

## Two patterns worth naming, because they generate the next batch

**Pattern A — "we could not look" rendered as "it isn't there", one layer out from §35.** Items 1, 3, 5, 6, 9 are all a *lookup narrower than the standard it cites*: DMARC queried without the RFC 7489 org-domain step; `www.` concatenated onto a subdomain; CDN detected by a five-vendor list that omits the RFC 9211 header; CSP reporting read only from the enforced policy; legal links matched by a token list rather than by fetching the page. Each produces a confident negative from a partial probe, and item 17 then stamps it HIGH confidence. **The generalisable rule: a verdict derived from an absence must name the exact question that was asked, and must not be HIGH.**

**Pattern B — absence is the secure state, or the wrong response class was graded.** Items 4, 12, 13 flag correct configuration of an HTML document as a defect, and item 10 grades one header while a sibling check on the same response already knows the modern equivalent supersedes it. In two cases (`cors_policy`, `rate_limiting_headers`) the **correct implementation already exists** in `api-behaviour.ts`, measured against a real API probe — the defective homepage duplicates are the ones reaching the free report. This is duplicate-check drift, and the fix shape is already in the codebase eight lines from `cors_policy`: `secure_cookie_attributes` (`pulse-scan.ts:1887`) returns SKIPPED with *"Not assessed — this response set no cookies…"*. Generalising that one pattern removes four of the twenty items above.

No repo files were edited by any of the six audits.# Findings from my own independent verification (NOT in the audit)

## A. item 2 is worse than reported — it also MISSES real modern OpenAI keys
`security-extended.ts:164` — `sk-[a-zA-Z0-9]{32,}` has NO hyphen in its character
class, so it cannot match `sk-proj-...`, which is the current OpenAI key format.
Verified: current regex returns FALSE on
`sk-proj-AbCd1234EfGh5678IjKl9012MnOp3456QrSt`, while returning TRUE on
gov.uk's `govuk-icon-mask-<sha256>.svg`.

So the check fires on icon content-hashes and stays silent on the real thing it
exists to catch. The fix must widen the alphabet to include `-` AND anchor the
left boundary AND reject an all-lowercase-hex tail. Proven working form:

    /AIza[0-9A-Za-z\-_]{35}|(?<![A-Za-z0-9])sk-(?![a-f0-9]+(?![A-Za-z0-9]))[A-Za-z0-9_-]{32,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}/

Controls (all verified): matches sk-proj / AKIA / ghp_ / AIza; does NOT match
mask- task- disk- desk- risk- kiosk- flask- followed by 32 hex chars.

---

# Known residuals after four passes — deliberately not fixed

Recorded so nobody rediscovers them, and so a future pass does not "fix" one of the
deliberate decisions. Every item below was **executed** against the shipped code by an
independent reviewer, not inferred. None of them tells a customer that a security or
legal control is fine when it is not — that was the bar for shipping, and the items that
failed it were fixed.

## Verified and accepted

| Residual | Direction | Why it is accepted |
|---|---|---|
| `x-cache: "nohit"` / `"whitehit"` read as cached (a `/hit$/` rule reachable across a hyphen) | false negative on an infra hygiene check | No CDN vocabulary emits either token, and the only precise exclusion also breaks CloudFront's real `RefreshHit` / `OriginShieldHit`. Test-pinned as accepted. |
| Run-together `consenttoken` (no separator, no case boundary) still reads as a session cookie | false **positive** — noise, not a cleared gate | Both candidate fixes are worse: a substring veto suppresses real credentials, and an approved-prefix allow-list creates false negatives on unknown vendor prefixes (`shopify_token`, `acmeToken` were executed and confirm this). |
| The qualifier veto is greedy: `session_expiry`, `session_timeout`, `csrf_token_expiry` read as metadata | false positive suppressed slightly too eagerly | Every constructed instance is genuinely metadata. If revisited, the shape is precedence (a strong token wins) rather than trimming the deny-list — trimming reopens the `consent_token` class. |
| Unquoted `href=/privacy-policy` is not matched | false positive, and it **fails safe** | Pre-existing, not a regression: the matcher has always required a quote (proved — the inert-markup strip returns that input byte-identical). With the document really served, the outcome is the WARN "published but nothing links to it", never a cleared gate. |
| `<![CDATA[ <a href="/privacy"> ]]>` outside a script still matches | over-reporting | An HTML parser treats `<![CDATA[` as a bogus comment, so a browser would not render the link. Exotic XHTML-in-HTML shape. |
| No DNS resolver retry: a transient SERVFAIL makes ~11–16 DNS-derived checks INCONCLUSIVE for that scan | honest but noisy | Verified it cannot flip a release gate. A retry-once, or `dns.google` as a tiebreak, belongs in its own change with its own tests. |
| A SERVFAIL that is the **customer's** fault (broken DNSSEC chain, lame delegation) reads as "Pulse could not establish this" | honest and incomplete | Nothing claims the customer is fine. The fix is a dedicated `dns_zone_resolves` check, not re-collapsing the rcode distinction. |
| `permissions-policy: camera= *` / `camera *` do not get the "syntax is also invalid" sentence | prose only | Both still WARN, so the verdict class is right; only the explanation understates the live exposure. |
| `session_cookie_httponly`'s `evidence` lists every session-shaped cookie examined, including compliant ones | presentation | The `detail` is precise and names only the exposed cookie. |
| Intermediate-ancestor DMARC record can PASS where a strict RFC 7489 receiver would not | contrived, pre-existing | A deliberate deviation documented in `registrable-domain.ts`: Pulse walks the whole ancestor ladder because for a shared namespace like `.gov.uk` either single choice is wrong for some hosts. **Read that header before "fixing" the cap.** |
| Dual-role servers (`nginx`, `Caddy`, `LiteSpeed`, `openresty`) now get INCONCLUSIVE rather than "no load balancer" | a real, arguably-correct finding lost | Honest under the governing rule, and surfaced in the report's "could not establish" list. Rebuilding it as a measurement needs multi-A / anycast topology, not a `Server` string. |
| `planWwwPair` now grades `www.<deploy-namespace>` (e.g. `www.pages.dev`) rather than declining | narrow | Consequence of correctly un-declining the platform vendors' own websites. Cloudflare permits a short project label; Firebase forbids it by a 6-char minimum; GitHub reserves `www`. |

## The standing gap, and it is the same one every time

**None of this was validated against a live scan.** Every fixture is a captured header
set, a measured DNS record or a constructed hostname. `CLAUDE.md` §34.3's lesson is that
validating a family against a real codebase is what finds the wrong checks — that is how
the `Logger.swift` sampling bug, the Dart single-quote bug and this audit's own three
hand-reproduced findings were caught, and none of it comes from unit tests.

So the post-deploy list is:

1. Re-scan the six audited sites and diff the findings against
   `docs/pulse-false-positive-audit-2026-08.md`. Every item marked defective should be
   gone; every item marked **verified CORRECT** should still fire.
2. Scan a real `*.vercel.app` deployment and confirm `backup_domain_configured` declines
   with the platform named.
3. Scan a real Caddy site, a real LiteSpeed shared host and a real nginx reverse-proxy
   tier, and confirm the dual-role INCONCLUSIVE tier reads sensibly on all three.
4. Scan a client-rendered SPA behind catch-all 200 routing and confirm the release gate
   now says INCONCLUSIVE rather than READY.
