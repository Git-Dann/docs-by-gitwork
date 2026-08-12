/**
 * HTML Email Templates for Gitwork E-Signatures.
 *
 * 1. renderSignatureRequestEmailHtml: Initial request email sent to client/signatory.
 * 2. renderLinkExpiredEmailHtml: Notification/re-issue email sent when a link expires.
 */

export interface SignatureRequestEmailParams {
  documentTitle: string;
  clientFirstName: string;
  signingUrl: string;
  senderName: string;
  expiresAtFormatted?: string;
  logoUrl?: string;
}

export interface LinkExpiredEmailParams {
  documentTitle: string;
  clientFirstName: string;
  reissueUrl: string;
  senderName?: string;
  logoUrl?: string;
}

const DEFAULT_LOGO_URL = "https://gitwork.co.uk/email/gitwork-mark.png";

/**
 * Renders the Signature Request HTML email template.
 */
export function renderSignatureRequestEmailHtml(params: SignatureRequestEmailParams): string {
  const {
    documentTitle,
    clientFirstName,
    signingUrl,
    senderName,
    expiresAtFormatted = "30 days from send",
    logoUrl = DEFAULT_LOGO_URL,
  } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(documentTitle)} for signature, from Gitwork</title>
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700&amp;family=Inter:wght@300;400;500;600&amp;family=JetBrains+Mono:wght@400;600&amp;family=Playfair+Display:ital@1&amp;display=swap" rel="stylesheet"><!--<![endif]-->
<!--[if mso]><style>body,table,td,p,a,h1{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}</style>
</head>
<body bgcolor="#F2EDE4" style="margin:0;padding:0;width:100%;background-color:#F2EDE4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2EDE4" style="background-color:#F2EDE4;margin:0;padding:0;">
<tbody><tr><td align="center" style="padding:38px 16px;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#F2EDE4;">Two minutes, any device, no account needed.</div>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;max-width:600px;background-color:#FFFFFF;border:1px solid #EAE5DC;border-radius:6px;">
<tbody><tr><td style="padding:32px 36px 0 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody><tr>
<td valign="middle" style="width:46px;"><img src="${logoUrl}" width="42" height="42" alt="Gitwork" style="display:block;width:42px;height:42px;border:0;border-radius:50%;"></td>
<td valign="middle" align="right"></td>
</tr></tbody></table></td></tr>
<tr><td style="padding:30px 36px 8px 36px;">
<p style="margin:0 0 14px 0;font-family:'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:#6B52FF;">Signature requested</p>
<h1 style="margin:0 0 20px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:31px;font-weight:700;line-height:1.16;letter-spacing:-0.4px;color:#0C0C18;">${escapeHtml(documentTitle)} is<br>ready to sign.</h1>
<p style="margin:0px 0 18px 0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:16px;line-height:1.62;color:#1A1A1E;">Hi ${escapeHtml(clientFirstName)},</p>
<p style="margin:0px 0 18px 0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:16px;line-height:1.62;color:#1A1A1E;">Everything we agreed is in here. Two minutes on any device, no account needed.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
<tbody><tr><td align="center" bgcolor="#6B52FF" style="border-radius:4px;">
<a href="${signingUrl}" style="display:inline-block;padding:17px 34px;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:15px;font-weight:600;letter-spacing:0.2px;color:#FFFFFF;text-decoration:none;border-radius:4px;">Review and sign</a>
</td></tr></tbody></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EAE5DC" style="border-radius:4px;margin:6px 0 22px 0;">
<tbody><tr><td style="padding:18px 20px 11px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td style="padding:0 0 7px 0;font-family:'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace;font-size:11px;letter-spacing:1.1px;text-transform:uppercase;color:#6B6B6B;width:118px;">Document</td><td style="padding:0 0 7px 0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:14px;color:#1A1A1E;font-weight:500;">${escapeHtml(documentTitle)}</td></tr><tr><td style="padding:0 0 7px 0;font-family:'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace;font-size:11px;letter-spacing:1.1px;text-transform:uppercase;color:#6B6B6B;width:118px;">Sent by</td><td style="padding:0 0 7px 0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:14px;color:#1A1A1E;font-weight:500;">${escapeHtml(senderName)}</td></tr><tr><td style="padding:0 0 7px 0;font-family:'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace;font-size:11px;letter-spacing:1.1px;text-transform:uppercase;color:#6B6B6B;width:118px;">Expires</td><td style="padding:0 0 7px 0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:14px;color:#1A1A1E;font-weight:500;">${escapeHtml(expiresAtFormatted)}</td></tr></tbody></table></td></tr></tbody></table>
<p style="margin:0px 0 18px 0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:16px;line-height:1.62;color:#1A1A1E;">You get a signed PDF copy the moment everyone has signed.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0 0;"><tbody><tr><td><p style="margin:0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:16px;line-height:1.5;color:#1A1A1E;font-weight:600;">${escapeHtml(senderName)}</p><p style="margin:2px 0 0 0;font-family:'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace;font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:#6B6B6B;">Gitwork</p></td></tr></tbody></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #EAE5DC;margin:28px 0 0 0;"><tbody><tr><td style="padding:18px 0 0 0;"><p style="margin:0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:14px;line-height:1.6;color:#6B6B6B;">Anything in it you want changed, reply to this email and we will sort it. Do not sign something you are not happy with.</p></td></tr></tbody></table>
</td></tr>
<tr><td style="padding:0 36px 34px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #EAE5DC;">
<tbody><tr><td style="padding:20px 0 0 0;font-family:'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace;font-size:10px;line-height:1.9;letter-spacing:0.4px;color:#6B6B6B;">Gitwork Group Ltd · Company no. 15756347 · VAT no. 468314867<br>3rd Floor, Anchorage One, Anchorage Quay, Salford Quays, Manchester M50 3YJ<br><a href="https://gitwork.co.uk" style="color:#6B6B6B;text-decoration:none;">gitwork.co.uk</a></td></tr>
</tbody></table></td></tr>
</tbody></table>
</td></tr></tbody></table>
</body></html>`;
}

/**
 * Renders the Link Expired HTML email template.
 */
export function renderLinkExpiredEmailHtml(params: LinkExpiredEmailParams): string {
  const {
    documentTitle,
    clientFirstName,
    reissueUrl,
    senderName = "Harry",
    logoUrl = DEFAULT_LOGO_URL,
  } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(documentTitle)} has expired</title>
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700&amp;family=Inter:wght@300;400;500;600&amp;family=JetBrains+Mono:wght@400;600&amp;family=Playfair+Display:ital@1&amp;display=swap" rel="stylesheet"><!--<![endif]-->
<!--[if mso]><style>body,table,td,p,a,h1{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}</style>
</head>
<body bgcolor="#F2EDE4" style="margin:0;padding:0;width:100%;background-color:#F2EDE4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2EDE4" style="background-color:#F2EDE4;margin:0;padding:0;">
<tbody><tr><td align="center" style="padding:38px 16px;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#F2EDE4;">Nothing lost. I can re issue in a minute.</div>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;max-width:600px;background-color:#FFFFFF;border:1px solid #EAE5DC;border-radius:6px;">
<tbody><tr><td style="padding:32px 36px 0 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody><tr>
<td valign="middle" style="width:46px;"><img src="${logoUrl}" width="42" height="42" alt="Gitwork" style="display:block;width:42px;height:42px;border:0;border-radius:50%;"></td>
<td valign="middle" align="right"></td>
</tr></tbody></table></td></tr>
<tr><td style="padding:30px 36px 8px 36px;">
<p style="margin:0 0 14px 0;font-family:'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:#6B6B6B;">Link expired</p>
<h1 style="margin:0 0 20px 0;font-family:'Fraunces', Georgia, 'Times New Roman', serif;font-size:31px;font-weight:700;line-height:1.16;letter-spacing:-0.4px;color:#0C0C18;">The signing link<br>has expired.</h1>
<p style="margin:0px 0 18px 0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:16px;line-height:1.62;color:#1A1A1E;">Hi ${escapeHtml(clientFirstName)},</p>
<p style="margin:0px 0 18px 0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:16px;line-height:1.62;color:#1A1A1E;">Nothing lost. I can re issue ${escapeHtml(documentTitle)} in a minute.</p>
<p style="margin:0px 0 18px 0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:16px;line-height:1.62;color:#1A1A1E;">Want it sent again as it stands, or has something changed on your side that we should update first?</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
<tbody><tr><td align="center" bgcolor="#6B52FF" style="border-radius:4px;">
<a href="${reissueUrl}" style="display:inline-block;padding:17px 34px;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:15px;font-weight:600;letter-spacing:0.2px;color:#FFFFFF;text-decoration:none;border-radius:4px;">Send it again</a>
</td></tr></tbody></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0 0;"><tbody><tr><td><p style="margin:0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:16px;line-height:1.5;color:#1A1A1E;font-weight:600;">${escapeHtml(senderName)}</p><p style="margin:2px 0 0 0;font-family:'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace;font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:#6B6B6B;">Gitwork</p></td></tr></tbody></table>
</td></tr>
<tr><td style="padding:0 36px 34px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #EAE5DC;">
<tbody><tr><td style="padding:20px 0 0 0;font-family:'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace;font-size:10px;line-height:1.9;letter-spacing:0.4px;color:#6B6B6B;">Gitwork Group Ltd · Company no. 15756347 · VAT no. 468314867<br>3rd Floor, Anchorage One, Anchorage Quay, Salford Quays, Manchester M50 3YJ<br><a href="https://gitwork.co.uk" style="color:#6B6B6B;text-decoration:none;">gitwork.co.uk</a></td></tr>
</tbody></table></td></tr>
</tbody></table>
</td></tr></tbody></table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
