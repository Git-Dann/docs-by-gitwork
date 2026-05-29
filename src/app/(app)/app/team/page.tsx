import { redirect } from "next/navigation";

// `/app/team` was the standalone invite-link page. Team management now lives inside Settings
// alongside every other workspace configuration surface.
export default function TeamRedirect() {
  redirect("/app/settings/team");
}
