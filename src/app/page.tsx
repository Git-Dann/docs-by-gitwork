import { redirect } from "next/navigation";

// The public front door is the client portal login. Staff Google sign-in still
// lives at /login (reachable directly, e.g. from the portal login page).
export default function RootPage() {
  redirect("/portal/login");
}
