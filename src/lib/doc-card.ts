/**
 * What "Copy doc card" puts on the clipboard (CLAUDE.md §139.2): the person's doc card as an
 * image linked to their public page, then one line of text with their name and position, also
 * linked. Google Docs, Word and Gmail paste the HTML version; anything else gets the plain text.
 * The text line is there because an image can't be searched or read aloud.
 *
 * Pure, so it is tested without a browser. Every value is escaped: names and titles are typed by
 * people, and this becomes markup the moment it is pasted.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function docCardClipboard({
  name,
  position,
  pageUrl,
  imageUrl,
}: {
  name: string;
  position: string | null;
  /** Absolute address of their public page. */
  pageUrl: string;
  /** Absolute address of their doc card image. */
  imageUrl: string;
}): { html: string; text: string } {
  const line = position ? `${name}, ${position}` : name;
  const html =
    `<a href="${esc(pageUrl)}"><img src="${esc(imageUrl)}" width="300" height="90" alt="${esc(line)}"></a>` +
    `<br><a href="${esc(pageUrl)}">${esc(name)}</a>${position ? `, ${esc(position)}` : ""}`;
  return { html, text: `${line}: ${pageUrl}` };
}

/** Copy it. Falls back to plain text where a browser can't write HTML to the clipboard. */
export async function copyDocCard(input: Parameters<typeof docCardClipboard>[0]): Promise<void> {
  const { html, text } = docCardClipboard(input);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(text);
}
