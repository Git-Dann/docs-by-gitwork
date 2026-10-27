"use client";

import { PulseNav } from "@/components/pulse/pulse-nav";
import { PULSE_DEMO_BASE } from "@/lib/pulse-nav";

/** The Pulse nav with demo links. The demo has no scan form, so there is no New scan. */
export function DemoPulseNav() {
  return <PulseNav base={PULSE_DEMO_BASE} newScanHref={null} />;
}
