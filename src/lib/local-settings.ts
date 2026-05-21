"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gitwork.local-settings.v1";
const UPDATE_EVENT = "gitwork:settings-updated";

export type ConfidentialityMode = "INTERNAL" | "EXTERNAL";

export interface AccountSettings {
  name: string;
  email: string;
  avatarUrl: string;
  password: string;
}

export interface WorkspaceSettings {
  preparedBy: string;
  team: string;
  contactDetails: string;
  internalConfidentialityText: string;
  externalConfidentialityText: string;
  invitedUsers: string[];
}

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
    name: "Gitwork",
    email: "hello@gitwork.co.uk",
    avatarUrl: "",
    password: "",
  },
  workspace: {
    preparedBy: "Gitwork Delivery Team",
    team: "Product & Delivery",
    contactDetails: "hello@gitwork.io",
    internalConfidentialityText: "Confidential: For internal stakeholder review only.",
    externalConfidentialityText: "Confidential: Shared for client review only. Not for onward distribution.",
    invitedUsers: [],
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

    const parsed = JSON.parse(raw) as Partial<LocalSettingsState>;
    return {
      account: {
        ...defaultLocalSettings.account,
        ...(parsed.account ?? {}),
      },
      workspace: {
        ...defaultLocalSettings.workspace,
        ...(parsed.workspace ?? {}),
        invitedUsers: Array.isArray(parsed.workspace?.invitedUsers)
          ? parsed.workspace.invitedUsers
          : defaultLocalSettings.workspace.invitedUsers,
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

export function resolveConfidentialityText(
  mode: ConfidentialityMode | undefined,
  settings: LocalSettingsState,
  fallback?: string,
) {
  if (mode === "EXTERNAL") {
    return settings.workspace.externalConfidentialityText || fallback || "";
  }

  return settings.workspace.internalConfidentialityText || fallback || "";
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
