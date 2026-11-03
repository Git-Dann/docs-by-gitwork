import { redirect } from "next/navigation";

/**
 * A notification's actionUrl is `/app/messages/<id>` — every channel (the bell, browser
 * push, and the phone) links here, so this path must resolve rather than 404.
 *
 * It redirects to the list with the message requested, so there is one place a message
 * is read and one set of behaviour (mark-as-read, read receipts) rather than two.
 */
export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/messages?open=${encodeURIComponent(id)}`);
}
