require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/db');

async function seed() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const fullname = process.env.SUPER_ADMIN_FULLNAME || 'Super Admin';

  if (!email || !password) {
    console.error('❌ SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log('ℹ️  Super admin already exists, skipping.');
      return;
    }

    const hashed = await bcrypt.hash(password, 12);
    await query(
      `INSERT INTO users (fullname, email, password, role, is_active, is_verified)
       VALUES ($1, $2, $3, 'admin', TRUE, TRUE)`,
      [fullname, email, hashed]
    );

    console.log(`✅ Super admin created: ${email}`);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
