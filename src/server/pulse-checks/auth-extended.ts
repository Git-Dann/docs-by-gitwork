import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";
import { claimNotApplicable, claimSeen, claimUnseen, findClaim, proseRuns } from "./page-claims";

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

  // Session timeout
  const hasSessionTimeout = /session.*expir|timeout.*setting|session.*length|auto.*log.*out|idle.*timeout/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "session_timeout_configured", label: "Session timeout configured", status: hasSessionTimeout ? "PASS" : "WARN", detail: hasSessionTimeout ? "Session timeout signals detected." : "No session timeout signals found — configure automatic session expiry to reduce exposure from unattended sessions." });

  // Account lockout
  const lockoutBase = { category: AUTH, checkKey: "account_lockout_policy", label: "Account lockout policy" };
  const lockoutQuote = findClaim(runs, /\baccounts?\s+(?:is\s+|are\s+|will\s+be\s+|gets?\s+)?(?:temporarily\s+)?locked\b|\block(?:s|ed|ing)?\s+(?:out\s+)?(?:the\s+|your\s+)?accounts?\b|\baccount\s+lock(?:out|ing)\b|\blockout\s+polic(?:y|ies)\b|\btoo\s+many\s+(?:failed\s+|unsuccessful\s+|incorrect\s+|invalid\s+)?(?:login\s+|sign[- ]?in\s+|password\s+)?attempts\b/i);
  checks.push(lockoutQuote
    ? claimSeen(lockoutBase, "The page states that repeated failed sign-ins lock the account.", lockoutQuote)
    : claimUnseen(lockoutBase, "The scanned page does not mention locking an account after failed sign-ins. Lockout is enforced by the sign-in server and only shows when it triggers, so this page cannot show whether it is in place. Confirm that repeated failures are slowed or locked."));

  // Password strength — not applicable to a confident OTP/passwordless-only project.
  const hasPasswordStrength = /password.*must|password.*require|at least.*character|must contain.*uppercase|strong.*password/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "password_strength_enforced", label: "Password strength requirements", status: isOtpOnly ? "SKIPPED" : (hasPasswordStrength ? "PASS" : "WARN"), detail: isOtpOnly ? "Not applicable — this project authenticates via OTP/passwordless login, not traditional passwords." : (hasPasswordStrength ? "Password strength requirements detected." : "No password strength requirements visible — enforce minimum length (≥12 chars) and complexity; consider NIST SP 800-63B guidance.") });

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
  const hasJwtLocalStorage = /localStorage\.(set|get)Item.*token|localStorage.*jwt|jwt.*localStorage/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "jwt_not_in_localstorage", label: "JWT not stored in localStorage", status: hasJwtLocalStorage ? "WARN" : "PASS", detail: hasJwtLocalStorage ? "JWT stored in localStorage detected — localStorage is accessible to any JavaScript on the page; use HttpOnly cookies for session tokens." : "No localStorage JWT storage detected — tokens appear to be stored securely." });

  // Refresh token rotation
  const hasRefreshRotation = /refresh.*token.*rotat|token.*refresh.*rotat|rotate.*refresh/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "refresh_token_rotation", label: "Refresh token rotation", status: hasRefreshRotation ? "PASS" : "WARN", detail: hasRefreshRotation ? "Refresh token rotation signals detected." : "No refresh token rotation signals — rotating refresh tokens on each use prevents token replay attacks." });

  // PKCE
  const hasPkce = /pkce|code_challenge|code_verifier|proof.*key.*code.*exchange/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "pkce_oauth_flow", label: "PKCE for OAuth public clients", status: hasPkce ? "PASS" : "WARN", detail: hasPkce ? "PKCE OAuth flow signals detected." : "No PKCE signals detected — PKCE is required for all OAuth public clients (SPAs, mobile apps) per RFC 9700." });

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
  const hasExcessiveScopes = /scope.*admin|scope.*write.*all|full.*access/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "oauth_minimal_scopes", label: "Minimal OAuth scope requests", status: hasExcessiveScopes ? "WARN" : "PASS", detail: hasExcessiveScopes ? "Broad OAuth scopes detected — request only the minimum permissions needed (principle of least privilege)." : "No overly broad OAuth scopes detected." });

  // Service accounts
  const hasServiceAccounts = /service.*account|machine.*to.*machine|m2m|api.*secret|client.*credential|client_credentials/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "service_account_support", label: "Machine-to-machine / service account tokens", status: pctx.isSaas && pctx.hasBackend ? (hasServiceAccounts ? "PASS" : "WARN") : "PASS", detail: pctx.isSaas && pctx.hasBackend ? (hasServiceAccounts ? "Service account / M2M auth signals detected." : "SaaS API product detected but no service account support — enterprise integrations require M2M authentication (OAuth client credentials flow).") : "Not applicable." });

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

  const hasCurrentPasswordAutocomplete = /<input(?=[^>]*\btype=["']password["'])(?=[^>]*\bautocomplete=["']current-password["'])[^>]*>/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "auth_login_autocomplete", label: "Login password identifies its autocomplete purpose", status: isOtpOnly ? "SKIPPED" : hasCurrentPasswordAutocomplete ? "PASS" : "WARN", detail: isOtpOnly ? "Not applicable — passwordless authentication detected." : hasCurrentPasswordAutocomplete ? "A password field declares autocomplete=current-password, enabling password managers to fill the correct credential safely." : "No password field with autocomplete=current-password was observed. Identify login credentials explicitly so password managers do not guess from surrounding markup." });

  const hasNewPasswordAutocomplete = /<input(?=[^>]*\btype=["']password["'])(?=[^>]*\bautocomplete=["']new-password["'])[^>]*>/i.test(html);
  checks.push({ category: CATEGORIES.AUTHENTICATION, checkKey: "auth_signup_autocomplete", label: "New password identifies its autocomplete purpose", status: isOtpOnly ? "SKIPPED" : hasNewPasswordAutocomplete ? "PASS" : "WARN", detail: isOtpOnly ? "Not applicable — passwordless authentication detected." : hasNewPasswordAutocomplete ? "A password-creation field declares autocomplete=new-password, allowing password managers to generate and save a strong credential." : "No password-creation field with autocomplete=new-password was observed. Add it to signup and password-change forms." });

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
