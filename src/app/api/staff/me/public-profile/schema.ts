/** The public-profile save body, shared by /api/staff/me/public-profile and /api/staff/[id]/public-profile. */
import { z } from "zod";
import { PROFILE_LIMITS } from "@/lib/public-profile";

export const publicProfileSchema = z
  .object({
    enabled: z.boolean().optional(),
    slug: z.string().max(PROFILE_LIMITS.slugMax + 10).optional(),
    headline: z.string().max(PROFILE_LIMITS.headline + 50).optional(),
    bio: z.string().max(PROFILE_LIMITS.bio + 50).optional(),
    summary: z.string().max(PROFILE_LIMITS.summary + 200).optional(),
    location: z.string().max(200).optional(),
    linkedinUrl: z.string().max(PROFILE_LIMITS.url).optional(),
    portfolioUrl: z.string().max(PROFILE_LIMITS.url).optional(),
    bookingUrl: z.string().max(PROFILE_LIMITS.url).optional(),
    // Shape and length are settled by readExtras; this only bounds the request.
    extras: z
      .object({
        highlights: z.array(z.object({ value: z.string().max(60), label: z.string().max(200) })).max(12).optional(),
        featured: z.array(z.object({ title: z.string().max(200), detail: z.string().max(600).nullable().optional(), url: z.string().max(PROFILE_LIMITS.url).nullable().optional() })).max(12).optional(),
        testimonials: z.array(z.object({ quote: z.string().max(800), name: z.string().max(120), role: z.string().max(200).nullable().optional() })).max(12).optional(),
        clients: z.array(z.string().max(80)).max(48).optional(),
      })
      .optional(),
    achievements: z
      .array(
        z.object({
          title: z.string().max(300),
          year: z.number().int().nullable(),
          detail: z.string().max(600).nullable(),
          kind: z.enum(["role", "education", "award"]).optional(),
          endYear: z.number().int().nullable().optional(),
          current: z.boolean().optional(),
        }),
      )
      .max(PROFILE_LIMITS.achievements)
      .optional(),
    card: z
      .object({ layout: z.string().max(40), font: z.string().max(40), colour: z.string().max(40), pattern: z.string().max(40) })
      .partial()
      .nullable()
      .optional(),
    links: z.array(z.object({ label: z.string().max(100), url: z.string().max(PROFILE_LIMITS.url) })).max(PROFILE_LIMITS.links).optional(),
  })
  .strict();
