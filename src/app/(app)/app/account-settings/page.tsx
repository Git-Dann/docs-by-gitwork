import { redirect } from "next/navigation";

// `/app/account-settings` was the old per-user settings page. It now lives as a section under
// `/app/settings/account` so all preferences are reachable from a single entry point.
export default function AccountSettingsRedirect() {
  redirect("/app/settings/account");
}
