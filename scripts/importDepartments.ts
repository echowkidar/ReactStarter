import * as XLSX from 'xlsx';
import * as path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { departmentNames, InsertDepartmentName } from '../shared/schema'; // Adjust path if needed

dotenv.config();

async function importDepartments() {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const db = drizzle(pool);

  const filePath = path.resolve(__dirname, '../shared/department.xlsx');
  console.log(`Reading departments from: ${filePath}`);

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Assuming data is in the first sheet
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Read as array of arrays

    // Assuming the first row is headers: DEPT, DEPT_NAME, D_AST
    const headers = jsonData[0];
    const deptIndex = headers.indexOf('DEPT');
    const nameIndex = headers.indexOf('DEPT_NAME');
    const astIndex = headers.indexOf('D_AST');

    if (deptIndex === -1 || nameIndex === -1 || astIndex === -1) {
      throw new Error('Required columns (DEPT, DEPT_NAME, D_AST) not found in the Excel sheet header.');
    }

    const departmentsToInsert: InsertDepartmentName[] = jsonData
      .slice(1) // Skip header row
      .map((row: any[]) => {
        const code = row[deptIndex] ? String(row[deptIndex]).trim() : null;
        const name = row[nameIndex] ? String(row[nameIndex]).trim() : null;
        const dealingAssistantCode = row[astIndex] ? String(row[astIndex]).trim() : null;

        // Basic validation: Ensure required fields are present
        if (!code || !name || !dealingAssistantCode) {
          console.warn(`Skipping row due to missing data: ${row.join(', ')}`);
          return null; // Skip rows with missing essential data
        }

        return {
          code,
          name,
          dealingAssistantCode,
        };
      })
      .filter((dept): dept is InsertDepartmentName => dept !== null); // Filter out skipped rows

    if (departmentsToInsert.length === 0) {
      console.log("No valid departments found in the Excel sheet to insert.");
      return;
    }

    console.log(`Found ${departmentsToInsert.length} departments to insert.`);

    // Insert data, ignoring duplicates based on the unique constraint on 'dept_code'
    await db.insert(departmentNames)
      .values(departmentsToInsert)
      .onConflictDoNothing({ target: departmentNames.code }); // Assumes 'dept_code' has a UNIQUE constraint

    console.log("Successfully inserted department data into the database.");

  } catch (error) {
    console.error("Error importing departments:", error);
  } finally {
    await pool.end(); // Close the database connection
    console.log("Database connection closed.");
  }
}

importDepartments(); 