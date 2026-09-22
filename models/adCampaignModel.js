const { query } = require('../config/db');

const create = async ({ vendorId, campaignType, durationDays, price, paymentRef, mediaUrl, mediaPublicId, mediaType }) => {
  const { rows } = await query(
    `INSERT INTO ad_campaigns (vendor_id, campaign_type, duration_days, price, payment_ref, media_url, media_public_id, media_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [vendorId, campaignType, durationDays, price, paymentRef, mediaUrl, mediaPublicId || null, mediaType]
  );
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT c.*, v.business_name FROM ad_campaigns c JOIN vendors v ON v.id = c.vendor_id WHERE c.id = $1`,
    [id]
  );
  return rows[0];
};

const findByVendor = async (vendorId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT * FROM ad_campaigns WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
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
    where = `WHERE c.status = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT c.*, v.business_name FROM ad_campaigns c JOIN vendors v ON v.id = c.vendor_id
     ${where} ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const countResult = await query(`SELECT COUNT(*)::int AS count FROM ad_campaigns c ${where}`, status ? [status] : []);
  return { rows, total: countResult.rows[0].count };
};

// Admin confirms payment: schedules the campaign to start now and links the
// generated `ads` row so it actually renders in the existing ad slots.
const activate = async (id, adId) => {
  const campaign = await findById(id);
  if (!campaign) return null;
  const starts = new Date();
  const ends = new Date(starts.getTime() + campaign.duration_days * 24 * 60 * 60 * 1000);

  const { rows } = await query(
    `UPDATE ad_campaigns SET status = 'active', ad_id = $1, starts_at = $2, ends_at = $3 WHERE id = $4 RETURNING *`,
    [adId, starts, ends, id]
  );
  return rows[0];
};

// Vendors actively running a homepage/search-sponsored campaign right now —
// used by the ranking algorithm to boost "Sponsored" vendors to the top.
const findActiveVendorIds = async () => {
  const { rows } = await query(
    `SELECT DISTINCT vendor_id FROM ad_campaigns WHERE status = 'active' AND ends_at > NOW()`
  );
  return rows.map((r) => r.vendor_id);
};

const expire = async (id) => {
  const { rows } = await query(`UPDATE ad_campaigns SET status = 'expired' WHERE id = $1 RETURNING *`, [id]);
  return rows[0];
};

module.exports = { create, findById, findByVendor, findAll, activate, findActiveVendorIds, expire };
