"use client";

import {
  ArrowTopRightOnSquareIcon,
  CodeBracketIcon,
  GlobeAltIcon,
  PencilIcon,
  PlusIcon,
  SignalIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { LogoImagePicker } from "@/components/ui/logo-image-picker";
import { ClientDesignFormModal } from "@/components/clients/client-design-form";
import { ClientPlatformFormModal } from "@/components/clients/client-platform-form";
import { StatusBadge } from "@/components/status-badge";
import {
  useClientDetail,
  useCreateClientDesign,
  useCreateClientPlatform,
  useDeleteClientDesign,
  useDeleteClientPlatform,
  useUpdateClient,
  useUpdateClientDesign,
  useUpdateClientPlatform,
} from "@/hooks/use-proposals";
import { formatDate } from "@/lib/format";
import type { ClientDesignRecord, ClientDetailFields, ClientPlatformRecord } from "@/types/client";

type EditFormState = {
  name: string;
  logoUrl: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
  notes: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  googleDriveFolderUrl: string;
  clickupUrl: string;
};

export function ClientDetail({ slug }: { slug: string }) {
  const { data, isPending, error } = useClientDetail(slug);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [platformModal, setPlatformModal] = useState<{
    open: boolean;
    platform: ClientPlatformRecord | null;
  }>({ open: false, platform: null });
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [deletingPlatformId, setDeletingPlatformId] = useState<string | null>(null);

  const [designModal, setDesignModal] = useState<{
    open: boolean;
    design: ClientDesignRecord | null;
  }>({ open: false, design: null });
  const [designError, setDesignError] = useState<string | null>(null);
  const [deletingDesignId, setDeletingDesignId] = useState<string | null>(null);

  const updateClientMutation = useUpdateClient(slug);
  const createPlatformMutation = useCreateClientPlatform(slug);
  const createDesignMutation = useCreateClientDesign(slug);

  if (isPending) {
    return <p className="text-sm text-[var(--text-3)]">Loading client...</p>;
  }

  if (error || !data) {
    return (
      <p className="text-sm text-rose-700">
        {(error as Error)?.message ?? "Client unavailable"}
      </p>
    );
  }

  const { client, proposals, proofDocuments, platforms, designs, pulseScans, supportClient, placements } = data;
  const isSuggested = client.source === "SUGGESTED";

  function openEdit() {
    setEditForm({
      name: client.name,
      logoUrl: client.logoUrl ?? "",
      website: client.website ?? "",
      addressLine1: client.addressLine1 ?? "",
      addressLine2: client.addressLine2 ?? "",
      city: client.city ?? "",
      postcode: client.postcode ?? "",
      country: client.country ?? "",
      notes: client.notes ?? "",
      primaryContactName: client.primaryContactName ?? "",
      primaryContactEmail: client.primaryContactEmail ?? "",
      primaryContactPhone: client.primaryContactPhone ?? "",
      googleDriveFolderUrl: client.googleDriveFolderUrl ?? "",
      clickupUrl: client.clickupUrl ?? "",
    });
    setEditing(true);
  }

  async function handleSaveClient() {
    if (!editForm) return;
    setEditError(null);

    try {
      await updateClientMutation.mutateAsync({
        name: editForm.name,
        logoUrl: editForm.logoUrl || undefined,
        website: editForm.website || undefined,
        addressLine1: editForm.addressLine1 || undefined,
        addressLine2: editForm.addressLine2 || undefined,
        city: editForm.city || undefined,
        postcode: editForm.postcode || undefined,
        country: editForm.country || undefined,
        notes: editForm.notes || undefined,
        primaryContactName: editForm.primaryContactName || undefined,
        primaryContactEmail: editForm.primaryContactEmail || undefined,
        primaryContactPhone: editForm.primaryContactPhone || undefined,
        googleDriveFolderUrl: editForm.googleDriveFolderUrl || undefined,
        clickupUrl: editForm.clickupUrl || undefined,
      });
      setEditing(false);
      setEditForm(null);
    } catch (err) {
      setEditError((err as Error).message);
    }
  }

  async function handleSavePlatform(input: {
    name: string;
    platformType?: string;
    url?: string;
    stagingUrl?: string;
    repoUrl?: string;
    credentials?: string;
    notes?: string;
  }) {
    setPlatformError(null);

    try {
      if (platformModal.platform) {
        // This will be handled by each card's own update mutation
      } else {
        await createPlatformMutation.mutateAsync(input);
      }
      setPlatformModal({ open: false, platform: null });
    } catch (err) {
      setPlatformError((err as Error).message);
    }
  }

  async function handleSaveDesign(input: {
    name: string;
    url?: string;
    notes?: string;
  }) {
    setDesignError(null);

    try {
      if (designModal.design) {
        // handled by each card's own update mutation
      } else {
        await createDesignMutation.mutateAsync(input);
      }
      setDesignModal({ open: false, design: null });
    } catch (err) {
      setDesignError((err as Error).message);
    }
  }

  const addressParts = [
    client.addressLine1,
    client.addressLine2,
    client.city,
    client.postcode,
    client.country,
  ].filter(Boolean);

  const hasContactInfo =
    client.primaryContactName ||
    client.primaryContactEmail ||
    client.primaryContactPhone ||
    addressParts.length > 0 ||
    client.website;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <section className="app-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)]">
              {client.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={client.logoUrl}
                  alt={`${client.name} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-semibold text-[var(--text-2)]">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--text-1)]">
                  {client.name}
                </h2>
                {isSuggested && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
                    <SparklesIcon className="h-3.5 w-3.5 text-[var(--brand-700)]" />
                    Suggested
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                {client.website && (
                  <a
                    href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-700)] hover:underline"
                  >
                    <GlobeAltIcon className="h-4 w-4" />
                    {client.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {client.googleDriveFolderUrl && (
                  <a
                    href={client.googleDriveFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)]"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    Google Drive
                  </a>
                )}
                {client.clickupUrl && (
                  <a
                    href={client.clickupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)]"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    ClickUp
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="md" onClick={openEdit}>
              <PencilIcon className="h-4 w-4" />
              Edit client
            </Button>
          </div>
        </div>
      </section>

      {/* ── Stats row ── */}
      <section className="grid gap-4 sm:grid-cols-4">
        <SummaryCard label="WIP Docs" value={String(proposals.length)} />
        <SummaryCard label="Platforms" value={String(platforms.length)} />
        <SummaryCard label="Designs" value={String(designs.length)} />
        <SummaryCard label="Pulse scans" value={String(pulseScans.length)} />
      </section>

      {/* ── Contact ── */}
      {hasContactInfo && (
        <section className="app-card p-6">
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            Contact
          </h3>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(client.primaryContactName || client.primaryContactEmail || client.primaryContactPhone) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                  Primary contact
                </p>
                {client.primaryContactName && (
                  <p className="text-sm font-medium text-[var(--text-1)]">
                    {client.primaryContactName}
                  </p>
                )}
                {client.primaryContactEmail && (
                  <a
                    href={`mailto:${client.primaryContactEmail}`}
                    className="block text-sm text-[var(--brand-700)] hover:underline"
                  >
                    {client.primaryContactEmail}
                  </a>
                )}
                {client.primaryContactPhone && (
                  <a
                    href={`tel:${client.primaryContactPhone}`}
                    className="block text-sm text-[var(--text-2)]"
                  >
                    {client.primaryContactPhone}
                  </a>
                )}
              </div>
            )}

            {addressParts.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                  Address
                </p>
                {[client.addressLine1, client.addressLine2].filter(Boolean).map((line, i) => (
                  <p key={i} className="text-sm text-[var(--text-2)]">
                    {line}
                  </p>
                ))}
                {(client.city || client.postcode) && (
                  <p className="text-sm text-[var(--text-2)]">
                    {[client.city, client.postcode].filter(Boolean).join(", ")}
                  </p>
                )}
                {client.country && (
                  <p className="text-sm text-[var(--text-2)]">{client.country}</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Platforms ── */}
      <section className="app-card">
        <div className="flex items-center justify-between border-b border-[var(--border-3)] px-6 py-4">
          <div>
            <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              Platforms
            </h3>
            <p className="mt-0.5 text-sm text-[var(--text-3)]">
              External builds, dashboards, and tools delivered for this client
            </p>
          </div>
          {!isSuggested && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setPlatformError(null);
                setPlatformModal({ open: true, platform: null });
              }}
            >
              <PlusIcon className="h-4 w-4" />
              Add platform
            </Button>
          )}
        </div>

        <div className="p-6">
          {platforms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-2)] py-10 text-center">
              <p className="text-sm text-[var(--text-4)]">
                {isSuggested
                  ? "Save this client to start adding platforms."
                  : "No platforms added yet. Click “Add platform” to start."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {platforms.map((platform) => (
                <PlatformCard
                  key={platform.id}
                  platform={platform}
                  slug={slug}
                  deletingId={deletingPlatformId}
                  setDeletingId={setDeletingPlatformId}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Designs ── */}
      <section className="app-card">
        <div className="flex items-center justify-between border-b border-[var(--border-3)] px-6 py-4">
          <div>
            <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              Designs
            </h3>
            <p className="mt-0.5 text-sm text-[var(--text-3)]">
              Figma files and other design assets for this client
            </p>
          </div>
          {!isSuggested && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setDesignError(null);
                setDesignModal({ open: true, design: null });
              }}
            >
              <PlusIcon className="h-4 w-4" />
              Add design
            </Button>
          )}
        </div>

        <div className="p-6">
          {designs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-2)] py-10 text-center">
              <p className="text-sm text-[var(--text-4)]">
                {isSuggested
                  ? "Save this client to start adding design files."
                  : "No design files added yet. Click “Add design” to start."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {designs.map((design) => (
                <DesignCard
                  key={design.id}
                  design={design}
                  slug={slug}
                  deletingId={deletingDesignId}
                  setDeletingId={setDeletingDesignId}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Notes ── */}
      {client.notes && (
        <section className="app-card p-6">
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            Notes
          </h3>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text-2)]">
            {client.notes}
          </p>
        </section>
      )}

      {/* ── Foundry Activity ── */}
      <section className="space-y-4">
        {/* WIP Documents */}
        <div className="app-table-shell">
          <div className="border-b border-[var(--border-3)] px-5 py-4">
            <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              WIP Documents
            </h3>
            <p className="mt-0.5 text-sm text-[var(--text-3)]">
              Proposals and documents linked to this client
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="app-table min-w-full">
              <thead>
                <tr>
                  <th className="text-left">Document</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Updated</th>
                  <th className="text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {proposals.length ? (
                  proposals.map((proposal) => (
                    <tr key={proposal.id}>
                      <td>
                        <p className="font-medium text-[var(--text-1)]">{proposal.title}</p>
                      </td>
                      <td>
                        <StatusBadge status={proposal.status} />
                      </td>
                      <td className="text-[var(--text-3)]">{formatDate(proposal.updatedAt)}</td>
                      <td>
                        <Link
                          href={`/app/docs/${proposal.id}`}
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                      No documents linked yet. Add a client name to any WIP document to link it here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pulse Scans */}
        {pulseScans.length > 0 && (
          <div className="app-table-shell">
            <div className="border-b border-[var(--border-3)] px-5 py-4">
              <div className="flex items-center gap-2">
                <SignalIcon className="h-4 w-4 text-[var(--text-3)]" />
                <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                  Pulse Scans
                </h3>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="app-table min-w-full">
                <thead>
                  <tr>
                    <th className="text-left">Project</th>
                    <th className="text-left">Score</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Date</th>
                    <th className="text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pulseScans.map((scan) => (
                    <tr key={scan.id}>
                      <td className="font-medium text-[var(--text-1)]">{scan.projectName}</td>
                      <td>
                        {scan.healthScore !== null ? (
                          <span className="font-semibold">{scan.healthScore}</span>
                        ) : (
                          <span className="text-[var(--text-4)]">—</span>
                        )}
                      </td>
                      <td>
                        <span className="text-sm capitalize text-[var(--text-3)]">
                          {scan.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="text-[var(--text-3)]">{formatDate(scan.createdAt)}</td>
                      <td>
                        <Link
                          href={`/app/pulse/${scan.id}`}
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Proof Documents */}
        {proofDocuments.length > 0 && (
          <div className="app-table-shell">
            <div className="border-b border-[var(--border-3)] px-5 py-4">
              <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                Proof Documents
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="app-table min-w-full">
                <thead>
                  <tr>
                    <th className="text-left">Document</th>
                    <th className="text-left">Source</th>
                    <th className="text-left">Updated</th>
                    <th className="text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {proofDocuments.map((document) => (
                    <tr key={document.id}>
                      <td className="font-medium text-[var(--text-1)]">{document.title}</td>
                      <td className="text-[var(--text-3)]">{document.proposalTitle || "—"}</td>
                      <td className="text-[var(--text-3)]">{formatDate(document.updatedAt)}</td>
                      <td>
                        <a
                          href={document.shareUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Developers */}
        {placements && placements.length > 0 && (
          <div className="app-table-shell">
            <div className="border-b border-[var(--border-3)] px-5 py-4">
              <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                Developers
              </h3>
              <p className="mt-0.5 text-sm text-[var(--text-3)]">
                Developers placed with this client via CodeClear
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="app-table min-w-full">
                <thead>
                  <tr>
                    <th className="text-left">Developer</th>
                    <th className="text-left">Project</th>
                    <th className="text-left">Start</th>
                    <th className="text-left">End</th>
                    <th className="text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {placements.map((placement) => (
                    <tr key={placement.id}>
                      <td className="font-medium text-[var(--text-1)]">{placement.candidateName}</td>
                      <td className="text-[var(--text-3)]">{placement.projectName}</td>
                      <td className="text-[var(--text-3)]">{formatDate(placement.startDate)}</td>
                      <td className="text-[var(--text-3)]">{placement.endDate ? formatDate(placement.endDate) : "Present"}</td>
                      <td>
                        <Link
                          href={`/app/codeclear?candidate=${placement.candidateId}`}
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Profile
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Care / Support link */}
        {supportClient && (
          <div className="app-card flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                Care
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--text-1)]">
                {supportClient.name}
              </p>
            </div>
            <Link
              href={`/app/care`}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              Open in Care
            </Link>
          </div>
        )}
      </section>

      {/* ── Edit client modal ── */}
      {editing && editForm && (
        <ClientEditModal
          form={editForm}
          onChange={setEditForm}
          onSave={() => void handleSaveClient()}
          onClose={() => {
            setEditing(false);
            setEditForm(null);
            setEditError(null);
          }}
          isSaving={updateClientMutation.isPending}
          error={editError}
        />
      )}

      {/* ── Platform modal (create only — edit handled in card) ── */}
      {platformModal.open && !platformModal.platform && (
        <ClientPlatformFormModal
          onSave={(input) => void handleSavePlatform(input)}
          onClose={() => setPlatformModal({ open: false, platform: null })}
          isSaving={createPlatformMutation.isPending}
          error={platformError}
        />
      )}

      {/* ── Design modal (create only — edit handled in card) ── */}
      {designModal.open && !designModal.design && (
        <ClientDesignFormModal
          onSave={(input) => void handleSaveDesign(input)}
          onClose={() => setDesignModal({ open: false, design: null })}
          isSaving={createDesignMutation.isPending}
          error={designError}
        />
      )}
    </div>
  );
}

function PlatformCard({
  platform,
  slug,
  deletingId,
  setDeletingId,
}: {
  platform: ClientPlatformRecord;
  slug: string;
  deletingId: string | null;
  setDeletingId: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateMutation = useUpdateClientPlatform(slug, platform.id);
  const deleteMutation = useDeleteClientPlatform(slug);

  async function handleSave(input: {
    name: string;
    platformType?: string;
    url?: string;
    stagingUrl?: string;
    repoUrl?: string;
    credentials?: string;
    notes?: string;
  }) {
    setError(null);
    try {
      await updateMutation.mutateAsync(input);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete() {
    setDeletingId(platform.id);
    try {
      await deleteMutation.mutateAsync(platform.id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <article
        className="app-card flex flex-col p-4 cursor-pointer hover:border-[var(--border-1)] transition-colors"
        onClick={() => setEditing(true)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[var(--text-1)]">{platform.name}</p>
            {platform.platformType && (
              <span className="mt-1 inline-block rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs text-[var(--text-3)]">
                {platform.platformType}
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
              title="Edit platform"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deletingId === platform.id}
              className="rounded p-1 text-[var(--text-4)] hover:bg-rose-50 hover:text-rose-600"
              title="Delete platform"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          {platform.url && (
            <a
              href={platform.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--brand-700)] hover:underline"
            >
              <GlobeAltIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{platform.url.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
          {platform.stagingUrl && (
            <a
              href={platform.stagingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--text-3)] hover:text-[var(--text-1)]"
            >
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Staging</span>
            </a>
          )}
          {platform.repoUrl && (
            <a
              href={platform.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--text-3)] hover:text-[var(--text-1)]"
            >
              <CodeBracketIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Repository</span>
            </a>
          )}
        </div>

        {platform.notes && (
          <p className="mt-3 border-t border-[var(--border-3)] pt-3 text-xs leading-5 text-[var(--text-3)]">
            {platform.notes}
          </p>
        )}
      </article>

      {editing && (
        <ClientPlatformFormModal
          platform={platform}
          onSave={(input) => void handleSave(input)}
          onClose={() => {
            setEditing(false);
            setError(null);
          }}
          isSaving={updateMutation.isPending}
          error={error}
        />
      )}
    </>
  );
}

function DesignCard({
  design,
  slug,
  deletingId,
  setDeletingId,
}: {
  design: ClientDesignRecord;
  slug: string;
  deletingId: string | null;
  setDeletingId: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateMutation = useUpdateClientDesign(slug, design.id);
  const deleteMutation = useDeleteClientDesign(slug);

  async function handleSave(input: { name: string; url?: string; notes?: string }) {
    setError(null);
    try {
      await updateMutation.mutateAsync(input);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete() {
    setDeletingId(design.id);
    try {
      await deleteMutation.mutateAsync(design.id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <article
        className="app-card flex flex-col p-4 cursor-pointer hover:border-[var(--border-1)] transition-colors"
        onClick={() => setEditing(true)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[var(--text-1)]">{design.name}</p>
          </div>
          <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
              title="Edit design"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deletingId === design.id}
              className="rounded p-1 text-[var(--text-4)] hover:bg-rose-50 hover:text-rose-600"
              title="Delete design"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          {design.url && (
            <a
              href={design.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--brand-700)] hover:underline"
            >
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{design.url.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
        </div>

        {design.notes && (
          <p className="mt-3 border-t border-[var(--border-3)] pt-3 text-xs leading-5 text-[var(--text-3)]">
            {design.notes}
          </p>
        )}
      </article>

      {editing && (
        <ClientDesignFormModal
          design={design}
          onSave={(input) => void handleSave(input)}
          onClose={() => {
            setEditing(false);
            setError(null);
          }}
          isSaving={updateMutation.isPending}
          error={error}
        />
      )}
    </>
  );
}

function ClientEditModal({
  form,
  onChange,
  onSave,
  onClose,
  isSaving,
  error,
}: {
  form: EditFormState;
  onChange: (form: EditFormState) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  function set(field: keyof EditFormState, value: string) {
    onChange({ ...form, [field]: value });
  }

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close"
        className="app-dialog-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="app-dialog-panel w-full max-w-2xl p-6">
          <p className="app-eyebrow">Client</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
            Edit client
          </h2>

          <div className="mt-5 max-h-[65vh] space-y-5 overflow-y-auto pr-1">
            {/* Identity */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="app-field-label">Client name</span>
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="app-input"
                />
              </label>
              <div>
                <span className="app-field-label mb-2 block">Logo</span>
                <LogoImagePicker
                  value={form.logoUrl}
                  onChange={(value) => set("logoUrl", value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="app-field-label">Website</span>
                <input
                  value={form.website}
                  onChange={(e) => set("website", e.target.value)}
                  className="app-input"
                  placeholder="https://client.com"
                />
              </label>
              <label className="block">
                <span className="app-field-label">Google Drive folder URL</span>
                <input
                  value={form.googleDriveFolderUrl}
                  onChange={(e) => set("googleDriveFolderUrl", e.target.value)}
                  className="app-input"
                  placeholder="https://drive.google.com/drive/folders/…"
                  type="url"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="app-field-label">ClickUp folder URL</span>
                <input
                  value={form.clickupUrl}
                  onChange={(e) => set("clickupUrl", e.target.value)}
                  className="app-input"
                  placeholder="https://app.clickup.com/…"
                  type="url"
                />
              </label>
            </div>

            <div className="border-t border-[var(--border-2)] pt-4">
              <p className="mb-3 text-sm font-medium text-[var(--text-2)]">Primary contact</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="app-field-label">Name</span>
                  <input
                    value={form.primaryContactName}
                    onChange={(e) => set("primaryContactName", e.target.value)}
                    className="app-input"
                    placeholder="Jane Smith"
                  />
                </label>
                <label className="block">
                  <span className="app-field-label">Email</span>
                  <input
                    value={form.primaryContactEmail}
                    onChange={(e) => set("primaryContactEmail", e.target.value)}
                    className="app-input"
                    placeholder="jane@client.com"
                    type="email"
                  />
                </label>
                <label className="block">
                  <span className="app-field-label">Phone</span>
                  <input
                    value={form.primaryContactPhone}
                    onChange={(e) => set("primaryContactPhone", e.target.value)}
                    className="app-input"
                    placeholder="+44 7700 000000"
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-[var(--border-2)] pt-4">
              <p className="mb-3 text-sm font-medium text-[var(--text-2)]">Address</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="app-field-label">Address line 1</span>
                  <input
                    value={form.addressLine1}
                    onChange={(e) => set("addressLine1", e.target.value)}
                    className="app-input"
                    placeholder="123 High Street"
                  />
                </label>
                <label className="block">
                  <span className="app-field-label">Address line 2</span>
                  <input
                    value={form.addressLine2}
                    onChange={(e) => set("addressLine2", e.target.value)}
                    className="app-input"
                    placeholder="Floor 2"
                  />
                </label>
                <label className="block">
                  <span className="app-field-label">City</span>
                  <input
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    className="app-input"
                    placeholder="London"
                  />
                </label>
                <label className="block">
                  <span className="app-field-label">Postcode</span>
                  <input
                    value={form.postcode}
                    onChange={(e) => set("postcode", e.target.value)}
                    className="app-input"
                    placeholder="SW1A 1AA"
                  />
                </label>
                <label className="block">
                  <span className="app-field-label">Country</span>
                  <input
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    className="app-input"
                    placeholder="United Kingdom"
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-[var(--border-2)] pt-4">
              <label className="block">
                <span className="app-field-label">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className="app-input min-h-[80px] resize-y"
                  placeholder="General notes about this client…"
                />
              </label>
            </div>

            {error && <p className="text-sm text-rose-700">{error}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={isSaving}
              onClick={onSave}
            >
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="app-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
        {value}
      </p>
    </article>
  );
}
