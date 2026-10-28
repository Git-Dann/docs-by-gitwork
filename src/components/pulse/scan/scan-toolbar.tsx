"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeftIcon, ArrowPathIcon, ClipboardDocumentCheckIcon, ClipboardDocumentIcon, DocumentArrowDownIcon, DocumentTextIcon, EllipsisHorizontalIcon, EnvelopeIcon, LinkIcon } from "@heroicons/react/24/outline";
import { PulseScanStatusBadge } from "@/components/pulse/pulse-shared";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { actionMenuItem, actionMenuPanel } from "./scan-helpers";
import type { ScanView } from "./use-scan-view";

export function renderScanToolbar(v: ScanView) {
  const { canActAsAgency, copied, emailError, emailModalOpen, emailMsg, emailSent, emailTo, emailing, generatingProposal, handleCopy, handleDownloadPdf, handleGenerateProposal, handleRescan, handleSendEmail, handleShare, handleUnshare, isShared, llm, pdfPending, proposalGenError, reportUrl, rescanning, scan, setEmailError, setEmailModalOpen, setEmailMsg, setEmailSent, setEmailTo, shareError, sharing, unsharing } = v;
  return (
    <>
      {/* Email-this-audit modal */}
      <Modal open={emailModalOpen} onClose={() => setEmailModalOpen(false)} title="Email this audit">
        {emailSent ? (
          <div className="widget-body space-y-3">
            <p className="text-sm text-emerald-600">Sent — {emailTo} will receive the report link and summary.</p>
            <Button size="sm" onClick={() => setEmailModalOpen(false)}>Done</Button>
          </div>
        ) : (
          <div className="widget-body space-y-3">
            <p className="text-sm text-[var(--text-3)]">Emails the prospect a link to the shared report plus the executive summary and proposal hook. Shares the report automatically if it isn&apos;t already.</p>
            <div className="space-y-1.5">
              <label className="app-field-label">Recipient email</label>
              <input className="app-input" type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="prospect@company.com" />
            </div>
            <div className="space-y-1.5">
              <label className="app-field-label">Personal note (optional)</label>
              <textarea className="app-input resize-none" rows={3} value={emailMsg} onChange={(e) => setEmailMsg(e.target.value)} placeholder="Hi Sam — ran our production audit on your app, a few things worth a look…" />
            </div>
            {emailError && <p className="text-xs text-red-600">{emailError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="tertiary" size="sm" onClick={() => setEmailModalOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSendEmail} loading={emailing} disabled={!/.+@.+\..+/.test(emailTo)}>Send</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Toolbar — back link + status in line with the breadcrumb (page.tsx suppresses its own
          breadcrumb row once the scan is COMPLETED so this is the only one rendered), primary
          actions (Generate proposal / Share) stay visible, the rest tuck into a 3-dot menu. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/app/pulse"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All scans
          </Link>
          <PulseScanStatusBadge status={scan.status} />
        </div>

        <div className="flex items-center gap-2">
          {llm && canActAsAgency && (
            scan.generatedProposalId ? (
              <Link href={`/app/docs/${scan.generatedProposalId}`}>
                <Button variant="secondary" size="sm" leadingIcon={<DocumentTextIcon className="h-4 w-4" />}>
                  View proposal
                </Button>
              </Link>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateProposal}
                loading={generatingProposal}
                leadingIcon={<DocumentTextIcon className="h-4 w-4" />}
              >
                Generate proposal
              </Button>
            )
          )}
          {isShared ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleCopy}
              leadingIcon={copied ? <ClipboardDocumentCheckIcon className="h-4 w-4" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
            >
              {copied ? "Copied!" : "Copy link"}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleShare}
              loading={sharing}
              leadingIcon={<LinkIcon className="h-4 w-4" />}
            >
              Share report
            </Button>
          )}

          <Menu as="div" className="relative">
            <MenuButton
              className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--border-2)] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] focus:outline-none"
              aria-label="More actions"
              title="More actions"
            >
              <EllipsisHorizontalIcon className="h-4 w-4" />
            </MenuButton>
            <MenuItems anchor="bottom end" className={actionMenuPanel}>
              <MenuItem>
                <button type="button" className={actionMenuItem} onClick={handleRescan} disabled={rescanning}>
                  <ArrowPathIcon className="h-4 w-4 text-[var(--text-4)]" />
                  {rescanning ? "Re-scanning…" : "Re-scan"}
                </button>
              </MenuItem>
              <MenuItem>
                <Link href={`/app/pulse/${scan.id}/report`} target="_blank" rel="noopener noreferrer" className={actionMenuItem}>
                  <DocumentTextIcon className="h-4 w-4 text-[var(--text-4)]" />
                  Report
                </Link>
              </MenuItem>
              <MenuItem>
                <button type="button" className={actionMenuItem} onClick={handleDownloadPdf} disabled={pdfPending}>
                  <DocumentArrowDownIcon className="h-4 w-4 text-[var(--text-4)]" />
                  {pdfPending ? "Preparing PDF…" : "PDF"}
                </button>
              </MenuItem>
              {canActAsAgency ? (
                <MenuItem>
                  <button
                    type="button"
                    className={actionMenuItem}
                    onClick={() => { setEmailSent(false); setEmailError(null); setEmailModalOpen(true); }}
                  >
                    <EnvelopeIcon className="h-4 w-4 text-[var(--text-4)]" />
                    Email audit
                  </button>
                </MenuItem>
              ) : null}
            </MenuItems>
          </Menu>
        </div>
      </div>

      {(isShared && reportUrl) || shareError || proposalGenError ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isShared && reportUrl && (
            <div className="flex items-center gap-2">
              <span className="select-all break-all rounded border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-1 font-mono text-[11px] text-[var(--text-3)]">
                {reportUrl}
              </span>
              <button
                type="button"
                onClick={handleUnshare}
                disabled={unsharing}
                className="text-[11px] text-red-500 hover:underline disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          )}
          {shareError && (
            <p className="text-[11px] text-red-600">{shareError}</p>
          )}
          {proposalGenError && (
            <p className="text-[11px] text-red-600">{proposalGenError}</p>
          )}
        </div>
      ) : null}
    </>
  );
}
