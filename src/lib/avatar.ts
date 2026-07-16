/**
 * Shared helpers for resolving a user's profile avatar.
 *
 * The avatar the user sees is one of three things, in priority order:
 *   1. A custom image they uploaded (a data: URL) or an explicit remote URL.
 *   2. Their Google Workspace photo (from the OAuth session).
 *   3. Their initials, drawn on a brand tile.
 *
 * `avatarUrl` on the User row carries the custom choice. The sentinel
 * `AVATAR_INITIALS` means "force initials even if a Google photo exists" — it lets a
 * user deliberately opt out of any photo. An empty/undefined value means "no custom
 * choice", so we fall back to the Google photo (then initials).
 *
 * `avatarPosition` is a CSS object-position string (e.g. "50% 30%") applied to the
 * cover-fit image so faces aren't cropped out.
 */

/** Sentinel stored in `User.avatarUrl` to force the initials tile. */
export const AVATAR_INITIALS = "__initials__";

/** Default object-position when none is set — centred. */
export const AVATAR_POSITION_DEFAULT = "50% 50%";

export interface ResolvedAvatar {
  /** The image URL to render, or "" when initials should be shown. */
  src: string;
  /** True when no image applies and the caller should draw initials. */
  isInitials: boolean;
}

/**
 * Resolve which avatar image (if any) to display, given the user's custom choice and
 * their Google photo.
 */
export function resolveAvatar(customAvatarUrl?: string | null, googleImage?: string | null): ResolvedAvatar {
  const custom = (customAvatarUrl ?? "").trim();
  if (custom === AVATAR_INITIALS) return { src: "", isInitials: true };
  if (custom) return { src: custom, isInitials: false };
  const google = (googleImage ?? "").trim();
  if (google) return { src: google, isInitials: false };
  return { src: "", isInitials: true };
}

/** Two-letter initials from a display name (falls back to "?"). */
export function initialsFrom(name: string): string {
  return (
    name
      .split(" ")
      .map((w) => w[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** Normalise a stored position to a usable CSS object-position value. */
export function avatarPosition(position?: string | null): string {
  const p = (position ?? "").trim();
  return p || AVATAR_POSITION_DEFAULT;
}
