const { query } = require('../config/db');

const SAFE_FIELDS = 'id, fullname, email, phone, role, is_active, is_verified, created_at';

const create = async ({ fullname, email, password, role = 'customer', phone = null }) => {
  const { rows } = await query(
    `INSERT INTO users (fullname, email, password, role, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SAFE_FIELDS}`,
    [fullname, email, password, role, phone]
  );
  return rows[0];
};

const findByEmail = async (email) => {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query(`SELECT ${SAFE_FIELDS} FROM users WHERE id = $1`, [id]);
  return rows[0];
};

const findAll = async ({ role, page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';
  if (role) {
    params.push(role);
    where = `WHERE role = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${SAFE_FIELDS} FROM users ${where}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM users ${where}`,
    role ? [role] : []
  );
  return { rows, total: countResult.rows[0].count };
};

const updatePassword = async (id, hashedPassword) => {
  await query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, id]);
};

const updateProfile = async (id, { fullname, phone }) => {
  const { rows } = await query(
    `UPDATE users SET fullname = COALESCE($1, fullname), phone = COALESCE($2, phone)
     WHERE id = $3 RETURNING ${SAFE_FIELDS}`,
    [fullname, phone, id]
  );
  return rows[0];
};

const setActiveStatus = async (id, isActive) => {
  const { rows } = await query(
    `UPDATE users SET is_active = $1 WHERE id = $2 RETURNING ${SAFE_FIELDS}`,
    [isActive, id]
  );
  return rows[0];
};

const setRole = async (id, role) => {
  const { rows } = await query(
    `UPDATE users SET role = $1 WHERE id = $2 RETURNING ${SAFE_FIELDS}`,
    [role, id]
  );
  return rows[0];
};

const remove = async (id) => {
  await query('DELETE FROM users WHERE id = $1', [id]);
};

module.exports = {
  create,
  findByEmail,
  findById,
  findAll,
  updatePassword,
  updateProfile,
  setActiveStatus,
  setRole,
  remove,
};
