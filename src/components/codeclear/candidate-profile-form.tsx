"use client";

import { useTechStacks } from "@/hooks/use-codeclear";
import { cn } from "@/lib/format";
import { TECH_STACK_OPTIONS, type CandidateAvailability, type CandidateOrigin } from "@/types/codeclear";
import { StackPill } from "@/components/codeclear/codeclear-shared";

export interface CandidateProfileValue {
  name: string;
  githubHandle: string;
  email: string;
  primaryStack: string;
  techStacks: string[];
  location: string;
  bio: string;
  linkedinUrl: string;
  cvUrl: string;
  portfolioUrl: string;
  yearsExperience: string; // kept as string so the input stays controlled while empty
  hourlyRate: string;
  currency: string;
  timezone: string;
  availability: CandidateAvailability | "";
  origin: CandidateOrigin;
}

export const emptyCandidateProfile: CandidateProfileValue = {
  name: "",
  githubHandle: "",
  email: "",
  primaryStack: "",
  techStacks: [],
  location: "",
  bio: "",
  linkedinUrl: "",
  cvUrl: "",
  portfolioUrl: "",
  yearsExperience: "",
  hourlyRate: "",
  currency: "",
  timezone: "",
  availability: "",
  origin: "INTERNAL",
};

const COMMON_CURRENCIES = ["USD", "GBP", "EUR", "AED", "SAR", "CAD", "AUD"] as const;

const AVAILABILITY_LABELS: Record<CandidateAvailability, string> = {
  AVAILABLE: "Available",
  ENGAGED: "Engaged",
  UNAVAILABLE: "Unavailable",
};

/**
 * Shared add + edit form for a Candidate. Used by both the Add modal in the
 * candidates workspace and the Drawer's profile section. Strictly a controlled
 * component: hand it `value` + `onChange` and you own state. Stays UI-only —
 * the parent decides what to do with the value (POST / PATCH / dirty-track).
 */
export function CandidateProfileForm({
  value,
  onChange,
  showOriginToggle = false,
}: {
  value: CandidateProfileValue;
  onChange: (next: CandidateProfileValue) => void;
  /** Admin-only toggle. Surface in Settings or the Drawer's admin section. */
  showOriginToggle?: boolean;
}) {
  const stacksQuery = useTechStacks();
  // Fall back to the static list so the form still works before the API has
  // seeded (e.g. on first ever load). Tech stacks added via the API show up
  // automatically once the cache refreshes.
  const stackOptions =
    stacksQuery.data?.stacks.map((stack) => stack.name) ?? TECH_STACK_OPTIONS;

  function patch<K extends keyof CandidateProfileValue>(key: K, next: CandidateProfileValue[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="space-y-5">
      {/* Identity */}
      <Section title="Identity">
        <Field label="Name">
          <input
            value={value.name}
            onChange={(event) => patch("name", event.target.value)}
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <Field label="GitHub handle">
          <input
            value={value.githubHandle}
            onChange={(event) => patch("githubHandle", event.target.value.replace(/^@+/, ""))}
            placeholder="username"
            className="app-input font-mono"
            autoComplete="off"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={value.email}
            onChange={(event) => patch("email", event.target.value)}
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <Field label="Location">
          <input
            value={value.location}
            onChange={(event) => patch("location", event.target.value)}
            className="app-input"
            autoComplete="off"
          />
        </Field>
      </Section>

      {/* Tech */}
      <Section title="Tech stack">
        <Field label="Primary stack" span="full">
          <input
            value={value.primaryStack}
            onChange={(event) => patch("primaryStack", event.target.value)}
            placeholder="e.g. TypeScript, Swift"
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <div className="col-span-full">
          <p className="text-xs font-medium text-[var(--text-3)]">Additional stacks</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stackOptions.map((stack) => {
              const active = value.techStacks.includes(stack);
              return (
                <button
                  key={stack}
                  type="button"
                  onClick={() =>
                    patch(
                      "techStacks",
                      active
                        ? value.techStacks.filter((entry) => entry !== stack)
                        : [...value.techStacks, stack],
                    )
                  }
                >
                  <StackPill label={stack} tone="stack" selected={active} />
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Validation signal sources */}
      <Section title="Validation links">
        <Field label="LinkedIn URL">
          <input
            value={value.linkedinUrl}
            onChange={(event) => patch("linkedinUrl", event.target.value)}
            placeholder="https://linkedin.com/in/…"
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <Field label="CV URL">
          <input
            value={value.cvUrl}
            onChange={(event) => patch("cvUrl", event.target.value)}
            placeholder="https://…"
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <Field label="Portfolio URL">
          <input
            value={value.portfolioUrl}
            onChange={(event) => patch("portfolioUrl", event.target.value)}
            placeholder="https://…"
            className="app-input"
            autoComplete="off"
          />
        </Field>
      </Section>

      {/* Commercials */}
      <Section title="Commercials">
        <Field label="Years of experience">
          <input
            type="number"
            min={0}
            max={60}
            value={value.yearsExperience}
            onChange={(event) => patch("yearsExperience", event.target.value)}
            className="app-input"
          />
        </Field>
        <Field label="Hourly rate">
          <input
            type="number"
            min={0}
            step="0.01"
            value={value.hourlyRate}
            onChange={(event) => patch("hourlyRate", event.target.value)}
            className="app-input"
          />
        </Field>
        <Field label="Currency">
          <select
            value={value.currency}
            onChange={(event) => patch("currency", event.target.value.toUpperCase())}
            className="app-select"
          >
            <option value="">—</option>
            {COMMON_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Timezone">
          <input
            value={value.timezone}
            onChange={(event) => patch("timezone", event.target.value)}
            placeholder="e.g. Europe/London"
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <Field label="Availability">
          <select
            value={value.availability}
            onChange={(event) =>
              patch("availability", event.target.value as CandidateAvailability | "")
            }
            className="app-select"
          >
            <option value="">Auto (from placements)</option>
            {(Object.keys(AVAILABILITY_LABELS) as CandidateAvailability[]).map((entry) => (
              <option key={entry} value={entry}>
                {AVAILABILITY_LABELS[entry]}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Bio */}
      <Section title="About">
        <Field label="Bio" span="full">
          <textarea
            value={value.bio}
            onChange={(event) => patch("bio", event.target.value)}
            rows={3}
            className="app-input min-h-[88px] resize-y"
          />
        </Field>
      </Section>

      {showOriginToggle ? (
        <Section title="Origin (admin)">
          <Field label="Roster" span="full">
            <div className="flex gap-1.5">
              {(["INTERNAL", "EXTERNAL"] as const).map((origin) => (
                <button
                  key={origin}
                  type="button"
                  onClick={() => patch("origin", origin)}
                  className={cn(
                    "rounded-[6px] border px-3 py-1.5 text-xs font-semibold transition",
                    value.origin === origin
                      ? "border-[var(--brand-600)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:border-[var(--border-1)]",
                  )}
                >
                  {origin === "INTERNAL" ? "Internal (Gitwork team)" : "External (catalogue)"}
                </button>
              ))}
            </div>
          </Field>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="widget-data-label mb-3">{title}</p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
  span = "half",
}: {
  label: string;
  children: React.ReactNode;
  span?: "half" | "full";
}) {
  return (
    <label className={cn("space-y-1.5", span === "full" ? "col-span-full" : "")}>
      <span className="text-xs font-medium text-[var(--text-3)]">{label}</span>
      {children}
    </label>
  );
}
