"use client";

import { useCallback, useEffect, useState } from "react";
import { GITWORK } from "@/lib/gitwork";

const STORAGE_KEY = "gitwork.local-settings.v1";
const UPDATE_EVENT = "gitwork:settings-updated";

export type ConfidentialityMode = "INTERNAL" | "EXTERNAL";

/**
 * @deprecated Identity now lives on the `User` row. Read via `useAccount()` from
 * `@/hooks/use-account`. Kept as a fallback shape for legacy consumers during the
 * localStorage → DB migration; will be removed once all callsites have moved over.
 */
export interface AccountSettings {
  name: string;
  email: string;
  avatarUrl: string;
}

/**
 * @deprecated Workspace defaults now live on `Workspace.proposalDefaults` + `Workspace.branding`.
 * Read via `useWorkspaceDefaults()` / `useWorkspaceBranding()`.
 */
export interface WorkspaceSettings {
  preparedBy: string;
  team: string;
  contactDetails: string;
  internalConfidentialityText: string;
  externalConfidentialityText: string;
}

/** @deprecated Mirrored in `Workspace.branding`. */
export interface TemplateBrandingSettings {
  coverBrandLogoUrl: string;
  coverTopAccentUrl: string;
  coverBottomAccentUrl: string;
}

export interface ObjectiveSnippet {
  title: string;
  description: string;
}

export interface LocalSettingsState {
  account: AccountSettings;
  workspace: WorkspaceSettings;
  templateBranding: TemplateBrandingSettings;
  proposalDefaults: {
    objectiveSnippets: ObjectiveSnippet[];
  };
}

export const defaultLocalSettings: LocalSettingsState = {
  account: {
    name: "",
    email: "",
    avatarUrl: "",
  },
  workspace: {
    preparedBy: "Gitwork Delivery Team",
    team: "Product & Delivery",
    contactDetails: GITWORK.email,
    internalConfidentialityText: "Confidential: For internal stakeholder review only.",
    externalConfidentialityText: "Confidential: Shared for client review only. Not for onward distribution.",
  },
  templateBranding: {
    coverBrandLogoUrl: "",
    coverTopAccentUrl: "",
    coverBottomAccentUrl: "",
  },
  proposalDefaults: {
    objectiveSnippets: [
      {
        title: "Reduce proposal cycle time",
        description: "Decrease proposal drafting and review timeline by at least 40%.",
      },
      {
        title: "Increase consistency",
        description: "Standardize structure and language across all proposal outputs.",
      },
    ],
  },
};

export function readLocalSettings(): LocalSettingsState {
  if (typeof window === "undefined") {
    return defaultLocalSettings;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultLocalSettings;
    }

    const parsed = JSON.parse(raw) as Partial<LocalSettingsState> & {
      account?: Partial<AccountSettings> & { password?: string };
      workspace?: Partial<WorkspaceSettings> & { invitedUsers?: unknown };
    };

    // Strip legacy fields we no longer accept: account.password and workspace.invitedUsers.
    // These were pre-auth artifacts; identity is now sourced from NextAuth + DB.
    return {
      account: {
        name: typeof parsed.account?.name === "string" ? parsed.account.name : defaultLocalSettings.account.name,
        email: typeof parsed.account?.email === "string" ? parsed.account.email : defaultLocalSettings.account.email,
        avatarUrl: typeof parsed.account?.avatarUrl === "string" ? parsed.account.avatarUrl : defaultLocalSettings.account.avatarUrl,
      },
      workspace: {
        preparedBy: typeof parsed.workspace?.preparedBy === "string" ? parsed.workspace.preparedBy : defaultLocalSettings.workspace.preparedBy,
        team: typeof parsed.workspace?.team === "string" ? parsed.workspace.team : defaultLocalSettings.workspace.team,
        contactDetails: typeof parsed.workspace?.contactDetails === "string" ? parsed.workspace.contactDetails : defaultLocalSettings.workspace.contactDetails,
        internalConfidentialityText: typeof parsed.workspace?.internalConfidentialityText === "string" ? parsed.workspace.internalConfidentialityText : defaultLocalSettings.workspace.internalConfidentialityText,
        externalConfidentialityText: typeof parsed.workspace?.externalConfidentialityText === "string" ? parsed.workspace.externalConfidentialityText : defaultLocalSettings.workspace.externalConfidentialityText,
      },
      templateBranding: {
        ...defaultLocalSettings.templateBranding,
        ...(parsed.templateBranding ?? {}),
      },
      proposalDefaults: {
        ...defaultLocalSettings.proposalDefaults,
        ...(parsed.proposalDefaults ?? {}),
        objectiveSnippets: Array.isArray(parsed.proposalDefaults?.objectiveSnippets)
          ? parsed.proposalDefaults.objectiveSnippets
          : defaultLocalSettings.proposalDefaults.objectiveSnippets,
      },
    };
  } catch {
    return defaultLocalSettings;
  }
}

function persistLocalSettings(settings: LocalSettingsState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

export function useLocalSettings() {
  const [settings, setSettings] = useState<LocalSettingsState>(readLocalSettings);

  useEffect(() => {
    function refresh() {
      setSettings(readLocalSettings());
    }

    window.addEventListener("storage", refresh);
    window.addEventListener(UPDATE_EVENT, refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(UPDATE_EVENT, refresh);
    };
  }, []);

  const updateSettings = useCallback(
    (updater: LocalSettingsState | ((current: LocalSettingsState) => LocalSettingsState)) => {
      setSettings((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        persistLocalSettings(next);
        return next;
      });
    },
    [],
  );

  return { settings, updateSettings };
}
