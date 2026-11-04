import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { GET } from "../route";

describe("desktop sign-in start, signed out", () => {
  it("sends the browser back to the public host, not the container's bind address", async () => {
    // What the standalone server sees behind nginx: request.url is the bind address.
    const req = new NextRequest("http://0.0.0.0:3000/api/auth/desktop/start", {
      headers: { host: "foundry.gitwork.co.uk", "x-forwarded-proto": "https" },
    });
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://foundry.gitwork.co.uk");
    expect(location.pathname).toBe("/api/auth/signin");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "https://foundry.gitwork.co.uk/api/auth/desktop/start",
    );
  });
});
