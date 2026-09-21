const { query } = require('../config/db');

// One row per editable section of the website (see utils/contentSchema.js).
// `content` holds only what an admin has saved; anything not saved falls back
// to the section's defaults when the site reads it.

const findAll = async () => {
  const { rows } = await query('SELECT section, content, updated_at FROM site_content');
  return rows;
};

const upsert = async (section, content, userId) => {
  const { rows } = await query(
    `INSERT INTO site_content (section, content, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (section) DO UPDATE
       SET content = $2, updated_by = $3, updated_at = NOW()
     RETURNING section, content, updated_at`,
    [section, JSON.stringify(content), userId || null]
  );
  return rows[0];
};

// Resetting a section = deleting its row, so the defaults show again.
const remove = async (section) => {
  const { rowCount } = await query('DELETE FROM site_content WHERE section = $1', [section]);
  return rowCount > 0;
};

module.exports = { findAll, upsert, remove };
