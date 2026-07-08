// Scene — renders ONE store screenshot at true pixel size. The SAME component powers the live
// preview and the export (no drift). Composite order: background → device frame (or full-bleed
// image, or nothing for a feature graphic) → text layers on top.

import { Background } from "./background";
import { DeviceFrame, frameWidthForOuterHeight } from "./devices";
import { FeatureGraphic } from "./feature-graphic";
import { TextLayer } from "./text-layer";
import { bodyColor, canvasById, layoutById, type ScreenshotState, type Scene as SceneModel } from "./config";

export function Scene({ state, scene, canvasId }: { state: ScreenshotState; scene: SceneModel; canvasId: string }) {
  const canvas = canvasById(canvasId);
  const u = canvas.w / 1080;
  const background = scene.bgOverride ?? state.background;

  // Feature graphic — no device frame.
  if (!canvas.framed) {
    return <FeatureGraphic size={{ w: canvas.w, h: canvas.h }} background={background} scene={scene} u={u} />;
  }

  const layout = layoutById(state.layout);
  const device = canvas.device ?? state.device;
  const { deviceConfig, statusBar } = state;

  let deviceNode: React.ReactNode = null;
  if (layout.hasDevice && layout.device) {
    const outerH = layout.device.height * canvas.h * deviceConfig.scale;
    const frameW = frameWidthForOuterHeight(device, outerH);
    const cxPx = (layout.device.cx + deviceConfig.offsetX) * canvas.w;
    const cyPx = (layout.device.cy + deviceConfig.offsetY) * canvas.h;
    const colors = bodyColor(device, deviceConfig.bodyColor[device]);
    deviceNode = (
      <div
        style={{
          position: "absolute",
          left: cxPx,
          top: cyPx,
          transform: `translate(-50%, -50%) rotate(${deviceConfig.rotation}deg)`,
          transformOrigin: "center center",
        }}
      >
        <DeviceFrame device={device} frameW={frameW} body={colors.body} rim={colors.rim} screenImage={scene.screenImage} statusBar={statusBar} />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: canvas.w, height: canvas.h, overflow: "hidden" }}>
      <Background theme={background} />
      {layout.fullBleed && scene.screenImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={scene.screenImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : null}
      {deviceNode}
      {scene.texts.map((t) => (
        <TextLayer key={t.id} layer={t} u={u} />
      ))}
    </div>
  );
}
