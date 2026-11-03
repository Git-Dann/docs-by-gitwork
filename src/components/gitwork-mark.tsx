/**
 * The Gitwork roundel: a cream disc, an ink Fraunces "G" and the purple full stop. The one G. mark
 * on the platform, used by the document cover, the running header and the brand guidelines. Kept
 * in its own file so a page that only needs the mark does not pull in the whole document cover.
 */
export function GitworkMark({ size = 44 }: { size?: number }) {
  return (
    <span
      aria-label="Gitwork"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#F2EDE4",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
          fontSize: Math.round(size * 0.5),
          fontWeight: 700,
          lineHeight: 1,
          color: "#0C0C18",
          transform: "translateY(-1px)",
        }}
      >
        G<span style={{ color: "#6B52FF" }}>.</span>
      </span>
    </span>
  );
}
