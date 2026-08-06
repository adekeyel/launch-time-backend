const app = require('./app');
const { pool } = require('./config/db');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 LAUNCH TIME server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

// One-time admin credential sync, for when you don't have terminal/CLI
// access to run `node database/reset-admin.js` directly against production.
// Set RESET_ADMIN_ON_BOOT=true on Railway and redeploy; check the deploy
// logs for the result. Safe to leave set (it's idempotent — re-running it
// with the same env values is a no-op login-wise), but there's no reason
// to keep it once you've confirmed it worked, so turn it back off after.
if (process.env.RESET_ADMIN_ON_BOOT === 'true') {
  const { syncAdminFromEnv } = require('./database/syncAdmin');
  syncAdminFromEnv()
    .then((result) => {
      console.log(`✅ [RESET_ADMIN_ON_BOOT] Admin account synced: ${result.email} (id: ${result.id})`);
      if (result.staleAdmins.length > 0) {
        console.log('⚠️  [RESET_ADMIN_ON_BOOT] Other admin account(s) still exist with different emails:');
        result.staleAdmins.forEach((r) => console.log(`   - ${r.email} (id: ${r.id})`));
      }
    })
    .catch((err) => {
      console.error('❌ [RESET_ADMIN_ON_BOOT] Admin sync failed:', err.message);
    });
}

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    console.log('Closed remaining connections. Bye 👋');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});
