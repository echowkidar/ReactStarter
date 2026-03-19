import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
    try {
        console.log("Creating useful_downloads table...");
        await db.execute(sql`
      CREATE TABLE IF NOT EXISTS useful_downloads (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        file_url TEXT,
        external_link TEXT,
        thumbnail_url TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
        console.log("✅ Table 'useful_downloads' created successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error creating table:", error);
        process.exit(1);
    }
}
main();
