/**
 * The Platform console's change rules — pure, so the server (src/server/platform) and
 * the demo (src/lib/demo/demo-platform.ts) apply exactly the same ones.
 */

import { WORKSPACE_MODULE_IDS } from "@/lib/workspace-modules";
import type { PlatformWorkspaceUpdate } from "@/lib/platform-types";

/**
 * Gitwork's own workspace. Mirrors DEFAULT_WORKSPACE_SLUG in src/server/proposals.ts,
 * which this file can't import (it is server-only); a test keeps the two equal.
 */
export const HOME_WORKSPACE_SLUG = "gitwork";

export class PlatformInputError extends Error {
  status = 400;
}

interface CurrentSettings {
  slug: string;
  modulesRestricted: boolean;
  enabledModules: string[];
  platformAiKeysAllowed: boolean;
}

/**
 * Pure: what `input` would change on `current`, or a PlatformInputError saying why it
 * is refused. Separate from the write so the rules are testable without a database.
 */
export function planWorkspaceUpdate(current: CurrentSettings, input: PlatformWorkspaceUpdate) {
  const unknown = (input.enabledModules ?? []).filter((id) => !WORKSPACE_MODULE_IDS.includes(id));
  if (unknown.length) throw new PlatformInputError(`Unknown module: ${unknown.join(", ")}`);

  const next = {
    modulesRestricted: input.modulesRestricted ?? current.modulesRestricted,
    // De-duplicated and kept in catalogue order, so two saves of the same choice
    // store the same value and the audit log shows no phantom change.
    enabledModules: input.enabledModules
      ? WORKSPACE_MODULE_IDS.filter((id) => input.enabledModules!.includes(id))
      : current.enabledModules,
    platformAiKeysAllowed: input.platformAiKeysAllowed ?? current.platformAiKeysAllowed,
  };
  const before = {
    modulesRestricted: current.modulesRestricted,
    enabledModules: current.enabledModules,
    platformAiKeysAllowed: current.platformAiKeysAllowed,
  };
  const changed = JSON.stringify(before) !== JSON.stringify(next);

  // Gitwork's own workspace is where every Gitwork user works, this console included.
  // Restricting its modules or its AI keys by a slip would take features away from the
  // whole team, so it needs saying twice.
  if (changed && current.slug === HOME_WORKSPACE_SLUG && !input.confirmHome) {
    throw new PlatformInputError("This is Gitwork's own workspace. Confirm to change it.");
  }
  return { changed, before, next };
}

