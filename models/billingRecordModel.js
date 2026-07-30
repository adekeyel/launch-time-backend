const { query } = require('../config/db');

const create = async ({ subscriptionId, vendorId, amount, billingCycle, paymentRef, status = 'pending', periodStart, periodEnd }) => {
  const { rows } = await query(
    `INSERT INTO billing_records (subscription_id, vendor_id, amount, billing_cycle, payment_ref, status, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [subscriptionId, vendorId, amount, billingCycle, paymentRef, status, periodStart, periodEnd]
  );
  return rows[0];
};

const markPaid = async (id) => {
  const { rows } = await query(`UPDATE billing_records SET status = 'paid' WHERE id = $1 RETURNING *`, [id]);
  return rows[0];
};

const findByVendor = async (vendorId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT * FROM billing_records WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [vendorId, limit, offset]
  );
  return rows;
};

const findAll = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT b.*, v.business_name FROM billing_records b JOIN vendors v ON v.id = b.vendor_id
     ORDER BY b.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const countResult = await query('SELECT COUNT(*)::int AS count FROM billing_records');
  return { rows, total: countResult.rows[0].count };
};

module.exports = { create, markPaid, findByVendor, findAll };
