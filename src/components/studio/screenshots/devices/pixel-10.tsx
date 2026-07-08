// Pixel 10 hole-punch camera — a small black circle centred near the top of the screen, drawn
// on top of the screenshot. Diameter/offset arrive in px from the DeviceFrame parent.

export function HolePunch({ d, top }: { d: number; top: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: "50%",
        transform: "translateX(-50%)",
        width: d,
        height: d,
        borderRadius: "50%",
        backgroundColor: "#000000",
        zIndex: 4,
      }}
    />
  );
}
