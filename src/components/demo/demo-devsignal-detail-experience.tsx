import { DemoShell } from "@/components/demo/demo-shell";
import { AssessmentDetail } from "@/components/codeclear/devsignal/assessment-detail";

/**
 * Public, no-auth demo of a single DevSignal assessment (stage timeline, score
 * breakdown, interview scorecard, decision + promote gate). Data served by the
 * demo interceptor; the id is ignored (always returns the sample assessment).
 */
export function DemoDevSignalDetailExperience({ id }: { id: string }) {
  return (
    <DemoShell active="Code" title="Code" subtitle="Assessment review">
      <AssessmentDetail id={id} />
    </DemoShell>
  );
}
