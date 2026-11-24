/**
 * The mode switch's sounds (src/components/ui/mode-switch/mode-switch.tsx), made live with the
 * Web Audio API so there are no files to load. Adapted from Lucy Bichakhchyan's "Dark Mode
 * Switcher" (CodePen, MIT; docs/third-party-ui.md): Light plays a rising chime, System a warm
 * hum, Dark a deep bell.
 *
 * On by default (Dan's call, Nov 2026); the choice is per browser (`foundry.mode-sound.v1`) and
 * changed from the profile menu or Settings → Appearance. Every read and write is wrapped, so a
 * browser that blocks storage or has no audio just stays silent.
 */
import type { ThemeMode } from "@/components/providers/theme-provider";

export const SOUND_KEY = "foundry.mode-sound.v1";
export const SOUND_CHANGED_EVENT = "foundry:mode-sound-changed";

export function readSoundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  window.dispatchEvent(new CustomEvent(SOUND_CHANGED_EVENT, { detail: on }));
}

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Browsers only allow audio after a click or key press; this is always called from one. */
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) as AudioCtor | undefined;
    if (!AC) return null;
    try {
      // iPhones mute Web Audio on the silent switch unless the page asks for playback audio.
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = "playback";
    } catch {
      // Not supported: nothing to do.
    }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state !== "running") void ctx.resume();
  return ctx;
}

type ToneOptions = { type?: OscillatorType; level?: number; attack?: number; into?: AudioNode };

/** One note: a quick fade in, then a fade out. */
function tone(c: AudioContext, freq: number, at: number, length: number, opts: ToneOptions = {}) {
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(opts.level ?? 0.08, t + (opts.attack ?? 0.01));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain);
  gain.connect(opts.into ?? master!);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** A bell: a few overtones that fade at different speeds. */
function bell(c: AudioContext, freq: number, at: number, length: number, level: number) {
  for (const [ratio, share] of [[1, 1], [2.01, 0.45], [3.02, 0.22], [4.17, 0.12]] as const) {
    tone(c, freq * ratio, at, (length / ratio) * 1.6, { level: level * share, attack: 0.005 });
  }
}

/** A soft lowpass that opens and closes, for a warm pad. */
function warmFilter(c: AudioContext, open: number, length: number): BiquadFilterNode {
  const t = c.currentTime;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(350, t);
  filter.frequency.exponentialRampToValueAtTime(open, t + length * 0.4);
  filter.frequency.exponentialRampToValueAtTime(500, t + length);
  filter.connect(master!);
  return filter;
}

const SOUNDS: Record<ThemeMode, (c: AudioContext) => void> = {
  // Rising chime
  light: (c) =>
    [1046.5, 1318.5, 1568, 2093].forEach((f, n) => {
      tone(c, f, 0.24 + n * 0.07, 0.9, { level: 0.06 });
      tone(c, f * 2, 0.24 + n * 0.07, 0.4, { level: 0.012 });
    }),
  // Low hum
  system: (c) => {
    const filter = warmFilter(c, 900, 2.4);
    [130.8, 196, 261.6].forEach((f, n) => tone(c, f, 0.12, 2.4, { level: 0.07 - n * 0.015, attack: 0.6, into: filter }));
  },
  // Deep bell
  dark: (c) => {
    bell(c, 196, 0.16, 2.6, 0.09);
    tone(c, 98, 0.16, 2.2, { level: 0.04, attack: 0.05 });
  },
};

/** Play the sound for a mode, if sound is on. Never throws. */
export function playModeSound(mode: ThemeMode): void {
  if (!readSoundOn()) return;
  try {
    const c = audio();
    if (!c) return;
    const go = () => SOUNDS[mode](c);
    if (c.state === "running") go();
    else void c.resume().then(go, go);
  } catch {
    // No audio: stay silent.
  }
}
