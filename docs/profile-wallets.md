# Wallet passes for public profiles

Every public profile (`/u/<handle>`) can offer **Add to Apple Wallet** and **Add to Google Wallet**.
The pass carries what the page shows: name, role, company, location, a QR code of the page, the
booking link and the person's links. Never an email or phone number. Each wallet is **off until its
secrets are set**, and the button only appears once it's on.

Code: `src/lib/profile-wallet.ts` (pass content), `src/server/profile-wallet.ts` (signing),
`/api/u/[slug]/wallet/apple` and `/api/u/[slug]/wallet/google`.

Secrets are GitHub Actions secrets; `deploy.yml` copies them onto the server. After adding them,
re-run the **Deploy** workflow (Actions → Deploy → Run workflow), and the buttons appear.

## Apple Wallet (about 10 minutes, needs a Mac)

1. **developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → +**
   → **Pass Type IDs** → description "Foundry profile", identifier `pass.co.uk.gitwork.profile`.
2. Open that Pass Type ID → **Create Certificate**. It asks for a signing request:
   on the Mac, **Keychain Access → Certificate Assistant → Request a Certificate From a
   Certificate Authority** → your email, "Saved to disk" → upload the `.certSigningRequest`.
3. Download the `.cer`, double-click it so it lands in Keychain Access (login keychain).
4. In Keychain Access, find **Pass Type ID: pass.co.uk.gitwork.profile**, expand it so the private
   key shows, select both → right-click → **Export 2 items…** → `.p12`, set a password.
5. Base64 it: `base64 -i pass.p12 | pbcopy`
6. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `APPLE_PASS_TYPE_ID` = `pass.co.uk.gitwork.profile`
   - `APPLE_TEAM_ID` = the 10-character Team ID (top right of the developer site)
   - `APPLE_PASS_CERT_P12` = the base64 from step 5
   - `APPLE_PASS_CERT_PASSWORD` = the password from step 4
7. **The badge:** Apple's official "Add to Apple Wallet" badge is behind its Wallet Marketing
   Agreement (developer.apple.com/wallet/add-to-apple-wallet-guidelines → Agree and Download).
   Until it's added the button is plain text with no Apple logo. Send the UK English SVG and it
   gets wired in as `public/brand/add-to-apple-wallet.svg`.

Apple's intermediate certificate (WWDR G4) is already in the code (`src/server/wallet/apple-wwdr.ts`);
it expires 10 Dec 2030.

## Google Wallet (about 15 minutes, plus Google's approval)

1. **pay.google.com/business/console** → create a **Google Wallet API** issuer account for
   Gitwork. Note the **Issuer ID**.
2. **console.cloud.google.com** (any Gitwork project) → **APIs & Services → Enable APIs** →
   enable **Google Wallet API**.
3. **IAM & Admin → Service accounts → Create** (e.g. `foundry-wallet`) → **Keys → Add key →
   JSON**. Download the key file.
4. Back in the Pay & Wallet Console → **Users** → invite the service account's email as
   **Developer**.
5. Base64 the key: `base64 -i key.json | pbcopy`
6. GitHub secrets:
   - `GOOGLE_WALLET_ISSUER_ID` = the Issuer ID
   - `GOOGLE_WALLET_SERVICE_ACCOUNT` = the base64 from step 5
7. **Request publishing access** in the console (Google Wallet API → generic pass). Until Google
   approves it (usually a few days), only accounts added as **test users** in the console can save
   the pass. Add yourselves there to try it straight away.
