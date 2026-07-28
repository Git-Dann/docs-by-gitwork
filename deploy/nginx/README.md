# nginx — Foundry VPS reverse proxy

The production reverse-proxy config for `foundry.gitwork.co.uk` on the Fasthosts
VPS (`194.164.127.222`). nginx terminates TLS (Let's Encrypt) and proxies to the
Next.js app container on `127.0.0.1:3000`. See CLAUDE.md §23 for the wider
infra picture.

**This is a checked-in mirror for disaster recovery** — the live file lives at
`/etc/nginx/sites-available/foundry` on the VPS (symlinked into
`sites-enabled/`). It is **not** applied automatically by any deploy; the app
deploy (`.github/workflows/deploy.yml`) only touches Docker. If the VPS is ever
rebuilt, restore nginx from `foundry.conf` here.

## The proxy buffer directives (why they matter)

```nginx
proxy_buffer_size 32k;
proxy_buffers 8 32k;
proxy_busy_buffers_size 64k;
```

Without these, nginx uses its 4k/8k default header buffer. Authenticated `/app/*`
responses carry large `Set-Cookie` headers (`gitwork_api_session` + the NextAuth
session JWT, which encodes the user's permissions array). When the combined
headers exceed the buffer, nginx returns **`502 Bad Gateway`** with
`upstream sent too big header while reading response header from upstream` in
`/var/log/nginx/error.log` — even though the app is perfectly healthy. It's
intermittent (only trips on the larger authenticated responses) and easy to
misread as an app crash. Diagnosed + fixed 2026-07-08.

## `server_tokens off` + gzip (added 2026-07-27)

Two things CLAUDE.md described as "an nginx setting on the VPS, outside this
repo" — true until this config was checked in, and no longer.

- **`server_tokens off;`** drops the version from `Server: nginx/1.24.0`. The
  matching app-side change (`poweredByHeader: false`, dropping
  `X-Powered-By: Next.js`) already shipped; this is the other half.
- **`gzip_types`** — ⚠️ corrected 2026-07-28 after reading the box: `gzip on` was
  **already** set globally in `/etc/nginx/nginx.conf`, so "we turn gzip on" was
  wrong. What is missing there is `gzip_types`, which is commented out — and
  without it nginx compresses **only `text/html`**. Verified live: a
  `/_next/static/chunks/*.js` response came back with **no `Content-Encoding` at
  all**, i.e. every JS/CSS/JSON response ships uncompressed. That is the real win.
  `text/html` must **not** be listed (duplicate MIME → `nginx -t` warns). Images
  are excluded on purpose — already-compressed formats gain nothing.

⚠️ **Do not test this with `/deck`.** Middleware gates `/deck**`, so an
unauthenticated probe gets the login redirect and tells you nothing. And
`text/html` is gzipped regardless of `gzip_types`, so even a 200 there would not
test the setting. Probe a **JS chunk** — `application/javascript` is only
compressed if `gzip_types` took effect.

**Neither is live until this file is applied and nginx reloaded** (below).
Editing it here changes nothing on the VPS by itself.

## ⚠️ This file has drifted from the box before — reconcile, don't overwrite

On 2026-07-28 the committed copy was **behind** the live config: live had
`listen 443 ssl http2` on both directives, this file had plain `listen 443 ssl`
(inherited from #332's 8 Jul snapshot, while the live file was edited again on
15 Jul — hence the `foundry.bak.20260708` *and* `foundry.bak.20260715` files on
the box). Applying it would have **passed `nginx -t` and silently dropped
HTTP/2.**

The lesson: `nginx -t` catches a *broken* config, never a *worse* one. Before
applying, read the live file (`VPS ops (manual)` → `inspect`) and diff it against
this one. Only the intended additions should differ.

## Apply / update on the VPS

**Preferred — from CI, no shell needed.** Actions → **VPS ops (manual)** →
`nginx-sync`. It scps this file to a staging path and calls the root-owned
`foundry-nginx-apply`, which backs up, installs, validates, and reloads — or
restores the backup and fails.

That needs a **one-time setup**, because the deploy user CI authenticates as has
no passwordless sudo. Do this once, as root on the VPS:

```bash
# from a checkout of this repo
scp deploy/nginx/foundry-nginx-apply root@194.164.127.222:/tmp/

# then on the box, as root
install -o root -g root -m 0755 /tmp/foundry-nginx-apply /usr/local/sbin/
printf '%s\n' 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/foundry-nginx-apply' \
  > /etc/sudoers.d/foundry-nginx
chmod 0440 /etc/sudoers.d/foundry-nginx
visudo -c        # validate before trusting it
```

Substitute the real `VPS_USER` for `deploy` if it differs — the `nginx-sync` job
prints the exact line with the correct username if the rule is missing.

**Why a script rather than `NOPASSWD: /bin/cp`:** write-anywhere-as-root *is*
root, so a bare `cp` rule would hand the CI deploy key the entire box. The script
hardcodes both paths, is root-owned and not writable by the deploy user, and
sanity-checks the staged file really is the Foundry vhost before installing it.
The deploy user can apply *this* config and nothing else.

**Manual fallback**, if you have root yourself:

```bash
scp deploy/nginx/foundry.conf root@194.164.127.222:/etc/nginx/sites-available/foundry
ssh root@194.164.127.222 'nginx -t && systemctl reload nginx'
```

`reload` rather than `restart` — it is enough for these directives and doesn't
drop live connections. Certbot manages the `listen 443 ssl` / `ssl_certificate*`
lines — keep them, including `http2`.
