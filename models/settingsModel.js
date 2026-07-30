const { query } = require('../config/db');

const findAll = async () => {
  const { rows } = await query('SELECT * FROM settings ORDER BY key ASC');
  return rows;
};

const findPublic = async () => {
  const { rows } = await query('SELECT key, value FROM settings WHERE is_public = TRUE ORDER BY key ASC');
  return rows;
};

const findByKey = async (key) => {
  const { rows } = await query('SELECT * FROM settings WHERE key = $1', [key]);
  return rows[0];
};

const getValue = async (key, fallback = null) => {
  const row = await findByKey(key);
  return row ? row.value : fallback;
};

// Upsert — lets an admin set a brand-new setting key too, not just edit existing ones.
const setValue = async (key, value, isPublic) => {
  const { rows } = await query(
    `INSERT INTO settings (key, value, is_public)
     VALUES ($1, $2, COALESCE($3, FALSE))
     ON CONFLICT (key) DO UPDATE SET value = $2, is_public = COALESCE($3, settings.is_public)
     RETURNING *`,
    [key, value, isPublic]
  );
  return rows[0];
};

module.exports = { findAll, findPublic, findByKey, getValue, setValue };
