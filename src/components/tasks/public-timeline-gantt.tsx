"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { GanttChart, type GanttBlock } from "@/components/tasks/gantt-chart";

/**
 * The public /timeline/[token] Gantt, with the same Categories | Releases switch as the wiki
 * Timeline. The switch only shows when the client has releases on the timeline.
 */
export function PublicTimelineGantt({ blocks, releases }: { blocks: GanttBlock[]; releases: GanttBlock[] }) {
  const [group, setGroup] = useState<"categories" | "releases">("categories");
  const byRelease = group === "releases" && releases.length > 0;
  return (
    // Client-facing share — no internal "behind schedule" slip overlay.
    <GanttChart
      blocks={byRelease ? releases : blocks}
      slippage={false}
      railLabel={byRelease ? "Releases" : "Categories"}
      controls={
        releases.length > 0 ? (
          <Segmented
            label="Group the timeline by"
            value={byRelease ? "releases" : "categories"}
            onChange={setGroup}
            options={[
              { value: "categories", label: "Categories" },
              { value: "releases", label: "Releases" },
            ]}
          />
        ) : null
      }
      emptyHint="The timeline will appear here once work is scheduled."
    />
  );
}
