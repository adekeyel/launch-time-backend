// Minimal Flutterwave v3 REST client using Node's built-in fetch (Node 18+,
// already required by package.json) — no extra dependency needed.
//
// Required env vars:
//   FLW_SECRET_KEY   - from your Flutterwave dashboard (Settings > API Keys)
//   FLW_WEBHOOK_HASH - a secret string YOU choose, set the same value in
//                      the Flutterwave dashboard's webhook "Secret Hash" field

const FLW_BASE = 'https://api.flutterwave.com/v3';

function assertConfigured() {
  if (!process.env.FLW_SECRET_KEY) {
    throw new Error('FLW_SECRET_KEY is not set — card payments cannot be initialized.');
  }
}

/**
 * Starts a Flutterwave hosted-checkout payment.
 * Returns the checkout URL to redirect the customer to.
 */
async function initializePayment({ txRef, amount, email, name, phone, redirectUrl }) {
  assertConfigured();

  const res = await fetch(`${FLW_BASE}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tx_ref: txRef,
      amount,
      currency: 'NGN',
      redirect_url: redirectUrl,
      customer: { email, name, phonenumber: phone },
      customizations: {
        title: 'LAUNCH TIME',
        description: 'Order payment',
      },
    }),
  });

  const data = await res.json();
  if (!res.ok || data.status !== 'success' || !data.data?.link) {
    throw new Error(data.message || 'Flutterwave payment initialization failed.');
  }
  return data.data.link;
}

/**
 * Verifies a transaction by its tx_ref (works from both the redirect
 * callback and the webhook, without needing Flutterwave's numeric
 * transaction id).
 * Returns { successful: boolean, amount, currency, txRef, raw }.
 */
async function verifyByReference(txRef) {
  assertConfigured();

  const res = await fetch(`${FLW_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, {
    headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
  });
  const data = await res.json();

  if (!res.ok || data.status !== 'success') {
    return { successful: false, raw: data };
  }

  const tx = data.data;
  return {
    successful: tx.status === 'successful',
    amount: tx.amount,
    currency: tx.currency,
    txRef: tx.tx_ref,
    raw: data,
  };
}

module.exports = { initializePayment, verifyByReference };
