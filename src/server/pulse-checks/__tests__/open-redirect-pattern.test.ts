// @vitest-environment node
/**
 * pulse_open_redirect must flag a redirect to a user-supplied value, not a redirect to the
 * request's own path. Fixture from django/djangoproject.com docs/views.py (Oct 2026).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/server/pulse-checks/web-repo-source.ts", "utf8");
const m = /addFail\("pulse_open_redirect"[^/]*(\/.*\/i),/.exec(src);
const pattern = new RegExp(m![1].slice(1, -2), "i");

describe("pulse_open_redirect pattern", () => {
  it("flags user-supplied destinations", () => {
    for (const line of [
      "return redirect(request.GET.get('next'))",
      "return redirect(request.args.get('url'))",
      "res.redirect(req.query.returnTo)",
      "redirect_to params[:return_to]",
    ]) expect(pattern.test(line.replace("redirect_to ", "redirect(")), line).toBe(true);
  });
  it("does not flag the request's own path (djangoproject.com docs/views.py)", () => {
    expect(pattern.test("return redirect(request.path[:-6])")).toBe(false);
    expect(pattern.test("return redirect(request.get_full_path())")).toBe(false);
  });
});
