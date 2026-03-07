import { runMigrations } from '../db/migrator.js';
import { dbPool, verifyDatabaseConnection } from '../db/pool.js';

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
