export function normalizeClientName(value?: string | null): string {
  return value?.trim() ?? "";
}

export function getClientLookupKey(value?: string | null): string {
  return normalizeClientName(value).toLowerCase();
}

export function slugifyClientName(value: string): string {
  const slug = getClientLookupKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "client";
}
