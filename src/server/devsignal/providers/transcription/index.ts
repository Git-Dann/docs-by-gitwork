import { DeepgramTranscriptionProvider } from "./deepgram";
import { MockTranscriptionProvider } from "./mock";
import type { TranscriptionProvider } from "./types";

/** Deepgram when configured, else a mock (which the caller treats as "unavailable"). */
export function getTranscriptionProvider(): TranscriptionProvider {
  const deepgram = new DeepgramTranscriptionProvider();
  return deepgram.available() ? deepgram : new MockTranscriptionProvider();
}
