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

## Apply / update on the VPS

```bash
# from your machine — copy this file up
scp deploy/nginx/foundry.conf root@194.164.127.222:/etc/nginx/sites-available/foundry

# on the VPS — validate, then reload (restart if buffer/keepalive changes must
# take effect for existing connections immediately)
nginx -t && systemctl restart nginx
```

Certbot manages the `listen 443 ssl` / `ssl_certificate*` lines — keep them.
