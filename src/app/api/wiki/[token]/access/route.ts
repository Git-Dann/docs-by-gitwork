import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { loginWikiAccess, WIKI_ACCESS_COOKIE_MAX_AGE } from "@/server/wiki-access";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

// Public — token in the URL resolves the wiki; email + password is the gate.
// On success sets an HttpOnly cookie so the public wiki page renders thereafter.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const { email, password } = bodySchema.parse(await req.json());

    const result = await loginWikiAccess(token, email, password);
    if (!result) return apiError("Invalid email or password", 401);

    const res = apiOk({ ok: true });
    res.cookies.set({
      name: result.cookieName,
      value: result.cookieValue,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: WIKI_ACCESS_COOKIE_MAX_AGE,
    });
    return res;
  } catch (err) {
    return fromError(err);
  }
}
