/**
 * TranscriptionProvider — abstraction over speech-to-text. Target is Deepgram
 * (free tier); a mock ships for tests/local. RETENTION: the audio blob is
 * transcribed and discarded — Foundry never persists candidate audio/video. The
 * transcript is kept only with consent, else only a hash + derived signals.
 */

export interface TranscriptionAudio {
  data: Uint8Array;
  mimeType: string;
}

export interface TranscriptionResult {
  provider: string;
  transcript: string;
  durationSec?: number;
  language?: string;
}

export interface TranscriptionProvider {
  name: string;
  /** Whether the provider is configured (e.g. API key present). */
  available(): boolean;
  transcribe(audio: TranscriptionAudio): Promise<TranscriptionResult>;
}
