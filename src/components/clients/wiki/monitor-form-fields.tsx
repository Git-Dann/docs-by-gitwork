"use client";

/**
 * The monitor fields, shared by the wiki's Monitors section (add + edit, inline) and the
 * Monitors page's Add monitor popup. State and the request rules are in
 * `src/lib/monitor-form.ts`; this file only draws them, so the two places always offer the
 * same fields with the same wording.
 */

import { useState } from "react";
import { basicAuthValue } from "@/lib/monitor-request";
import { MONITOR_METHODS, MONITOR_TYPE_OPTIONS, type MonitorFormState, type MonitorFormType } from "@/lib/monitor-form";
import { MONITOR_ENVIRONMENTS, isClientVisibleEnvironment, type MonitorEnvironment } from "@/lib/monitor-environment";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/** 16px on a phone, so iOS doesn't zoom the page when a field takes focus. */
export const monitorInputCls =
  "w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 text-base text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] sm:text-[14px]";

const labelCls = "text-[12px] font-medium text-[var(--text-2)]";

export function MonitorFormFields({
  form,
  setForm,
  /** Editing a heartbeat: its ping URL is tied to the type, so the type can't change. */
  lockType = false,
}: {
  form: MonitorFormState;
  setForm: (f: MonitorFormState) => void;
  lockType?: boolean;
}) {
  const hint = MONITOR_TYPE_OPTIONS.find((t) => t.value === form.type)?.hint ?? "";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          Name
          <input
            className={`mt-1 ${monitorInputCls}`}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Website, API, Database…"
          />
        </label>
        <label className={labelCls}>
          Type
          <select
            className="app-select-compact mt-1 w-full"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as MonitorFormType })}
            disabled={lockType}
          >
            {MONITOR_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          Environment
          <select
            className="app-select-compact mt-1 w-full"
            value={form.environment}
            onChange={(e) => setForm({ ...form, environment: e.target.value as MonitorEnvironment })}
          >
            {MONITOR_ENVIRONMENTS.map((env) => (
              <option key={env.value} value={env.value}>
                {env.label}
              </option>
            ))}
          </select>
        </label>
        <p className="self-end pb-1 text-[12px] text-[var(--text-3)]" data-environment-hint>
          {isClientVisibleEnvironment(form.environment)
            ? "Shown on the client's status board."
            : "Only Gitwork sees this one. The client's status board shows Production only."}
        </p>
      </div>

      {form.type === "HEARTBEAT" ? (
        <p className="text-[12px] text-[var(--text-3)]">
          Foundry gives this monitor a ping URL. Add a request to it at the end of the job
          (for example <code style={{ fontFamily: MONO }}>curl -fsS &lt;url&gt;</code>), or
          call <code style={{ fontFamily: MONO }}>&lt;url&gt;/fail</code> when the run fails.
          If no ping arrives within the interval plus grace, it goes down.
        </p>
      ) : (
        <label className={`block ${labelCls}`}>
          {form.type === "TCP" ? "Host and port" : "Address to check"}
          <input
            className={`mt-1 ${monitorInputCls}`}
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
            placeholder={hint}
            style={{ fontFamily: MONO }}
            spellCheck={false}
            autoComplete="off"
            inputMode="url"
          />
        </label>
      )}

      {form.type === "HTTP" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className={labelCls}>
            Method
            <select
              className="app-select-compact mt-1 w-full"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            >
              {MONITOR_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Expected status
            <input
              className={`mt-1 ${monitorInputCls}`}
              value={form.expectedStatus}
              onChange={(e) => setForm({ ...form, expectedStatus: e.target.value })}
              placeholder="any 2xx/3xx"
              inputMode="numeric"
            />
          </label>
          <label className={`col-span-2 sm:col-span-1 ${labelCls}`}>
            Keyword (optional)
            <input
              className={`mt-1 ${monitorInputCls}`}
              value={form.keyword}
              onChange={(e) => setForm({ ...form, keyword: e.target.value })}
              placeholder="must contain…"
            />
          </label>
        </div>
      )}

      {form.type === "HTTP" && <RequestOptions form={form} setForm={setForm} />}

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {form.type === "HEARTBEAT" ? "Expected every (min)" : "Check every (min)"}
          <input
            className={`mt-1 ${monitorInputCls}`}
            value={form.intervalMinutes}
            onChange={(e) => setForm({ ...form, intervalMinutes: e.target.value })}
            inputMode="numeric"
          />
        </label>
        {form.type === "HEARTBEAT" ? (
          <label className={labelCls}>
            Grace (min, optional)
            <input
              className={`mt-1 ${monitorInputCls}`}
              value={form.graceMinutes}
              onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })}
              placeholder="a fifth of the interval"
              inputMode="numeric"
            />
          </label>
        ) : (
          <label className={labelCls}>
            Slow after (ms, optional)
            <input
              className={`mt-1 ${monitorInputCls}`}
              value={form.degradedMs}
              onChange={(e) => setForm({ ...form, degradedMs: e.target.value })}
              placeholder="e.g. 2000"
              inputMode="numeric"
            />
          </label>
        )}
      </div>
    </div>
  );
}

/**
 * Headers (an API key, a bearer token, a sign-in) and a POST body for HTTP checks. Values are
 * stored encrypted and never sent back to the browser, so editing shows the saved names only.
 */
function RequestOptions({ form, setForm }: { form: MonitorFormState; setForm: (f: MonitorFormState) => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showSignIn, setShowSignIn] = useState(false);

  function addLine(line: string) {
    const rest = form.headersText
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.toLowerCase().startsWith("authorization:"));
    setForm({ ...form, headersText: [...rest, line].join("\n"), clearHeaders: false });
  }

  return (
    <div className="space-y-2">
      <label className={`block ${labelCls}`}>
        Request headers (optional)
        <textarea
          className={`mt-1 min-h-[64px] ${monitorInputCls}`}
          style={{ fontFamily: MONO }}
          value={form.headersText}
          onChange={(e) => setForm({ ...form, headersText: e.target.value, clearHeaders: false })}
          placeholder={
            form.savedHeaders.length
              ? "Leave blank to keep the saved headers"
              : "One per line, e.g.\nAuthorization: Bearer <token>\nX-Api-Key: <key>"
          }
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {form.savedHeaders.length > 0 && !form.clearHeaders ? (
          <>
            <span className="text-[var(--text-3)]">Saved: {form.savedHeaders.join(", ")}</span>
            <button
              type="button"
              onClick={() => setForm({ ...form, clearHeaders: true, headersText: "" })}
              className="text-[var(--danger-500)] hover:underline"
            >
              Remove saved headers
            </button>
          </>
        ) : form.clearHeaders ? (
          <span className="text-[var(--warning-500)]">Saved headers will be removed when you save.</span>
        ) : null}
        <button type="button" onClick={() => setShowSignIn((v) => !v)} className="text-[var(--brand-700)] hover:underline">
          {showSignIn ? "Hide sign-in" : "Add a username and password"}
        </button>
      </div>
      {showSignIn ? (
        <div className="flex flex-wrap items-end gap-2">
          <input
            className={`${monitorInputCls} max-w-[180px]`}
            placeholder="Username"
            aria-label="Username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="off"
          />
          <input
            className={`${monitorInputCls} max-w-[180px]`}
            placeholder="Password"
            aria-label="Password"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            disabled={!user}
            onClick={() => {
              addLine(`Authorization: ${basicAuthValue(user, pass)}`);
              setUser("");
              setPass("");
              setShowSignIn(false);
            }}
            className="rounded-[7px] border border-[var(--border-2)] px-3 py-2 text-[13px] text-[var(--text-2)] hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : null}
      {form.method === "POST" ? (
        <label className={`block ${labelCls}`}>
          Request body (optional)
          <textarea
            className={`mt-1 min-h-[64px] ${monitorInputCls}`}
            style={{ fontFamily: MONO }}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder='e.g. {"ping": true}. Leave blank to keep what&apos;s saved.'
            spellCheck={false}
          />
        </label>
      ) : null}
      <p className="text-[11px] text-[var(--text-4)]">
        Stored encrypted and only sent to this monitor&apos;s own address. Redirects to another
        site are refused while headers are set.
      </p>
    </div>
  );
}
