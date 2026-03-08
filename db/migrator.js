import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbPool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationTable() {
  await dbPool.query(`
    create table if not exists schema_migrations (
      id bigserial primary key,
      name text not null unique,
      run_at timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrationNames() {
  const result = await dbPool.query('select name from schema_migrations');
  return new Set(result.rows.map((row) => row.name));
}

async function getMigrationFiles() {
  const files = await fs.readdir(migrationsDir);
  return files.filter((file) => file.endsWith('.sql')).sort();
}

export async function runMigrations() {
  const migrationStart = Date.now();
  await ensureMigrationTable();

  const applied = await getAppliedMigrationNames();
  const files = await getMigrationFiles();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const sql = await fs.readFile(fullPath, 'utf8');

    const client = await dbPool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`✅ Applied migration: ${file}`);
    } catch (error) {
      await client.query('rollback');
      console.error(`❌ Failed migration: ${file}`);
      throw error;
    } finally {
      client.release();
    }
  }

  if (files.length === 0) {
    console.log('⚠️ No migration files found.');
  }

  console.log(`[BOOT] Migration scan/apply completed in ${Date.now() - migrationStart}ms.`);
}
