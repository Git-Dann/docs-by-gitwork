// @vitest-environment jsdom
/**
 * One page per developer (docs/hr-platform.md): the Hiring review page sends anyone on the team
 * to their Staff page, and keeps Hiring's external candidates, whom Staff leaves out.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let candidate: { origin: "INTERNAL" | "EXTERNAL" } | null = null;

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/hooks/use-codeclear", () => ({
  useCodeClearCandidate: () => ({ isLoading: false, data: candidate ? { candidate } : undefined }),
  useDeleteCodeClearCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBulkUpdateCodeClearCandidates: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-proposals", () => ({ useClientList: () => ({ data: { clients: [] }, isLoading: false }) }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ canViewRates: false, canManageCode: false, isAdminOrAbove: false }) }));
vi.mock("@/hooks/use-fx", () => ({ useUsdToGbpRate: () => ({ data: null }), formatMoney: () => "" }));
// The rest of the page is irrelevant here; render nothing for it.
vi.mock("@/components/codeclear/current-client-picker", () => ({ CurrentClientPicker: () => null }));
vi.mock("@/components/codeclear/cv-modal", () => ({ CvModal: () => null }));
vi.mock("@/components/codeclear/candidate-parts", () => ({
  AvailabilityBadge: () => null,
  CandidateNotes: () => null,
  EditDevModal: () => null,
  ExternalLinks: () => null,
  HeroStat: () => null,
}));

import { CodeClearCandidateProfile } from "../codeclear-candidate-profile";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function full(origin: "INTERNAL" | "EXTERNAL") {
  return {
    id: "c1", name: "Ali", githubHandle: "ali", primaryStack: "TS", techStacks: [], origin, devGroup: "BENCH",
    availability: null, location: null, timezone: null, linkedinUrl: null, cvUrl: null, portfolioUrl: null,
    monthlyRate: null, monthlyRateCurrency: null, avatarUrl: null, email: null, placements: [], notes: [], currentClients: [],
  } as unknown as { origin: "INTERNAL" | "EXTERNAL" };
}

async function render() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => createRoot(host).render(<CodeClearCandidateProfile candidateId="c1" />));
  return host;
}

beforeEach(() => {
  replace.mockReset();
  document.body.innerHTML = "";
});

describe("the developer review page", () => {
  it("sends someone on the team to their Staff page", async () => {
    candidate = full("INTERNAL");
    await render();
    expect(replace).toHaveBeenCalledWith("/app/staff/c1");
  });

  it("keeps Hiring's external candidates, whom Staff leaves out", async () => {
    candidate = full("EXTERNAL");
    const host = await render();
    expect(replace).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Ali");
  });
});
