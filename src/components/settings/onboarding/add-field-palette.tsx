"use client";

import { useEffect } from "react";
import {
  XMarkIcon,
  Bars3BottomLeftIcon,
  Bars3Icon,
  EnvelopeIcon,
  PhoneIcon,
  LinkIcon,
  HashtagIcon,
  ChevronUpDownIcon,
  ListBulletIcon,
  CheckIcon,
  InformationCircleIcon,
  UserIcon,
  BuildingOffice2Icon,
  MapPinIcon,
  CreditCardIcon,
  CubeIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { FIELD_TYPE_REGISTRY } from "@/lib/onboarding/field-types";
import {
  SYSTEM_FIELDS,
  SYSTEM_FIELD_GROUPS,
  systemFieldDef,
  type SystemFieldGroup,
} from "@/lib/onboarding/system-fields";
import type { OnboardingFieldDef, OnboardingFieldType } from "@/types/onboarding";

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const TYPE_ICON: Record<OnboardingFieldType, IconType> = {
  short_text: Bars3BottomLeftIcon,
  long_text: Bars3Icon,
  email: EnvelopeIcon,
  phone: PhoneIcon,
  url: LinkIcon,
  number: HashtagIcon,
  select: ChevronUpDownIcon,
  multiselect: ListBulletIcon,
  checkbox: CheckIcon,
  static: InformationCircleIcon,
  bank_details: BanknotesIcon,
};

const GROUP_ICON: Record<SystemFieldGroup, IconType> = {
  contact: UserIcon,
  company: BuildingOffice2Icon,
  address: MapPinIcon,
  billing: CreditCardIcon,
  product: CubeIcon,
  bank: BanknotesIcon,
};

function newId(): string {
  return `f-${crypto.randomUUID().slice(0, 8)}`;
}

export interface AddFieldPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Called with a ready-to-insert field def. */
  onPick: (field: OnboardingFieldDef) => void;
  /** systemKeys already present in the form — hidden from the Client-details list. */
  usedSystemKeys: Set<string>;
}

export function AddFieldPalette({ open, onClose, onPick, usedSystemKeys }: AddFieldPaletteProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const customTypes = Object.values(FIELD_TYPE_REGISTRY).filter((m) => m.custom);

  const pickSystem = (systemKey: string) => {
    const def = systemFieldDef(systemKey);
    if (def) onPick(def);
    onClose();
  };

  const pickCustom = (type: OnboardingFieldType) => {
    const base = FIELD_TYPE_REGISTRY[type].makeDefault();
    onPick({ id: newId(), ...base });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close palette" className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-[var(--shadow-lg)]"
        style={{ animation: "fieldPaletteSlide 220ms ease-out" }}
      >
        <div className="widget-header">
          <span className="widget-header__label">ADD A FIELD</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
            aria-label="Close palette"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
          {/* Client details — system fields not yet used */}
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
              Client details
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
              Built-in fields that map into the client record.
            </p>
            <div className="mt-3 space-y-5">
              {SYSTEM_FIELD_GROUPS.map((group) => {
                const keys = Object.values(SYSTEM_FIELDS)
                  .filter((f) => f.group === group.key && !usedSystemKeys.has(f.systemKey))
                  .map((f) => f.systemKey);
                if (keys.length === 0) return null;
                const GroupIcon = GROUP_ICON[group.key];
                return (
                  <div key={group.key}>
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-3)]">
                      <GroupIcon className="h-3.5 w-3.5 text-[var(--text-4)]" />
                      {group.label}
                    </p>
                    <ul className="grid grid-cols-1 gap-2">
                      {keys.map((key) => {
                        const entry = SYSTEM_FIELDS[key];
                        const Icon = TYPE_ICON[entry.type];
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => pickSystem(key)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-2.5 text-left transition",
                                "hover:border-[var(--brand-300)] hover:bg-[var(--brand-200)]/30",
                              )}
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-1)] text-[var(--brand-700)]">
                                <Icon className="h-4 w-4" />
                              </div>
                              <span className="text-sm font-medium text-[var(--text-1)]">{entry.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom questions — free field types */}
          <div className="border-t border-[var(--border-3)] pt-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
              Custom questions
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
              Free-form questions. Answers are stored and shown in review, not mapped to a client field.
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2">
              {customTypes.map((meta) => {
                const Icon = TYPE_ICON[meta.type];
                return (
                  <li key={meta.type}>
                    <button
                      type="button"
                      onClick={() => pickCustom(meta.type)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-3 text-left transition",
                        "hover:border-[var(--brand-300)] hover:bg-[var(--brand-200)]/30",
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-1)] text-[var(--brand-700)]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text-1)]">{meta.displayName}</p>
                        <p className="mt-0.5 text-xs leading-5 text-[var(--text-3)]">{meta.description}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fieldPaletteSlide {
          from {
            transform: translateX(40px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
