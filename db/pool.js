import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

function buildSslConfig(databaseUrl) {
  const forced = process.env.PGSSLMODE === 'require';
  const fromConnectionString = String(databaseUrl || '').includes('sslmode=require');
  const looksRemote = databaseUrl && !databaseUrl.includes('localhost');

  if (forced || fromConnectionString || looksRemote) {
    return { rejectUnauthorized: false };
  }

  return false;
}

function normalizeConnectionString(value) {
  if (!value) {
    return value;
  }

  if (value.startsWith('postgresql:') && !value.startsWith('postgresql://')) {
    return value.replace('postgresql:', 'postgresql://');
  }

  if (value.startsWith('postgres:') && !value.startsWith('postgres://')) {
    return value.replace('postgres:', 'postgres://');
  }

  return value;
}

function encodePasswordIfNeeded(value) {
  if (!value) {
    return value;
  }

  try {
    // Fast path for already-valid connection strings.
    new URL(value);
    return value;
  } catch {
    const credentialPattern = /^(postgres(?:ql)?:\/\/)([^:@/]+):([^@]+)@(.+)$/;
    const match = value.match(credentialPattern);

    if (!match) {
      return value;
    }

    const [, protocol, user, rawPassword, rest] = match;
    const encodedPassword = encodeURIComponent(rawPassword);
    return `${protocol}${user}:${encodedPassword}@${rest}`;
  }
}

const connectionString = encodePasswordIfNeeded(
  normalizeConnectionString(process.env.DATABASE_URL)
);

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Add it to your environment.');
}

export const dbPool = new Pool({
  connectionString,
  ssl: buildSslConfig(connectionString),
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000)
});

export async function verifyDatabaseConnection() {
  const client = await dbPool.connect();
  try {
    await client.query('select 1 as ok');
  } finally {
    client.release();
  }
}
