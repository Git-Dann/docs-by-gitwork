import { DevSignalStageRegistry } from "./registry";
import { applicationIntakeRunner } from "./application-intake";
import { onlineFootprintRunner } from "./online-footprint";

/**
 * The production stage registry. Only stages with a REAL runner are registered;
 * unimplemented stages are simply absent, so the orchestrator skips them and
 * scoring treats them as "no result yet" (→ human review), never faking a
 * signal. Register more runners here as they land:
 *   - profile_connections, video_assessment, coding_challenge (Phase C)
 *   - identity_verification (Stripe), leadership_interview (human scorecard)
 */
export function createDefaultRegistry(): DevSignalStageRegistry {
  return new DevSignalStageRegistry()
    .register(applicationIntakeRunner)
    .register(onlineFootprintRunner);
}
