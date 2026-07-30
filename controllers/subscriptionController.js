const subscriptionModel = require('../models/subscriptionModel');
const billingRecordModel = require('../models/billingRecordModel');
const vendorModel = require('../models/vendorModel');
const settingsModel = require('../models/settingsModel');
const { query } = require('../config/db');
const { ApiError, ok } = require('../utils/response');

const PRICE_KEYS = {
  pro: { monthly: 'pro_price_monthly', quarterly: 'pro_price_quarterly', yearly: 'pro_price_yearly' },
  enterprise: { monthly: 'enterprise_price_monthly', yearly: 'enterprise_price_yearly' },
};

// There's no background job runner in this app, so instead of a cron
// expiring lapsed subscriptions, we check lazily whenever subscriptions are
// read (see call sites below) and downgrade the vendor back to Tier 1 —
// they keep their OffPay verification, they just lose Pro/Enterprise perks.
async function sweepExpiredSubscriptions() {
  const expired = await subscriptionModel.findExpiredActive();
  for (const sub of expired) {
    await subscriptionModel.expire(sub.id);
    const vendor = await vendorModel.findById(sub.vendor_id);
    if (vendor && vendor.tier > 1) {
      await vendorModel.update(sub.vendor_id, { tier: 1 });
    }
  }
}

// POST /api/vendors/me/subscriptions  { plan: 'pro'|'enterprise', billingCycle }
// Creates a pending_payment subscription: the vendor pays via OffPay outside
// the app, then submits the reference; admin confirms to activate — the
// same manual-verification pattern used for Tier 1 (no OffPay webhook access).
const subscribe = async (req, res) => {
  const { plan, billingCycle = 'monthly' } = req.body;
  if (!['pro', 'enterprise'].includes(plan)) {
    throw new ApiError(422, 'plan must be "pro" or "enterprise".');
  }

  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  if (plan === 'pro' && vendor.tier < 1) {
    throw new ApiError(400, 'Reach Tier 1 (verify your OffPay payment account) before subscribing to Pro.');
  }

  if (plan === 'enterprise') {
    const enabled = await settingsModel.getValue('enterprise_enabled', 'false');
    if (enabled !== 'true') {
      throw new ApiError(403, 'Enterprise is not yet available. You will be notified when it launches.');
    }
  }

  const priceKey = PRICE_KEYS[plan][billingCycle];
  if (!priceKey) {
    throw new ApiError(422, `Invalid billing cycle for ${plan}.`);
  }
  const amount = Number(await settingsModel.getValue(priceKey, '0'));

  const subscription = await subscriptionModel.create({
    vendorId: vendor.id,
    plan,
    billingCycle,
    amount,
    paymentRef: req.body.paymentRef || null,
  });

  return ok(res, subscription, 'Subscription created — pay via OffPay, then it will be activated once confirmed.', 201);
};

// PUT /api/vendors/me/subscriptions/:id/payment-ref  { paymentRef }
// Lets a vendor attach/update the OffPay payment reference after paying.
const attachPaymentRef = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  const { paymentRef } = req.body;
  if (!paymentRef) throw new ApiError(422, 'paymentRef is required.');

  const sub = await subscriptionModel.findById(req.params.id);
  if (!sub || sub.vendor_id !== vendor.id) throw new ApiError(404, 'Subscription not found.');
  if (sub.status !== 'pending_payment') throw new ApiError(400, 'This subscription is not awaiting payment.');

  const { rows } = await query('UPDATE subscriptions SET payment_ref = $1 WHERE id = $2 RETURNING *', [
    paymentRef,
    req.params.id,
  ]);
  return ok(res, rows[0], 'Payment reference submitted — awaiting admin confirmation.');
};

// GET /api/vendors/me/subscriptions
const listMySubscriptions = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  await sweepExpiredSubscriptions();
  const rows = await subscriptionModel.findByVendor(vendor.id, req.query);
  return ok(res, { subscriptions: rows });
};

// PUT /api/vendors/me/subscriptions/:id/cancel
// Benefits remain active until current_period_end — this only stops renewal.
const cancelMySubscription = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  const sub = await subscriptionModel.findById(req.params.id);
  if (!sub || sub.vendor_id !== vendor.id) throw new ApiError(404, 'Subscription not found.');

  const updated = await subscriptionModel.cancelAtPeriodEnd(req.params.id);
  return ok(res, updated, 'Subscription will not renew — benefits remain active until the current period ends.');
};

// GET /api/vendors/me/billing
const listMyBilling = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  const rows = await billingRecordModel.findByVendor(vendor.id, req.query);
  return ok(res, { records: rows });
};

module.exports = { subscribe, attachPaymentRef, listMySubscriptions, cancelMySubscription, listMyBilling, sweepExpiredSubscriptions };
