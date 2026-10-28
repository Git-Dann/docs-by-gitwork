import { redirect } from "next/navigation";

/**
 * Code became Staff (CLAUDE.md §86). /app/code was the sidebar's link, so it is in
 * bookmarks and notifications: it now lands on Staff → People. The developer overview it
 * used to show is Staff → Hiring → Overview, at /app/codeclear.
 */
export default function CodePage() {
  redirect("/app/staff");
}
