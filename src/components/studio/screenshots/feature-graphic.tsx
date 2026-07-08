// Google Play feature graphic (1024×500, no device frame) — background + optional contained
// artwork/logo (the scene's uploaded image) + the scene's text layers on top.

import { Background } from "./background";
import { TextLayer } from "./text-layer";
import type { BackgroundTheme, Scene } from "./config";

export function FeatureGraphic({
  size,
  background,
  scene,
  u,
}: {
  size: { w: number; h: number };
  background: BackgroundTheme;
  scene: Scene;
  u: number;
}) {
  return (
    <div style={{ position: "relative", width: size.w, height: size.h, overflow: "hidden" }}>
      <Background theme={background} />
      {scene.screenImage ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: size.h * 0.12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scene.screenImage} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
        </div>
      ) : null}
      {scene.texts.map((t) => (
        <TextLayer key={t.id} layer={t} u={u} />
      ))}
    </div>
  );
}
