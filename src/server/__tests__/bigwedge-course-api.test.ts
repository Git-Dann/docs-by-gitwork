/**
 * The course backend (wedge-course-backend) is not the Big Wedge APP API (apiv1.bigwedgegolf.com).
 * Until Nov 2026 the app connector's base URL won here, so the course backend's credentials were
 * posted to the app's /auth/token/ and refused — "check WEDGE_COURSE_API_USER/PASSWORD" with the
 * right password. These pin the host and keep the login failure diagnosable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/wiki-bigwedge-sync", () => ({
  resolveBigWedgeApi: vi.fn(async () => ({ baseUrl: "https://apiv1.bigwedgegolf.com", apiToken: "APP-ADMIN-JWT" })),
}));
vi.mock("@/server/golf-cache", () => ({ cached: (_k: string, fn: () => unknown) => fn(), bustGolfCache: vi.fn() }));

import { courseApiBaseUrl, resolveCourseApi } from "../bigwedge-course-api";

const fetchMock = vi.fn();
const saved = { ...process.env };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.WEDGE_COURSE_API_URL;
  process.env.WEDGE_COURSE_API_USER = "foundry";
  process.env.WEDGE_COURSE_API_PASSWORD = "pw";
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...saved };
});

describe("course backend base URL", () => {
  it("is the course backend by default, never the app API", () => {
    expect(courseApiBaseUrl({} as NodeJS.ProcessEnv)).toBe("https://wedge-course-backend.vercel.app");
  });
  it("takes WEDGE_COURSE_API_URL, without a trailing slash", () => {
    expect(courseApiBaseUrl({ WEDGE_COURSE_API_URL: "https://courses.example.com/ " } as unknown as NodeJS.ProcessEnv)).toBe("https://courses.example.com");
  });
});

describe("resolveCourseApi", () => {
  it("logs in at the course backend, not apiv1.bigwedgegolf.com, even with the app connector set", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ access: "T" }), { status: 200 }));
    expect(await resolveCourseApi()).toEqual({ baseUrl: "https://wedge-course-backend.vercel.app", token: "T" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://wedge-course-backend.vercel.app/api/v1/auth/token/");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("apiv1.bigwedgegolf.com");
  });

  it("says which HTTP status the login got, so a wrong password reads differently from a wrong host", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    const r = await resolveCourseApi();
    expect(r).toEqual({ error: expect.stringContaining("HTTP 401") });
  });

  it("without credentials sends no token — and never the app connector's admin JWT", async () => {
    delete process.env.WEDGE_COURSE_API_USER;
    expect(await resolveCourseApi()).toEqual({ baseUrl: "https://wedge-course-backend.vercel.app" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
