import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, skip, platformIs } from "./_types";

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

  // RBAC
  const hasRbac = /role.based|rbac|user.*role|assign.*role|role.*assign|role.*permission|permission.*role/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "rbac_signals", label: "Role-based access control (RBAC) UI", status: hasRbac ? "PASS" : "WARN", detail: hasRbac ? "RBAC / role management signals detected." : "No RBAC signals detected — role-based access control is essential for multi-user products to enforce least privilege." });

  // Admin role separation
  const hasAdminSep = /admin.*role|admin.*user|admin.*panel|admin.*dashboard|super.*admin|role.*admin/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "admin_role_separation", label: "Admin vs user role separation", status: hasAdminSep ? "PASS" : "WARN", detail: hasAdminSep ? "Admin role separation signals detected." : "No admin role separation detected — separate admin and end-user roles to enforce privilege separation." });

  // Team management
  const hasTeamMgmt = /team.*management|manage.*team|team.*member|add.*member|invite.*team|workspace.*member/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "team_management_ui", label: "Team / org management UI", status: hasTeamMgmt ? "PASS" : "WARN", detail: hasTeamMgmt ? "Team management UI signals detected." : "No team management UI detected — multi-user SaaS products need an interface to add, remove, and manage team members." });

  // Invite workflow
  const hasInvite = /invite.*user|invite.*member|send.*invite|invitation.*link|invite.*email/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "invite_workflow", label: "User invitation workflow", status: hasInvite ? "PASS" : "WARN", detail: hasInvite ? "User invitation workflow detected." : "No invite workflow detected — team products need an invitation system for controlled user onboarding." });

  // Permission matrix docs
  const hasPermMatrix = /permission.*matrix|permission.*table|what.*can.*role|role.*comparison|access.*level/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "permission_matrix_docs", label: "Permissions matrix documentation", status: hasPermMatrix ? "PASS" : "WARN", detail: hasPermMatrix ? "Permissions matrix documentation signals detected." : "No permissions matrix found — document which roles can perform which actions to help enterprise buyers evaluate your access controls." });

  // Data scope isolation
  const hasIsolation = /tenant.*isol|workspace.*isol|data.*scope|multi.tenant|isolated.*data|your.*workspace|your.*organisation/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "data_scope_isolation", label: "Multi-tenant data isolation signals", status: hasIsolation ? "PASS" : "WARN", detail: hasIsolation ? "Multi-tenant isolation signals detected." : "No tenant isolation signals — enterprise buyers need assurance that their data is isolated from other customers." });

  // Audit trail
  const hasAuditLog = /audit.*log|activity.*log|audit.*trail|event.*log|history.*log|action.*log/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "audit_trail_present", label: "Audit log / activity log", status: hasAuditLog ? "PASS" : "WARN", detail: hasAuditLog ? "Audit / activity log signals detected." : "No audit log detected — enterprise and compliance customers require an audit trail of who did what and when." });

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
  const hasRevocation = /deactivate.*user|revoke.*access|suspend.*user|remove.*member|disable.*account/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "access_revocation_ui", label: "Account deactivation / access revocation UI", status: hasRevocation ? "PASS" : "WARN", detail: hasRevocation ? "Access revocation UI signals detected." : "No access revocation UI detected — the ability to quickly revoke access is critical for offboarding and security incident response." });

  // IP allowlisting
  const hasIpRestrict = /ip.*allowlist|ip.*whitelist|ip.*restriction|allowed.*ip|restrict.*ip/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "ip_allowlisting", label: "IP restriction / allowlist available", status: hasIpRestrict ? "PASS" : "WARN", detail: hasIpRestrict ? "IP allowlisting signals detected." : "No IP restriction feature detected — enterprise security teams often require IP allowlisting to restrict access to corporate networks." });

  // SCIM provisioning
  const hasScim = /scim|user.*provisioning|deprovisioning|just-in-time.*provisioning|jit.*provisioning|directory.*sync/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "sso_scim_provisioning", label: "SCIM provisioning support", status: hasScim ? "PASS" : "WARN", detail: hasScim ? "SCIM provisioning signals detected." : "No SCIM provisioning detected — enterprise customers need SCIM to automate user provisioning and deprovisioning from their identity provider." });

  // MFA enforced for admins
  const hasMfaAdmin = /mfa.*admin|admin.*mfa|mfa.*required.*admin|enforce.*mfa|mandatory.*mfa/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "mfa_admin_enforced", label: "MFA required for admin accounts", status: hasMfaAdmin ? "PASS" : "WARN", detail: hasMfaAdmin ? "MFA enforcement for admin signals detected." : "No admin MFA enforcement signals — require MFA for admin accounts to protect against account takeover." });

  // Guest mode
  const hasGuestMode = /guest.*access|view.only|read.only.*access|guest.*user|anonymous.*view|public.*share/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "guest_anonymous_mode", label: "Guest / view-only mode", status: hasGuestMode ? "PASS" : "WARN", detail: hasGuestMode ? "Guest / view-only access signals detected." : "No guest mode detected — a view-only or guest role enables sharing with external stakeholders without giving them edit access." });

  // Read-only role
  const hasReadOnly = /read.only|viewer.*role|read.*permission|view.*only.*access/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "read_only_role", label: "Read-only role available", status: hasReadOnly ? "PASS" : "WARN", detail: hasReadOnly ? "Read-only role signals detected." : "No read-only role detected — a read-only role is important for compliance (auditors, finance) who need to view but not modify data." });

  // Data export by role
  const hasExportPermission = /export.*permission|permission.*export|role.*export|who.*can.*export/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "data_export_permission", label: "Data export restricted by role", status: hasExportPermission ? "PASS" : "WARN", detail: hasExportPermission ? "Role-based export permission signals detected." : "No role-based export controls detected — restrict bulk data exports to admin/owner roles to prevent data exfiltration." });

  // Workspace/tenant isolation
  const hasWorkspaceIsolation = /workspace.*setting|organisation.*setting|tenant.*setting|your.*workspace|workspace.*id/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "workspace_tenant_isolation", label: "Workspace / tenant isolation", status: hasWorkspaceIsolation ? "PASS" : "WARN", detail: hasWorkspaceIsolation ? "Workspace / tenant isolation signals detected." : "No workspace isolation signals — multi-tenant SaaS requires clear workspace boundaries to prevent data cross-contamination." });

  // Permission inheritance
  const hasInheritance = /group.*permission|inherit.*permission|team.*permission|permission.*group|role.*group/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "permission_inheritance", label: "Permission inheritance (groups)", status: hasInheritance ? "PASS" : "WARN", detail: hasInheritance ? "Permission group / inheritance signals detected." : "No group-based permissions detected — group-based permission inheritance reduces admin overhead at scale." });

  // GDPR data access control
  const hasGdprAccess = /data.*access.*request|subject.*access|access.*personal.*data|export.*personal.*data/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "gdpr_data_access_control", label: "GDPR data access controlled by role", status: hasGdprAccess ? "PASS" : "WARN", detail: hasGdprAccess ? "GDPR data access request signals detected." : "No GDPR data access controls detected — GDPR requires that personal data access (subject access requests) is controlled and auditable." });

  return checks;
}
