
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function runMigration() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL not set");
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });

    const client = await pool.connect();
    try {
        console.log("Starting migration: Make transfer request fields nullable...");

        // Check if table exists
        const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'transfer_requests'
      );
    `);

        if (!tableCheck.rows[0].exists) {
            console.log("Table transfer_requests does not exist. Skipping migration.");
            return;
        }

        // Alter columns
        await client.query(`ALTER TABLE transfer_requests ALTER COLUMN order_number DROP NOT NULL`);
        console.log("✓ Dropped NOT NULL from order_number");

        await client.query(`ALTER TABLE transfer_requests ALTER COLUMN order_date DROP NOT NULL`);
        console.log("✓ Dropped NOT NULL from order_date");

        await client.query(`ALTER TABLE transfer_requests ALTER COLUMN relieving_date DROP NOT NULL`);
        console.log("✓ Dropped NOT NULL from relieving_date");

        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        await pool.end();
        process.exit(0);
    }
}

runMigration();
