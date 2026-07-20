import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:salary@167.71.230.230:5432/postgres'
});

await client.connect();

console.log('\n======== SURBHI WATSON - DETAILED ANALYSIS ========\n');

const surbhiDetail = await client.query(`
  SELECT 
    ae.id as entry_id,
    ae.report_id,
    ae.employee_id,
    e.name,
    e.epid,
    ar.month,
    ar.year,
    ar.status as report_status,
    ar.department_id,
    d.name as dept_name,
    ae.days,
    ae.from_date,
    ae.to_date,
    ae.periods,
    ar.created_at as report_created_at
  FROM attendance_entries ae
  JOIN employees e ON ae.employee_id = e.id
  JOIN attendance_reports ar ON ae.report_id = ar.id
  LEFT JOIN departments d ON ar.department_id = d.id
  WHERE e.name ILIKE '%SURBHI%' AND e.epid = '08791'
    AND ar.month = 7 AND ar.year = 2026
  ORDER BY ae.report_id, ae.id
`);

surbhiDetail.rows.forEach((row, i) => {
  console.log(`Entry #${i+1}:`);
  console.log(`  Entry ID: ${row.entry_id} | Report ID: ${row.report_id}`);
  console.log(`  Employee: ${row.name} (EPID: ${row.epid}, ID: ${row.employee_id})`);
  console.log(`  Department: ${row.dept_name} (ID: ${row.department_id})`);
  console.log(`  Report Status: ${row.report_status}`);
  console.log(`  Report Created: ${row.report_created_at}`);
  console.log(`  Days: ${row.days} | From: ${row.from_date} | To: ${row.to_date}`);
  console.log(`  Periods: ${row.periods}`);
  console.log('');
});

console.log('\n======== ALL 6 DUPLICATE EMPLOYEES - FULL DETAILS ========\n');

const allDuplicates = await client.query(`
  SELECT 
    ae.id as entry_id,
    ae.report_id,
    ae.employee_id,
    e.name,
    e.epid,
    ar.month,
    ar.year,
    ar.status as report_status,
    ar.department_id,
    d.name as dept_name,
    ae.days,
    ae.from_date,
    ae.to_date
  FROM attendance_entries ae
  JOIN employees e ON ae.employee_id = e.id
  JOIN attendance_reports ar ON ae.report_id = ar.id
  LEFT JOIN departments d ON ar.department_id = d.id
  WHERE ae.employee_id IN (
    SELECT ae2.employee_id
    FROM attendance_entries ae2
    JOIN attendance_reports ar2 ON ae2.report_id = ar2.id
    WHERE ar2.month = 7 AND ar2.year = 2026
    GROUP BY ae2.employee_id
    HAVING COUNT(*) > 1
  )
  AND ar.month = 7 AND ar.year = 2026
  ORDER BY ae.employee_id, ae.report_id, ae.id
`);

// Group by employee
const byEmployee = {};
allDuplicates.rows.forEach(row => {
  const key = `${row.employee_id}`;
  if (!byEmployee[key]) byEmployee[key] = [];
  byEmployee[key].push(row);
});

Object.values(byEmployee).forEach(rows => {
  console.log(`Employee: ${rows[0].name} (EPID: ${rows[0].epid}, ID: ${rows[0].employee_id})`);
  rows.forEach((row, i) => {
    console.log(`  Entry #${i+1}: ID=${row.entry_id} | Report=${row.report_id} | Dept: ${row.dept_name} | Status: ${row.report_status} | Days: ${row.days}`);
    console.log(`           Period: ${row.from_date} to ${row.to_date}`);
  });
  console.log('');
});

console.log('\n======== WOMEN\'s COLLEGE DOUBLE REPORT ANALYSIS ========\n');
// WOMEN's COLLEGE has 2 reports: 2244 and 2454 - both sent!
const womenCollegeQuery = await client.query(`
  SELECT 
    ae.id as entry_id,
    ae.report_id,
    ae.employee_id,
    e.name,
    e.epid,
    ar.status,
    ae.days,
    ae.from_date,
    ae.to_date
  FROM attendance_entries ae
  JOIN employees e ON ae.employee_id = e.id
  JOIN attendance_reports ar ON ae.report_id = ar.id
  WHERE ar.id IN (2244, 2454)
  ORDER BY ae.employee_id, ae.report_id
`);

console.log("Report 2244 vs 2454 (WOMEN's COLLEGE):");
womenCollegeQuery.rows.forEach(row => {
  console.log(`  Report ${row.report_id} | ${row.name} (${row.epid}) | ${row.days} days | ${row.from_date}-${row.to_date} | Status: ${row.status}`);
});

console.log('\n======== SALARY SECTION DOUBLE REPORT ANALYSIS ========\n');
// SALARY SECTION has 2 reports: 2171 and 2287 - both sent!
const salaryQuery = await client.query(`
  SELECT 
    ae.id as entry_id,
    ae.report_id,
    ae.employee_id,
    e.name,
    e.epid,
    ar.status,
    ae.days,
    ae.from_date,
    ae.to_date
  FROM attendance_entries ae
  JOIN employees e ON ae.employee_id = e.id
  JOIN attendance_reports ar ON ae.report_id = ar.id
  WHERE ar.id IN (2171, 2287)
  ORDER BY ae.employee_id, ae.report_id
`);

console.log("Report 2171 vs 2287 (SALARY SECTION):");
salaryQuery.rows.forEach(row => {
  console.log(`  Report ${row.report_id} | ${row.name} (${row.epid}) | ${row.days} days | ${row.from_date}-${row.to_date} | Status: ${row.status}`);
});

await client.end();
console.log('\n✅ Detailed analysis complete.');
