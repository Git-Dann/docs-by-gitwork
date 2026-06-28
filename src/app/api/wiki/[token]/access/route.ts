import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { loginWikiAccess, WIKI_ACCESS_COOKIE_MAX_AGE } from "@/server/wiki-access";
import { z } from "zod";

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Public — token in the URL is the wiki resolver; credentials are the gate.
// On success sets an HttpOnly cookie so the public wiki page renders thereafter.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const { username, password } = bodySchema.parse(await req.json());

    const result = await loginWikiAccess(token, username, password);
    if (!result) return apiError("Invalid username or password", 401);

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
