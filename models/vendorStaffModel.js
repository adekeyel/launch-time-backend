const { query } = require('../config/db');

// Permission keys understood by the app. A 'manager' gets the fuller set by
// default; a plain 'staff' account gets a narrower operational set — both
// are just defaults and can be overridden per account via `permissions`.
const AVAILABLE_PERMISSIONS = [
  'manage_menu',
  'manage_orders',
  'view_analytics',
  'manage_staff',
  'manage_branches',
];

const DEFAULT_PERMISSIONS = {
  manager: ['manage_menu', 'manage_orders', 'view_analytics', 'manage_staff'],
  staff: ['manage_orders'],
};

const create = async ({ userId, vendorId, branchId, staffRole = 'staff', permissions }) => {
  const perms = permissions && permissions.length ? permissions : DEFAULT_PERMISSIONS[staffRole] || DEFAULT_PERMISSIONS.staff;
  const { rows } = await query(
    `INSERT INTO vendor_staff (user_id, vendor_id, branch_id, staff_role, permissions)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, vendorId, branchId, staffRole, perms]
  );
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT vs.*, u.fullname, u.email, b.name AS branch_name
     FROM vendor_staff vs JOIN users u ON u.id = vs.user_id
     LEFT JOIN branches b ON b.id = vs.branch_id
     WHERE vs.id = $1`,
    [id]
  );
  return rows[0];
};

const findByUserId = async (userId) => {
  const { rows } = await query('SELECT * FROM vendor_staff WHERE user_id = $1', [userId]);
  return rows[0];
};

const findByVendor = async (vendorId) => {
  const { rows } = await query(
    `SELECT vs.*, u.fullname, u.email, b.name AS branch_name
     FROM vendor_staff vs JOIN users u ON u.id = vs.user_id
     LEFT JOIN branches b ON b.id = vs.branch_id
     WHERE vs.vendor_id = $1 ORDER BY vs.created_at DESC`,
    [vendorId]
  );
  return rows;
};

const countByVendor = async (vendorId) => {
  const { rows } = await query('SELECT COUNT(*)::int AS count FROM vendor_staff WHERE vendor_id = $1', [vendorId]);
  return rows[0].count;
};

const update = async (id, { branchId, staffRole, permissions, isActive }) => {
  const { rows } = await query(
    `UPDATE vendor_staff SET
       branch_id = COALESCE($1, branch_id),
       staff_role = COALESCE($2, staff_role),
       permissions = COALESCE($3, permissions),
       is_active = COALESCE($4, is_active)
     WHERE id = $5 RETURNING *`,
    [branchId, staffRole, permissions, isActive, id]
  );
  return rows[0];
};

const remove = async (id) => {
  await query('DELETE FROM vendor_staff WHERE id = $1', [id]);
};

module.exports = {
  AVAILABLE_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  create,
  findById,
  findByUserId,
  findByVendor,
  countByVendor,
  update,
  remove,
};
