// Full-bleed background layer for a scene — solid or gradient, resolved to CSS via resolveFill.

import { resolveFill, type BackgroundTheme } from "./config";

export function Background({ theme }: { theme: BackgroundTheme }) {
  const css = resolveFill(theme.fill);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: css.backgroundColor,
        backgroundImage: css.backgroundImage,
      }}
    />
  );
}
