"use client";

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import type { AssetInput } from "@/types/proposal";

const assetTypes: AssetInput["type"][] = [
  "COVER_IMAGE",
  "SECTION_GRAPHIC",
  "DIAGRAM",
  "LOGO",
  "SCREENSHOT",
];
const placementOptions = [
  { value: "cover", label: "Cover" },
  { value: "introduction", label: "Introduction" },
  { value: "product_overview", label: "Product overview" },
  { value: "objectives", label: "Objectives" },
  { value: "touchpoints", label: "Scope / touchpoints" },
  { value: "timeline", label: "Timeline" },
  { value: "costing", label: "Cost breakdown" },
  { value: "cta_next_steps", label: "CTA / next steps" },
  { value: "supporting_links_assets", label: "Supporting links & assets" },
  { value: "assumptions", label: "Assumptions" },
  { value: "out_of_scope", label: "Out of scope" },
  { value: "signoff_footer", label: "Sign-off / footer" },
] as const;

const sizeOptions: AssetInput["size"][] = ["SMALL", "MEDIUM", "LARGE", "FULL"];
const alignmentOptions: AssetInput["alignment"][] = ["LEFT", "CENTER", "RIGHT", "FULL"];

export function AssetPicker({
  assets,
  onChange,
}: {
  assets: AssetInput[];
  onChange: (assets: AssetInput[]) => void;
}) {
  const safeAssets = assets ?? [];

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border-1)] bg-[var(--surface-0)] p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Proposal assets</p>
          <p className="text-xs text-[var(--text-3)]">
            Use this area for proposal-specific decks, documentation visuals, diagrams, screenshots, and supporting brand assets.
          </p>
        </div>
        <Button
          type="button"
          onClick={() =>
            onChange([
              ...safeAssets,
              {
                type: "SECTION_GRAPHIC",
                title: "",
                url: "",
                altText: "",
                placement: "cover",
                caption: "",
                size: "MEDIUM",
                alignment: "LEFT",
                sortOrder: safeAssets.length,
              },
            ])
          }
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
        >
          Add asset
        </Button>
      </div>

      {safeAssets.length ? (
        <div className="space-y-2">
          {safeAssets.map((asset, index) => (
            <article key={`${asset.id ?? "asset"}-${index}`} className="space-y-2 rounded-md border border-[var(--border-1)] bg-white p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Title</span>
                  <input
                    value={asset.title}
                    onChange={(event) =>
                      onChange(
                        safeAssets.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, title: event.target.value } : entry,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Type</span>
                  <select
                    value={asset.type}
                    onChange={(event) =>
                      onChange(
                        safeAssets.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, type: event.target.value as AssetInput["type"] }
                            : entry,
                        ),
                      )
                    }
                    className="app-select-compact h-9 w-full rounded-md border border-[var(--border-1)] bg-white text-sm"
                  >
                    {assetTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-[var(--text-3)]">Asset image</span>
                <ImagePicker
                  value={asset.url}
                  onChange={(url) =>
                    onChange(
                      safeAssets.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, url } : entry,
                      ),
                    )
                  }
                  previewClassName="h-36 w-full"
                />
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Alt text</span>
                  <input
                    value={asset.altText}
                    onChange={(event) =>
                      onChange(
                        safeAssets.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, altText: event.target.value } : entry,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Placement</span>
                  <select
                    value={asset.placement}
                    onChange={(event) =>
                      onChange(
                        safeAssets.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, placement: event.target.value } : entry,
                        ),
                      )
                    }
                    className="app-select-compact h-9 w-full rounded-md border border-[var(--border-1)] bg-white text-sm"
                  >
                    {placementOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Caption</span>
                  <input
                    value={asset.caption ?? ""}
                    onChange={(event) =>
                      onChange(
                        safeAssets.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, caption: event.target.value } : entry,
                        ),
                      )
                    }
                    className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
                  />
                </label>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Size</span>
                  <select
                    value={asset.size}
                    onChange={(event) =>
                      onChange(
                        safeAssets.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, size: event.target.value as AssetInput["size"] }
                            : entry,
                        ),
                      )
                    }
                    className="app-select-compact h-9 w-full rounded-md border border-[var(--border-1)] bg-white text-sm"
                  >
                    {sizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-[var(--text-3)]">Alignment</span>
                  <select
                    value={asset.alignment}
                    onChange={(event) =>
                      onChange(
                        safeAssets.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, alignment: event.target.value as AssetInput["alignment"] }
                            : entry,
                        ),
                      )
                    }
                    className="app-select-compact h-9 w-full rounded-md border border-[var(--border-1)] bg-white text-sm"
                  >
                    {alignmentOptions.map((alignment) => (
                      <option key={alignment} value={alignment}>
                        {alignment}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    onClick={() => onChange(safeAssets.filter((_, entryIndex) => entryIndex !== index))}
                    variant="danger"
                    size="sm"
                    leadingIcon={<TrashIcon className="h-3.5 w-3.5" />}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-3)]">No assets added yet.</p>
      )}
    </div>
  );
}
