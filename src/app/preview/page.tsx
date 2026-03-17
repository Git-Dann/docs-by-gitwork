import { redirect } from "next/navigation";
import { DEFAULT_PRIMARY_PROPOSAL_ID } from "@/lib/poc-store";

export default function PreviewLandingPage() {
  redirect(`/preview/${DEFAULT_PRIMARY_PROPOSAL_ID}`);
}
