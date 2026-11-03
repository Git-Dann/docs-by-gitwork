import Image from "next/image";
import type { ReactNode } from "react";

/** The shell of the sign-in side pages: forgot password, reset password, invite. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-1)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Image src="/foundry-logo.svg" alt="Foundry" width={120} height={36} />
        </div>
        <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-8 shadow-[var(--shadow-sm)]">
          <h1 className="text-2xl font-normal tracking-[-0.02em] text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </h1>
          {subtitle ? <p className="mt-1.5 text-sm text-[var(--text-3)]">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">{label}</span>
      {children}
    </label>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-[10px] bg-[var(--danger-50)] px-4 py-3 text-sm text-[var(--danger-500)]">
      {children}
    </p>
  );
}

export const authButtonClass =
  "w-full rounded-[10px] bg-[var(--brand-700)] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60";
