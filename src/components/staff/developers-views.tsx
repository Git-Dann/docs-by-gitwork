"use client";

/**
 * Staff → Developers: the developer list, and Insights (tier mix, bench, calibre, costs, client
 * coverage). Insights used to be Hiring's "Overview", but it describes the developers you HAVE,
 * not hiring, so it lives here now (Staff audit, Nov 2026). The view is in `?view=insights` so a
 * link opens on it.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CodeClearCandidatesWorkspace } from "@/components/codeclear/codeclear-candidates-workspace";
import { CodeClearOverview } from "@/components/codeclear/codeclear-overview";
import { CodeClearTabs } from "@/components/codeclear/codeclear-shared";
import { Segmented } from "@/components/ui/segmented";

type View = "list" | "insights";

export function DevelopersViews() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view: View = params.get("view") === "insights" ? "insights" : "list";

  function choose(next: View) {
    const qs = new URLSearchParams(params.toString());
    if (next === "list") qs.delete("view");
    else qs.set("view", next);
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CodeClearTabs />
        <Segmented
          label="Developers view"
          value={view}
          onChange={choose}
          options={[
            { value: "list", label: "List" },
            { value: "insights", label: "Insights" },
          ]}
        />
      </div>
      {view === "insights" ? <CodeClearOverview hideTabs /> : <CodeClearCandidatesWorkspace hideTabs />}
    </div>
  );
}
