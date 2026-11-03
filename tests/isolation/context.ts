/**
 * Who is calling right now. The mocks in setup.ts read this, so a route handler sees the
 * attacker's identity whichever way it asks for one (`auth()`, the mobile headers, cookies).
 */
export type CallerSession = { user: { id: string; email: string; workspaceId: string; role: string } } | null;

export const ctx: { session: CallerSession; headers: Headers } = {
  session: null,
  headers: new Headers(),
};
