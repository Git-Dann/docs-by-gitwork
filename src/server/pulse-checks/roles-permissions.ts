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
  ["workspace_tenant_isolation", "Workspace / tenant isolation"],
  ["permission_inheritance", "Permission inheritance (groups)"],
  ["gdpr_data_access_control", "GDPR data access controlled by role"],
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
  const hasRbac = /role.based|rbac|user.*role|assign.*role|role.*assign|role.*permission|permission.*role/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "rbac_signals", label: "Role-based access control (RBAC) UI", status: hasRbac ? "PASS" : "WARN", detail: hasRbac ? "RBAC / role management signals detected." : "No RBAC signals detected — role-based access control is essential for multi-user products to enforce least privilege." });

  // Admin role separation
  // `role.*admin` matched `<nav role="navigation"><a href="/admin">Admin`; a bare "Admin"
  // link says nothing about separating roles, so the run has to talk about the roles.
  const adminBase = { category: CATEGORY, checkKey: "admin_role_separation", label: "Admin vs user role separation" };
  const adminQuote = findClaim(runs, /\badmin(?:istrator)?s?\s+(?:roles?|permissions?|privileges?|rights|accounts?|controls?)\b|\bsuper[- ]?admins?\b|\badmin(?:istrator)?s?\s*(?:,\s*|\s+(?:and|or|vs\.?|versus)\s+)(?:members?|users?|editors?|viewers?|guests?)\b/i);
  checks.push(adminQuote
    ? claimSeen(adminBase, "The page describes separate administrator and member roles.", adminQuote)
    : claimUnseen(adminBase, `The scanned page does not describe separate administrator and member roles. ${behindSignIn}`));

  // Team management
  const hasTeamMgmt = /team.*management|manage.*team|team.*member|add.*member|invite.*team|workspace.*member/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "team_management_ui", label: "Team / org management UI", status: hasTeamMgmt ? "PASS" : "WARN", detail: hasTeamMgmt ? "Team management UI signals detected." : "No team management UI detected — multi-user SaaS products need an interface to add, remove, and manage team members." });

  // Invite workflow
  const hasInvite = /\binvit\w*[^<>"=]{0,30}\b(?:users?|members?|teammates?|colleagues?|collaborators?|guests?|clients?|others|people|team)\b|\bsend\w*[^<>"=]{0,15}\binvit|\binvitation links?\b|\binvite\w*[^<>"=]{0,15}\bby email\b/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "invite_workflow", label: "User invitation workflow", status: hasInvite ? "PASS" : "WARN", detail: hasInvite ? "User invitation workflow detected." : "No invite workflow detected — team products need an invitation system for controlled user onboarding." });

  // Permission matrix docs
  const hasPermMatrix = /permission.*matrix|permission.*table|what.*can.*role|role.*comparison|access.*level/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "permission_matrix_docs", label: "Permissions matrix documentation", status: hasPermMatrix ? "PASS" : "WARN", detail: hasPermMatrix ? "Permissions matrix documentation signals detected." : "No permissions matrix found — document which roles can perform which actions to help enterprise buyers evaluate your access controls." });

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
  const hasLeastPrivilege = /scoped.*token|limited.*access.*token|read.only.*token|restricted.*token|minimal.*permission/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "least_privilege_api_tokens", label: "Scoped / least-privilege API tokens", status: hasLeastPrivilege ? "PASS" : "WARN", detail: hasLeastPrivilege ? "Scoped / least-privilege token signals detected." : "No scoped token signals — allow creating API tokens restricted to specific actions (read-only, specific resources) to enforce least privilege." });

  // Role hierarchy
  const hasHierarchy = /admin.*manager.*user|owner.*admin.*member|super.*admin.*admin.*user|role.*level|permission.*level/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "role_hierarchy", label: "Admin > Manager > User role hierarchy", status: hasHierarchy ? "PASS" : "WARN", detail: hasHierarchy ? "Role hierarchy signals detected." : "No multi-level role hierarchy detected — a clear role hierarchy (Owner > Admin > Member > Guest) helps enterprises manage permissions at scale." });

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
  const hasReadOnly = /read.only|viewer.*role|read.*permission|view.*only.*access/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "read_only_role", label: "Read-only role available", status: hasReadOnly ? "PASS" : "WARN", detail: hasReadOnly ? "Read-only role signals detected." : "No read-only role detected — a read-only role is important for compliance (auditors, finance) who need to view but not modify data." });

  // Data export by role
  // `role.*export` ran from `role="img"` to a JavaScript `export`; the run has to tie
  // exporting to a role or permission.
  const exportBase = { category: CATEGORY, checkKey: "data_export_permission", label: "Data export restricted by role" };
  const exportQuote = findClaim(runs, /\bexport\w*\b[^.!?]{0,50}\b(?:admins?|administrators?|owners?|roles?|permissions?)\b|\b(?:admins?|administrators?|owners?|roles?|permissions?)\b[^.!?]{0,50}\bexport\w*\b/i);
  checks.push(exportQuote
    ? claimSeen(exportBase, "The page ties exporting data to a role or permission.", exportQuote)
    : claimUnseen(exportBase, `The scanned page does not say who may export data. ${behindSignIn}`));

  // Workspace/tenant isolation
  const hasWorkspaceIsolation = /workspace.*setting|organisation.*setting|tenant.*setting|your.*workspace|workspace.*id/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "workspace_tenant_isolation", label: "Workspace / tenant isolation", status: hasWorkspaceIsolation ? "PASS" : "WARN", detail: hasWorkspaceIsolation ? "Workspace / tenant isolation signals detected." : "No workspace isolation signals — multi-tenant SaaS requires clear workspace boundaries to prevent data cross-contamination." });

  // Permission inheritance
  const hasInheritance = /group.*permission|inherit.*permission|team.*permission|permission.*group|role.*group/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "permission_inheritance", label: "Permission inheritance (groups)", status: hasInheritance ? "PASS" : "WARN", detail: hasInheritance ? "Permission group / inheritance signals detected." : "No group-based permissions detected — group-based permission inheritance reduces admin overhead at scale." });

  // GDPR data access control
  const hasGdprAccess = /data.*access.*request|subject.*access|access.*personal.*data|export.*personal.*data/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "gdpr_data_access_control", label: "GDPR data access controlled by role", status: hasGdprAccess ? "PASS" : "WARN", detail: hasGdprAccess ? "GDPR data access request signals detected." : "No GDPR data access controls detected — GDPR requires that personal data access (subject access requests) is controlled and auditable." });

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
