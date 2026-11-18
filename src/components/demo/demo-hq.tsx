"use client";

/**
 * `/demo/hq`: Foundry HQ as an admin sees it, from the real `AppOverview` fed by the demo
 * interceptor. The demo's own session is a developer (that's `/demo/dev`), so this page
 * seeds the account query with a Super Admin before HQ mounts. It is a cache seed, not a
 * session: nothing here can reach the server.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppOverview } from "@/components/app-overview";
import { DemoShell } from "@/components/demo/demo-shell";

const DEMO_ADMIN = {
  id: "demo-admin",
  email: "sam@gitwork.co.uk",
  name: "Sam Carter",
  avatarUrl: "",
  role: "SUPER_ADMIN",
  // Empty = unrestricted, as for a real Super Admin.
  permissions: [] as string[],
  showDevRates: false,
};

function SeedAdmin({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [ready] = useState(() => {
    qc.setQueryData(["account", "me"], DEMO_ADMIN);
    return true;
  });
  return ready ? <>{children}</> : null;
}

export function DemoHq() {
  return (
    <DemoShell active="Foundry HQ" title="Foundry HQ" subtitle="Your workspace at a glance">
      <SeedAdmin>
        <AppOverview />
      </SeedAdmin>
    </DemoShell>
  );
}
