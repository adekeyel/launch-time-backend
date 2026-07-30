const { query } = require('../config/db');

const create = async ({
  title,
  mediaUrl,
  mediaPublicId,
  mediaType,
  linkUrl,
  placement,
  page = 'all',
  displayOrder = 0,
  startsAt = null,
  endsAt = null,
}) => {
  const { rows } = await query(
    `INSERT INTO ads (title, media_url, media_public_id, media_type, link_url, placement, page, display_order, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [title, mediaUrl, mediaPublicId, mediaType, linkUrl, placement, page, displayOrder, startsAt, endsAt]
  );
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query('SELECT * FROM ads WHERE id = $1', [id]);
  return rows[0];
};

// Public: only currently-active ads (respecting optional scheduling window),
// optionally filtered by placement and/or page. Ads with page='all' show
// everywhere the frontend requests, alongside any page-specific ones.
const findActive = async ({ placement, page } = {}) => {
  const conditions = ['is_active = TRUE', '(starts_at IS NULL OR starts_at <= NOW())', '(ends_at IS NULL OR ends_at >= NOW())'];
  const params = [];

  if (placement) {
    params.push(placement);
    conditions.push(`placement = $${params.length}`);
  }
  if (page) {
    params.push(page);
    conditions.push(`(page = 'all' OR page = $${params.length})`);
  }

  const { rows } = await query(
    `SELECT * FROM ads WHERE ${conditions.join(' AND ')} ORDER BY placement, display_order ASC, created_at DESC`,
    params
  );
  return rows;
};

// Admin: every ad regardless of status/schedule
const findAll = async ({ placement, page, isActive, pageNum = 1, limit = 50 } = {}) => {
  const offset = (pageNum - 1) * limit;
  const conditions = [];
  const params = [];

  if (placement) {
    params.push(placement);
    conditions.push(`placement = $${params.length}`);
  }
  if (page) {
    params.push(page);
    conditions.push(`page = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(isActive);
    conditions.push(`is_active = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT * FROM ads ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const countResult = await query(`SELECT COUNT(*)::int AS count FROM ads ${where}`, params.slice(0, params.length - 2));
  return { rows, total: countResult.rows[0].count };
};

const update = async (id, fields) => {
  const allowed = [
    'title',
    'media_url',
    'media_public_id',
    'media_type',
    'link_url',
    'placement',
    'page',
    'is_active',
    'display_order',
    'starts_at',
    'ends_at',
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
  const { rows } = await query(`UPDATE ads SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return rows[0];
};

const remove = async (id) => {
  await query('DELETE FROM ads WHERE id = $1', [id]);
};

module.exports = { create, findById, findActive, findAll, update, remove };
