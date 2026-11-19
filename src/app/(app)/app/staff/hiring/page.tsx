import { redirect } from "next/navigation";

/**
 * Hiring opens on Pipeline. Its old Overview (tier mix, bench, calibre, costs) described the
 * developers you have rather than hiring, so it moved to Developers → Insights (Staff audit,
 * Nov 2026). Old links land on the nearest equivalent.
 */
export default function HiringPage() {
  redirect("/app/staff/hiring/pipeline");
}
