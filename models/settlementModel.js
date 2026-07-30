const { query } = require('../config/db');

const create = async ({ vendorId, amount, paymentRef, receiptUrl, receiptPublicId, note }) => {
  const { rows } = await query(
    `INSERT INTO settlements (vendor_id, amount, payment_ref, receipt_url, receipt_public_id, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [vendorId, amount, paymentRef, receiptUrl, receiptPublicId, note]
  );
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT s.*, v.business_name, v.user_id AS vendor_user_id
     FROM settlements s JOIN vendors v ON v.id = s.vendor_id WHERE s.id = $1`,
    [id]
  );
  return rows[0];
};

const findByVendor = async (vendorId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT * FROM settlements WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [vendorId, limit, offset]
  );
  return rows;
};

const findAll = async ({ status, page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE s.status = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT s.*, v.business_name FROM settlements s JOIN vendors v ON v.id = s.vendor_id
     ${where} ORDER BY s.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM settlements s ${where}`,
    status ? [status] : []
  );
  return { rows, total: countResult.rows[0].count };
};

const updateStatus = async (id, status) => {
  const settledAt = status === 'approved' ? new Date() : null;
  const { rows } = await query(
    `UPDATE settlements SET status = $1, settled_at = COALESCE($2, settled_at) WHERE id = $3 RETURNING *`,
    [status, settledAt, id]
  );
  return rows[0];
};

module.exports = { create, findById, findByVendor, findAll, updateStatus };
