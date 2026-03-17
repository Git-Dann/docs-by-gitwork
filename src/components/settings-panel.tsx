"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CompanyProfile {
  preparedBy: string;
  team: string;
  contactDetails: string;
}

const defaultProfile: CompanyProfile = {
  preparedBy: "Gitwork Delivery Team",
  team: "Product & Delivery",
  contactDetails: "hello@gitwork.io",
};

const defaultSnippets = [
  "Stakeholder feedback SLA: 2 business days.",
  "Client to provide legal copy prior to implementation phase.",
];

function loadProfile(): CompanyProfile {
  if (typeof window === "undefined") {
    return defaultProfile;
  }

  try {
    const raw = localStorage.getItem("gitwork.companyProfile");
    if (!raw) {
      return defaultProfile;
    }

    return {
      ...defaultProfile,
      ...(JSON.parse(raw) as Partial<CompanyProfile>),
    };
  } catch {
    return defaultProfile;
  }
}

function loadSnippets(): string[] {
  if (typeof window === "undefined") {
    return defaultSnippets;
  }

  try {
    const raw = localStorage.getItem("gitwork.snippets");
    if (!raw) {
      return defaultSnippets;
    }

    const parsed = JSON.parse(raw) as string[];
    return parsed.length ? parsed : defaultSnippets;
  } catch {
    return defaultSnippets;
  }
}

export function SettingsPanel() {
  const [profile, setProfile] = useState<CompanyProfile>(loadProfile);
  const [snippets, setSnippets] = useState<string[]>(loadSnippets);
  const [saved, setSaved] = useState(false);

  function persist() {
    localStorage.setItem("gitwork.companyProfile", JSON.stringify(profile));
    localStorage.setItem("gitwork.snippets", JSON.stringify(snippets));
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <h2 className="text-base font-semibold">Default company profile</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Applied to sign-off blocks and proposal defaults.
        </p>

        <div className="mt-4 space-y-2">
          <Input
            label="Prepared by"
            value={profile.preparedBy}
            onChange={(preparedBy) => setProfile((previous) => ({ ...previous, preparedBy }))}
          />
          <Input
            label="Team / department"
            value={profile.team}
            onChange={(team) => setProfile((previous) => ({ ...previous, team }))}
          />
          <Input
            label="Contact details"
            value={profile.contactDetails}
            onChange={(contactDetails) =>
              setProfile((previous) => ({ ...previous, contactDetails }))
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <h2 className="text-base font-semibold">Reusable snippets</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Fast-insert content snippets for assumptions and other sections.
        </p>

        <div className="mt-4 space-y-2">
          {snippets.map((snippet, index) => (
            <div key={`${snippet}-${index}`} className="flex items-center gap-2">
              <input
                value={snippet}
                onChange={(event) =>
                  setSnippets((previous) =>
                    previous.map((entry, entryIndex) =>
                      entryIndex === index ? event.target.value : entry,
                    ),
                  )
                }
                className="h-9 flex-1 rounded-md border border-[var(--border-1)] px-2 text-sm"
              />
              <Button
                type="button"
                onClick={() =>
                  setSnippets((previous) => previous.filter((_, entryIndex) => entryIndex !== index))
                }
                variant="danger"
                size="sm"
              >
                Remove
              </Button>
            </div>
          ))}

          <Button
            type="button"
            onClick={() => setSnippets((previous) => [...previous, ""])}
            variant="secondary"
            size="sm"
          >
            Add snippet
          </Button>
        </div>
      </section>

      <div className="lg:col-span-2">
        <Button
          type="button"
          onClick={persist}
          variant="primary"
          size="md"
        >
          {saved ? "Saved" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-[var(--text-3)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
      />
    </label>
  );
}
