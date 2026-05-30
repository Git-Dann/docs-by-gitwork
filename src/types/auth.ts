import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      permissions: string[];
      /** Bumped to force re-auth — see SESSION_VERSION in auth.config.ts. */
      sessionVersion?: number;
    } & DefaultSession["user"];
  }
}


export const MODULE_PERMISSIONS = [
  { id: "pulse", label: "Pulse", description: "Health and delivery tracking" },
  { id: "codeclear", label: "Code", description: "Dev review and validation" },
  { id: "proposals", label: "Docs", description: "Documentation and client outputs" },
  { id: "clients", label: "Portal", description: "Client management" },
  { id: "support", label: "Care", description: "Support and aftercare" },
  { id: "study", label: "Study", description: "AI-powered user research" },
] as const;

export type ModuleId = (typeof MODULE_PERMISSIONS)[number]["id"];
