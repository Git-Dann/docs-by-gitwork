import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
import { demoHrefFor } from "../use-demo-nav";

describe("demoHrefFor", () => {
  it("maps the real app links the demo covers", () => {
    expect(demoHrefFor("/app/portal/northwind/wiki")).toBe("/demo/wiki");
    expect(demoHrefFor("/app/portal/northwind/tasks")).toBe("/demo/tasks");
    expect(demoHrefFor("/app/portal/northwind")).toBe("/demo/portal");
    expect(demoHrefFor("/app/docs/doc-1")).toBe("/demo/docs/doc-1?tab=builder");
    expect(demoHrefFor("/app/pulse")).toBe("/demo/pulse");
    expect(demoHrefFor("/app/pulse/embed")).toBe("/demo/pulse/growth");
    expect(demoHrefFor("/app/pulse/projects/p1")).toBe("/demo/pulse/projects/p1");
    expect(demoHrefFor("/app/pulse/scan-1")).toBe("/demo/pulse/scan-1");
  });

  it("returns null for anything the demo doesn't have, so it is swallowed", () => {
    expect(demoHrefFor("/app/settings")).toBeNull();
    expect(demoHrefFor("/app/docs/analytics")).toBeNull();
    expect(demoHrefFor("https://example.com")).toBeNull();
  });
});
