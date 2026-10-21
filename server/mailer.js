// Sends account and order emails through Resend's HTTP API when RESEND_API_KEY is set. Without a
// key the message (including any link) is written to the server log instead, which is all local
// development needs.
const { cafe } = require('./config');

const API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.MAIL_FROM || `${cafe.name} <onboarding@resend.dev>`;
const enabled = Boolean(API_KEY);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function layout({ heading, body, action, link, footnote }) {
  const button = link
    ? `<p style="margin:0 0 26px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#7a3e1d;color:#fff;text-decoration:none;font-weight:bold">${escapeHtml(action)}</a></p>`
    : '';
  const fallback = link ? `<br>If the button does not work, paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span>` : '';
  return `<!doctype html><html><body style="margin:0;background:#faf6f0;font-family:Arial,sans-serif;color:#2b211b">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px">
    <p style="font-family:Georgia,serif;font-size:18px;font-weight:bold;margin:0 0 28px;color:#7a3e1d">${escapeHtml(cafe.name)}</p>
    <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal;margin:0 0 14px">${escapeHtml(heading)}</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 26px;white-space:pre-line">${escapeHtml(body)}</p>
    ${button}
    <p style="font-size:12px;line-height:1.6;color:#8a7d72;margin:0">${escapeHtml(footnote)}${fallback}</p>
  </div></body></html>`;
}

async function send({ to, subject, text, html }) {
  if (!enabled) {
    console.log(`[mail] Email sending is not configured. Message for ${to}: ${subject}\n${text}`);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Email provider returned ${response.status}: ${detail.slice(0, 200)}`);
  }
}

function sendVerification(user, link) {
  const footnote = `This link works for 24 hours. If you did not create an account at ${cafe.name}, you can ignore this email.`;
  return send({
    to: user.email,
    subject: `Confirm your email for ${cafe.name}`,
    text: `Hi ${user.name},\n\nConfirm your email to start ordering ahead:\n${link}\n\n${footnote}`,
    html: layout({ heading: `Welcome, ${user.name}.`, body: 'Confirm your email address and you can order ahead for pickup.', action: 'Confirm my email', link, footnote })
  });
}

function sendPasswordReset(user, link) {
  const footnote = 'This link works for 1 hour and can be used once. If you did not ask for a reset, ignore this email: your password has not changed.';
  return send({
    to: user.email,
    subject: `Reset your ${cafe.name} password`,
    text: `Hi ${user.name},\n\nChoose a new password here:\n${link}\n\n${footnote}`,
    html: layout({ heading: 'Choose a new password.', body: 'Someone (hopefully you) asked to reset the password for your account.', action: 'Reset my password', link, footnote })
  });
}

function sendOrderConfirmation(user, order, lines, pickupLabel, total) {
  const list = lines.map(line => `${line.quantity} × ${line.name}`).join('\n');
  const body = `Order #${order.number} is in. Pick it up ${pickupLabel} at ${cafe.address}.\n\n${list}\n\nTotal ${total}, paid at the counter.`;
  return send({
    to: user.email,
    subject: `Order #${order.number} confirmed`,
    text: `Hi ${user.name},\n\n${body}`,
    html: layout({ heading: 'Thanks, your order is in.', body, footnote: `Questions? Call us on ${cafe.phone}.` })
  });
}

module.exports = { enabled, sendVerification, sendPasswordReset, sendOrderConfirmation };
