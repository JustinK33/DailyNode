import { runMigrations } from '../db/migrator.ts';
import { dbPool, verifyDatabaseConnection } from '../db/pool.ts';

(async () => {
  try {
    await verifyDatabaseConnection();
    await runMigrations();
    console.log('✅ Database migrations completed.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await dbPool.end();
  }
})();
