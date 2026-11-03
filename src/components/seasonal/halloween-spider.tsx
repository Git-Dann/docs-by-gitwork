"use client";

/**
 * The Halloween spider (docs/motion.md): it peeks down from the top-right corner, dips when
 * you hover it, and drops on its thread when you click it, bounces, sways, and climbs back up.
 *
 * Where it hangs, and why it can't get in the way:
 *   - Desktop only (`lg+`), on pages that show the header band. It hangs in the band's 32px
 *     right gutter (`px-8`), so peeking it covers nothing; on a page without the band, or on
 *     the phone top bar, there's no gutter to hang in, so it isn't shown.
 *   - Only the spider itself takes clicks. The thread and the space around it don't.
 *   - Dropped, it climbs back by itself after a few seconds, so it never sits over the page.
 *   - Below dialogs (z-70), above the Desk drawer (z-40) and the fog (z-45).
 *   - Reduced motion: no sway, and the drop and climb are instant.
 *
 * The art is the sprite from the supplied `animation_spider.json` Lottie (public/motion/
 * spider.webp). The motion is a spring rather than that file's timeline, which only moved the
 * spider nine units in a 32-unit frame: too small a drop to read as one.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Rendered size. The sprite is 120×248, drawn at 30px wide (2× for retina is 60; this is 4×). */
const W = 30;
const H = Math.round((W * 248) / 120);
/** Peeking, only the head and hands show below the top of the screen. */
const PEEK_Y = -(H - 24);
const HOVER_Y = PEEK_Y + 9;
/** How long it hangs before climbing back by itself. */
const HANG_MS = 5000;

type Pose = "hidden" | "peek" | "dropped";

export function HalloweenSpider() {
  const reduce = useReducedMotion() ?? false;
  const [pose, setPose] = useState<Pose>("hidden");
  const [hover, setHover] = useState(false);
  const [dropTo, setDropTo] = useState(300);

  // Arrive a moment after the page does, so it reads as something that came to look.
  useEffect(() => {
    const t = window.setTimeout(() => setPose("peek"), 1200);
    return () => window.clearTimeout(t);
  }, []);

  // Dropped, it climbs back by itself. Any change of pose cancels the timer.
  useEffect(() => {
    if (pose !== "dropped") return;
    const t = window.setTimeout(() => setPose("peek"), HANG_MS);
    return () => window.clearTimeout(t);
  }, [pose]);

  const drop = () => {
    if (pose === "dropped") {
      setPose("peek");
      return;
    }
    // A third of the way down, within reason, so it lands over the page, not past the fold.
    setDropTo(Math.round(Math.min(Math.max(window.innerHeight * 0.34, 180), 360)));
    setPose("dropped");
  };

  const y = pose === "hidden" ? -H - 8 : pose === "dropped" ? dropTo : hover ? HOVER_Y : PEEK_Y;
  const transition = reduce
    ? { duration: 0 }
    : pose === "dropped"
      ? { type: "spring" as const, stiffness: 120, damping: 7, mass: 1.1 }
      : { type: "spring" as const, stiffness: 140, damping: 18 };

  return (
    <div className="pointer-events-none fixed right-[1px] top-0 z-[46] hidden lg:block print:hidden" style={{ width: W + 2 }}>
      {/* The pendulum: swings from the top of the screen. Two degrees at the full drop is ~12px
          either way, so it stays in the gutter rather than swinging over the page. */}
      <motion.div
        style={{ transformOrigin: "50% 0%" }}
        animate={reduce ? { rotate: 0 } : { rotate: pose === "dropped" ? [-2, 2, -2] : [-1.5, 1.5, -1.5] }}
        transition={reduce ? { duration: 0 } : { duration: pose === "dropped" ? 2.6 : 4.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div initial={{ y: -H - 8 }} animate={{ y }} transition={transition} className="relative mx-auto" style={{ width: W, height: H }}>
          {/* The rest of the thread, up to the top of the screen. */}
          <span aria-hidden className="absolute bottom-[calc(100%-2px)] left-1/2 h-[100vh] w-[1.5px] -translate-x-1/2 bg-[rgba(232,229,255,0.75)]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/motion/spider.webp"
            alt=""
            width={W}
            height={H}
            draggable={false}
            className="pointer-events-none block select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
          />
          <button
            type="button"
            onClick={drop}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            aria-label={pose === "dropped" ? "Send the spider back up" : "Drop the spider"}
            title={pose === "dropped" ? "Back up you go" : "Boo"}
            // The thread half of the sprite isn't a target; only the spider is.
            className="pointer-events-auto absolute inset-x-0 bottom-0 top-[45%] cursor-pointer rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-500)]"
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
