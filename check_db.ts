import pg from "pg";

async function main() {
  const connectionString = "postgresql://postgres:salary@167.71.230.230:5432/postgres";
  const { Pool } = pg;
  const pool = new Pool({ connectionString });
  
  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT id, dispatch_id, status, inward_number FROM dispatch_recipients ORDER BY id DESC LIMIT 10;`);
    console.log(result.rows);
    client.release();
  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

main();
