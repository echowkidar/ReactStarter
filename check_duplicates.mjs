import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:salary@167.71.230.230:5432/postgres'
});

await client.connect();

console.log('\n======== SURBHI WATSON - JULY 2026 DUPLICATE CHECK ========\n');

// Check Surbhi Watson duplicates in July 2026
const surbhiQuery = await client.query(`
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
    ae.days,
    ae.from_date,
    ae.to_date,
    ae.periods
  FROM attendance_entries ae
  JOIN employees e ON ae.employee_id = e.id
  JOIN attendance_reports ar ON ae.report_id = ar.id
  WHERE e.name ILIKE '%SURBHI%'
    AND ar.month = 7
    AND ar.year = 2026
  ORDER BY ae.report_id, ae.id
`);

console.log('SURBHI WATSON entries (July 2026):');
surbhiQuery.rows.forEach(row => {
  console.log(`  Entry ID: ${row.entry_id}, Report ID: ${row.report_id}, Employee ID: ${row.employee_id}`);
  console.log(`  Name: ${row.name}, EPID: ${row.epid}`);
  console.log(`  Report Status: ${row.report_status}, Dept ID: ${row.department_id}`);
  console.log(`  Days: ${row.days}, From: ${row.from_date}, To: ${row.to_date}`);
  console.log(`  Periods: ${row.periods}`);
  console.log('  ---');
});

console.log('\n======== ALL DUPLICATE EMPLOYEES IN JULY 2026 ========\n');

// Find ALL employees appearing more than once in July 2026 reports
const duplicateQuery = await client.query(`
  SELECT 
    e.name,
    e.epid,
    ae.employee_id,
    COUNT(*) as entry_count,
    array_agg(ae.report_id ORDER BY ae.report_id) as report_ids,
    array_agg(ae.id ORDER BY ae.id) as entry_ids,
    array_agg(ar.status ORDER BY ae.report_id) as report_statuses,
    array_agg(ar.department_id ORDER BY ae.report_id) as dept_ids
  FROM attendance_entries ae
  JOIN employees e ON ae.employee_id = e.id
  JOIN attendance_reports ar ON ae.report_id = ar.id
  WHERE ar.month = 7
    AND ar.year = 2026
  GROUP BY ae.employee_id, e.name, e.epid
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, e.name
`);

if (duplicateQuery.rows.length === 0) {
  console.log('No duplicates found!');
} else {
  console.log(`Found ${duplicateQuery.rows.length} employees with duplicate entries:\n`);
  duplicateQuery.rows.forEach(row => {
    console.log(`  Name: ${row.name} | EPID: ${row.epid}`);
    console.log(`  Employee ID: ${row.employee_id}`);
    console.log(`  Entry Count: ${row.entry_count}`);
    console.log(`  Report IDs: ${row.report_ids}`);
    console.log(`  Entry IDs: ${row.entry_ids}`);
    console.log(`  Report Statuses: ${row.report_statuses}`);
    console.log(`  Dept IDs: ${row.dept_ids}`);
    console.log('  ---');
  });
}

console.log('\n======== SAME EMPLOYEE - SAME REPORT DUPLICATE CHECK ========\n');

// Check if same employee is in SAME report more than once
const sameReportDuplicateQuery = await client.query(`
  SELECT 
    ae.report_id,
    ae.employee_id,
    e.name,
    e.epid,
    ar.status,
    ar.department_id,
    COUNT(*) as count_in_report
  FROM attendance_entries ae
  JOIN employees e ON ae.employee_id = e.id
  JOIN attendance_reports ar ON ae.report_id = ar.id
  WHERE ar.month = 7
    AND ar.year = 2026
  GROUP BY ae.report_id, ae.employee_id, e.name, e.epid, ar.status, ar.department_id
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC
`);

if (sameReportDuplicateQuery.rows.length === 0) {
  console.log('No employees duplicated within same report.');
} else {
  console.log('Employees duplicated WITHIN same report:');
  sameReportDuplicateQuery.rows.forEach(row => {
    console.log(`  Report ID: ${row.report_id} | Status: ${row.status}`);
    console.log(`  Employee: ${row.name} (EPID: ${row.epid}, ID: ${row.employee_id})`);
    console.log(`  Count in report: ${row.count_in_report}`);
    console.log(`  Dept ID: ${row.department_id}`);
    console.log('  ---');
  });
}

console.log('\n======== SUPPLEMENTARY REPORTS IN JULY 2026 ========\n');

// Check if any supplementary reports exist for July 2026
const suppQuery = await client.query(`
  SELECT 
    ar.id,
    ar.month,
    ar.year,
    ar.status,
    ar.department_id,
    d.name as dept_name,
    COUNT(ae.id) as entry_count,
    ar.created_at
  FROM attendance_reports ar
  LEFT JOIN attendance_entries ae ON ae.report_id = ar.id
  LEFT JOIN departments d ON ar.department_id = d.id
  WHERE ar.month = 7 AND ar.year = 2026
  GROUP BY ar.id, ar.month, ar.year, ar.status, ar.department_id, d.name, ar.created_at
  ORDER BY ar.department_id, ar.created_at
`);

console.log('All July 2026 reports:');
suppQuery.rows.forEach(row => {
  console.log(`  Report ID: ${row.id} | Dept: ${row.dept_name} (ID: ${row.department_id})`);
  console.log(`  Status: ${row.status} | Entries: ${row.entry_count}`);
  console.log(`  Created: ${row.created_at}`);
  console.log('  ---');
});

// Find departments with MORE than one report in July 2026
const multiReportDepts = await client.query(`
  SELECT 
    ar.department_id,
    d.name as dept_name,
    COUNT(ar.id) as report_count,
    array_agg(ar.id ORDER BY ar.id) as report_ids,
    array_agg(ar.status ORDER BY ar.id) as statuses
  FROM attendance_reports ar
  LEFT JOIN departments d ON ar.department_id = d.id
  WHERE ar.month = 7 AND ar.year = 2026
  GROUP BY ar.department_id, d.name
  HAVING COUNT(ar.id) > 1
  ORDER BY COUNT(ar.id) DESC
`);

console.log('\n======== DEPARTMENTS WITH MULTIPLE REPORTS (July 2026) ========\n');
if (multiReportDepts.rows.length === 0) {
  console.log('No department has more than one report for July 2026.');
} else {
  multiReportDepts.rows.forEach(row => {
    console.log(`  Dept: ${row.dept_name} (ID: ${row.department_id})`);
    console.log(`  Report Count: ${row.report_count}`);
    console.log(`  Report IDs: ${row.report_ids}`);
    console.log(`  Statuses: ${row.statuses}`);
    console.log('  ---');
  });
}

await client.end();
console.log('\n✅ Analysis complete.');
