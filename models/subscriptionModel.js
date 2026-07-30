const { query } = require('../config/db');

const PERIOD_DAYS = { monthly: 30, quarterly: 90, yearly: 365 };

const create = async ({ vendorId, plan, billingCycle, amount, paymentRef }) => {
  const { rows } = await query(
    `INSERT INTO subscriptions (vendor_id, plan, billing_cycle, amount, payment_ref)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [vendorId, plan, billingCycle, amount, paymentRef]
  );
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT s.*, v.business_name FROM subscriptions s JOIN vendors v ON v.id = s.vendor_id WHERE s.id = $1`,
    [id]
  );
  return rows[0];
};

// The vendor's current subscription for a plan — whatever is most recent,
// regardless of status, so the vendor can see "pending payment" too.
const findLatestForVendor = async (vendorId, plan) => {
  const { rows } = await query(
    `SELECT * FROM subscriptions WHERE vendor_id = $1 AND plan = $2 ORDER BY created_at DESC LIMIT 1`,
    [vendorId, plan]
  );
  return rows[0];
};

const findByVendor = async (vendorId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT * FROM subscriptions WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [vendorId, limit, offset]
  );
  return rows;
};

const findAll = async ({ status, plan, page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  }
  if (plan) {
    params.push(plan);
    conditions.push(`s.plan = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT s.*, v.business_name FROM subscriptions s JOIN vendors v ON v.id = s.vendor_id
     ${where} ORDER BY s.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM subscriptions s ${where}`,
    params.slice(0, params.length - 2)
  );
  return { rows, total: countResult.rows[0].count };
};

// Admin confirms payment: activates the subscription for one billing period.
const activate = async (id) => {
  const sub = await findById(id);
  if (!sub) return null;
  const days = PERIOD_DAYS[sub.billing_cycle] || 30;
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  const { rows } = await query(
    `UPDATE subscriptions
     SET status = 'active', current_period_start = $1, current_period_end = $2, cancelled_at = NULL, cancel_at_period_end = FALSE
     WHERE id = $3 RETURNING *`,
    [start, end, id]
  );
  return rows[0];
};

// Vendor cancels — benefits remain active until the current period ends.
const cancelAtPeriodEnd = async (id) => {
  const { rows } = await query(
    `UPDATE subscriptions SET cancel_at_period_end = TRUE, auto_renew = FALSE WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0];
};

const expire = async (id) => {
  const { rows } = await query(`UPDATE subscriptions SET status = 'expired' WHERE id = $1 RETURNING *`, [id]);
  return rows[0];
};

// Subscriptions whose period has ended — used to downgrade vendors and
// close out expired Pro/Enterprise access without a background job:
// checked lazily whenever relevant reads happen.
const findExpiredActive = async () => {
  const { rows } = await query(
    `SELECT * FROM subscriptions WHERE status = 'active' AND current_period_end < NOW()`
  );
  return rows;
};

module.exports = {
  create,
  findById,
  findLatestForVendor,
  findByVendor,
  findAll,
  activate,
  cancelAtPeriodEnd,
  expire,
  findExpiredActive,
};
