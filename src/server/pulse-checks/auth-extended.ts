import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";
import { claimNotApplicable, claimSeen, claimUnseen, findClaim, proseRuns } from "./page-claims";
import { oauthLinkFindings, passwordRuleEvidence, tokenInLocalStorage } from "./auth-page-evidence";

/**
 * The password inputs on a page, with their autocomplete tokens (lower-cased, may be
 * empty). Reads each `<input>` tag on its own, so an attribute is never borrowed from a
 * neighbouring element. Attribute values may be quoted either way or unquoted.
 */
export function passwordFields(html: string): { autocomplete: string }[] {
  const out: { autocomplete: string }[] = [];
  for (const m of html.matchAll(/<input\b[^>]{0,2000}>/gi)) {
    const tag = m[0];
    const attr = (name: string) =>
      new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
    const type = attr("type");
    if ((type?.[1] ?? type?.[2] ?? type?.[3] ?? "").toLowerCase() !== "password") continue;
    const ac = attr("autocomplete");
    out.push({ autocomplete: (ac?.[1] ?? ac?.[2] ?? ac?.[3] ?? "").trim().toLowerCase() });
  }
  return out;
}

export async function runAuthExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { pageResult, ctx: pctx } = ctx;
  const html = pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (!pctx.isAuthEnabled) {
    const authChecks: Array<[string, string]> = [
      ["session_timeout_configured", "Session timeout configured"],
      ["account_lockout_policy", "Account lockout policy"],
      ["password_strength_enforced", "Password strength requirements"],
      ["passkey_webauthn_support", "Passkeys / WebAuthn support"],
      ["breach_password_detection", "Breach password detection"],
      ["account_recovery_options", "Account recovery beyond email"],
      ["jwt_not_in_localstorage", "JWT not stored in localStorage"],
      ["refresh_token_rotation", "Refresh token rotation"],
      ["pkce_oauth_flow", "PKCE for OAuth public clients"],
      ["api_key_creation_ui", "API key generation UI"],
      ["oauth_minimal_scopes", "Minimal OAuth scope requests"],
      ["service_account_support", "Machine-to-machine / service account tokens"],
      ["device_management", "Trusted device management"],
      ["concurrent_session_policy", "Concurrent session limiting"],
      ["token_expiry_short", "Short-lived access tokens (< 1hr)"],
      ["otp_expiry_configured", "OTP code expiry"],
      ["otp_resend_cooldown", "OTP resend cooldown"],
      ["otp_attempt_limiting", "OTP attempt / brute-force limiting"],
      ["auth_login_autocomplete", "Login password identifies its autocomplete purpose"],
      ["auth_signup_autocomplete", "New password identifies its autocomplete purpose"],
      ["auth_password_reset", "Password reset flow is discoverable"],
      ["auth_logout_control", "Sign-out control is discoverable"],
      ["auth_security_notifications", "Security-event notifications are disclosed"],
    ];
    return authChecks.map(([checkKey, label]) => ({
      category: CATEGORIES.AUTHENTICATION, checkKey, label, status: "SKIPPED" as const,
      detail: "Not applicable — no authentication detected on this site.",
    }));
  }

  // Only a confident "otp" (OTP/magic-link signals found, no password field) skips
  // the password-specific checks below. "unknown" (auth via a provider like Clerk/
  // Auth0 with the method not visible in static HTML) still gets scored — we can't
  // tell it apart from "password" from the homepage alone, so don't guess N/A.
  const isOtpOnly = pctx.authMethod === "otp";
  const isOtpRelevant = pctx.authMethod === "otp" || pctx.authMethod === "both";
  // Readable text, one block at a time (page-claims.ts). The account controls below live
  // inside the signed-in product, so the page saying so is a PASS and its silence is not
  // a finding: on linear.app `lockout.*policy` ran 77,926 characters from an SVG symbol id.
  const runs = proseRuns(ctx.contentHtml ?? html);
  const AUTH = CATEGORIES.AUTHENTICATION;
  // OAuth authorisation links in the page's own markup (auth-page-evidence.ts).
  const pageHtml = ctx.contentHtml ?? html;
  const oauth = oauthLinkFindings(pageHtml);

  // Session timeout
  const sessionBase = { category: AUTH, checkKey: "session_timeout_configured", label: "Session timeout configured" };
  const sessionTimeoutPhrase = findClaim(runs, /\bsessions?\b[^.!?]{0,30}\b(?:expire|expires|time out|times out|timeout)\b|\b(?:idle|inactivity|session)[- ]timeouts?\b|\b(?:automatically|auto)[- ]?(?:log(?:s|ged)?|sign(?:s|ed)?) (?:you |users )?out\b/i);
  checks.push(sessionTimeoutPhrase
    ? claimSeen(sessionBase, "The page says sessions time out.", sessionTimeoutPhrase)
    : claimUnseen(sessionBase, "The scanned page does not mention session timeouts. Session lifetime is a server setting, normally only described in security docs, so this does not show it is missing."));

  // Account lockout
  const lockoutBase = { category: AUTH, checkKey: "account_lockout_policy", label: "Account lockout policy" };
  const lockoutQuote = findClaim(runs, /\baccounts?\s+(?:is\s+|are\s+|will\s+be\s+|gets?\s+)?(?:temporarily\s+)?locked\b|\block(?:s|ed|ing)?\s+(?:out\s+)?(?:the\s+|your\s+)?accounts?\b|\baccount\s+lock(?:out|ing)\b|\blockout\s+polic(?:y|ies)\b|\btoo\s+many\s+(?:failed\s+|unsuccessful\s+|incorrect\s+|invalid\s+)?(?:login\s+|sign[- ]?in\s+|password\s+)?attempts\b/i);
  checks.push(lockoutQuote
    ? claimSeen(lockoutBase, "The page states that repeated failed sign-ins lock the account.", lockoutQuote)
    : claimUnseen(lockoutBase, "The scanned page does not mention locking an account after failed sign-ins. Lockout is enforced by the sign-in server and only shows when it triggers, so this page cannot show whether it is in place. Confirm that repeated failures are slowed or locked."));

  // Password strength — not applicable to a confident OTP/passwordless-only project.
  // Read from the password field's own minlength, or a stated "at least N characters" rule.
  // A `<strong>` tag next to a password field is not a strength rule (it was, on linear.app).
  const passwordRule = passwordRuleEvidence(pageHtml, runs.join("\n"));
  checks.push({
    category: CATEGORIES.AUTHENTICATION, checkKey: "password_strength_enforced", label: "Password strength requirements",
    ...(isOtpOnly
      ? { status: "SKIPPED" as const, detail: "Not applicable — this project authenticates via OTP/passwordless login, not traditional passwords." }
      : passwordRule === null
        ? { status: "INCONCLUSIVE" as const, detail: "The scanned page shows no password-length rule (no minlength on a password field and no \"at least N characters\" text). The rule is normally shown on the sign-up form and enforced by the server, neither of which this page shows, so this is not evidence either way." }
        : passwordRule.min >= 8
          ? { status: "PASS" as const, detail: `The page requires passwords of at least ${passwordRule.min} characters (${passwordRule.source}). NIST SP 800-63B asks for at least 8; Pulse did not test that the server enforces it.`, evidence: passwordRule.source }
          : { status: "WARN" as const, detail: `The page allows passwords of only ${passwordRule.min} characters (${passwordRule.source}). NIST SP 800-63B asks for a minimum of 8 characters.`, evidence: passwordRule.source }),
  });

  // Passkeys / WebAuthn
  const hasWebAuthn = /webauthn|passkey|passkeys|fido2|security key|biometric.*login|face id.*login|fingerprint.*login/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "passkey_webauthn_support", label: "Passkeys / WebAuthn support", status: hasWebAuthn ? "PASS" : "WARN", detail: hasWebAuthn ? "WebAuthn / Passkey support signals detected." : "No passkey or WebAuthn support — passkeys are phishing-resistant, faster than passwords, and now supported by all major platforms." });

  // Breach password detection — not applicable to a confident OTP/passwordless-only project.
  const hasBreachDetection = /haveibeenpwned|pwned.*password|breached.*password|compromised.*password|known.*breach/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "breach_password_detection", label: "Breach password detection", status: isOtpOnly ? "SKIPPED" : (hasBreachDetection ? "PASS" : "WARN"), detail: isOtpOnly ? "Not applicable — this project authenticates via OTP/passwordless login; there are no user passwords to check against breach corpora." : (hasBreachDetection ? "Breach password detection signals detected." : "No breach password detection — integrating with HaveIBeenPwned (k-anonymity API) to reject known-breached passwords is recommended by NIST.") });

  // Account recovery
  const recoveryBase = { category: AUTH, checkKey: "account_recovery_options", label: "Account recovery beyond email" };
  const recoveryQuote = findClaim(runs, /\b(?:backup|recovery)\s+(?:codes?|keys?|phrases?|emails?|phone(?:\s+numbers?)?)\b|\brecovery\s+(?:options?|methods?)\b|\bsecurity\s+questions?\b|\btrusted\s+contacts?\b/i);
  checks.push(recoveryQuote
    ? claimSeen(recoveryBase, "The page mentions a way to recover an account other than an email link.", recoveryQuote)
    : claimUnseen(recoveryBase, "The scanned page does not mention backup codes, a recovery phone or another way back into an account. Recovery options are set up inside account settings, which this scan cannot reach, so this does not show they are missing."));

  // JWT not in localStorage
  // Only the page's inline scripts are read; the bundles where storage code normally lives
  // are not downloaded, so not finding it can never be a PASS.
  const tokenWrite = tokenInLocalStorage(html);
  checks.push({
    category: CATEGORIES.AUTHENTICATION, checkKey: "jwt_not_in_localstorage", label: "JWT not stored in localStorage",
    ...(tokenWrite
      ? { status: "WARN" as const, detail: `An inline script on the page writes a token to localStorage (${tokenWrite}). Any script running on the page can read localStorage, so an XSS bug can steal it; an HttpOnly cookie cannot be read by scripts.`, evidence: tokenWrite }
      : { status: "INCONCLUSIVE" as const, detail: "No inline script on the scanned page stores a token in localStorage. Token storage normally lives in the app's JavaScript bundles, which Pulse does not download, so where tokens are kept could not be established." }),
  });

  // Refresh token rotation
  const refreshBase = { category: AUTH, checkKey: "refresh_token_rotation", label: "Refresh token rotation" };
  const refreshRotationPhrase = findClaim(runs, /\brefresh tokens?\b[^.!?]{0,60}\brotat\w*|\brotat\w*\b[^.!?]{0,40}\brefresh tokens?\b/i);
  checks.push(refreshRotationPhrase
    ? claimSeen(refreshBase, "The page says refresh tokens are rotated.", refreshRotationPhrase)
    : claimUnseen(refreshBase, "The scanned page does not mention refresh token rotation. Token handling happens on the server and is normally only described in API docs, so this does not show it is missing."));

  // PKCE
  // Judged from OAuth authorisation links in the page itself. A site with a /login link
  // may not use OAuth at all, and a flow started by a script or a server redirect shows no
  // link, so no link is INCONCLUSIVE rather than a missing-PKCE warning.
  checks.push({
    category: CATEGORIES.AUTHENTICATION, checkKey: "pkce_oauth_flow", label: "PKCE for OAuth public clients",
    ...(oauth.links.length === 0
      ? { status: "INCONCLUSIVE" as const, detail: "The scanned page contains no OAuth authorisation link. Sign-in flows are normally started by a script or a server redirect, where the code_challenge parameter is not visible to Pulse." }
      : oauth.withoutPkce.length > 0
        ? { status: "WARN" as const, detail: `An OAuth authorisation link on the page (${oauth.withoutPkce[0]}) requests an authorisation code without a code_challenge. RFC 9700 recommends PKCE for every client that uses the authorisation code flow.`, evidence: oauth.withoutPkce[0] }
        : { status: "PASS" as const, detail: `The OAuth authorisation link${oauth.links.length > 1 ? "s" : ""} on the page carr${oauth.links.length > 1 ? "y" : "ies"} a code_challenge (PKCE).`, evidence: oauth.links[0] }),
  });

  // API key creation UI
  // "Not applicable" used to be reported as a PASS, which counted toward the score of
  // every authenticated site that is not a SaaS product.
  const apiKeyBase = { category: AUTH, checkKey: "api_key_creation_ui", label: "API key generation UI" };
  const apiKeyQuote = pctx.isSaas
    ? findClaim(runs, /\b(?:create|generate|issue|manage|rotate|revoke|get)\w*\s+(?:(?:an?|your|new|own|personal)\s+){0,2}(?:api|access|developer)\s+(?:keys?|tokens?)\b|\b(?:api|access)\s+(?:keys?|tokens?)\s+(?:from|in|under)\s+(?:your\s+|the\s+)?(?:dashboard|settings|account|console|workspace)\b|\bpersonal\s+access\s+tokens?\b/i)
    : null;
  checks.push(!pctx.isSaas
    ? claimNotApplicable(apiKeyBase, "Not applicable: no SaaS product was detected, so there is no developer API to issue keys for.")
    : apiKeyQuote
      ? claimSeen(apiKeyBase, "The page tells users they can create their own API keys or tokens.", apiKeyQuote)
      : claimUnseen(apiKeyBase, "The scanned page does not mention creating API keys or tokens. Key management sits inside account settings, which this scan cannot reach, so this does not show it is missing."));

  // OAuth minimal scopes — only the excessive-scope signal drives the verdict; the minimal-scope
  // signal was used in an earlier version but didn't add value beyond the excessive check.
  // The scope parameter of the page's own OAuth authorisation links, not the words "full
  // access" in marketing copy (79,066 characters apart on linear.app).
  checks.push({
    category: CATEGORIES.AUTHENTICATION, checkKey: "oauth_minimal_scopes", label: "Minimal OAuth scope requests",
    ...(oauth.scopes.length === 0
      ? { status: "INCONCLUSIVE" as const, detail: "The scanned page contains no OAuth authorisation link with a scope parameter, so the permissions the app requests could not be read." }
      : oauth.broadScopes.length > 0
        ? { status: "WARN" as const, detail: `The page's OAuth link requests broad scope${oauth.broadScopes.length > 1 ? "s" : ""}: ${oauth.broadScopes.join(", ")}. Request the narrowest scope the feature needs; users are more willing to grant less.`, evidence: oauth.broadScopes.join(" ") }
        : { status: "PASS" as const, detail: `The page's OAuth link requests: ${oauth.scopes.slice(0, 8).join(", ")}. None of these is a broad admin or full-access scope.`, evidence: oauth.scopes.slice(0, 8).join(" ") }),
  });

  // Service accounts
  const serviceBase = { category: AUTH, checkKey: "service_account_support", label: "Machine-to-machine / service account tokens" };
  const serviceAccountPhrase = findClaim(runs, /\bservice accounts?\b|\bmachine[- ]to[- ]machine\b|\bM2M\b|\bclient[ _]credentials\b|\b(?:bot|robot|integration) (?:accounts?|users?|tokens?)\b/i);
  checks.push(!(pctx.isSaas && pctx.hasBackend)
    ? claimNotApplicable(serviceBase, "Not applicable: no hosted SaaS product with a backend was detected, so there is no API for machine credentials to reach.")
    : serviceAccountPhrase
      ? claimSeen(serviceBase, "The page says the product offers service accounts or machine-to-machine credentials.", serviceAccountPhrase)
      : claimUnseen(serviceBase, "The scanned page does not mention service accounts or machine-to-machine credentials. They are normally documented in the API docs or set up behind sign-in, so this does not show they are missing."));

  // Device management
  const deviceBase = { category: AUTH, checkKey: "device_management", label: "Trusted device management" };
  const deviceQuote = findClaim(runs, /\b(?:trusted|active|recogni[sz]ed|signed[- ]in|logged[- ]in)\s+(?:devices?|sessions?)\b|\b(?:manage|view|review|revoke|remove|sign\s+out\s+(?:of|from)|log\s+out\s+(?:of|from))\s+(?:your\s+|all\s+|other\s+|any\s+)?(?:devices?|sessions?)\b|\bdevice\s+management\b/i);
  checks.push(deviceQuote
    ? claimSeen(deviceBase, "The page mentions letting users see or revoke their signed-in devices or sessions.", deviceQuote)
    : claimUnseen(deviceBase, "The scanned page does not mention a list of signed-in devices or sessions. That list lives in account settings, which this scan cannot reach, so this does not show it is missing."));

  // Concurrent sessions
  const concurrentBase = { category: AUTH, checkKey: "concurrent_session_policy", label: "Concurrent session limiting" };
  const concurrentQuote = findClaim(runs, /\bconcurrent\s+(?:sessions?|logins?|sign[- ]?ins?|users?\s+limit)\b|\b(?:single|one)\s+(?:active\s+)?(?:session|login|sign[- ]?in)\s+(?:at\s+a\s+time|per\s+(?:user|account|seat))\b|\bsession\s+limits?\b|\b(?:simultaneous|parallel)\s+(?:sessions?|logins?)\b/i);
  checks.push(concurrentQuote
    ? claimSeen(concurrentBase, "The page states a limit on simultaneous sessions.", concurrentQuote)
    : claimUnseen(concurrentBase, "The scanned page does not mention limiting simultaneous sessions. Such a limit is enforced by the sign-in server and shows only when it triggers, so this page cannot show whether one exists."));

  // Short-lived tokens
  // Terms must sit together in one text run: an unbounded `.*` let a 315KB span of
  // minified state JSON ("tokens":{…} … "h") pass on flipkart.com.
  const hasShortTokens = /expires[\s_-]*in[^<>{}]{0,20}?\b(?:60|120|300|600|900|1800|3600)\s*(?:s|seconds)\b|access[\s_-]*tokens?[^<>{}"]{0,40}expir|token[\s_-]*ttl[^<>{}]{0,20}?\b[1-9][0-9]?\s*(?:min(?:ute)?s?|h(?:ours?|rs?)?)\b/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "token_expiry_short", label: "Short-lived access tokens (< 1hr)", status: hasShortTokens ? "PASS" : "WARN", detail: hasShortTokens ? "Short-lived token expiry signals detected." : "No short token expiry signals — access tokens should expire within 15–60 minutes; use refresh tokens for long-lived sessions." });

  // OTP-specific checks — only relevant when OTP/magic-link auth was actually detected.
  const hasOtpExpiry = /code.*expir|expir.*code|expires.*in.*(?:\d+\s*(?:minute|second|min|sec))|valid.*for.*(?:\d+\s*(?:minute|second))/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "otp_expiry_configured", label: "OTP code expiry", status: !isOtpRelevant ? "SKIPPED" : (hasOtpExpiry ? "PASS" : "WARN"), detail: !isOtpRelevant ? "Not applicable — no OTP/magic-link authentication detected." : (hasOtpExpiry ? "OTP/code expiry signals detected." : "No OTP expiry signals visible — codes should expire within 5–10 minutes to limit the window for interception or brute-forcing.") });

  const hasOtpResendCooldown = /resend.*code|resend.*in.*\d+|didn.?t.*receive.*code|wait.*(?:\d+\s*(?:second|minute)).*resend|resend.*(?:\d+\s*(?:second|minute))/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "otp_resend_cooldown", label: "OTP resend cooldown", status: !isOtpRelevant ? "SKIPPED" : (hasOtpResendCooldown ? "PASS" : "WARN"), detail: !isOtpRelevant ? "Not applicable — no OTP/magic-link authentication detected." : (hasOtpResendCooldown ? "OTP resend cooldown signals detected." : "No resend cooldown visible — without a cooldown between code requests, an attacker (or an impatient user) can trigger unlimited SMS/email sends, driving up cost and enabling spam.") });

  const hasOtpAttemptLimiting = /too many.*(?:attempt|code|tries)|invalid.*code.*(?:attempt|remaining)|locked.*out.*(?:attempt|code)|maximum.*attempt/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "otp_attempt_limiting", label: "OTP attempt / brute-force limiting", status: !isOtpRelevant ? "SKIPPED" : (hasOtpAttemptLimiting ? "PASS" : "WARN"), detail: !isOtpRelevant ? "Not applicable — no OTP/magic-link authentication detected." : (hasOtpAttemptLimiting ? "OTP attempt-limiting signals detected." : "No attempt-limiting signals visible — a short numeric OTP without a cap on guesses is brute-forceable; lock out or invalidate the code after a handful of failed attempts.") });

  // Autocomplete purpose is judged on the password fields the scanned page actually
  // has. The login and signup forms usually live on their own pages, which Pulse does
  // not fetch, so a page with no password field says nothing either way: the withheld
  // version WARNed linear.app's homepage, which has no password input at all.
  const fields = passwordFields(ctx.contentHtml ?? html);
  const newPasswordFields = fields.filter((f) => f.autocomplete.includes("new-password"));
  const currentPasswordFields = fields.filter((f) => f.autocomplete.includes("current-password"));
  // A form with two password fields is a signup or change-password form; a lone one is a login.
  const signupShaped = fields.length >= 2 || newPasswordFields.length > 0;
  const loginUnlabelled = !signupShaped && fields.length > 0 && currentPasswordFields.length === 0;
  checks.push({
    category: CATEGORIES.AUTHENTICATION, checkKey: "auth_login_autocomplete", label: "Login password identifies its autocomplete purpose",
    status: isOtpOnly ? "SKIPPED" : currentPasswordFields.length > 0 ? "PASS" : loginUnlabelled ? "WARN" : "INCONCLUSIVE",
    confidence: isOtpOnly ? undefined : currentPasswordFields.length > 0 || loginUnlabelled ? "HIGH" : "LOW",
    detail: isOtpOnly
      ? "Not applicable: passwordless authentication detected."
      : currentPasswordFields.length > 0
        ? "The password field on the scanned page declares autocomplete=\"current-password\", so password managers fill the saved credential for this site."
        : loginUnlabelled
          ? `The scanned page has a login password field with ${fields[0].autocomplete ? `autocomplete="${fields[0].autocomplete}"` : "no autocomplete attribute"}. Add autocomplete="current-password" (and autocomplete="username" on the email field) so password managers fill the right credential.`
          : "The scanned page has no login password field, so this could not be checked. The login form is usually on its own page, which Pulse does not fetch.",
  });

  const signupUnlabelled = signupShaped && newPasswordFields.length === 0;
  checks.push({
    category: CATEGORIES.AUTHENTICATION, checkKey: "auth_signup_autocomplete", label: "New password identifies its autocomplete purpose",
    status: isOtpOnly ? "SKIPPED" : newPasswordFields.length > 0 ? "PASS" : signupUnlabelled ? "WARN" : "INCONCLUSIVE",
    confidence: isOtpOnly ? undefined : newPasswordFields.length > 0 || signupUnlabelled ? "HIGH" : "LOW",
    detail: isOtpOnly
      ? "Not applicable: passwordless authentication detected."
      : newPasswordFields.length > 0
        ? "A password-creation field on the scanned page declares autocomplete=\"new-password\", so password managers can generate and save a strong password."
        : signupUnlabelled
          ? "The scanned page has a form with two password fields (a signup or change-password form), and neither declares autocomplete=\"new-password\". Add it so password managers offer to generate and save a strong password."
          : "The scanned page has no signup or change-password form, so this could not be checked. Those forms are usually on their own pages, which Pulse does not fetch.",
  });

  const hasPasswordReset = /forgot(?:ten)?[\s_-]*password|reset[\s_-]*password|password[\s_-]*recovery/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "auth_password_reset", label: "Password reset flow is discoverable", status: isOtpOnly ? "SKIPPED" : hasPasswordReset ? "PASS" : "WARN", detail: isOtpOnly ? "Not applicable — passwordless authentication detected." : hasPasswordReset ? "A password recovery/reset route or control is visible." : "No password reset control was observed. Users need a discoverable recovery route that does not require support intervention." });

  const hasLogout = /(?:sign|log)[\s_-]*out|end[\s_-]*session/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "auth_logout_control", label: "Sign-out control is discoverable", status: hasLogout ? "PASS" : "WARN", detail: hasLogout ? "A sign-out/end-session control is visible." : "No sign-out control was observed. Authenticated users need an obvious way to invalidate their current session." });

  // "security alert" alone is marketing copy as often as a disclosure (notion.so: "Respond to
  // security alerts faster"), so it needs account context, and every gap stays in one text run.
  const hasSecurityNotifications = /(?:security|login|sign[\s-]?in) (?:alert|notification)s?[^<>]{0,60}(?:account|sign[\s-]?in|log[\s-]?in|device|password)|(?:account|sign[\s-]?in|log[\s-]?in|device|password)[^<>]{0,60}security (?:alert|notification)|new (?:device|login|sign.in)[^<>]{0,60}(?:alert|email|notif)|\b(?:alert|email|notif)\w*\s+(?:you\s+|me\s+|users\s+)?(?:when(?:ever)?|of|about|on|if|for)\b[^<>]{0,40}\bnew (?:device|login|sign[\s-]?in)|password (?:change|reset)[^<>]{0,60}(?:alert|email|notif)/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "auth_security_notifications", label: "Security-event notifications are disclosed", status: hasSecurityNotifications ? "PASS" : "WARN", detail: hasSecurityNotifications ? "Security notification signals were found for account-sensitive events." : "No security-event notification signal was observed. Notify users about new-device sign-ins, password changes, and recovery events so account takeover is detectable." });

  return checks;
}
