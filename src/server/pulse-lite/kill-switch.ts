/** Error carrying a 503 so `fromError` maps it cleanly. */
export class PulseEmbedDisabledError extends Error {
  status = 503;
  constructor(message = "The Pulse scanner is temporarily unavailable.") {
    super(message);
    this.name = "PulseEmbedDisabledError";
  }
}
