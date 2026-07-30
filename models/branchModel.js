const { query } = require('../config/db');

const create = async ({ vendorId, name, address, phone }) => {
  const { rows } = await query(
    `INSERT INTO branches (vendor_id, name, address, phone) VALUES ($1, $2, $3, $4) RETURNING *`,
    [vendorId, name, address, phone]
  );
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM branches WHERE id = $1', [id]);
  return rows[0];
};

const findByVendor = async (vendorId) => {
  const { rows } = await query('SELECT * FROM branches WHERE vendor_id = $1 ORDER BY created_at DESC', [vendorId]);
  return rows;
};

const countByVendor = async (vendorId) => {
  const { rows } = await query('SELECT COUNT(*)::int AS count FROM branches WHERE vendor_id = $1', [vendorId]);
  return rows[0].count;
};

const update = async (id, { name, address, phone, isActive }) => {
  const { rows } = await query(
    `UPDATE branches SET
       name = COALESCE($1, name),
       address = COALESCE($2, address),
       phone = COALESCE($3, phone),
       is_active = COALESCE($4, is_active)
     WHERE id = $5 RETURNING *`,
    [name, address, phone, isActive, id]
  );
  return rows[0];
};

const remove = async (id) => {
  await query('DELETE FROM branches WHERE id = $1', [id]);
};

module.exports = { create, findById, findByVendor, countByVendor, update, remove };
