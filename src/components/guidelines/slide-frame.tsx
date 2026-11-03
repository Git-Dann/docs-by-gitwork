"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";

/** Every slide is drawn on this canvas and scaled to fit, so a slide looks the same at any width. */
export const SLIDE_W = 1600;
export const SLIDE_H = 900;

/**
 * A 16:9 box that scales its 1600 x 900 slide to whatever width it is given. `fit="contain"`
 * (present mode) also fits the height, letterboxing the slide inside its parent.
 *
 * Until the first measurement the slide is hidden rather than drawn at the wrong scale, which
 * would flash a 1600px slide across a phone.
 */
export function SlideFrame({
  children,
  fit = "width",
  className,
}: {
  children: React.ReactNode;
  fit?: "width" | "contain";
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const measure = () => {
      const target = fit === "contain" ? el.parentElement ?? el : el;
      const byWidth = target.clientWidth / SLIDE_W;
      const byHeight = target.clientHeight / SLIDE_H;
      setScale(fit === "contain" ? Math.min(byWidth, byHeight) : byWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(fit === "contain" ? el.parentElement ?? el : el);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <div
      ref={outer}
      className={cn("gl-frame relative overflow-hidden", className)}
      style={
        fit === "contain"
          ? { width: SLIDE_W * scale, height: SLIDE_H * scale }
          : { width: "100%", aspectRatio: `${SLIDE_W} / ${SLIDE_H}` }
      }
    >
      <div
        className="gl-frame-inner absolute left-0 top-0 origin-top-left"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
