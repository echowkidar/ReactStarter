import pg from "pg";

async function main() {
  const connectionString = "postgresql://postgres:salary@167.71.230.230:5432/postgres";
  const { Pool } = pg;
  const pool = new Pool({ connectionString });
  
  try {
    const client = await pool.connect();
    await client.query(`ALTER TABLE dispatch_recipients ADD COLUMN inward_number text;`);
    console.log("Successfully added inward_number column!");
    client.release();
  } catch (err: any) {
    if (err.message.includes("already exists")) {
      console.log("Column inward_number already exists.");
    } else {
      console.error("Error:", err.message);
    }
  } finally {
    await pool.end();
  }
}

main();
