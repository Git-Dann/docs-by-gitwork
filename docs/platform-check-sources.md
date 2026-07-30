# Platform check families — sources

Every check in the desktop, React Native, CLI, API-behaviour and browser-extension
families traces to a documented platform rule rather than to a preference. This file
is the citation list, so a disputed finding can be settled against the vendor's own
documentation instead of an argument about style.

It also records the **version-pinned constants**, which are the parts of these
families that go stale on a schedule. Each is a single named constant with a
"bump this line" comment; this table is where to check them from.

## Version-pinned constants

| Constant | File | Current value | Moves when |
|---|---|---|---|
| `ELECTRON_OLDEST_SUPPORTED_MAJOR` | `desktop-app.ts` | 41 | Electron ships a major every 8 weeks and supports the latest three. Electron 40 went EOL 30 June 2026. |
| `RN_OLDEST_SUPPORTED_MINOR` | `react-native-app.ts` | 84 | React Native maintains the latest three minor series. As of July 2026: 0.86 current, 0.85 supported, 0.84 security-only. |
| `PLAY_TARGET_SDK_FLOOR` | `android-app.ts` | 35 | Google Play raises the minimum target API level each August. |

An out-of-date constant here produces a WRONG finding, not a missing one — an app
on a supported version reported as end-of-life. Check these before trusting a
version finding in a client report.

## Desktop — Electron

Primary source: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

| Check | Rule |
|---|---|
| `electron_node_integration` | `nodeIntegration` must be `false`. With `contextIsolation: false` this is a direct RCE path from any script the renderer loads. |
| `electron_context_isolation` | `contextIsolation` must be `true`. Default since Electron 12, so *absence* is a pass — this distinction is why `readBooleanSetting` returns `null` rather than `false` for a missing key. |
| `electron_sandbox` | `sandbox` must be `true`. Default since Electron 20; commonly disabled to let a preload use Node. |
| `electron_web_security` | `webSecurity: false` disables the same-origin policy. Usually added to work around CORS in development. |
| `electron_insecure_content` | `allowRunningInsecureContent` must be `false`. |
| `electron_experimental_features` | `experimentalFeatures` / `enableBlinkFeatures` enable unaudited Chromium surface. |
| `electron_webview_tag` | Electron documents `<webview>` as high-attack-surface and recommends `WebContentsView`. |
| `electron_remote_module` | The remote module was removed from core; it collapses the process boundary. |
| `electron_navigation_guard` | `will-navigate` must `preventDefault()` untrusted origins. |
| `electron_window_open_handler` | `setWindowOpenHandler` should return `{ action: 'deny' }` by default. |
| `electron_open_external_validated` | `shell.openExternal` hands the string to the OS handler — validate the scheme. |
| `electron_permission_handler` | `setPermissionRequestHandler` — otherwise media/geolocation are auto-granted. |
| `electron_ipc_sender_validation` | Validate `event.senderFrame` — handlers are reachable from every frame. |
| `electron_preload_surface` | `contextBridge` must expose named functions, not `ipcRenderer` itself. |
| `electron_csp` | Electron applies no default CSP. |
| `electron_version_supported` | Latest three majors only. See the constants table. |
| `electron_asar_enabled` | ASAR + `asarIntegrity` for signed builds. |
| `electron_code_signing` | Gatekeeper refuses unsigned macOS builds; SmartScreen warns on Windows. |
| `electron_auto_update` / `electron_update_transport` | An HTTP update feed is a code-execution channel. |
| `electron_fuses` | [`@electron/fuses`](https://www.electronjs.org/docs/latest/tutorial/fuses) disables `RunAsNode`, `EnableNodeCliInspectArguments`, `EnableNodeOptionsEnvironmentVariable`. |

## Desktop — Tauri

Primary sources: [Tauri security](https://v2.tauri.app/security/) and the
[configuration reference](https://v2.tauri.app/reference/config/).

| Check | Rule |
|---|---|
| `tauri_csp` | Tauri injects nonce/hash sources into a declared CSP at compile time; `"csp": null` disables it. |
| `tauri_csp_modification_disabled` | `dangerousDisableAssetCspModification` stops that injection. |
| `tauri_remote_ipc_access` | `dangerousRemoteDomainIpcAccess` exposes IPC to remote pages — the Tauri analogue of `nodeIntegration: true`. |
| `tauri_global_api` | `withGlobalTauri` puts the API on `window` for every script in the bundle. |
| `tauri_updater_signature` | The updater verifies bundles against `pubkey`; without it there is nothing to verify against. |
| `tauri_fs_scope` / `tauri_shell_scope` / `tauri_shell_open_validator` | v2 capability scopes. A `**` wildcard from `$HOME` is read/write to the user's whole tree. |
| `tauri_version_current` | v2 replaced v1's coarse allowlist with per-window capabilities. |

## React Native

Primary sources: [React Native security](https://reactnative.dev/docs/security) and
[Releases / support policy](https://reactnative.dev/docs/releases).

- **`rn_token_storage`** — RN's security page states AsyncStorage is unencrypted and
  must not hold tokens; it names `react-native-keychain` and `expo-secure-store`.
- **`rn_bundled_secret`** — the same page calls out that `react-native-config` and
  `react-native-dotenv` are for environment *variables*, not secrets: they inline the
  value at build time, so it ships in the bundle.
- **`rn_deeplink_credentials`** — URL schemes have no central registry, so any app can
  claim yours. RN's page uses a token-in-deep-link as its worked example.
- **`rn_reporting_pii_scrub`** — "avoid unintentional exposure" via Sentry/Crashlytics.
- **`rn_certificate_pinning`** — documented as a hardening step with a stated rotation
  cost, which is why this check is informational rather than a failure.
- **`rn_hermes_enabled`**, **`rn_new_architecture`**, **`rn_android_proguard`**,
  **`rn_release_logging`**, **`rn_source_maps`** — the standard release checklist.
- **`rn_version_supported`** — latest three minors. See the constants table.

## CLI / published npm package

Primary sources:
[OWASP NPM Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/NPM_Security_Cheat_Sheet.html),
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/).

- **`cli_install_scripts`** — install lifecycle scripts are the mechanism behind npm
  supply-chain worms. pnpm, Yarn and Bun block them by default and npm v12 does the
  same, so an install script is also increasingly *not going to run* for users.
- **`cli_bin_name_safe`** — npm puts `node_modules/.bin` first on PATH for scripts, so
  a `bin` named `node` intercepts that command. Fires even under `--ignore-scripts`.
- **`cli_publish_provenance`** — trusted publishing produces a signed attestation
  tying the tarball to the repo and workflow that built it.
- **`cli_files_allowlist`** — `files` is an allow-list; `.npmignore` is a deny-list,
  so anything newly added publishes by default.
- **`cli_bin_shebang`** — npm symlinks the bin directly on macOS/Linux but generates a
  `.cmd` wrapper on Windows, which is why a missing shebang ships undetected from a
  Windows machine.
- **`cli_exit_codes`, `cli_stderr_for_errors`, `cli_color_respects_tty`** — the argv /
  stdout / stderr / exit-code contract other programs depend on.

## API behaviour

Every check maps to an item in the
[OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
that is observable from outside with an unauthenticated request.

| Check | OWASP item |
|---|---|
| `api_cors_credentials`, `api_cors_origin_reflection` | API8 — Security Misconfiguration |
| `api_verbose_errors` | API8 |
| `api_rate_limit_headers` | API4 — Unrestricted Resource Consumption |
| `api_server_banner`, `api_nosniff_header`, `api_trace_method` | API8 |
| `api_graphql_introspection` | API9 — Improper Inventory Management |
| `api_unauthenticated_data` | API1 — reported as SKIPPED: object-level authorisation needs an authenticated test with two accounts and cannot be inferred from outside. |

## Browser extension

Primary sources: [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/),
[Manifest V3 migration](https://developer.chrome.com/docs/extensions/develop/migrate).

- **`ext_manifest_v3`, `ext_service_worker`, `ext_blocking_webrequest`** — MV2 is no
  longer accepted or run; `webRequestBlocking` is enterprise-policy only in MV3.
- **`ext_host_permissions_scoped`, `ext_content_script_scope`,
  `ext_activetab_alternative`** — over-broad host access is the most common review
  rejection and the largest install-time drop-off.
- **`ext_no_remote_code`, `ext_no_eval`** — remotely-hosted code is banned outright.
- **`ext_web_accessible_resources`** — resources open to all origins make an extension
  fingerprintable from any page.
- **`ext_icons_complete`, `ext_version_format`, `ext_listing_complete`,
  `ext_short_name`** — listing requirements; the version format is enforced at upload,
  after packaging.
