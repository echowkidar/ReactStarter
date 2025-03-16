import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import 'dotenv/config';

console.log('Initializing database connection...');

// Check for database URL with helpful error message
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. This will cause database operations to fail.");
  
  // In development, throw an error, but in production, try to continue
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
}

// Log database URL partially for debugging (hiding credentials)
const dbUrlForLogging = process.env.DATABASE_URL ? 
  `${process.env.DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown-host'}` : 
  'not-set';
console.log(`Using database host: ${dbUrlForLogging}`);

// Create a connection pool
const { Pool } = pg;
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  // Add connection timeout options
  connectionTimeoutMillis: 5000, // 5 seconds
  // Set initial number of clients in Vercel serverless environment
  min: 0,
  max: 10,
  // Add idle timeout for serverless environment
  idleTimeoutMillis: 30000, // 30 seconds
});

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const db = drizzle({ client: pool, schema });

// Create a test function for database connectivity
export async function testDbConnection() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  } finally {
    if (client) client.release();
  }
}
