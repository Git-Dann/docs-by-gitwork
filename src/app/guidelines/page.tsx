import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GuidelinesViewer } from "@/components/guidelines/guidelines-viewer";
import { workspaceAllowsPath } from "@/lib/workspace-modules";
import { getGuidelineOverrides } from "@/server/guidelines";
import { isAtLeast } from "@/types/auth";

// The Gitwork brand guidelines as a 16:9 deck. Opened from Settings → Labs. Signed-in only
// (the middleware gates it like /deck); edits to the copy are admin-only and live on the workspace.
export const dynamic = "force-dynamic";

export default async function GuidelinesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fguidelines");
  // Outside the middleware's /app branch, so the workspace module switch is checked here,
  // as /edge does: the guidelines belong to Labs (src/lib/workspace-modules.ts).
  if (!workspaceAllowsPath("/guidelines", session.user.workspaceModules)) redirect("/app");
  const overrides = session.user.workspaceId ? await getGuidelineOverrides(session.user.workspaceId) : {};
  return <GuidelinesViewer initialOverrides={overrides} canEdit={isAtLeast(session.user.role, "ADMIN")} />;
}
