"use client";

/**
 * The theme control everywhere in Foundry: the app's profile menu, the internal wiki header,
 * the client's shared wiki page and the demo banner. It is the animated Light · System · Dark
 * switch (src/components/ui/mode-switch/mode-switch.tsx); this name stays so every caller kept
 * working when the old segmented control was replaced (Nov 2026).
 */
import { useEffect, useState } from "react";
import { SpeakerWaveIcon, SpeakerXMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { ModeSwitch } from "@/components/ui/mode-switch/mode-switch";
import { SOUND_CHANGED_EVENT, readSoundOn, writeSoundOn } from "@/lib/mode-switch-sounds";

export function ThemeToggle({
  className,
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "lg";
  /** @deprecated The switch has no labels to hide; kept so older callers compile. */
  iconOnly?: boolean;
}) {
  return <ModeSwitch size={size} className={className} />;
}

/** The switch's sound, on or off, for this browser. Small enough to sit beside the switch. */
export function ThemeSoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(readSoundOn());
    const sync = (e: Event) => setOn(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(SOUND_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SOUND_CHANGED_EVENT, sync);
  }, []);
  const Icon = on ? SpeakerWaveIcon : SpeakerXMarkIcon;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Theme switch sound on" : "Theme switch sound off"}
      title={on ? "Sound on. Click to mute the theme switch." : "Sound off. Click to hear the theme switch."}
      onClick={() => writeSoundOn(!on)}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
        className,
      )}
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );
}
