/**
 * Gitwork OS — tiny synthesised sounds, so nothing is downloaded. Off by default:
 * a sales demo opened in an office must not start making noise. The speaker in the
 * menu bar turns them on, and the choice is remembered.
 */

export type SoundName = "pop" | "chime" | "achievement" | "whoosh" | "thud" | "launch" | "boot";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = "sine", gain = 0.12, slideTo?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + at + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + at);
  o.stop(c.currentTime + at + dur + 0.02);
}

export function playSound(name: SoundName) {
  const c = audio();
  if (!c) return;
  switch (name) {
    case "pop":
      tone(c, 660, 0, 0.09, "sine", 0.1, 990);
      break;
    case "chime":
      tone(c, 880, 0, 0.35, "sine", 0.08);
      tone(c, 1320, 0.06, 0.4, "sine", 0.05);
      break;
    case "achievement":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, i * 0.09, 0.32, "triangle", 0.09));
      break;
    case "whoosh":
      tone(c, 300, 0, 0.25, "sawtooth", 0.025, 90);
      break;
    case "thud":
      tone(c, 140, 0, 0.18, "sine", 0.18, 60);
      break;
    case "launch":
      tone(c, 120, 0, 1.1, "sawtooth", 0.03, 900);
      break;
    case "boot":
      [261.63, 329.63, 392, 523.25].forEach((f) => tone(c, f, 0, 1.4, "sine", 0.05));
      break;
  }
}

/** A four-on-the-floor beat for party mode. Returns a stop function. */
export function startPartyBeat(bpm = 124): () => void {
  const c = audio();
  if (!c) return () => {};
  const beat = 60 / bpm;
  let i = 0;
  const t = setInterval(() => {
    tone(c, 110, 0, 0.16, "sine", 0.22, 45); // kick
    if (i % 2 === 1) tone(c, 3000, 0, 0.05, "square", 0.012); // hat on the off-beat
    if (i % 4 === 0) tone(c, [261.63, 311.13, 349.23, 392][(i / 4) % 4], 0, beat * 1.8, "triangle", 0.03);
    i++;
  }, beat * 1000);
  return () => clearInterval(t);
}
