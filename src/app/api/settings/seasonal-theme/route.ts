import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import {
  DEFAULT_SEASONAL_THEME,
  activeSeasonalTheme,
  isSeasonalThemeId,
  type SeasonalThemeSetting,
} from "@/lib/seasonal-themes";

export const dynamic = "force-dynamic";

function toSetting(ws: { seasonalThemeEnabled: boolean; seasonalTheme: string } | null): SeasonalThemeSetting {
  const enabled = ws?.seasonalThemeEnabled ?? false;
  const theme = isSeasonalThemeId(ws?.seasonalTheme) ? ws!.seasonalTheme : DEFAULT_SEASONAL_THEME;
  return { enabled, theme, active: activeSeasonalTheme(enabled, theme) };
}

/** GET — the workspace's seasonal theme. Any signed-in member: every page needs it. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthedUser(req);
    const ws = await prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { seasonalThemeEnabled: true, seasonalTheme: true },
    });
    return apiOk(toSetting(ws));
  } catch (err) {
    return fromError(err);
  }
}

const putSchema = z.object({ enabled: z.boolean(), theme: z.string() }).strict();

/** PUT — switch it on or off and choose the theme. Admins and Super Admins. */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuthedUser(req);
    assertAtLeastAdmin(user);
    const parsed = putSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Send { enabled, theme }.", 400);
    if (!isSeasonalThemeId(parsed.data.theme)) return apiError(`Unknown theme "${parsed.data.theme}".`, 400);
    const ws = await prisma.workspace.update({
      where: { id: user.workspaceId },
      data: { seasonalThemeEnabled: parsed.data.enabled, seasonalTheme: parsed.data.theme },
      select: { seasonalThemeEnabled: true, seasonalTheme: true },
    });
    return apiOk(toSetting(ws));
  } catch (err) {
    return fromError(err);
  }
}
