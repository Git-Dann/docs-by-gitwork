import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";

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
    ];
    return authChecks.map(([checkKey, label]) => ({
      category: "Authentication", checkKey, label, status: "SKIPPED" as const,
      detail: "Not applicable — no authentication detected on this site.",
    }));
  }

  // Session timeout
  const hasSessionTimeout = /session.*expir|timeout.*setting|session.*length|auto.*log.*out|idle.*timeout/i.test(html);
  checks.push({ category: "Authentication", checkKey: "session_timeout_configured", label: "Session timeout configured", status: hasSessionTimeout ? "PASS" : "WARN", detail: hasSessionTimeout ? "Session timeout signals detected." : "No session timeout signals found — configure automatic session expiry to reduce exposure from unattended sessions." });

  // Account lockout
  const hasLockout = /account.*lock|too many.*attempt|temporarily.*disabled|lockout.*policy/i.test(html);
  checks.push({ category: "Authentication", checkKey: "account_lockout_policy", label: "Account lockout policy", status: hasLockout ? "PASS" : "WARN", detail: hasLockout ? "Account lockout signals detected." : "No account lockout signals — implement lockout after repeated failed login attempts to prevent credential stuffing." });

  // Password strength
  const hasPasswordStrength = /password.*must|password.*require|at least.*character|must contain.*uppercase|strong.*password/i.test(html);
  checks.push({ category: "Authentication", checkKey: "password_strength_enforced", label: "Password strength requirements", status: hasPasswordStrength ? "PASS" : "WARN", detail: hasPasswordStrength ? "Password strength requirements detected." : "No password strength requirements visible — enforce minimum length (≥12 chars) and complexity; consider NIST SP 800-63B guidance." });

  // Passkeys / WebAuthn
  const hasWebAuthn = /webauthn|passkey|passkeys|fido2|security key|biometric.*login|face id.*login|fingerprint.*login/i.test(html);
  checks.push({ category: "Authentication", checkKey: "passkey_webauthn_support", label: "Passkeys / WebAuthn support", status: hasWebAuthn ? "PASS" : "WARN", detail: hasWebAuthn ? "WebAuthn / Passkey support signals detected." : "No passkey or WebAuthn support — passkeys are phishing-resistant, faster than passwords, and now supported by all major platforms." });

  // Breach password detection
  const hasBreachDetection = /haveibeenpwned|pwned.*password|breached.*password|compromised.*password|known.*breach/i.test(html);
  checks.push({ category: "Authentication", checkKey: "breach_password_detection", label: "Breach password detection", status: hasBreachDetection ? "PASS" : "WARN", detail: hasBreachDetection ? "Breach password detection signals detected." : "No breach password detection — integrating with HaveIBeenPwned (k-anonymity API) to reject known-breached passwords is recommended by NIST." });

  // Account recovery
  const hasRecovery = /backup.*code|recovery.*code|security.*question|phone.*verify|backup.*email|recovery.*options/i.test(html);
  checks.push({ category: "Authentication", checkKey: "account_recovery_options", label: "Account recovery beyond email", status: hasRecovery ? "PASS" : "WARN", detail: hasRecovery ? "Multiple recovery options detected." : "Only email-based recovery signals found — support backup codes, recovery phrases, or trusted devices to prevent lockouts." });

  // JWT not in localStorage
  const hasJwtLocalStorage = /localStorage\.(set|get)Item.*token|localStorage.*jwt|jwt.*localStorage/i.test(html);
  checks.push({ category: "Authentication", checkKey: "jwt_not_in_localstorage", label: "JWT not stored in localStorage", status: hasJwtLocalStorage ? "WARN" : "PASS", detail: hasJwtLocalStorage ? "JWT stored in localStorage detected — localStorage is accessible to any JavaScript on the page; use HttpOnly cookies for session tokens." : "No localStorage JWT storage detected — tokens appear to be stored securely." });

  // Refresh token rotation
  const hasRefreshRotation = /refresh.*token.*rotat|token.*refresh.*rotat|rotate.*refresh/i.test(html);
  checks.push({ category: "Authentication", checkKey: "refresh_token_rotation", label: "Refresh token rotation", status: hasRefreshRotation ? "PASS" : "WARN", detail: hasRefreshRotation ? "Refresh token rotation signals detected." : "No refresh token rotation signals — rotating refresh tokens on each use prevents token replay attacks." });

  // PKCE
  const hasPkce = /pkce|code_challenge|code_verifier|proof.*key.*code.*exchange/i.test(html);
  checks.push({ category: "Authentication", checkKey: "pkce_oauth_flow", label: "PKCE for OAuth public clients", status: hasPkce ? "PASS" : "WARN", detail: hasPkce ? "PKCE OAuth flow signals detected." : "No PKCE signals detected — PKCE is required for all OAuth public clients (SPAs, mobile apps) per RFC 9700." });

  // API key creation UI
  const hasApiKeyUi = /api key|api token|access token|create.*token|generate.*key|developer.*key/i.test(html);
  checks.push({ category: "Authentication", checkKey: "api_key_creation_ui", label: "API key generation UI", status: pctx.isSaas ? (hasApiKeyUi ? "PASS" : "WARN") : "PASS", detail: pctx.isSaas ? (hasApiKeyUi ? "API key generation UI detected." : "SaaS app detected but no API key creation UI — developer access is critical for integration adoption and partner workflows.") : "Not applicable." });

  // OAuth minimal scopes — only the excessive-scope signal drives the verdict; the minimal-scope
  // signal was used in an earlier version but didn't add value beyond the excessive check.
  const hasExcessiveScopes = /scope.*admin|scope.*write.*all|full.*access/i.test(html);
  checks.push({ category: "Authentication", checkKey: "oauth_minimal_scopes", label: "Minimal OAuth scope requests", status: hasExcessiveScopes ? "WARN" : "PASS", detail: hasExcessiveScopes ? "Broad OAuth scopes detected — request only the minimum permissions needed (principle of least privilege)." : "No overly broad OAuth scopes detected." });

  // Service accounts
  const hasServiceAccounts = /service.*account|machine.*to.*machine|m2m|api.*secret|client.*credential|client_credentials/i.test(html);
  checks.push({ category: "Authentication", checkKey: "service_account_support", label: "Machine-to-machine / service account tokens", status: pctx.isSaas && pctx.hasBackend ? (hasServiceAccounts ? "PASS" : "WARN") : "PASS", detail: pctx.isSaas && pctx.hasBackend ? (hasServiceAccounts ? "Service account / M2M auth signals detected." : "SaaS API product detected but no service account support — enterprise integrations require M2M authentication (OAuth client credentials flow).") : "Not applicable." });

  // Device management
  const hasDeviceMgmt = /trusted.*device|device.*management|manage.*session|active.*session|logged.*in.*device/i.test(html);
  checks.push({ category: "Authentication", checkKey: "device_management", label: "Trusted device management", status: hasDeviceMgmt ? "PASS" : "WARN", detail: hasDeviceMgmt ? "Device / session management signals detected." : "No device management detected — allowing users to view and revoke active sessions builds security trust." });

  // Concurrent sessions
  const hasConcurrentPolicy = /single.*session|one.*session|active.*session.*limit|concurrent.*session/i.test(html);
  checks.push({ category: "Authentication", checkKey: "concurrent_session_policy", label: "Concurrent session limiting", status: hasConcurrentPolicy ? "PASS" : "WARN", detail: hasConcurrentPolicy ? "Concurrent session policy signals detected." : "No concurrent session policy visible — consider allowing users to control how many simultaneous sessions are allowed." });

  // Short-lived tokens
  const hasShortTokens = /expires.*in.*(?:60|120|300|600|900|1800|3600)\s*(?:s|seconds)|access.*token.*expir|token.*ttl.*(?:[1-9][0-9]?(?:\s*min|h))/i.test(html);
  checks.push({ category: "Authentication", checkKey: "token_expiry_short", label: "Short-lived access tokens (< 1hr)", status: hasShortTokens ? "PASS" : "WARN", detail: hasShortTokens ? "Short-lived token expiry signals detected." : "No short token expiry signals — access tokens should expire within 15–60 minutes; use refresh tokens for long-lived sessions." });

  return checks;
}
