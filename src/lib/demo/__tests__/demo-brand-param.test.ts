import { describe, expect, it } from "vitest";
import { demoBrandParam } from "@/lib/demo/demo-brand-param";

describe("demoBrandParam", () => {
  it("reads ?client= as the brand on ordinary demo pages", () => {
    expect(demoBrandParam("/demo", "?client=Acme%20Corp")).toBe("Acme Corp");
    expect(demoBrandParam("/demo/hq", "?client=Acme")).toBe("Acme");
    expect(demoBrandParam("/demo/hq", "?client=")).toBe("");
    expect(demoBrandParam("/demo/hq", "")).toBeNull();
  });

  it("leaves Care's own ?client= deep link alone", () => {
    expect(demoBrandParam("/demo/care", "?client=sup-northwind&section=reports")).toBeNull();
    expect(demoBrandParam("/demo/care/anything", "?client=sup-northwind")).toBeNull();
  });

  it("does not treat a lookalike path as Care", () => {
    expect(demoBrandParam("/demo/careers", "?client=Acme")).toBe("Acme");
  });
});
