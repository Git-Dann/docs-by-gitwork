// DeviceFrame — one CSS-drawn phone frame shared by both devices. Everything derives from the
// frame width `frameW` (px) via the device geometry ratios, so it scales to any resolution and
// the on-screen preview equals the export. The screenshot fills the screen via object-fit: cover;
// the device-specific cutout (Dynamic Island / hole-punch) and the faux status bar draw on top.

import { DEVICES, type DeviceId } from "../config";
import { DynamicIsland } from "./iphone-17";
import { HolePunch } from "./pixel-10";
import { StatusBar } from "./status-bar";

/** Outer body aspect (height / width) given the bezel + screen aspect. */
export function outerAspect(device: DeviceId): number {
  const g = DEVICES[device];
  return (1 - 2 * g.bezel) * g.screenAspect + 2 * g.bezel;
}

/** Frame width (px) that yields a given outer body height. */
export function frameWidthForOuterHeight(device: DeviceId, outerH: number): number {
  return outerH / outerAspect(device);
}

export function DeviceFrame({
  device,
  frameW,
  body,
  rim,
  screenImage,
  statusBar,
}: {
  device: DeviceId;
  frameW: number;
  body: string;
  rim: string;
  screenImage: string | null;
  statusBar: { on: boolean; style: "ios" | "android"; tint: "light" | "dark" };
}) {
  const g = DEVICES[device];
  const W = frameW;
  const b = g.bezel * W;
  const rOuter = g.radiusOuter * W;
  const rScreen = Math.max(0, rOuter - b);
  const screenW = W - 2 * b;
  const screenH = screenW * g.screenAspect;
  const outerH = screenH + 2 * b;
  const statusH = screenH * 0.048;

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: outerH,
        borderRadius: rOuter,
        backgroundColor: body,
        boxShadow: `inset 0 0 0 ${Math.max(1, b * 0.16)}px ${rim}, 0 ${W * 0.05}px ${W * 0.11}px rgba(0,0,0,0.30)`,
        boxSizing: "border-box",
      }}
    >
      {/* Screen */}
      <div
        style={{
          position: "absolute",
          top: b,
          left: b,
          width: screenW,
          height: screenH,
          borderRadius: rScreen,
          overflow: "hidden",
          backgroundColor: "#0B0B0D",
        }}
      >
        {screenImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={screenImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : null}
        {statusBar.on ? <StatusBar w={screenW} h={statusH} style={statusBar.style} tint={statusBar.tint} /> : null}
        {g.cutout.type === "island" ? (
          <DynamicIsland w={g.cutout.wPct * W} h={g.cutout.hPct * W} top={g.cutout.top * W} />
        ) : (
          <HolePunch d={g.cutout.dPct * W} top={g.cutout.top * W} />
        )}
      </div>
    </div>
  );
}
