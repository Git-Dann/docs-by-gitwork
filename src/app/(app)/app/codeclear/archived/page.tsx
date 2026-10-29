import { redirect } from "next/navigation";

/**
 * The old Staff → Archived tab. Everyone who has left, developers included, is now under
 * Staff → People → Archived (docs/hr-platform.md), so old links land there.
 */
export default function CodeClearArchivedPage() {
  redirect("/app/staff?view=archived");
}
