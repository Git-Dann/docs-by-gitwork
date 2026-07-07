import type { TranscriptionAudio, TranscriptionProvider, TranscriptionResult } from "./types";

/**
 * Deepgram STT via its REST API (no SDK dependency — a single fetch). Gated on
 * DEEPGRAM_API_KEY; when absent, `available()` is false and the caller falls
 * back (marking the video stage for manual transcription rather than faking it).
 */
export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly name = "deepgram";

  available(): boolean {
    return Boolean(process.env.DEEPGRAM_API_KEY);
  }

  async transcribe(audio: TranscriptionAudio): Promise<TranscriptionResult> {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("DEEPGRAM_API_KEY is not set.");

    const res = await fetch("https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": audio.mimeType },
      body: audio.data as unknown as BodyInit,
    });
    if (!res.ok) {
      throw new Error(`Deepgram error ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const json = (await res.json()) as {
      results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
      metadata?: { duration?: number };
    };
    const transcript = json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return { provider: this.name, transcript, durationSec: json.metadata?.duration };
  }
}
