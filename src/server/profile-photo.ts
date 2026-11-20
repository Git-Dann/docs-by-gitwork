/**
 * A public profile's photo as a square PNG, cut around the person's chosen focus (the same crop
 * the page shows). Null when the page isn't public or there's no photo stored here. Used by the
 * share image, which can't draw WebP.
 */
import { prisma } from "@/lib/prisma";
import { focusPoint, squareCrop } from "@/lib/avatar";
import { decodeDataUrl } from "@/server/avatar-response";
import { publicAvatarUserId } from "@/server/public-profile";

export async function profilePhotoPng(slug: string, size: number): Promise<Buffer | null> {
  const userId = await publicAvatarUserId(slug);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarImage: true, avatarPosition: true } });
  const decoded = user?.avatarImage ? decodeDataUrl(user.avatarImage) : null;
  if (!decoded) return null;
  try {
    const sharp = (await import("sharp")).default;
    const upright = await sharp(decoded.body, { failOn: "none" }).rotate().toBuffer({ resolveWithObject: true });
    const crop = squareCrop(upright.info.width, upright.info.height, focusPoint(user?.avatarPosition));
    return await sharp(upright.data)
      .extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size })
      .resize(size, size)
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
