require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/db');

// Unlike seed.js (which only ever CREATES a super admin and skips if one
// already exists), this always syncs the admin account to whatever is
// currently in .env — fixing the case where SUPER_ADMIN_EMAIL/PASSWORD
// changed after the database was already seeded.
//
// Usage: node database/reset-admin.js
// Run this from your backend project root, wherever DATABASE_URL is
// available (locally with the right .env, or via `railway run node database/reset-admin.js`).

async function resetAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const fullname = process.env.SUPER_ADMIN_FULLNAME || 'Super Admin';

  if (!email || !password) {
    console.error('❌ SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  try {
    const hashed = await bcrypt.hash(password, 12);

    // Any existing admin(s) with a different email are left alone — we only
    // touch the row matching the current SUPER_ADMIN_EMAIL, upserting it.
    const { rows } = await query(
      `INSERT INTO users (fullname, email, password, role, is_active, is_verified)
       VALUES ($1, $2, $3, 'admin', TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET password = $3, fullname = $1, role = 'admin', is_active = TRUE, is_verified = TRUE
       RETURNING id, email`,
      [fullname, email, hashed]
    );

    console.log(`✅ Admin account synced: ${rows[0].email} (id: ${rows[0].id})`);
    console.log('   You can now log in at /login with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env.');

    // If there's a stale admin row under a DIFFERENT email left over from an
    // earlier .env value, surface it so you can decide whether to remove it.
    const stale = await query(`SELECT id, email FROM users WHERE role = 'admin' AND email != $1`, [email]);
    if (stale.rows.length > 0) {
      console.log('\n⚠️  Other admin account(s) still exist with different emails:');
      stale.rows.forEach((r) => console.log(`   - ${r.email} (id: ${r.id})`));
      console.log('   These still work for login too. Delete them manually if you don\'t want them around:');
      console.log(`   DELETE FROM users WHERE id = '<id>';`);
    }
  } catch (err) {
    console.error('❌ Reset failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

resetAdmin();
