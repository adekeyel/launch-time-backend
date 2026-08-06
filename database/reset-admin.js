require('dotenv').config();
const { pool } = require('../config/db');
const { syncAdminFromEnv } = require('./syncAdmin');

// Usage: node database/reset-admin.js
// Run this from your backend project root, wherever DATABASE_URL is
// available (locally with the right .env, or via `railway run node database/reset-admin.js`).
//
// If you can't get a terminal against the production database (no Railway
// CLI, etc.), set RESET_ADMIN_ON_BOOT=true as an env var on Railway instead
// and redeploy — server.js runs this same sync automatically on startup and
// logs the result, no terminal access needed. Remove the env var afterward.

async function main() {
  try {
    const result = await syncAdminFromEnv();
    console.log(`✅ Admin account synced: ${result.email} (id: ${result.id})`);
    console.log('   You can now log in at /login with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env.');

    if (result.staleAdmins.length > 0) {
      console.log('\n⚠️  Other admin account(s) still exist with different emails:');
      result.staleAdmins.forEach((r) => console.log(`   - ${r.email} (id: ${r.id})`));
      console.log("   These still work for login too. Delete them manually if you don't want them around:");
      console.log(`   DELETE FROM users WHERE id = '<id>';`);
    }
  } catch (err) {
    console.error('❌ Reset failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
