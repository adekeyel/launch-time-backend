const { query } = require('../config/db');

const create = async ({ vendorId, name, description, price, category, image, imagePublicId = null, mediaType = 'image' }) => {
  const { rows } = await query(
    `INSERT INTO foods (vendor_id, name, description, price, category, image, image_public_id, media_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [vendorId, name, description, price, category, image, imagePublicId, mediaType]
  );
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT f.*, v.business_name, v.id AS vendor_id, v.status AS vendor_status,
            v.opening_hours AS vendor_opening_hours, v.orders_paused AS vendor_orders_paused
     FROM foods f JOIN vendors v ON v.id = f.vendor_id WHERE f.id = $1`,
    [id]
  );
  return rows[0];
};

const findAll = async ({ vendorId, search, category, page = 1, limit = 20, includeUnavailable = false, includeAll = false } = {}) => {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (includeAll) {
    // Admin view: every food regardless of the owning vendor's status/tier
    // or the item's own availability, so admin can manage anything.
    if (!includeUnavailable) conditions.push('f.is_available = TRUE');
  } else {
    // Public browsing: only approved AND Tier 1+ vendors' available items.
    conditions.push(`v.status = 'approved'`);
    conditions.push(`v.tier >= 1`);
    if (!includeUnavailable) conditions.push('f.is_available = TRUE');
  }

  if (vendorId) {
    params.push(vendorId);
    conditions.push(`f.vendor_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`f.name ILIKE $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`f.category = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT f.*, v.business_name,
            v.opening_hours AS vendor_opening_hours, v.orders_paused AS vendor_orders_paused
     FROM foods f JOIN vendors v ON v.id = f.vendor_id
     ${where}
     ORDER BY f.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM foods f JOIN vendors v ON v.id = f.vendor_id ${where}`,
    countParams
  );

  return { rows, total: countResult.rows[0].count };
};

// A vendor managing their own menu needs to see EVERY item they own —
// including ones marked unavailable — regardless of the vendor's approval
// status. This intentionally skips the public-facing filters above.
const findAllByOwner = async (vendorId, { page = 1, limit = 50 } = {}) => {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT * FROM foods WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [vendorId, limit, offset]
  );
  const countResult = await query('SELECT COUNT(*)::int AS count FROM foods WHERE vendor_id = $1', [vendorId]);
  return { rows, total: countResult.rows[0].count };
};

const update = async (id, fields) => {
  const allowed = [
    'name',
    'description',
    'price',
    'category',
    'image',
    'image_public_id',
    'media_type',
    'rating',
    'popular',
    'is_available',
  ];
  const sets = [];
  const params = [];

  allowed.forEach((key) => {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  });

  if (!sets.length) return findById(id);

  params.push(id);
  const { rows } = await query(
    `UPDATE foods SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0];
};

const remove = async (id) => {
  await query('DELETE FROM foods WHERE id = $1', [id]);
};

module.exports = { create, findById, findAll, findAllByOwner, update, remove };
