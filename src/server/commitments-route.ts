import { requireAuthedUser, type EffectiveUser } from "@/server/auth/effective-user";
import { CommitmentError } from "@/server/commitments";

/**
 * The signed-in person, for a Commitments route. Commitments are private: a Super Admin
 * "viewing as" someone is refused rather than shown that person's promises and messages.
 */
export async function commitmentsUser(req: Request): Promise<EffectiveUser> {
  const user = await requireAuthedUser(req);
  const viewingAs = req.headers.get("x-view-as-user");
  if (viewingAs && viewingAs === user.id) {
    throw new CommitmentError("Commitments are private, so they aren't shown while viewing as someone.", 403);
  }
  return user;
}
