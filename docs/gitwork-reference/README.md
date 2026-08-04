# Gitwork signing emails, HTML set

31 designed emails. 600px, table based, inline styles only. Open `00-preview-gallery.html` to see them all and copy any one to clipboard.

## Files

| File | What it is |
| --- | --- |
| `00-preview-gallery.html` | Preview all 31, copy button per email |
| `N1` to `N7` | DocuSeal native slots, Settings then Personalization |
| `F1` to `F16` | Foundry webhook driven, paste into your mailer |
| `D1` to `D8` | Per document sign requests, one DocuSeal template each |
| `gitwork-mark.png` | Header mark for light emails |
| `gitwork-mark-light.png` | Header mark for dark internal emails |

## Before you send anything

1. **Host the two PNGs.** Every email points at `https://gitwork.co.uk/email/gitwork-mark.png` and `.../gitwork-mark-light.png`. Upload both to that path or find and replace the URLs. Until then the header shows a broken image.
2. **HTML personalisation needs DocuSeal Pro.** The stock AGPL build only accepts plain text in the personalisation slots. Plain text versions are in the earlier templates document if you want to run on plain text for now.
3. **HTML email in DocuSeal also needs a connected Gmail or Outlook account, or configured SMTP.** Worth checking on the self hosted instance before you assume the Pro licence alone fixes it.
4. **Send yourself every template once in Test Mode.** Gmail, Outlook desktop, iPhone Mail. Three clients catches almost everything.

## Design notes

| Choice | Why |
| --- | --- |
| Fraunces and Inter loaded via web font link | Apple Mail and iOS honour it. Gmail and Outlook fall back to Georgia and Arial, which is why the fallback stack is set deliberately rather than left to chance. |
| Table based, no flexbox or grid | Outlook uses Word to render. Anything modern breaks. |
| Padded table cell buttons, not VML | Works everywhere. Outlook desktop loses the rounded corners and keeps a square purple button, which is fine. |
| Cream page background, white card | Matches the site. Ink background on internal alerts only, so a client email and an internal alert can never be confused at a glance. |
| Preheader text hidden in a div | Controls the grey line next to the subject in the inbox. Set per email, never left to pull the first sentence. |
| `color-scheme: light only` | Stops Outlook and some Gmail dark modes inverting the cream to muddy brown. |
| One CTA per email | Two competing buttons on a signature request lowers signature rate. |

## Patterns

| Pattern | Used for | Look |
| --- | --- | --- |
| Action | Anything needing a signature, payment or booking | Purple eyebrow, big heading, purple CTA, mono meta strip |
| Confirm | Signature received, signed copy | Attachment card, no urgent CTA |
| Steps | Signed and next steps, kickoff | Playfair italic numerals, one CTA at the end |
| Notice | Declined, expired, withdrawn, graceful exit | Muted eyebrow, text link not a button, deliberately low key |
| Internal | Foundry alerts to the team | Ink card, mono throughout, cream mark, ghost button |
