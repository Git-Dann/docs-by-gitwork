// One text layer, positioned at true pixel size. The block is centred on its (xPct, yPct) anchor
// and rotated in place; font size scales by the canvas unit `u`. Drop shadow via CSS text-shadow.
// Newlines in the copy are honoured (white-space: pre-line).

import { fontStack, type TextLayer as TextLayerModel } from "./config";

export function TextLayer({ layer, u }: { layer: TextLayerModel; u: number }) {
  const shadow = layer.shadow.on ? `${layer.shadow.x * u}px ${layer.shadow.y * u}px ${layer.shadow.blur * u}px ${layer.shadow.color}` : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: `${layer.xPct}%`,
        top: `${layer.yPct}%`,
        width: `${layer.widthPct}%`,
        transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
        transformOrigin: "center center",
        textAlign: layer.align,
        fontFamily: fontStack(layer.font),
        fontWeight: layer.weight,
        fontSize: layer.sizePx * u,
        lineHeight: 1.1,
        letterSpacing: -layer.sizePx * u * 0.01,
        color: layer.color,
        textShadow: shadow,
        whiteSpace: "pre-line",
        wordBreak: "break-word",
      }}
    >
      {layer.text}
    </div>
  );
}
