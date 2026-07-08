// iPhone 17 Dynamic Island — a black pill centred near the top of the screen, drawn on top of
// the screenshot. Sizes arrive in px (computed from the frame width by the DeviceFrame parent).

export function DynamicIsland({ w, h, top }: { w: number; h: number; top: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: "50%",
        transform: "translateX(-50%)",
        width: w,
        height: h,
        borderRadius: h / 2,
        backgroundColor: "#000000",
        zIndex: 4,
      }}
    />
  );
}
