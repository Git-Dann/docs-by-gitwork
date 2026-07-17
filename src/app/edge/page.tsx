import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EdgeBoard } from "@/components/edge/edge-board";

// Corsair Xeneon Edge "Mission Control" — a dedicated, dark, chrome-free exec board.
// Signed-in only: because the viewer is authenticated, everything renders as THEM
// (their desk/calendar, the workspace's real client health) with no API key or token
// to distribute. Open it fullscreen/kiosk on the Edge; sign in once; it stays live.
export const dynamic = "force-dynamic";

export default async function EdgePage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fedge");
  return <EdgeBoard />;
}
