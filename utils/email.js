const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'LAUNCH TIME <onboarding@resend.dev>';

async function sendEmail({ to, subject, html }) {
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error('Resend error:', error);
    }
  } catch (err) {
    // Email failures should never crash the request that triggered them.
    console.error('Failed to send email:', err.message);
  }
}

// Anything a user or vendor typed (names, dish names) is escaped before it goes
// into an email's HTML, so a dish called "<img onerror=...>" shows up as text
// instead of running in the recipient's mail client.
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const baseWrapper = (title, bodyHtml) => `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h2 style="color:#e85d04;">LAUNCH TIME</h2>
    <h3>${title}</h3>
    ${bodyHtml}
    <p style="color:#888; font-size: 12px; margin-top: 32px;">
      LAUNCH TIME — Local Food Ordering System
    </p>
  </div>
`;

async function sendPasswordResetEmail(to, fullname, resetUrl) {
  const html = baseWrapper(
    'Reset your password',
    `<p>Hi ${escapeHtml(fullname)},</p>
     <p>We received a request to reset your password. Click the button below to
     choose a new one. This link expires in ${process.env.RESET_TOKEN_EXPIRES_MIN || 30} minutes.</p>
     <p><a href="${escapeHtml(resetUrl)}" style="background:#e85d04;color:#fff;padding:10px 20px;
     border-radius:6px;text-decoration:none;display:inline-block;">Reset Password</a></p>
     <p>If you didn't request this, you can safely ignore this email.</p>`
  );
  await sendEmail({ to, subject: 'Reset your LAUNCH TIME password', html });
}

async function sendOrderConfirmationEmail(to, fullname, order) {
  const itemsHtml = order.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 8px;">${escapeHtml(i.food_name)}</td><td style="padding:4px 8px;">x${i.quantity}</td><td style="padding:4px 8px;">₦${(i.price * i.quantity).toFixed(2)}</td></tr>`
    )
    .join('');

  // Food / delivery lines. Orders placed before delivery fees existed have no
  // subtotal, so they just show the total as before.
  const fee = Number(order.delivery_fee || 0);
  const breakdownHtml =
    order.subtotal === null || order.subtotal === undefined
      ? ''
      : `<p style="margin:0;">Food: ₦${Number(order.subtotal).toFixed(2)}</p>
     <p style="margin:0 0 8px;">Delivery: ${fee > 0 ? `₦${fee.toFixed(2)}` : 'Free'}</p>`;

  const html = baseWrapper(
    'Order Confirmed 🎉',
    `<p>Hi ${escapeHtml(fullname)},</p>
     <p>Your order <strong>#${escapeHtml(order.id.slice(0, 8))}</strong> has been placed successfully.</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0;">
       ${itemsHtml}
     </table>
     ${breakdownHtml}
     <p><strong>Total: ₦${Number(order.total).toFixed(2)}</strong></p>
     <p>You can track its status anytime from "My Orders" in the app.</p>`
  );
  await sendEmail({ to, subject: 'Your LAUNCH TIME order confirmation', html });
}

async function sendOrderStatusUpdateEmail(to, fullname, order) {
  const html = baseWrapper(
    'Order Status Updated',
    `<p>Hi ${escapeHtml(fullname)},</p>
     <p>Your order <strong>#${escapeHtml(order.id.slice(0, 8))}</strong> status changed to:
     <strong style="text-transform:capitalize;">${escapeHtml(order.status)}</strong></p>`
  );
  await sendEmail({ to, subject: `Order update: ${order.status}`, html });
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusUpdateEmail,
};
