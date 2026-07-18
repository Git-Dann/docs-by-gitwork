"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  useStarterRecipeList,
  useCreateStarterRecipe,
  useUpdateStarterRecipe,
  useDeleteStarterRecipe,
} from "@/hooks/use-starter-recipes";
import { useStarterList } from "@/hooks/use-starters";
import { usePermissions } from "@/hooks/use-permissions";
import { Modal } from "@/components/ui/modal";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/format";
import type { StarterRecipeWithStarters } from "@/server/starter-recipes";
import type { StarterListItem } from "@/server/starters";

/** A named, curated bundle of existing Starters — "give me the whole stack for X kind of
 * project" in one click. Pure grouping layer over the catalog; no new content. */
export function StarterRecipesPanel() {
  const { canManageStarters } = usePermissions();
  const { data: recipes, isLoading } = useStarterRecipeList();
  const { data: starters } = useStarterList();
  const { mutate: deleteRecipe } = useDeleteStarterRecipe();
  const [editing, setEditing] = useState<StarterRecipeWithStarters | "new" | null>(null);

  if (!canManageStarters) return null;

  return (
    <div className="space-y-5">
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // RECIPES"}
          </span>
          <span className="widget-header__status">{(recipes ?? []).length} TOTAL</span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm text-[var(--text-3)]">
            Bundle existing starters into one named stack — a client kicking off a new build gets
            the whole recommended set in one click, not five separate lookups.
          </p>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className={buttonStyles({ variant: "primary", size: "sm" })}
          >
            <PlusIcon className="h-4 w-4" />
            New recipe
          </button>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]" />
          ))}
        </div>
      ) : (recipes ?? []).length === 0 ? (
        <div className="widget-card px-6 py-10 text-center">
          <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--text-1)]">No recipes yet</h3>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            Group a few starters together — e.g. &ldquo;SaaS MVP Recipe&rdquo; = Launch Kit + Design System + Ship It.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(recipes ?? []).map((recipe) => (
            <article key={recipe.id} className="widget-card group flex flex-col">
              <div className="flex-1 px-5 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-[var(--text-1)]">{recipe.name}</h3>
                  <button
                    type="button"
                    onClick={() => deleteRecipe(recipe.id)}
                    className="rounded-[6px] p-1 text-[var(--text-4)] opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    title="Delete recipe"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--text-3)]">{recipe.summary}</p>
                <ul className="mt-3 space-y-1">
                  {recipe.starters.length === 0 ? (
                    <li className="text-xs text-[var(--text-4)]">No starters added yet</li>
                  ) : (
                    recipe.starters.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/app/starters/${s.id}`}
                          className="text-xs font-medium text-[var(--brand-700)] hover:underline"
                        >
                          {s.name}
                        </Link>
                        <span className="ml-1.5 font-mono text-[10px] uppercase text-[var(--text-4)]">{s.type}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="border-t border-[var(--border-2)] px-5 py-3">
                <button
                  type="button"
                  onClick={() => setEditing(recipe)}
                  className="text-xs font-medium text-[var(--text-3)] hover:text-[var(--text-1)]"
                >
                  Edit recipe
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing ? (
        <RecipeEditorModal
          recipe={editing === "new" ? null : editing}
          allStarters={starters ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function RecipeEditorModal({
  recipe,
  allStarters,
  onClose,
}: {
  recipe: StarterRecipeWithStarters | null;
  allStarters: StarterListItem[];
  onClose: () => void;
}) {
  const { mutateAsync: create, isPending: creating } = useCreateStarterRecipe();
  const { mutateAsync: update, isPending: updating } = useUpdateStarterRecipe(recipe?.id ?? "");
  const [name, setName] = useState(recipe?.name ?? "");
  const [summary, setSummary] = useState(recipe?.summary ?? "");
  const [starterIds, setStarterIds] = useState<string[]>(recipe?.starterIds ?? []);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allStarters.filter((s) => !q || s.name.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q)));
  }, [allStarters, query]);

  const selected = starterIds
    .map((id) => allStarters.find((s) => s.id === id))
    .filter((s): s is StarterListItem => Boolean(s));

  function toggleStarter(id: string) {
    setStarterIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleSave() {
    if (!name.trim() || !summary.trim()) return;
    if (recipe) {
      await update({ name, summary, starterIds });
    } else {
      await create({ name, summary, starterIds });
    }
    onClose();
  }

  const saving = creating || updating;

  return (
    <Modal open onClose={onClose} title={recipe ? "Edit recipe" : "New recipe"} panelClassName="max-w-2xl">
      <div className="space-y-4 px-5 py-4">
        <div>
          <label className="app-field-label">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. SaaS MVP Recipe"
            className="app-input"
          />
        </div>
        <div>
          <label className="app-field-label">Summary</label>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What kind of project is this stack for?"
            className="app-input"
          />
        </div>
        <div>
          <label className="app-field-label">Starters ({selected.length} selected)</label>
          {selected.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selected.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--mist)] px-2 py-1 text-xs font-medium text-[var(--brand-700)]"
                >
                  {s.name}
                  <button type="button" onClick={() => toggleStarter(s.id)} aria-label={`Remove ${s.name}`}>
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search starters to add…"
            className="app-input mb-2"
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-[6px] border border-[var(--border-2)] p-1">
            {filtered.slice(0, 40).map((s) => {
              const isSelected = starterIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleStarter(s.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[4px] px-2 py-1.5 text-left text-xs transition",
                    isSelected ? "bg-[var(--mist)] text-[var(--brand-700)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  <span>{s.name}</span>
                  <span className="font-mono text-[10px] uppercase text-[var(--text-4)]">{s.type}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        <button type="button" onClick={onClose} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim() || !summary.trim()}
          className={buttonStyles({ variant: "primary", size: "sm" })}
        >
          {saving ? "Saving…" : recipe ? "Save changes" : "Create recipe"}
        </button>
      </div>
    </Modal>
  );
}
