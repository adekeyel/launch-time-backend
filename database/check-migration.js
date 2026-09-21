require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

// Checks that this backend is connected to a database and that the database has
// everything the latest update needs — and, if not, proves the migration will work
// BEFORE you deploy.
//
//   node database/check-migration.js            safe: connects, reports, and TRIES the
//                                               migration inside a transaction that is
//                                               always rolled back (changes nothing)
//   node database/check-migration.js --apply    runs the migration for real (same as
//                                               `node database/migrate.js`), then checks
//
// Run it wherever DATABASE_URL is available: locally with the right .env, or
// `railway run node database/check-migration.js`.

const APPLY = process.argv.includes('--apply');

const NEW_TABLES = ['reviews', 'site_content'];
const NEW_COLUMNS = [
  ['vendors', 'opening_hours'],
  ['vendors', 'orders_paused'],
  ['vendors', 'delivery_fee'],
  ['vendors', 'free_delivery_above'],
  ['vendors', 'rating_avg'],
  ['vendors', 'rating_count'],
  ['orders', 'subtotal'],
  ['orders', 'delivery_fee'],
];
const DATA_TABLES = ['users', 'vendors', 'foods', 'orders'];

// Host / port / database name only — never the password.
const describeTarget = () => {
  const raw = process.env.DATABASE_URL;
  if (!raw) return '(no DATABASE_URL set — using the PG* settings)';
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(DATABASE_URL is set but could not be read)';
  }
};

// What the latest update needs that this database has / hasn't got yet.
async function inspect(client) {
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [NEW_TABLES]
  );
  const haveTables = new Set(tables.rows.map((r) => r.table_name));

  const cols = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [['vendors', 'orders']]
  );
  const haveCols = new Set(cols.rows.map((r) => `${r.table_name}.${r.column_name}`));

  // The ads.placement rule must allow the homepage slots.
  let placementOk = false;
  try {
    const defs = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'ads'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%placement%'`
    );
    placementOk = defs.rows.length > 0 && defs.rows.every((r) => r.def.includes("'hero'") && r.def.includes("'tile'"));
  } catch {
    placementOk = false; // ads table missing entirely
  }

  const missingTables = NEW_TABLES.filter((t) => !haveTables.has(t));
  const missingColumns = NEW_COLUMNS.filter(([t, c]) => !haveCols.has(`${t}.${c}`)).map(([t, c]) => `${t}.${c}`);
  return { missingTables, missingColumns, placementOk, ok: missingTables.length === 0 && missingColumns.length === 0 && placementOk };
}

function report(label, state) {
  console.log(`\n${label}`);
  NEW_TABLES.forEach((t) => console.log(`  ${state.missingTables.includes(t) ? '❌ missing' : '✅ present'}  table ${t}`));
  NEW_COLUMNS.forEach(([t, c]) =>
    console.log(`  ${state.missingColumns.includes(`${t}.${c}`) ? '❌ missing' : '✅ present'}  column ${t}.${c}`)
  );
  console.log(`  ${state.placementOk ? '✅ present' : '❌ missing'}  ad placements "hero" and "tile" allowed`);
}

async function main() {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error(`❌ Could not connect to the database at ${describeTarget()}`);
    console.error(`   ${err.message}`);
    console.error('   Check DATABASE_URL (Railway > your Postgres service > Variables) and that this machine can reach it.');
    process.exitCode = 1;
    await pool.end().catch(() => {});
    return;
  }

  try {
    const info = (await client.query(`SELECT current_database() AS db, current_user AS usr, split_part(version(), ' ', 2) AS version`)).rows[0];
    console.log(`✅ Connected to PostgreSQL ${info.version}`);
    console.log(`   server: ${describeTarget()}   database: ${info.db}   user: ${info.usr}`);

    console.log('\nData already in this database:');
    for (const table of DATA_TABLES) {
      try {
        const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
        console.log(`  ${table}: ${rows[0].n}`);
      } catch {
        console.log(`  ${table}: (table not created yet)`);
      }
    }

    const before = await inspect(client);
    report('What the latest update needs — right now:', before);

    if (before.ok) {
      console.log('\n✅ This database is already up to date. Nothing to do.');
      return;
    }

    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

    if (APPLY) {
      console.log('\nApplying database/schema.sql ...');
      await client.query(sql);
      const after = await inspect(client);
      report('After the migration:', after);
      if (after.ok) console.log('\n✅ Migration applied. You can deploy the backend update.');
      else {
        console.log('\n❌ The migration ran but something is still missing (see above).');
        process.exitCode = 1;
      }
      return;
    }

    console.log('\nTrying database/schema.sql inside a transaction (it is always rolled back — nothing is changed) ...');
    await client.query('BEGIN');
    let after;
    try {
      await client.query(sql);
      after = await inspect(client);
    } finally {
      await client.query('ROLLBACK');
    }
    report('If the migration were applied:', after);
    if (after.ok) {
      console.log('\n✅ The migration will work on this database. Nothing was changed.');
      console.log('   To apply it now:  node database/check-migration.js --apply   (or node database/migrate.js)');
    } else {
      console.log('\n❌ The migration would run, but something would still be missing (see above).');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`\n❌ The migration would FAIL on this database: ${err.message}`);
    if (err.detail) console.error(`   ${err.detail}`);
    if (err.hint) console.error(`   ${err.hint}`);
    console.error('   Nothing was changed. Send this message and I will fix the SQL.');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
