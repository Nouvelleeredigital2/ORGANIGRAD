/**
 * Templates email pour les notifications Organigrad.
 * HTML minimaliste, compatible dark mode, responsive.
 */

export interface HitlEmailData {
    nodeName: string;
    roleTitle: string;
    nodeId: string;
    fromStatus: string;
    toStatus: string;
    appUrl?: string;
    generatedAt?: string;
}

export interface FluxEmailData {
    nodeName: string;
    roleTitle: string;
    nodeId: string;
    fromStatus: string;
    toStatus: string;
    error?: string;
    generatedAt?: string;
}

const COLORS = {
    bg: '#fbfbfd',
    card: '#ffffff',
    border: 'rgba(0,0,0,0.07)',
    accent: '#0071e3',
    text1: '#1d1d1f',
    text3: '#6e6e73',
    danger: '#ff3b30',
    success: '#34c759',
};

function baseTemplate(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0" border="0">

          <!-- Logo / brand -->
          <tr>
            <td style="padding-bottom:24px;">
              <span style="display:inline-block;width:32px;height:32px;background:${COLORS.text1};border-radius:9px;text-align:center;line-height:32px;color:#fff;font-size:17px;font-weight:600;letter-spacing:-0.06em;">O</span>
              <span style="margin-left:10px;font-size:15px;font-weight:600;color:${COLORS.text1};vertical-align:middle;letter-spacing:-0.018em;">Organigrad</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:18px;padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;font-size:11px;color:${COLORS.text3};text-align:center;">
              Organigrad · Notification automatique · Ne pas répondre à cet email
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fieldRow(label: string, value: string): string {
    return `
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.text3};font-weight:600;text-transform:uppercase;letter-spacing:0.08em;width:120px;">${escHtml(label)}</td>
        <td style="padding:6px 0;font-size:14px;color:${COLORS.text1};font-weight:500;">${value}</td>
      </tr>`;
}

function codeBadge(text: string): string {
    return `<code style="background:rgba(0,0,0,0.06);border-radius:4px;padding:2px 6px;font-size:12px;font-family:ui-monospace,monospace;">${escHtml(text)}</code>`;
}

/** Email HITL — envoyé quand un nœud passe en WAITING_HUMAN_APPROVAL */
export function buildHitlEmail(data: HitlEmailData): { subject: string; html: string; text: string } {
    const subject = `🔒 Validation requise · ${data.nodeName}`;
    const ts = data.generatedAt ?? new Date().toISOString();

    const buttonHtml = data.appUrl
        ? `
      <tr><td style="padding-top:28px;">
        <a href="${escHtml(data.appUrl)}?view=orchestration&nodeId=${encodeURIComponent(data.nodeId)}"
           style="display:inline-block;background:${COLORS.accent};color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;text-decoration:none;letter-spacing:-0.01em;">
          Ouvrir le Centre de validation →
        </a>
      </td></tr>`
        : '';

    const html = baseTemplate(subject, `
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:${COLORS.text3};">Validation requise</p>
      <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:${COLORS.text1};letter-spacing:-0.02em;">${escHtml(data.nodeName)}</h1>

      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${fieldRow('Rôle', escHtml(data.roleTitle))}
        ${fieldRow('Transition', `${codeBadge(data.fromStatus)} → ${codeBadge(data.toStatus)}`)}
        ${fieldRow('ID nœud', codeBadge(data.nodeId))}
        ${fieldRow('Horodatage', escHtml(ts))}
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${buttonHtml}
      </table>
    `);

    const text = [
        '🔒 VALIDATION REQUISE — ORGANIGRAD',
        '',
        `Nœud : ${data.nodeName}`,
        `Rôle : ${data.roleTitle}`,
        `Transition : ${data.fromStatus} → ${data.toStatus}`,
        `ID : ${data.nodeId}`,
        `Date : ${ts}`,
        ...(data.appUrl
            ? ['', `Lien : ${data.appUrl}?view=orchestration&nodeId=${encodeURIComponent(data.nodeId)}`]
            : []),
        '',
        '---',
        'Organigrad — notification automatique',
    ].join('\n');

    return { subject, html, text };
}

/** Email flux journal — autres transitions */
export function buildFluxEmail(data: FluxEmailData): { subject: string; html: string; text: string } {
    const subject = `[Organigrad] ${data.nodeName} → ${data.toStatus}`;
    const ts = data.generatedAt ?? new Date().toISOString();

    const statusColor = data.toStatus === 'ERROR' ? COLORS.danger
        : data.toStatus === 'IDLE' ? COLORS.success
        : COLORS.accent;

    const errorHtml = data.error
        ? `<tr><td colspan="2" style="padding-top:12px;">
            <div style="background:#fff2f0;border-left:3px solid ${COLORS.danger};border-radius:6px;padding:10px 14px;font-size:13px;color:${COLORS.danger};">
              ⚠️ ${escHtml(data.error)}
            </div>
           </td></tr>`
        : '';

    const html = baseTemplate(subject, `
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:${COLORS.text3};">Transition de statut</p>
      <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:${COLORS.text1};letter-spacing:-0.02em;">
        ${escHtml(data.nodeName)}
        <span style="margin-left:10px;font-size:14px;font-weight:600;color:${statusColor};background:${statusColor}18;padding:3px 10px;border-radius:20px;">${escHtml(data.toStatus)}</span>
      </h1>

      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${fieldRow('Rôle', escHtml(data.roleTitle))}
        ${fieldRow('Transition', `${codeBadge(data.fromStatus)} → ${codeBadge(data.toStatus)}`)}
        ${fieldRow('ID nœud', codeBadge(data.nodeId))}
        ${fieldRow('Horodatage', escHtml(ts))}
        ${errorHtml}
      </table>
    `);

    const text = [
        `[Organigrad] ${data.nodeName} → ${data.toStatus}`,
        '',
        `Rôle : ${data.roleTitle}`,
        `Transition : ${data.fromStatus} → ${data.toStatus}`,
        `ID : ${data.nodeId}`,
        `Date : ${ts}`,
        ...(data.error ? [`Erreur : ${data.error}`] : []),
        '',
        '---',
        'Organigrad — notification automatique',
    ].join('\n');

    return { subject, html, text };
}
