import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { loginPortalUser, WIKI_ACCESS_COOKIE_MAX_AGE } from "@/server/wiki-access";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

/**
 * Central portal login — POST { email, password }, no token. Authenticates across
 * every client wiki and, on success, sets the access cookie for EACH wiki the user
 * can reach, then returns the list so the client routes them (one → straight in,
 * many → chooser). Public: the email/password is the auth.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = bodySchema.parse(await req.json());
    const wikis = await loginPortalUser(email, password);
    if (wikis.length === 0) {
      return apiError("No workspace found for that email and password", 401);
    }

    const res = apiOk({
      wikis: wikis.map((w) => ({ clientName: w.clientName, slug: w.slug, url: w.url })),
    });
    for (const w of wikis) {
      res.cookies.set({
        name: w.cookieName,
        value: w.cookieValue,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: WIKI_ACCESS_COOKIE_MAX_AGE,
      });
    }
    return res;
  } catch (err) {
    return fromError(err);
  }
}
