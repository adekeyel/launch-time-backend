const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

/**
 * Upserts the admin account to match current SUPER_ADMIN_EMAIL /
 * SUPER_ADMIN_PASSWORD env vars — unlike seed.js (which only ever CREATES
 * one and skips if any admin exists), this always syncs, fixing the case
 * where those env vars changed after the database was already seeded.
 *
 * Returns { email, id, staleAdmins } — staleAdmins lists any OTHER admin
 * rows under different emails left over from a previous env value (they
 * still work for login too; nothing here deletes them automatically).
 */
async function syncAdminFromEnv() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const fullname = process.env.SUPER_ADMIN_FULLNAME || 'Super Admin';

  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set.');
  }

  const hashed = await bcrypt.hash(password, 12);

  const { rows } = await query(
    `INSERT INTO users (fullname, email, password, role, is_active, is_verified)
     VALUES ($1, $2, $3, 'admin', TRUE, TRUE)
     ON CONFLICT (email) DO UPDATE
       SET password = $3, fullname = $1, role = 'admin', is_active = TRUE, is_verified = TRUE
     RETURNING id, email`,
    [fullname, email, hashed]
  );

  const stale = await query(`SELECT id, email FROM users WHERE role = 'admin' AND email != $1`, [email]);

  return { email: rows[0].email, id: rows[0].id, staleAdmins: stale.rows };
}

module.exports = { syncAdminFromEnv };
