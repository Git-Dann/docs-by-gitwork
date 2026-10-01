# Connecting a desktop MCP client

Foundry uses the same OAuth authorization-code flow with S256 PKCE for web and
desktop clients. Desktop clients can register HTTP callbacks on `127.0.0.1`,
`[::1]`, or `localhost`, including the temporary port chosen by the client.
Web clients continue to use HTTPS callbacks. Registration rejects credentials,
fragments, and remote HTTP hosts (including names such as `localhost.example.com`).

In the desktop app, add Foundry as a **Streamable HTTP** server with this URL:

```text
https://foundry.gitwork.co.uk/api/mcp
```

Use **Automatic** or **Dynamic client registration (DCR)** and choose
**Authenticate**, then sign in to Foundry and approve the connection. Foundry
currently advertises DCR; this change does not add Client ID Metadata Documents
(CIMD). A server being enabled does not mean the user has authenticated.

For Codex CLI, the equivalent setup is:

```sh
codex mcp add foundry --url https://foundry.gitwork.co.uk/api/mcp
codex mcp login foundry
```

An error mentioning `invalid_client_metadata` and `redirect_uris must be https://`
comes from the old registration validator, which rejected desktop IP loopback
callbacks. Deploy the fix before retrying authentication. A fresh connection
still requires Foundry consent and the member's existing MCP permission; no new
permission or token type is introduced. Authorization still matches the exact
registered redirect URI, and token exchange still checks the URI bound to the
single-use code and its PKCE verifier.

Regression check (no database or credentials needed):

```sh
npx vitest run src/server/__tests__/oauth-registration.test.ts
```

Reference: [RFC 8252 §7.3 — loopback interface redirection](https://www.rfc-editor.org/rfc/rfc8252#section-7.3).
