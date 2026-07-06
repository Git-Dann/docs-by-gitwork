import type { TranscriptionProvider, TranscriptionResult } from "./types";

/** Deterministic mock STT for tests + local dev. Transcribes nothing. */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock";
  private readonly transcript: string;
  constructor(transcript = "") {
    this.transcript = transcript;
  }
  available(): boolean {
    return true;
  }
  async transcribe(): Promise<TranscriptionResult> {
    return { provider: this.name, transcript: this.transcript, language: "en" };
  }
}
