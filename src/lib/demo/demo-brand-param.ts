/**
 * The demo's white-label brand is passed as `?client=Acme Corp`. Care uses the same name for its
 * own deep link (`/app/care?client=<id>&section=reports`), and it writes it into the address bar
 * as you move between clients, so on `/demo/care` that parameter is a Care client id, not a brand.
 * Reading it as a brand renamed the whole demo "sup-northwind" on reload and kept it in
 * localStorage for every other demo page.
 *
 * Returns the brand parameter as written (`""` clears the brand), or `null` when the URL carries
 * none, or carries one that belongs to the page.
 */
const PAGES_THAT_OWN_CLIENT = ["/demo/care"];

export function demoBrandParam(pathname: string, search: string): string | null {
  if (PAGES_THAT_OWN_CLIENT.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return new URLSearchParams(search).get("client");
}
