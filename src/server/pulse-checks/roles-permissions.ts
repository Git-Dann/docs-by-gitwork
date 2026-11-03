import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, skip, platformIs } from "./_types";
import { claimSeen, claimUnseen, findClaim, proseRuns } from "./page-claims";

const CATEGORY = CATEGORIES.ROLES;

const ALL_CHECKS: Array<[string, string]> = [
  ["rbac_signals", "Role-based access control (RBAC) UI"],
  ["admin_role_separation", "Admin vs user role separation"],
  ["team_management_ui", "Team / org management UI"],
  ["invite_workflow", "User invitation workflow"],
  ["permission_matrix_docs", "Permissions matrix documentation"],
  ["data_scope_isolation", "Multi-tenant data isolation signals"],
  ["audit_trail_present", "Audit log / activity log"],
  ["api_scope_documentation", "API scopes documented"],
  ["least_privilege_api_tokens", "Scoped / least-privilege API tokens"],
  ["role_hierarchy", "Admin > Manager > User role hierarchy"],
  ["access_revocation_ui", "Account deactivation / access revocation UI"],
  ["ip_allowlisting", "IP restriction / allowlist available"],
  ["sso_scim_provisioning", "SCIM provisioning support"],
  ["mfa_admin_enforced", "MFA required for admin accounts"],
  ["guest_anonymous_mode", "Guest / view-only mode"],
  ["read_only_role", "Read-only role available"],
  ["data_export_permission", "Data export restricted by role"],
  ["permission_inheritance", "Permission inheritance (groups)"],
  ["invite_expiry", "Invitations expire automatically"],
  ["invite_revocation", "Pending invitations can be revoked"],
  ["ownership_transfer", "Workspace ownership can be transferred safely"],
  ["last_admin_protection", "Last administrator cannot be removed"],
  ["custom_roles", "Custom roles can be defined"],
];

export async function runRolesPermissionsChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { ctx: pctx } = ctx;
  const html = ctx.pageResult.html;

  if (platformIs(ctx.platform, "CLI_TOOL", "MARKETING_SITE")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable — roles and permissions are not relevant for this platform type.");
  }

  if (platformIs(ctx.platform, "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable — native app role management is handled server-side.");
  }

  if (!pctx.isSaas && !pctx.isAuthEnabled) {
    return ALL_CHECKS.map(([checkKey, label]) => ({
      category: CATEGORY, checkKey, label, status: "SKIPPED" as const,
      detail: "Not applicable — no SaaS or authenticated product signals detected.",
    }));
  }

  const checks: PulseScanCheckInput[] = [];
  // Readable text, one block at a time (page-claims.ts). The controls read from it live
  // inside the signed-in product: the page saying so is a PASS, its silence is not a finding.
  const runs = proseRuns(ctx.contentHtml ?? html);
  const behindSignIn = "That control lives inside the signed-in product, which this scan cannot reach, so this does not show it is missing.";

  // RBAC
  const rbacPhraseBase = { category: CATEGORY, checkKey: "rbac_signals", label: "Role-based access control (RBAC) UI" };
  const rbacPhrase = findClaim(runs, /\brole[- ]based access(?: control)?\b|\bRBAC\b|\b(?:assign|set|change|manage|define)\w*\s+(?:user\s+|member\s+|team\s+)?roles\b|\broles? and permissions\b|\bpermissions? (?:by|per) role\b/i);
  checks.push(rbacPhrase
    ? claimSeen(rbacPhraseBase, "The page says the product has role-based access control.", rbacPhrase)
    : claimUnseen(rbacPhraseBase, `The scanned page does not mention role-based access control. ${behindSignIn}`));

  // Admin role separation
  // `role.*admin` matched `<nav role="navigation"><a href="/admin">Admin`; a bare "Admin"
  // link says nothing about separating roles, so the run has to talk about the roles.
  const adminBase = { category: CATEGORY, checkKey: "admin_role_separation", label: "Admin vs user role separation" };
  const adminQuote = findClaim(runs, /\badmin(?:istrator)?s?\s+(?:roles?|permissions?|privileges?|rights|accounts?|controls?)\b|\bsuper[- ]?admins?\b|\badmin(?:istrator)?s?\s*(?:,\s*|\s+(?:and|or|vs\.?|versus)\s+)(?:members?|users?|editors?|viewers?|guests?)\b/i);
  checks.push(adminQuote
    ? claimSeen(adminBase, "The page describes separate administrator and member roles.", adminQuote)
    : claimUnseen(adminBase, `The scanned page does not describe separate administrator and member roles. ${behindSignIn}`));

  // Team management
  // "Meet our team members" on an About page is not team management, so a bare "team
  // member" does not count: the copy has to manage, add or invite people, or sell seats.
  const teamPhraseBase = { category: CATEGORY, checkKey: "team_management_ui", label: "Team / org management UI" };
  const teamPhrase = findClaim(runs, /\b(?:manage|add|invite|remove)\s+(?:your\s+|new\s+)?(?:team ?mates?|team members?|members|seats|users)\b|\bteam management\b|\bunlimited (?:team )?(?:members|seats|users)\b|\bper (?:seat|member)\b/i);
  checks.push(teamPhrase
    ? claimSeen(teamPhraseBase, "The page says team members can be managed.", teamPhrase)
    : claimUnseen(teamPhraseBase, `The scanned page does not mention a way to manage team members. ${behindSignIn}`));

  // Invite workflow
  const hasInvite = /\binvit\w*[^<>"=]{0,30}\b(?:users?|members?|teammates?|colleagues?|collaborators?|guests?|clients?|others|people|team)\b|\bsend\w*[^<>"=]{0,15}\binvit|\binvitation links?\b|\binvite\w*[^<>"=]{0,15}\bby email\b/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "invite_workflow", label: "User invitation workflow", status: hasInvite ? "PASS" : "WARN", detail: hasInvite ? "User invitation workflow detected." : "No invite workflow detected — team products need an invitation system for controlled user onboarding." });

  // Permission matrix docs
  const permMatrixBase = { category: CATEGORY, checkKey: "permission_matrix_docs", label: "Permissions matrix documentation" };
  const permMatrix = roleTableHeader(ctx.contentHtml ?? html)
    ?? findClaim(runs, /\bpermissions? (?:matrix|table)\b|\bwhat each role can (?:do|see|access)\b|\bcompare (?:user )?roles\b/i);
  checks.push(permMatrix
    ? claimSeen(permMatrixBase, "The page sets out what each role can do.", permMatrix)
    : claimUnseen(permMatrixBase, "The scanned page does not set out what each role can do. A permissions matrix normally sits on a docs or help page, which this scan does not read, so this does not show it is missing."));

  // Data scope isolation
  // "Your workspace" is marketing copy, not an isolation claim; the run has to say the
  // data is kept apart.
  const isolationBase = { category: CATEGORY, checkKey: "data_scope_isolation", label: "Multi-tenant data isolation signals" };
  const isolationQuote = findClaim(runs, /\b(?:tenant|data|customer|workspace)\s+(?:data\s+)?(?:isolation|segregation|separation)\b|\b(?:isolated|segregated|logically\s+separated|separated)\s+(?:per|by|from\s+(?:other|each))\s+(?:tenants?|customers?|workspaces?|organi[sz]ations?|accounts?)\b|\b(?:single|dedicated)[- ]tenan(?:t|cy)\b|\brow[- ]level\s+security\b/i);
  checks.push(isolationQuote
    ? claimSeen(isolationBase, "The page states how one customer's data is kept apart from another's.", isolationQuote)
    : claimUnseen(isolationBase, "The scanned page does not say how one customer's data is kept apart from another's. Isolation is enforced in the product's data layer, which a public page cannot show, so this does not show it is missing. Stating it, for example on a security page, helps enterprise buyers."));

  // Audit trail
  // 'log' is a substring of 'login' and 'logo'; the words have to sit together.
  const auditBase = { category: CATEGORY, checkKey: "audit_trail_present", label: "Audit log / activity log" };
  const auditQuote = findClaim(runs, /\baudit\s*(?:logs?|logging|trails?|history|events?)\b|\bactivity\s+(?:logs?|history|trails?)\b|\b(?:admin|security|event)\s+logs?\b/i);
  checks.push(auditQuote
    ? claimSeen(auditBase, "The page mentions an audit or activity log.", auditQuote)
    : claimUnseen(auditBase, `The scanned page does not mention an audit or activity log. ${behindSignIn}`));

  // API scope docs
  const hasApiScopeDocs = /api.*scope|oauth.*scope|scope.*permission|scoped.*token|token.*scope/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_scope_documentation", label: "API scopes documented", status: hasApiScopeDocs ? "PASS" : "WARN", detail: hasApiScopeDocs ? "API scope documentation signals detected." : "No API scope documentation detected — document available OAuth/API scopes so developers can request only the permissions they need." });

  // Least privilege tokens
  const leastPrivilegePhraseBase = { category: CATEGORY, checkKey: "least_privilege_api_tokens", label: "Scoped / least-privilege API tokens" };
  const leastPrivilegePhrase = findClaim(runs, /\b(?:scoped|fine[- ]grained|read[- ]only|restricted|limited[- ]scope)\s+(?:API\s+|access\s+|personal access\s+)?(?:tokens?|keys?)\b|\b(?:API )?(?:tokens?|keys?)\s+(?:with|limited to|restricted to)\s+(?:specific|limited|read[- ]only|selected)\s+(?:scopes?|permissions?|resources?)\b/i);
  checks.push(leastPrivilegePhrase
    ? claimSeen(leastPrivilegePhraseBase, "The page says API tokens can be limited to specific scopes.", leastPrivilegePhrase)
    : claimUnseen(leastPrivilegePhraseBase, "The scanned page does not mention API tokens limited to specific scopes. Token settings normally sit in the API docs or behind sign-in so this does not show it is missing."));

  // Role hierarchy
  const roleSet = namedRoleSet(runs.join(" "));
  checks.push({
    category: CATEGORY, checkKey: "role_hierarchy", label: "Admin > Manager > User role hierarchy",
    ...(roleSet
      ? { status: "PASS" as const, detail: `The scanned page names several user roles together (${roleSet.join(", ")}). This is what the site states; Pulse did not test how the roles are enforced.`, evidence: roleSet.join(", ") }
      : { status: "INCONCLUSIVE" as const, detail: `The scanned page does not name a set of user roles. ${behindSignIn}` }),
  });

  // Access revocation
  const revokeBase = { category: CATEGORY, checkKey: "access_revocation_ui", label: "Account deactivation / access revocation UI" };
  const revokeQuote = findClaim(runs, /\b(?:deactivat|suspend|disabl|offboard|deprovision|remov)\w*\s+(?:(?:a|an|the|any|former|inactive)\s+)?(?:users?|members?|teammates?|employees?|seats?)\b|\brevok\w*\s+(?:(?:their|user|member)\s+)?access\b|\boffboarding\b|\bdeprovisioning\b/i);
  checks.push(revokeQuote
    ? claimSeen(revokeBase, "The page mentions removing a user or revoking their access.", revokeQuote)
    : claimUnseen(revokeBase, `The scanned page does not mention removing users or revoking access. ${behindSignIn}`));

  // IP allowlisting
  // A standalone "IP" token near allowlist/restriction wording, either order. The leading verb is
  // allowlist/whitelist/restrict* only, so CSS `cursor-not-allowed` can never start a match.
  const hasIpRestrict = /\bip(?:v[46])?s?\b[^<>"=]{0,30}(?:allow[- ]?list|white[- ]?list|restriction|restrict)|\b(?:allow[- ]?list\w*|white[- ]?list\w*|restrict\w*)\b[^<>"=]{0,30}\bip(?:v[46])?(?:s\b|\b)/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "ip_allowlisting", label: "IP restriction / allowlist available", status: hasIpRestrict ? "PASS" : "WARN", detail: hasIpRestrict ? "IP allowlisting signals detected." : "No IP restriction feature detected — enterprise security teams often require IP allowlisting to restrict access to corporate networks." });

  // SCIM provisioning
  const hasScim = /\bscim\b|\busers? (?:provisioning|deprovisioning)\b|\bdeprovisioning\b|\bjust.in.time (?:user )?provisioning\b|\bjit (?:user )?provisioning\b|\bdirectory[- ]sync\w*/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "sso_scim_provisioning", label: "SCIM provisioning support", status: hasScim ? "PASS" : "WARN", detail: hasScim ? "SCIM provisioning signals detected." : "No SCIM provisioning detected — enterprise customers need SCIM to automate user provisioning and deprovisioning from their identity provider." });

  // MFA enforced for admins
  const hasMfaAdmin = /\b(?:mfa|2fa|two.factor|multi.factor)\b.{0,40}\badmin(?:s|istrators?)?\b|\badmin(?:s|istrators?)?\b.{0,40}\b(?:mfa|2fa|two.factor|multi.factor)\b|\b(?:enforc|requir|mandator)\w*.{0,20}\b(?:mfa|2fa|two.factor|multi.factor)\b/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "mfa_admin_enforced", label: "MFA required for admin accounts", status: hasMfaAdmin ? "PASS" : "WARN", detail: hasMfaAdmin ? "MFA enforcement for admin signals detected." : "No admin MFA enforcement signals — require MFA for admin accounts to protect against account takeover." });

  // Guest mode
  // Gaps are bounded and never cross markup (`<>"=`): crossorigin="anonymous"><meta name="view-…"
  // and a Tailwind `read-only:` class are not guest-mode copy.
  const hasGuestMode = /\bguests?\b[^<>"=]{0,30}\b(?:access|users?|roles?|seats?|accounts?)\b|\bview[- ]only\b|\bread[- ]only access\b|\banonymous(?:ly)?\b[^<>"=]{0,20}\bview(?:ing|ers?)?\b|\bpublic(?:ly)?\b[^<>"=]{0,15}\bshar(?:e|ing)\b/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "guest_anonymous_mode", label: "Guest / view-only mode", status: hasGuestMode ? "PASS" : "WARN", detail: hasGuestMode ? "Guest / view-only access signals detected." : "No guest mode detected — a view-only or guest role enables sharing with external stakeholders without giving them edit access." });

  // Read-only role
  const readOnlyPhraseBase = { category: CATEGORY, checkKey: "read_only_role", label: "Read-only role available" };
  const readOnlyPhrase = findClaim(runs, /\b(?:read[- ]only|view[- ]only|viewer)\s+(?:roles?|access|users?|seats?|members?|permissions?)\b|\bviewers?\b[^.!?]{0,30}\bcan only\s+(?:view|see|read|comment)\b/i);
  checks.push(readOnlyPhrase
    ? claimSeen(readOnlyPhraseBase, "The page says the product has a read-only role.", readOnlyPhrase)
    : claimUnseen(readOnlyPhraseBase, `The scanned page does not mention a read-only role. ${behindSignIn}`));

  // Data export by role
  // `role.*export` ran from `role="img"` to a JavaScript `export`; the run has to tie
  // exporting to a role or permission.
  const exportBase = { category: CATEGORY, checkKey: "data_export_permission", label: "Data export restricted by role" };
  const exportQuote = findClaim(runs, /\bexport\w*\b[^.!?]{0,50}\b(?:admins?|administrators?|owners?|roles?|permissions?)\b|\b(?:admins?|administrators?|owners?|roles?|permissions?)\b[^.!?]{0,50}\bexport\w*\b/i);
  checks.push(exportQuote
    ? claimSeen(exportBase, "The page ties exporting data to a role or permission.", exportQuote)
    : claimUnseen(exportBase, `The scanned page does not say who may export data. ${behindSignIn}`));

  // Workspace/tenant isolation

  // Permission inheritance
  // Read from visible copy only: `role="group"` is an ARIA attribute on every other page.
  const inheritancePhraseBase = { category: CATEGORY, checkKey: "permission_inheritance", label: "Permission inheritance (groups)" };
  const inheritancePhrase = findClaim(runs, /\binherit\w*\b[^.!?]{0,40}\b(?:permissions?|roles?|access)\b|\b(?:permissions?|roles?|access)\b[^.!?]{0,40}\binherit\w*|\b(?:assign|grant)\w*\s+(?:roles?|permissions?|access)\s+to\s+(?:whole |entire |user )?(?:groups|teams)\b|\b(?:user|permission|security) groups\b/i);
  checks.push(inheritancePhrase
    ? claimSeen(inheritancePhraseBase, "The page says permissions can be granted through groups.", inheritancePhrase)
    : claimUnseen(inheritancePhraseBase, `The scanned page does not mention permissions granted through groups. ${behindSignIn}`));

  // GDPR data access control

  const hasInviteExpiry = /invit(?:e|ation).{0,60}expir|expir.{0,60}invit(?:e|ation)|invite valid for/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "invite_expiry", label: "Invitations expire automatically", status: hasInviteExpiry ? "PASS" : "WARN", detail: hasInviteExpiry ? "Invitation-expiry evidence detected." : "No invitation expiry was observed. Time-bound invitation tokens reduce the window in which a forwarded or leaked link can be used." });

  const hasInviteRevocation = /(?:revoke|cancel|delete).{0,40}(?:pending )?invit|pending invit.{0,40}(?:revoke|cancel|delete)/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "invite_revocation", label: "Pending invitations can be revoked", status: hasInviteRevocation ? "PASS" : "WARN", detail: hasInviteRevocation ? "Pending-invitation revocation evidence detected." : "No way to revoke a pending invitation was observed. Administrators need to invalidate an invite sent to the wrong person or address." });

  const hasOwnershipTransfer = /transfer.{0,40}(?:workspace|organisation|organization|account).{0,20}owner|transfer ownership/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "ownership_transfer", label: "Workspace ownership can be transferred safely", status: hasOwnershipTransfer ? "PASS" : "WARN", detail: hasOwnershipTransfer ? "Ownership-transfer workflow evidence detected." : "No ownership-transfer workflow was observed. A workspace must not become stranded when its original owner leaves." });

  const hasLastAdminProtection = /(?:cannot|can.?t|must not|prevent).{0,50}(?:last|only).{0,20}(?:admin|owner)|(?:last|only).{0,20}(?:admin|owner).{0,50}(?:cannot|can.?t|remove|delete)/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "last_admin_protection", label: "Last administrator cannot be removed", status: hasLastAdminProtection ? "PASS" : "WARN", detail: hasLastAdminProtection ? "Last-admin/owner protection evidence detected." : "No protection against removing the final administrator was observed. Enforce this invariant server-side to prevent an unmanageable workspace." });

  const hasCustomRoles = /custom role|create.{0,20}role|role builder|define.{0,20}permissions/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "custom_roles", label: "Custom roles can be defined", status: hasCustomRoles ? "PASS" : "WARN", detail: hasCustomRoles ? "Custom-role configuration evidence detected." : "No custom-role support was observed. For larger teams, fixed roles often force unnecessary privileges; custom roles allow a closer least-privilege fit." });

  return checks;
}

/**
 * Three or more distinct role names within one short stretch of copy ("Owner, Admin,
 * Member and Guest roles"). A single "admin" or "member" anywhere is not a hierarchy.
 */
export function namedRoleSet(copy: string): string[] | null {
  const re = /\b(owners?|admins?|administrators?|managers?|members?|editors?|viewers?|guests?|contributors?|collaborators?)\b/gi;
  const hits = [...copy.matchAll(re)].map((m) => ({ at: m.index ?? 0, role: m[1].toLowerCase().replace(/s$/, "").replace(/^administrator$/, "admin") }));
  for (let i = 0; i < hits.length; i++) {
    const seen = new Set<string>();
    for (let j = i; j < hits.length && hits[j].at - hits[i].at <= 120; j++) seen.add(hits[j].role);
    if (seen.size >= 3) return [...seen].map((r) => r[0].toUpperCase() + r.slice(1));
  }
  return null;
}

const ROLE_HEADERS = new Set(["owner", "admin", "administrator", "manager", "member", "editor", "viewer", "guest", "contributor", "collaborator", "billing admin"]);

/**
 * A table on the page whose header row names two or more roles: a role-by-capability
 * matrix. Returned as the header text it was recognised from.
 */
export function roleTableHeader(html: string): string | null {
  for (const table of html.match(/<table\b[\s\S]{0,20000}?<\/table>/gi) ?? []) {
    const headerRow = /<tr\b[\s\S]*?<\/tr>/i.exec(table)?.[0] ?? "";
    const cells = [...headerRow.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase());
    const roles = new Set(cells.map((c) => c.replace(/s$/, "")).filter((c) => ROLE_HEADERS.has(c)));
    if (roles.size >= 2) return cells.filter(Boolean).join(" | ").slice(0, 90);
  }
  return null;
}
