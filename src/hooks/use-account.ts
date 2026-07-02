/**
 * Current-user profile hook — fetches and updates `/api/account`.
 *
 * Profile lives on the `User` row; email is read-only (sourced from OAuth). Use this hook
 * everywhere we previously read `settings.account.*` from localStorage.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  role: string;
  permissions: string[];
  showDevRates: boolean;
}

const ACCOUNT_KEY = ["account", "me"] as const;

export function useAccount() {
  return useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: async (): Promise<AccountProfile> => {
      const res = await apiFetch<{ account: AccountProfile }>("/api/account");
      return res.account;
    },
    // 5 min cache — most pages share the QueryClient, so navigation reuses this aggressively
    // and we never re-fetch unless the user pauses for ages or explicitly invalidates.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useToggleDevRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (showDevRates: boolean): Promise<void> => {
      await apiFetch("/api/settings/dev-rates", {
        method: "PATCH",
        body: JSON.stringify({ showDevRates }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (_data, showDevRates) => {
      queryClient.setQueryData<AccountProfile>(ACCOUNT_KEY, (prev) =>
        prev ? { ...prev, showDevRates } : prev,
      );
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<Pick<AccountProfile, "name" | "avatarUrl">>,
    ): Promise<AccountProfile> => {
      const res = await apiFetch<{ account: Omit<AccountProfile, "role" | "permissions"> }>(
        "/api/account",
        {
          method: "PATCH",
          body: JSON.stringify(patch),
          headers: { "Content-Type": "application/json" },
        },
      );
      // Merge with cached role/permissions since PATCH doesn't return them
      const existing = queryClient.getQueryData<AccountProfile>(ACCOUNT_KEY);
      return {
        ...res.account,
        role: existing?.role ?? "STAFF",
        permissions: existing?.permissions ?? [],
      };
    },
    onSuccess: (account) => {
      queryClient.setQueryData(ACCOUNT_KEY, account);
    },
  });
}
