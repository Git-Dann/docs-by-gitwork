"use client";

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  BeakerIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  CodeBracketIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowUpRightIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  SignalIcon,
  SparklesIcon,
  TrashIcon,
  VideoCameraIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { LogoImagePicker } from "@/components/ui/logo-image-picker";
import { ClientDesignFormModal } from "@/components/clients/client-design-form";
import { ClientPlatformFormModal } from "@/components/clients/client-platform-form";
import { StatusBadge } from "@/components/status-badge";
import {
  useClientDetail,
  useClientMeetings,
  useClientSlackActivity,
  useIngestClientMeeting,
  useToggleMeetingActionItem,
  useCreateClientDesign,
  useCreateClientPlatform,
  useDeleteClientDesign,
  useDeleteClientPlatform,
  useOgPreview,
  useRevealClientBank,
  useSetClientStatus,
  useUpdateClient,
  useUpdateClientDesign,
  useUpdateClientPlatform,
} from "@/hooks/use-proposals";
import { useCreateTask } from "@/hooks/use-tasks";
import { cn, formatDate } from "@/lib/format";
import { fetchSlackChannels, type SlackAvailableChannel, type ScribeMeeting } from "@/lib/api";
import type {
  ClientBankReveal,
  ClientBankSummary,
  ClientDesignRecord,
  ClientPlatformRecord,
} from "@/types/client";

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
  slackChannelId: string;
};

export function ClientDetail({ slug }: { slug: string }) {
  const { data, isPending, error } = useClientDetail(slug);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
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
  const slackActivity = useClientSlackActivity(slug);

  if (isPending) {
    return (
      <div className="widget-card">
        <div className="widget-body py-16 text-center">
          <p className="widget-data-label animate-pulse">Loading client…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="widget-card">
        <div className="widget-body py-16 text-center">
          <p className="text-sm text-rose-700">
            {(error as Error)?.message ?? "Client unavailable"}
          </p>
        </div>
      </div>
    );
  }

  const { client, proposals, proofDocuments, platforms, designs, pulseScans, supportClient, placements, studies } = data;
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
      slackChannelId: client.slackChannelId ?? "",
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
        slackChannelId: editForm.slackChannelId || undefined,
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
      if (!platformModal.platform) {
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
      if (!designModal.design) {
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
    <div className="space-y-5">

      {client.status === "PENDING_REVIEW" && (
        <PendingReviewBanner
          slug={slug}
          companyName={client.legalCompanyName ?? client.name}
        />
      )}

      {/* ── 01 // CLIENT RECORD ── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // CLIENT RECORD"}
          </span>
          <div className="flex items-center gap-2">
            {isSuggested && (
              <span className="flex items-center gap-1 rounded-[4px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-3)]"
                style={{ fontFamily: "var(--font-mono)" }}>
                <SparklesIcon className="h-3 w-3 text-[var(--brand-700)]" />
                Suggested
              </span>
            )}
            {supportClient && (
              <Link
                href="/app/care"
                title="Open in Care"
                className="flex items-center gap-1 rounded-[4px] border border-[var(--mist-border)] bg-[var(--mist)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)] transition hover:opacity-80"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <ChatBubbleLeftRightIcon className="h-3 w-3" />
                Care
              </Link>
            )}
            {/* Integration quick-links */}
            {client.googleDriveFolderUrl && (
              <a
                href={client.googleDriveFolderUrl}
                target="_blank"
                rel="noreferrer"
                title="Open Google Drive folder"
                className="opacity-40 hover:opacity-80 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.google.com/s2/favicons?domain=drive.google.com&sz=16"
                  alt="Google Drive"
                  className="h-4 w-4 grayscale"
                />
              </a>
            )}
            {client.clickupUrl && (
              <a
                href={client.clickupUrl}
                target="_blank"
                rel="noreferrer"
                title="Open ClickUp folder"
                className="opacity-40 hover:opacity-80 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.google.com/s2/favicons?domain=app.clickup.com&sz=16"
                  alt="ClickUp"
                  className="h-4 w-4 grayscale"
                />
              </a>
            )}
            <Button type="button" variant="secondary" size="xs" onClick={openEdit}>
              <PencilIcon className="h-3 w-3" />
              Edit
            </Button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-start gap-5">
            {/* Avatar */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)]">
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

            {/* Identity */}
            <div className="flex-1">
              <h2
                className="text-3xl leading-none tracking-[-0.03em] text-[var(--text-1)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {client.name}
              </h2>

              {/* External links */}
              {(client.website || client.googleDriveFolderUrl || client.clickupUrl) && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
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
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
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
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      ClickUp
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Bank details — only rendered when on file. Opens the reveal
                modal so it stays out of the way until it's actually needed. */}
            {client.bank?.onFile && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-center"
                onClick={() => setBankOpen(true)}
              >
                <BanknotesIcon className="h-4 w-4 text-[var(--brand-700)]" />
                Bank details
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ── 02-06 // STATS ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard number="02" label="DOCS" value={proposals.length} />
        <StatCard number="03" label="PLATFORMS" value={platforms.length} />
        <StatCard number="04" label="DESIGNS" value={designs.length} />
        <StatCard number="05" label="PULSE SCANS" value={pulseScans.length} />
        <StatCard
          number="06"
          label="DEVS"
          value={(placements ?? []).filter((p) => !p.endDate).length}
          action={
            <Link
              href={`/app/portal/${slug}/tasks`}
              className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
            >
              Tasks →
            </Link>
          }
        />
      </div>

      {/* ── 07 // SLACK ACTIVITY ── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">07</span>
            {" // SLACK ACTIVITY"}
          </span>
          <div className="flex items-center gap-2">
            {slackActivity.data?.channelName && client.slackChannelId && (
              <a
                href={`https://slack.com/app_redirect?channel=${client.slackChannelId}`}
                target="_blank"
                rel="noreferrer"
                className="widget-header__status hover:text-[var(--brand-700)] transition-colors"
                title="Open in Slack"
              >
                <ChatBubbleLeftRightIcon className="h-3 w-3" />
                {slackActivity.data.channelName}
              </a>
            )}
            {slackActivity.data?.configured && (
              <button
                type="button"
                onClick={() => void slackActivity.refetch()}
                disabled={slackActivity.isFetching}
                className="rounded-[4px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)] transition-colors"
                title="Refresh"
              >
                <ArrowPathIcon className={cn("h-3.5 w-3.5", slackActivity.isFetching && "animate-spin")} />
              </button>
            )}
          </div>
        </div>
        <SlackActivityBody
          data={slackActivity.data}
          isLoading={slackActivity.isPending}
          onConfigureClick={openEdit}
        />
      </section>

      {/* ── 08 // CONTACT ── */}
      {hasContactInfo && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">08</span>
              {" // CONTACT"}
            </span>
          </div>
          <div className="p-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(client.primaryContactName || client.primaryContactEmail || client.primaryContactPhone) && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Primary contact</p>
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

              {client.website && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Website</p>
                  <a
                    href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[var(--brand-700)] hover:underline"
                  >
                    {client.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}

              {addressParts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Address</p>
                  {[client.addressLine1, client.addressLine2].filter(Boolean).map((line, i) => (
                    <p key={i} className="text-sm text-[var(--text-2)]">{line}</p>
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
          </div>
        </section>
      )}

      {/* ── 09 // BILLING ── */}
      {(client.legalCompanyName ||
        client.vatNumber ||
        client.companyNumber ||
        client.invoiceEmail ||
        client.billingAddressLine1) && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">09</span>
              {" // BILLING"}
            </span>
          </div>
          <div className="p-6">
            <div className="grid gap-6 sm:grid-cols-3">
              {client.legalCompanyName && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Registered name</p>
                  <p className="text-sm text-[var(--text-1)]">{client.legalCompanyName}</p>
                </div>
              )}
              {client.companyNumber && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Company number</p>
                  <p className="font-mono text-sm text-[var(--text-1)]">{client.companyNumber}</p>
                </div>
              )}
              {client.vatNumber && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">VAT number</p>
                  <p className="font-mono text-sm text-[var(--text-1)]">{client.vatNumber}</p>
                </div>
              )}
              {client.invoiceEmail && (
                <div className="space-y-1.5">
                  <p className="widget-data-label mb-2">Invoice email</p>
                  <p className="text-sm text-[var(--text-1)] [overflow-wrap:anywhere]">
                    {client.invoiceEmail}
                  </p>
                </div>
              )}
            </div>
            {client.billingAddressLine1 && (
              <div className="mt-6 border-t border-[var(--border-3)] pt-5">
                <p className="widget-data-label mb-2">Billing address</p>
                <p className="text-sm leading-relaxed text-[var(--text-1)]">
                  {[
                    client.billingAddressLine1,
                    client.billingAddressLine2,
                    client.billingCity,
                    client.billingCounty,
                    client.billingPostcode,
                    client.billingCountry,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Bank details now live behind the header button → BankDetailsModal (bottom of file) */}
      {client.bank?.onFile && (
        <BankDetailsModal
          open={bankOpen}
          onClose={() => setBankOpen(false)}
          slug={slug}
          bank={client.bank}
        />
      )}

      {/* ── 10 // PLATFORMS ── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">10</span>
            {" // PLATFORMS"}
          </span>
          {!isSuggested && (
            <button
              type="button"
              onClick={() => { setPlatformError(null); setPlatformModal({ open: true, platform: null }); }}
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)] transition-colors"
              title="Add platform"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="p-5">
          {platforms.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center">
              <p className="text-sm text-[var(--text-4)]">
                {isSuggested ? "Save this client to start adding platforms." : (
                  <button
                    type="button"
                    onClick={() => { setPlatformError(null); setPlatformModal({ open: true, platform: null }); }}
                    className="text-[var(--brand-700)] hover:underline"
                  >
                    + Add your first platform
                  </button>
                )}
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

      {/* ── 11 // DESIGNS + 12 // MEETING NOTES (side by side) ── */}
      <div className="grid grid-cols-2 gap-4">
      {/* 11 // DESIGNS */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">11</span>
            {" // DESIGNS"}
          </span>
          {!isSuggested && (
            <button
              type="button"
              onClick={() => { setDesignError(null); setDesignModal({ open: true, design: null }); }}
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)] transition-colors"
              title="Add design"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="p-5">
          {designs.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center">
              <p className="text-sm text-[var(--text-4)]">
                {isSuggested ? "Save this client to start adding design files." : (
                  <button
                    type="button"
                    onClick={() => { setDesignError(null); setDesignModal({ open: true, design: null }); }}
                    className="text-[var(--brand-700)] hover:underline"
                  >
                    + Add your first design
                  </button>
                )}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
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

      {/* 12 // MEETING NOTES (Scribe) — quiet, client-scoped Google Meet notes */}
      <section className="widget-card">
        <MeetingNotesSection slug={slug} />
      </section>
      </div>

      {/* ── 13 // NOTES ── */}
      {client.notes && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">13</span>
              {" // NOTES"}
            </span>
          </div>
          <div className="p-6">
            <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-2)]">
              {client.notes}
            </p>
          </div>
        </section>
      )}

      {/* ── ACTIVITY — 2×2 grid ── */}
      {/* Row 1: Documents + Pulse */}
      <div className="grid grid-cols-2 gap-4">

        {/* 14 // DOCUMENTS */}
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">14</span>
              {" // DOCUMENTS"}
            </span>
            <span className="widget-header__status">
              {proposals.length} linked
            </span>
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
                      <td>
                        <span className="widget-timestamp">{formatDate(proposal.updatedAt)}</span>
                      </td>
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
                      No documents linked yet. Add this client&rsquo;s name to any document draft to link it here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>


        {/* 15 // PULSE SCANS */}
        <section className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">15</span>
                {" // PULSE SCANS"}
              </span>
              {pulseScans.length > 0 && (
                <span className="widget-header__status">
                  <SignalIcon className="h-3 w-3" />
                  {pulseScans.length} scan{pulseScans.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {pulseScans.length === 0 ? (
              <div className="p-5">
                {client.status === "PENDING_REVIEW" ? (
                  <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center">
                    <p className="px-6 text-sm text-[var(--text-4)]">
                      Pulse scans run once this client is moved to workflow — keeps us
                      from scanning a product URL before it&apos;s officially in our pipeline.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center">
                    <p className="text-sm text-[var(--text-4)]">
                      <Link href="/app/pulse" className="text-[var(--brand-700)] hover:underline">
                        + Run a Pulse scan for this client
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="app-table min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left">Project</th>
                      <th className="text-left">Score</th>
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
                            <span
                              className="text-xl leading-none text-[var(--text-1)]"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              {scan.healthScore}
                            </span>
                          ) : (
                            <span className="text-[var(--text-4)]">—</span>
                          )}
                        </td>
                        <td>
                          <span className="widget-timestamp">{formatDate(scan.createdAt)}</span>
                        </td>
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
            )}
          </section>

      </div>

      {/* Row 2: Developers + Studies */}
      <div className="grid grid-cols-2 gap-4">
        {/* 16 // DEVELOPERS */}
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">16</span>
              {" // DEVELOPERS"}
            </span>
            {placements && placements.length > 0 ? (
              <span className="widget-header__status">
                {placements.filter((p) => !p.endDate).length} active
                {placements.filter((p) => p.endDate).length > 0 &&
                  ` · ${placements.filter((p) => p.endDate).length} past`}
              </span>
            ) : (
              <Link
                href="/app/codeclear/candidates"
                className="widget-header__status hover:text-[var(--brand-700)] transition-colors"
              >
                Assign in Code →
              </Link>
            )}
          </div>
          <ClientDevelopersSection
            clientId={client.id}
            clientName={client.name}
            placements={placements ?? []}
          />
        </section>


        {/* 17 // STUDIES */}
        {!isSuggested && (
          <section className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">17</span>
                {" // STUDIES"}
              </span>
              <div className="flex items-center gap-2">
                {studies.length > 0 && (
                  <span className="widget-header__status">
                    <BeakerIcon className="h-3 w-3" />
                    {studies.length} stud{studies.length !== 1 ? "ies" : "y"}
                  </span>
                )}
                <Link
                  href={`/app/study/new?clientId=${client.id}`}
                  className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
                  title="New study for this client"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            {studies.length === 0 ? (
              <div className="p-4">
                <div className="flex items-center justify-center rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center w-full">
                  <p className="text-sm text-[var(--text-4)]">
                    <Link
                      href={`/app/study/new?clientId=${client.id}`}
                      className="text-[var(--brand-700)] hover:underline"
                    >
                      + Start a research study for this client
                    </Link>
                  </p>
                </div>
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="app-table min-w-full">
                <thead>
                  <tr>
                    <th className="text-left">Title</th>
                    <th className="text-left">Mode</th>
                    <th className="text-left">Personas</th>
                    <th className="text-left">Sessions</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Created</th>
                    <th className="text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {studies.map((study) => (
                    <tr key={study.id}>
                      <td>
                        <p className="font-medium text-[var(--text-1)]">{study.title}</p>
                      </td>
                      <td>
                        <span
                          className="inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
                        >
                          {study.sessionMode === "GROUP" ? "GROUP" : "1-ON-1"}
                        </span>
                      </td>
                      <td className="text-[var(--text-3)]">
                        {study.selectedPersonaIds.length}
                      </td>
                      <td className="text-[var(--text-3)]">
                        {study.completedSessionCount}/{study.sessionCount}
                      </td>
                      <td>
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] " +
                            (study.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700"
                              : study.status === "RUNNING" || study.status === "PLAN_GENERATING"
                              ? "bg-amber-50 text-amber-700"
                              : study.status === "FAILED"
                              ? "bg-red-50 text-red-700"
                              : "bg-[var(--surface-1)] text-[var(--text-3)]")
                          }
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {(study.status === "RUNNING" || study.status === "PLAN_GENERATING") && (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          )}
                          {study.status.toLowerCase().replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span className="widget-timestamp">{formatDate(study.createdAt)}</span>
                      </td>
                      <td>
                        <Link
                          href={`/app/study/${study.id}`}
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
            )}
          </section>
        )}

      </div>

      {/* Full-width optionals */}
        {/* 18 // PROOF DOCUMENTS */}
        {proofDocuments.length > 0 && (
          <section className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">18</span>
                {" // PROOF DOCUMENTS"}
              </span>
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
                      <td>
                        <span className="widget-timestamp">{formatDate(document.updatedAt)}</span>
                      </td>
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
          </section>
        )}

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

// ---------------------------------------------------------------------------
// MeetingNotesSection — Scribe: client-scoped Google Meet notes, surfaced quietly here.
function meetingStatusChip(status: ScribeMeeting["status"]): { label: string; cls: string } {
  switch (status) {
    case "SUMMARISED":
      return { label: "Ready", cls: "bg-emerald-50 text-emerald-700" };
    case "TRANSCRIBED":
      return { label: "Summarising", cls: "bg-amber-50 text-amber-700" };
    case "AWAITING_TRANSCRIPT":
      return { label: "Awaiting", cls: "bg-[var(--surface-1)] text-[var(--text-3)]" };
    case "ERROR":
      return { label: "Error", cls: "bg-red-50 text-red-700" };
    default:
      return { label: "No notes", cls: "bg-[var(--surface-1)] text-[var(--text-3)]" };
  }
}

function formatTimeRange(startISO?: string | null, endISO?: string | null): string {
  if (!startISO) return "";
  try {
    const opts = { hour: "2-digit", minute: "2-digit", hour12: false } as const;
    const s = new Date(startISO).toLocaleTimeString("en-GB", opts);
    const e = endISO ? new Date(endISO).toLocaleTimeString("en-GB", opts) : "";
    return e ? `${s}–${e}` : s;
  } catch {
    return "";
  }
}

function MeetingNotesSection({ slug }: { slug: string }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  // Debounce so we search as the user pauses, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isLoading } = useClientMeetings(slug, true, query);
  const ingest = useIngestClientMeeting(slug);
  const toggle = useToggleMeetingActionItem(slug);
  const createTask = useCreateTask();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);
  const [addedTaskIds, setAddedTaskIds] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<ScribeMeeting | null>(null);

  // Push a meeting action item into the client's task board (lands in Backlog).
  async function addActionItemAsTask(clientId: string, itemId: string, text: string) {
    setAddingTaskId(itemId);
    try {
      await createTask.mutateAsync({ clientId, title: text });
      setAddedTaskIds((s) => ({ ...s, [itemId]: true }));
    } catch {
      /* swallow — button just won't flip to "Added" */
    } finally {
      setAddingTaskId(null);
    }
  }

  const meetings = data?.meetings ?? [];
  const candidates = data?.candidates ?? [];
  const showSearch = Boolean(data) && (meetings.length > 0 || query.length > 0);

  async function fetchNotes(args: {
    calendarEventId: string;
    meetingCode: string | null;
    title: string;
    start?: string;
    end?: string;
    attendees?: string[];
  }) {
    if (!args.meetingCode) return;
    setBusyId(args.calendarEventId);
    try {
      await ingest.mutateAsync({
        calendarEventId: args.calendarEventId,
        meetingCode: args.meetingCode,
        title: args.title,
        start: args.start,
        end: args.end,
        attendees: args.attendees,
      });
    } catch {
      /* error surfaced via ingest.isError */
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">12</span>
          {" // MEETING NOTES"}
        </span>
        <span className="widget-header__status">
          <VideoCameraIcon className="h-3 w-3" />
          Scribe
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {showSearch && (
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search meeting notes…"
              className="w-full rounded-[6px] border border-[var(--border-2)] bg-white py-1.5 pl-8 pr-3 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
        )}

        {isLoading ? (
          <p className="widget-data-label animate-pulse">Loading…</p>
        ) : (
          <>
            {meetings.length === 0 && candidates.length === 0 &&
              (query ? (
                <p className="py-6 text-center text-sm text-[var(--text-4)]">
                  No notes match “{query}”.
                </p>
              ) : (
                <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.12)] py-8 text-center">
                  <p className="text-sm text-[var(--text-4)]">
                    {data?.calendarConnected
                      ? "No recent Google Meet calls with this client."
                      : "Connect Google (sign out and back in) to let Scribe capture notes from your Meet calls."}
                  </p>
                </div>
              ))}

            {candidates.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-[var(--text-3)]">Recent calls</p>
                {candidates.map((c) => (
                  <div
                    key={c.calendarEventId}
                    className="flex items-center justify-between gap-3 rounded-[6px] border border-[var(--border-1)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">{c.title}</p>
                      <p className="text-xs text-[var(--text-3)]">{formatDate(c.start)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === c.calendarEventId}
                      onClick={() => void fetchNotes(c)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {busyId === c.calendarEventId ? (
                        <>
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Fetching
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="h-3 w-3" />
                          Fetch notes
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {ingest.isError && (
              <p className="text-xs text-rose-600">
                {(ingest.error as Error)?.message ?? "Couldn't fetch notes."}
              </p>
            )}

            {meetings.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {candidates.length > 0 && (
                  <p className="text-xs font-medium text-[var(--text-3)]">Captured notes</p>
                )}
                {meetings.map((m) => {
                  const chip = meetingStatusChip(m.status);
                  const ready = m.status === "SUMMARISED";
                  const retryable = m.status === "NO_TRANSCRIPT" || m.status === "ERROR";
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-[6px] border border-[var(--border-1)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text-1)]">{m.title}</p>
                        <p className="text-xs text-[var(--text-3)]">{formatDate(m.startedAt ?? m.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                            chip.cls,
                          )}
                        >
                          {chip.label}
                        </span>
                        {ready ? (
                          <button
                            type="button"
                            onClick={() => setViewing(m)}
                            className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            View
                            <ArrowUpRightIcon className="h-3 w-3" />
                          </button>
                        ) : retryable && m.calendarEventId && m.meetingCode ? (
                          <button
                            type="button"
                            disabled={busyId === m.calendarEventId}
                            onClick={() =>
                              void fetchNotes({
                                calendarEventId: m.calendarEventId!,
                                meetingCode: m.meetingCode,
                                title: m.title,
                                start: m.startedAt ?? undefined,
                                end: m.endedAt ?? undefined,
                                attendees: m.attendees,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60"
                          >
                            {busyId === m.calendarEventId ? "Retrying" : "Retry"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {viewing && (
        <MeetingNotesModal
          meeting={viewing}
          onClose={() => setViewing(null)}
          onToggleItem={(itemId, done) => toggle.mutate({ meetingId: viewing.id, actionItemId: itemId, done })}
          onAddTask={addActionItemAsTask}
          addingTaskId={addingTaskId}
          addedTaskIds={addedTaskIds}
        />
      )}
    </>
  );
}

// MeetingNotesModal — full notes for one meeting: title/attendees/time header,
// notes on the left, decisions + action items on the right.
function MeetingNotesModal({
  meeting,
  onClose,
  onToggleItem,
  onAddTask,
  addingTaskId,
  addedTaskIds,
}: {
  meeting: ScribeMeeting;
  onClose: () => void;
  onToggleItem: (itemId: string, done: boolean) => void;
  onAddTask: (clientId: string, itemId: string, text: string) => void;
  addingTaskId: string | null;
  addedTaskIds: Record<string, boolean>;
}) {
  const decisions = Array.isArray(meeting.decisions) ? meeting.decisions : [];
  const when = [formatDate(meeting.startedAt ?? meeting.createdAt), formatTimeRange(meeting.startedAt, meeting.endedAt)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="app-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="app-dialog-panel flex h-[80vh] max-h-[680px] w-full max-w-4xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — title top-left, time + attendees beneath */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-1)] px-6 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              {meeting.title}
            </h3>
            {when && <p className="mt-1 text-xs text-[var(--text-3)]">{when}</p>}
            {meeting.attendees.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {meeting.attendees.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-[var(--surface-1)] px-2 py-0.5 text-[10px] text-[var(--text-3)]"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[4px] p-1 text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 2 columns, each scrolls independently */}
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[var(--border-1)] overflow-hidden">
          <div className="min-h-0 overflow-y-auto p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-1)]">
              {meeting.summary || "No summary captured."}
            </p>
          </div>

          <div className="min-h-0 space-y-5 overflow-y-auto p-6">
            {decisions.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">Decisions</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text-2)]">
                  {decisions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">Action items</p>
              {meeting.actionItems.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-4)]">None.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {meeting.actionItems.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                      <input
                        type="checkbox"
                        checked={a.done}
                        onChange={() => onToggleItem(a.id, !a.done)}
                        className="mt-0.5"
                      />
                      <span className={a.done ? "text-[var(--text-4)] line-through" : ""}>
                        {a.text}
                        {a.owner ? <span className="text-[var(--text-4)]"> — {a.owner}</span> : null}
                      </span>
                      {meeting.clientId && (
                        <button
                          type="button"
                          disabled={addingTaskId === a.id || addedTaskIds[a.id]}
                          onClick={() => onAddTask(meeting.clientId!, a.id, a.text)}
                          className="ml-auto shrink-0 rounded-[4px] border border-[var(--border-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60"
                          title="Add to this client's task board"
                        >
                          {addingTaskId === a.id ? "Adding…" : addedTaskIds[a.id] ? "Added ✓" : "+ Task"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ClientDevelopersSection — compact name roster, Portal read-only view
// ---------------------------------------------------------------------------
function ClientDevelopersSection({
  placements,
}: {
  clientId: string;
  clientName: string;
  placements: import("@/types/client").ClientPlacementRecord[];
}) {
  if (placements.length === 0) {
    return (
      <div className="p-5">
        <p className="text-sm text-[var(--text-4)]">
          No developers assigned yet. Open a developer in{" "}
          <Link href="/app/codeclear/candidates" className="text-[var(--brand-700)] hover:underline">
            Code
          </Link>{" "}
          and assign them here.
        </p>
      </div>
    );
  }

  const active = placements.filter((p) => !p.endDate);

  function Avatar({ name }: { name: string }) {
    const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    const colors = ["#1D4ED8","#0F766E","#7C3AED","#B45309","#DC2626","#16A34A"];
    return (
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ background: colors[Math.abs(h) % colors.length], fontFamily: "var(--font-mono)" }}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className="p-5">
      {active.length === 0 ? (
        <p className="text-sm text-[var(--text-4)]">
          No active developers.{" "}
          <Link href="/app/codeclear/candidates" className="text-[var(--brand-700)] hover:underline">
            Assign in Code →
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {active.map((p) => (
            <Link
              key={p.id}
              href={`/app/codeclear/candidates/${p.candidateId}`}
              className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-1)] hover:border-[var(--brand-700)] hover:text-[var(--brand-700)] transition-colors"
            >
              <Avatar name={p.candidateName} />
              {p.candidateName}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  number,
  label,
  value,
  action,
}: {
  number: string;
  label: string;
  value: number;
  /** Optional small control pinned bottom-right (e.g. a jump link). */
  action?: React.ReactNode;
}) {
  return (
    <article className="widget-card relative">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${label}`}
        </span>
      </div>
      <div className="widget-body--compact">
        <p
          className="text-5xl leading-none tracking-tight text-[var(--text-1)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {value}
        </p>
        <p className="widget-data-label mt-2">{label}</p>
      </div>
      {action ? <div className="absolute bottom-3 right-3">{action}</div> : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// LinkPreviewArea — fixed 130px image strip at the top of platform/design cards
// ---------------------------------------------------------------------------
function LinkPreviewArea({
  imageUrl,
  domain,
  label,
}: {
  imageUrl: string | null | undefined;
  domain: string | null | undefined;
  label: string | null | undefined;
}) {
  const domainLabel = domain
    ? domain.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]
    : label || "Link";

  // Hash the label to pick a consistent gradient
  let hash = 0;
  for (let i = 0; i < domainLabel.length; i++) {
    hash = domainLabel.charCodeAt(i) + ((hash << 5) - hash);
  }
  const gradients = [
    "linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)",
    "linear-gradient(135deg, #0F766E 0%, #134E4A 100%)",
    "linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)",
    "linear-gradient(135deg, #B45309 0%, #78350F 100%)",
    "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
  ];
  const gradient = gradients[Math.abs(hash) % gradients.length];

  if (imageUrl) {
    return (
      <div
        className="h-[130px] w-full overflow-hidden"
        style={{ background: "#f1f5f9" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={domainLabel}
          className="h-full w-full object-cover"
          onError={(e) => {
            // Hide broken image, let the parent show placeholder
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-[130px] w-full items-center justify-center"
      style={{ background: gradient }}
    >
      <div className="text-center">
        <p
          className="text-2xl font-semibold text-white/90 tracking-[-0.02em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {domainLabel.charAt(0).toUpperCase()}
        </p>
        <p
          className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/50 max-w-[120px] truncate"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {domainLabel}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slack helpers
// ---------------------------------------------------------------------------

/** Clean raw Slack message text into something readable. */
function formatSlackText(text: string): string {
  return (
    text
      // Slack links: <URL|display> → display text
      .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2")
      // Bare Slack links: <https://...> → just the domain
      .replace(/<(https?:\/\/([^/>]+)[^>]*)>/g, "$2")
      // User mentions: <@UXXX> → @name (we don't have names here, keep @user)
      .replace(/<@([A-Z0-9]+)>/g, "@user")
      // Channel mentions: <!channel> <!here> <!everyone>
      .replace(/<!channel>/g, "@channel")
      .replace(/<!here>/g, "@here")
      .replace(/<!everyone>/g, "@everyone")
      // HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      // Slack bold *text* → keep readable as-is (strip asterisks)
      .replace(/\*([^*\n]+)\*/g, "$1")
      // Slack italic _text_
      .replace(/_([^_\n]+)_/g, "$1")
      // Slack strikethrough ~text~
      .replace(/~([^~\n]+)~/g, "$1")
      // Slack code `text`
      .replace(/`([^`]+)`/g, "$1")
      // Collapse excess whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// ---------------------------------------------------------------------------
// SlackActivityBody — content panel for the 07 // SLACK ACTIVITY widget
// ---------------------------------------------------------------------------
function SlackActivityBody({
  data,
  isLoading,
  onConfigureClick,
}: {
  data: {
    configured: boolean;
    channelName: string | null;
    summary: string | null;
    generatedAt: string | null;
    reason: string;
    messages: Array<{ id: string; author: string; text: string; ts: string }>;
  } | undefined;
  isLoading: boolean;
  onConfigureClick: () => void;
}) {
  if (isLoading) {
    return (
      <div className="p-5">
        <p className="widget-data-label animate-pulse">Loading activity…</p>
      </div>
    );
  }

  if (!data || !data.configured) {
    const reason = data?.reason;
    return (
      <div className="p-5">
        {reason === "no_token" ? (
          <p className="text-sm text-[var(--text-4)]">
            No Slack bot token configured.{" "}
            <Link href="/app/settings" className="text-[var(--brand-700)] hover:underline">
              Add one in Settings →
            </Link>
          </p>
        ) : (
          <p className="text-sm text-[var(--text-4)]">
            No Slack channel linked.{" "}
            <button
              type="button"
              onClick={onConfigureClick}
              className="text-[var(--brand-700)] hover:underline"
            >
              Set one in Edit →
            </button>
          </p>
        )}
      </div>
    );
  }

  if (data.reason === "not_in_channel") {
    return (
      <div className="p-5">
        <p className="text-sm text-[var(--text-4)]">
          The Foundry bot hasn&apos;t been invited to{" "}
          <span className="font-medium text-[var(--text-2)]">{data.channelName}</span>.
          Invite it in Slack then refresh.
        </p>
      </div>
    );
  }

  if (data.messages.length === 0) {
    return (
      <div className="p-5">
        <p className="text-sm text-[var(--text-4)]">No recent messages in {data.channelName}.</p>
      </div>
    );
  }

  const summaryLines = data.summary
    ? data.summary.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentMessages = data.messages
    .filter((msg) => new Date(msg.ts).getTime() > oneDayAgo)
    .reverse();
  // Fall back to last 5 if nothing in 24 h
  const displayMessages = recentMessages.length > 0
    ? recentMessages
    : data.messages.slice(-5).reverse();
  const is24hView = recentMessages.length > 0;

  return (
    <div className="grid h-[360px] grid-cols-[2fr_3fr] divide-x divide-[rgba(0,0,0,0.06)] overflow-hidden">

      {/* ── Left: AI summary — min-h-0 lets the grid item shrink + scroll ── */}
      <div className="relative min-h-0">
        <div className="h-full overflow-y-auto p-5 pb-10">
        <p className="widget-data-label mb-3">AI digest</p>
        {summaryLines.length > 0 ? (
          <ul className="space-y-2">
            {summaryLines.map((line, i) => {
              const clean = line.replace(/^\•\s*/, "").replace(/\*\*([^*]+)\*\*/g, "$1");
              const colonIdx = clean.indexOf(":");
              const label = colonIdx > 0 && colonIdx < 30 ? clean.slice(0, colonIdx) : null;
              const body = label ? clean.slice(colonIdx + 1).trim() : clean;
              return (
                <li key={i} className="flex gap-2 text-sm leading-5 text-[var(--text-2)]">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-600)]" />
                  <span>
                    {label && (
                      <span className="font-semibold text-[var(--text-1)]">{label}: </span>
                    )}
                    {body}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          /* Only show "no digest" if the channel has literally never had messages.
             When the channel is just quiet (reason = "empty"), hide the placeholder
             so the cached summary from a previous session would show if present. */
          data.reason !== "empty" && (
            <p className="text-sm text-[var(--text-4)]">
              Digest will appear after the first messages are posted.
            </p>
          )
        )}
        {data.generatedAt && (
          <p className="widget-timestamp mt-4 opacity-50">
            {formatDate(data.generatedAt)}
          </p>
        )}
        </div>
        {/* Fade gradient — no hard crop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-10"
          style={{ background: "linear-gradient(to bottom, transparent, white)" }}
        />
      </div>

      {/* ── Right: Messages ── */}
      <div className="min-h-0 overflow-y-auto divide-y divide-[rgba(0,0,0,0.05)]">
        {!is24hView && (
          <div className="px-4 py-2 bg-[var(--surface-1)]">
            <p className="widget-data-label">No messages in last 24 h — showing recent</p>
          </div>
        )}
        {displayMessages.map((msg) => {
          const initials = msg.author
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          let h = 0;
          for (let i = 0; i < msg.author.length; i++) h = msg.author.charCodeAt(i) + ((h << 5) - h);
          const avatarColors = ["#1D4ED8", "#0F766E", "#7C3AED", "#B45309", "#DC2626", "#16A34A"];
          const avatarBg = avatarColors[Math.abs(h) % avatarColors.length];

          return (
            <div key={msg.id} className="flex gap-2.5 px-4 py-3">
              <div
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: avatarBg, fontFamily: "var(--font-mono)" }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-[var(--text-1)]">{msg.author}</span>
                  <span className="widget-timestamp text-[10px] opacity-50">
                    {formatDate(msg.ts)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-[1.55] text-[var(--text-3)] line-clamp-2">
                  {formatSlackText(msg.text)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformCard — individual platform record widget
// ---------------------------------------------------------------------------
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
    previewImageUrl?: string;
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

  const linkForPreview = platform.url || platform.stagingUrl;
  const ogQuery = useOgPreview(!platform.previewImageUrl ? linkForPreview : null);
  const previewImage = platform.previewImageUrl || ogQuery.data?.imageUrl || null;

  return (
    <>
      <article className="widget-card cursor-pointer overflow-hidden" onClick={() => setEditing(true)}>
        {/* Preview image area — fixed 130px, always present */}
        <LinkPreviewArea
          imageUrl={previewImage}
          domain={linkForPreview}
          label={platform.platformType || platform.name}
        />

        {/* Card label + actions — compact, not a section header */}
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-3 py-1.5">
          {platform.platformType && (
            <span className="rounded-[3px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}>
              {platform.platformType}
            </span>
          )}
          <div className="ml-auto flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] transition"
              title="Edit platform"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deletingId === platform.id}
              className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-red-50 hover:text-red-600 transition"
              title="Delete platform"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <p className="font-semibold text-[var(--text-1)]">{platform.name}</p>

          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
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
            <p className="border-t border-[rgba(0,0,0,0.06)] pt-3 text-xs leading-5 text-[var(--text-3)]">
              {platform.notes}
            </p>
          )}
        </div>
      </article>

      {editing && (
        <ClientPlatformFormModal
          platform={platform}
          onSave={(input) => void handleSave(input)}
          onClose={() => { setEditing(false); setError(null); }}
          isSaving={updateMutation.isPending}
          error={error}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DesignCard — individual design record widget
// ---------------------------------------------------------------------------
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

  async function handleSave(input: { name: string; url?: string; notes?: string; previewImageUrl?: string }) {
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

  const ogQuery = useOgPreview(!design.previewImageUrl ? design.url : null);
  const previewImage = design.previewImageUrl || ogQuery.data?.imageUrl || null;

  return (
    <>
      <article className="widget-card cursor-pointer overflow-hidden" onClick={() => setEditing(true)}>
        {/* Preview image area */}
        <LinkPreviewArea imageUrl={previewImage} domain={design.url} label={design.name} />

        {/* Card label + actions — compact, not a section header */}
        <div className="flex items-center justify-end border-b border-[rgba(0,0,0,0.06)] px-3 py-1.5 gap-0.5"
          onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] transition"
            title="Edit design"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deletingId === design.id}
            className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-red-50 hover:text-red-600 transition"
            title="Delete design"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <p className="font-semibold text-[var(--text-1)]">{design.name}</p>

          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
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
            <p className="border-t border-[rgba(0,0,0,0.06)] pt-3 text-xs leading-5 text-[var(--text-3)]">
              {design.notes}
            </p>
          )}
        </div>
      </article>

      {editing && (
        <ClientDesignFormModal
          design={design}
          onSave={(input) => void handleSave(input)}
          onClose={() => { setEditing(false); setError(null); }}
          isSaving={updateMutation.isPending}
          error={error}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ClientEditModal — edit client fields
// ---------------------------------------------------------------------------
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
  const [channels, setChannels] = useState<SlackAvailableChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  useEffect(() => {
    setLoadingChannels(true);
    fetchSlackChannels()
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setLoadingChannels(false));
  }, []);

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
        <div className="app-dialog-panel w-full max-w-2xl overflow-hidden">
          {/* Modal widget header */}
          <div className="widget-header">
            <span className="widget-header__label">EDIT CLIENT</span>
          </div>

          <div className="p-6">
            <h2 className="mb-5 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              Edit client
            </h2>

            <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
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

              {/* Links */}
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
                <label className="block">
                  <span className="app-field-label">
                    Slack channel
                    {loadingChannels && (
                      <span className="ml-2 text-[var(--text-4)]">Loading…</span>
                    )}
                  </span>
                  <select
                    value={form.slackChannelId}
                    onChange={(e) => set("slackChannelId", e.target.value)}
                    className="app-select w-full"
                  >
                    <option value="">— None —</option>
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.isPrivate ? "🔒 " : "#"}{ch.name}
                        {ch.isMember ? "" : " (invite bot)"}
                      </option>
                    ))}
                  </select>
                  {channels.length === 0 && !loadingChannels && (
                    <p className="mt-1 text-xs text-[var(--text-4)]">
                      Add a Slack bot token in Settings → Integrations to enable this.
                    </p>
                  )}
                </label>
              </div>

              {/* Primary contact */}
              <div className="border-t border-[rgba(0,0,0,0.08)] pt-4">
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

              {/* Address */}
              <div className="border-t border-[rgba(0,0,0,0.08)] pt-4">
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

              {/* Notes */}
              <div className="border-t border-[rgba(0,0,0,0.08)] pt-4">
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
    </div>
  );
}

// ─── Pending review banner ──────────────────────────────────────────────────

function PendingReviewBanner({
  slug,
  companyName,
}: {
  slug: string;
  companyName: string;
}) {
  const setStatus = useSetClientStatus(slug);
  const [error, setError] = useState<string | null>(null);

  const handleMove = async () => {
    setError(null);
    try {
      // The client already exists (materialised on submit) — moving to workflow
      // just flips PENDING_REVIEW → ACTIVE, which enables Pulse + full access.
      await setStatus.mutateAsync("ACTIVE");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
    }
  };

  return (
    <section className="rounded-[10px] border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Submitted via onboarding — awaiting review
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            {companyName} has filled in their onboarding. Review their answers below, then
            move them to workflow to enable Pulse scans and full Portal access.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={setStatus.isPending}
          onClick={() => void handleMove()}
          data-slug={slug}
        >
          <CheckCircleIcon className="h-4 w-4" />
          Move to workflow
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-rose-700">{error}</p>
      )}
    </section>
  );
}

// ─── Bank details section (Reveal-on-demand) ───────────────────────────────

function BankDetailsModal({
  open,
  onClose,
  slug,
  bank,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  bank: ClientBankSummary;
}) {
  const [revealed, setRevealed] = useState<ClientBankReveal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revealMutation = useRevealClientBank();

  // Re-mask whenever the modal closes so decrypted values never linger in
  // component state after the operator is done looking.
  useEffect(() => {
    if (!open) {
      setRevealed(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleReveal = async () => {
    setError(null);
    if (revealed) {
      setRevealed(null);
      return;
    }
    try {
      const result = await revealMutation.mutateAsync(slug);
      setRevealed(result.bank);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reveal failed");
    }
  };

  return (
    <div
      className="app-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="app-dialog-panel w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="widget-header">
          <span className="widget-header__label">
            <BanknotesIcon className="mr-1 inline h-3.5 w-3.5 text-[var(--brand-700)]" />
            BANK DETAILS
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[4px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] transition-colors"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">
          <div className="mb-4 flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-3)]">
            <BanknotesIcon className="h-4 w-4 shrink-0 text-[var(--brand-700)]" />
            Encrypted at rest. Reveal is server-side only and not cached.
          </div>
          {/* Fixed-height area so the modal doesn't change size on reveal/hide. */}
          <div className="min-h-[210px]">
          {!revealed ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <BankField label="Account" value={bank.accountNumberLast4 ? `•••• ${bank.accountNumberLast4}` : "On file"} />
              <BankField label="Currency" value={bank.currency ?? "—"} />
              <BankField label="Status" value="Encrypted" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <BankField label="Account holder" value={revealed.accountHolder ?? "—"} mono />
              <BankField label="Bank name" value={revealed.bankName ?? "—"} />
              <BankField label="Sort code" value={revealed.sortCode ?? "—"} mono />
              <BankField label="Account number" value={revealed.accountNumber ?? "—"} mono />
              {revealed.iban && <BankField label="IBAN" value={revealed.iban} mono />}
              {revealed.swiftBic && <BankField label="SWIFT / BIC" value={revealed.swiftBic} mono />}
              <BankField label="Currency" value={revealed.currency ?? "—"} />
            </div>
          )}
          </div>
          {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleReveal()}
              disabled={revealMutation.isPending}
            >
              {revealed ? (
                <>
                  <EyeSlashIcon className="h-4 w-4" />
                  Hide
                </>
              ) : (
                <>
                  <EyeIcon className="h-4 w-4" />
                  {revealMutation.isPending ? "Revealing…" : "Reveal"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BankField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="widget-data-label">{label}</p>
      <p
        className={cn(
          "text-sm text-[var(--text-1)]",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}
