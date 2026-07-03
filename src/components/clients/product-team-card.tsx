"use client";

import { useMemo, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { useTeamMembers, useUpdateClientProductTeam } from "@/hooks/use-proposals";

/**
 * Per-client product-team picker. The chosen Gitwork members surface as the
 * "Product" avatar stack on the client wiki header (see wiki-dashboard). Stored
 * order is preserved (selection order), so pick the lead first. Edit gated on
 * canManageClients at the API; the card is only rendered for managers.
 */
export function ProductTeamCard({
  slug,
  initialUserIds,
}: {
  slug: string;
  initialUserIds: string[];
}) {
  const membersQuery = useTeamMembers();
  const update = useUpdateClientProductTeam(slug);
  const [selected, setSelected] = useState<string[]>(initialUserIds);

  const members = membersQuery.data?.members ?? [];
  const dirty = useMemo(() => {
    if (selected.length !== initialUserIds.length) return true;
    return selected.some((id, i) => id !== initialUserIds[i]);
  }, [selected, initialUserIds]);

  function toggle(userId: string) {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">PT</span>
          {" // PRODUCT TEAM"}
        </span>
        {dirty && (
          <button
            type="button"
            onClick={() => update.mutate(selected)}
            disabled={update.isPending}
            className="rounded-[6px] bg-[var(--brand-600)] px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      <div className="p-5">
        <p className="mb-3 text-[13px] text-[var(--text-3)]">
          Account/product leads shown on this client&apos;s wiki header. Pick the lead first —
          order is preserved.
        </p>
        {membersQuery.isLoading ? (
          <p className="text-[13px] text-[var(--text-4)]">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="text-[13px] text-[var(--text-4)]">No workspace members found.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const isOn = selected.includes(m.userId);
              const name = m.name?.trim() || m.email;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => toggle(m.userId)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition",
                    isOn
                      ? "border-[var(--brand-600)] bg-[var(--brand-50)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                  ].join(" ")}
                >
                  {isOn && <CheckIcon className="h-3.5 w-3.5" />}
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
