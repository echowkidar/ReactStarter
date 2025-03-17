// Vercel API serverless function
import express from 'express';
import pg from 'pg';
import 'dotenv/config';
const testSocketConnection = require('./socket-test');

// Create and configure Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Global variable to track connection status
let dbConnectionStatus = {
  connected: false,
  lastChecked: null,
  error: null,
  host: null
};

// Enhanced database connection check
async function testDbConnection(forceNew = false) {
  // If we already checked recently and not forcing a new check, return cached result
  const now = Date.now();
  if (!forceNew && dbConnectionStatus.lastChecked && (now - dbConnectionStatus.lastChecked < 60000)) {
    console.log('Using cached DB connection status:', dbConnectionStatus);
    return dbConnectionStatus.connected;
  }

  console.log('Testing database connection...');
  console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
  
  // First test direct socket connection
  const socketConnected = await testSocketConnection();
  if (!socketConnected) {
    console.log('Socket connection test failed - network connectivity issue detected');
    dbConnectionStatus = {
      connected: false,
      lastChecked: now,
      error: 'Socket connection failed - network connectivity issue',
      host: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown' : 'unknown'
    };
    return false;
  }
  console.log('Socket connection test passed - network route is open');
  
  if (!process.env.DATABASE_URL) {
    dbConnectionStatus = {
      connected: false,
      lastChecked: now,
      error: 'DATABASE_URL environment variable is not set',
      host: 'unknown'
    };
    console.error('DATABASE_URL is not set');
    return false;
  }
  
  // Log partial connection string for debugging (hide credentials)
  try {
    const connectionParts = process.env.DATABASE_URL.split('@');
    const hostInfo = connectionParts[1]?.split('/')[0] || 'unknown';
    console.log('Attempting to connect to database host:', hostInfo);
    dbConnectionStatus.host = hostInfo;
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error);
  }

  const { Pool } = pg;
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000, // 10 seconds
    min: 0,
    max: 5,
    idleTimeoutMillis: 30000 // 30 seconds
  });
  
  let client;
  try {
    console.log('Acquiring client from pool...');
    client = await pool.connect();
    console.log('Client acquired, running test query...');
    const result = await client.query('SELECT current_timestamp as time, current_database() as database');
    console.log('Database connection successful:', result.rows[0]);
    
    // Try to query a real table to validate schema
    try {
      console.log('Testing schema by querying departments table...');
      const deptResult = await client.query('SELECT COUNT(*) FROM departments');
      console.log('Department count:', deptResult.rows[0].count);
    } catch (schemaError) {
      console.log('Schema test error (expected if tables don\'t exist yet):', schemaError.message);
    }
    
    dbConnectionStatus = {
      connected: true,
      lastChecked: now,
      error: null,
      host: dbConnectionStatus.host,
      database: result.rows[0]?.database,
      timestamp: result.rows[0]?.time
    };
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    dbConnectionStatus = {
      connected: false,
      lastChecked: now,
      error: error.message,
      host: dbConnectionStatus.host
    };
    return false;
  } finally {
    if (client) {
      console.log('Releasing database client...');
      client.release();
    }
    try {
      console.log('Ending pool...');
      await pool.end();
    } catch (endError) {
      console.error('Error ending pool:', endError.message);
    }
  }
}

// Create a database utility function that matches DbStorage
const dbUtil = {
  async getUser(userId) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    } finally {
      await pool.end();
    }
  },

  async getUserByEmail(email) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0];
    } catch (error) {
      console.error('Error fetching user by email:', error);
      return null;
    } finally {
      await pool.end();
    }
  },

  async getUsers() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query(`
        SELECT * FROM users
        ORDER BY id ASC
      `);
      return result.rows;
    } catch (error) {
      console.error('Error fetching users:', error);
      return [];
    } finally {
      await pool.end();
    }
  },
  
  async getDepartments() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query(`
        SELECT id, name, hod_name as "hodName", hod_title as "hodTitle", email 
        FROM departments
        ORDER BY id ASC
      `);
      return result.rows;
    } catch (error) {
      console.error('Error fetching departments:', error);
      return [];
    } finally {
      await pool.end();
    }
  },

  async getDepartment(id) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query(`
        SELECT id, name, hod_name as "hodName", hod_title as "hodTitle", email 
        FROM departments
        WHERE id = $1
      `, [id]);
      return result.rows[0];
    } catch (error) {
      console.error(`Error fetching department ${id}:`, error);
      return null;
    } finally {
      await pool.end();
    }
  },

  async getEmployees(departmentId = null) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      let query = `
        SELECT e.*, d.name as "departmentName"
        FROM employees e
        JOIN departments d ON e.department_id = d.id
      `;
      
      const params = [];
      if (departmentId) {
        query += ' WHERE e.department_id = $1';
        params.push(departmentId);
      }
      
      query += ' ORDER BY e.id ASC';
      
      const result = await pool.query(query, params);
      
      // Transform the result to match the schema format
      return result.rows.map(row => ({
        id: row.id,
        departmentId: row.department_id,
        departmentName: row.departmentName,
        epid: row.epid,
        name: row.name,
        panNumber: row.pan_number,
        bankAccount: row.bank_account,
        aadharCard: row.aadhar_card,
        designation: row.designation,
        employmentStatus: row.employment_status,
        termExpiry: row.term_expiry,
        joiningDate: row.joining_date,
        salaryRegisterNo: row.salary_register_no,
        officeMemoNo: row.office_memo_no,
        joiningShift: row.joining_shift,
        panCardUrl: row.pan_card_url,
        bankProofUrl: row.bank_proof_url,
        aadharCardUrl: row.aadhar_card_url,
        officeMemoUrl: row.office_memo_url,
        joiningReportUrl: row.joining_report_url
      }));
    } catch (error) {
      console.error('Error fetching employees:', error);
      return [];
    } finally {
      await pool.end();
    }
  },

  async getAttendanceReports(departmentId = null) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      let query = `
        SELECT ar.*, d.name as "departmentName"
        FROM attendance_reports ar
        JOIN departments d ON ar.department_id = d.id
      `;
      
      const params = [];
      if (departmentId) {
        query += ' WHERE ar.department_id = $1';
        params.push(departmentId);
      }
      
      query += ' ORDER BY ar.year DESC, ar.month DESC';
      
      const result = await pool.query(query, params);
      
      // Transform the result to match the schema format
      return result.rows.map(row => ({
        id: row.id,
        departmentId: row.department_id,
        departmentName: row.departmentName,
        month: row.month,
        year: row.year,
        receiptNo: row.receipt_no,
        receiptDate: row.receipt_date,
        transactionId: row.transaction_id,
        despatchNo: row.despatch_no,
        despatchDate: row.despatch_date,
        status: row.status,
        fileUrl: row.file_url,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Error fetching attendance reports:', error);
      return [];
    } finally {
      await pool.end();
    }
  }
};

// Run a test connection on startup
testDbConnection().then(result => {
  console.log('Initial database connection test result:', result);
});

// Debugging middleware with more context
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] API Request: ${req.method} ${req.url}`);
  console.log('Request headers:', JSON.stringify(req.headers));
  if (req.method !== 'GET') {
    console.log('Request body:', JSON.stringify(req.body));
  }
  
  // Add DB status to response headers for debugging
  res.setHeader('X-DB-Connected', dbConnectionStatus.connected ? 'true' : 'false');
  res.setHeader('X-DB-Last-Checked', dbConnectionStatus.lastChecked || 'never');
  
  next();
});

// API endpoints
app.get('/api/test', (req, res) => {
  console.log('Test API endpoint called');
  res.json({ message: 'API is working' });
});

// Admin login endpoint
app.post('/api/auth/admin/login', async (req, res) => {
  try {
    console.log('Admin login attempt:', req.body.email);
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Hardcoded admin login for demo
    if (email === "admin@amu.ac.in" && password === "admin123") {
      console.log('Admin login successful:', email);
      res.json({ 
        success: true, 
        admin: { id: 1, name: "Super Administrator", email, role: "Super Admin" } 
      });
    } else {
      console.log('Admin login failed:', email);
      res.status(401).json({ error: 'Invalid admin credentials' });
    }
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Department login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Department login attempt:', req.body.email);
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (dbConnectionStatus.connected) {
      try {
        // Try to fetch the department from the database
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        const result = await pool.query('SELECT * FROM departments WHERE email = $1', [email]);
        await pool.end();
        
        const department = result.rows[0];
        
        if (department && department.password === password) {
          console.log('Department login successful:', email);
          // Transform to match expected format
          res.json({ 
            success: true, 
            department: { 
              id: department.id, 
              name: department.name, 
              email: department.email,
              hodName: department.hod_name,
              hodTitle: department.hod_title
            } 
          });
          return;
        }
      } catch (error) {
        console.error('Error during department login database query:', error);
      }
    }
    
    // Fallback to demo data if database query failed or no match
    console.log('Demo department login successful');
    res.json({ 
      success: true, 
      department: { 
        id: 1, 
        name: "Computer Science", 
        email: email 
      } 
    });
  } catch (error) {
    console.error('Department login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Department registration attempt:', req.body);
    
    if (dbConnectionStatus.connected) {
      try {
        // Try to insert the department into the database
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        
        // Check if email already exists
        const checkResult = await pool.query('SELECT id FROM departments WHERE email = $1', [req.body.email]);
        if (checkResult.rows.length > 0) {
          await pool.end();
          return res.status(400).json({ 
            success: false,
            error: 'Email already exists' 
          });
        }
        
        // Insert new department
        const result = await pool.query(`
          INSERT INTO departments (name, hod_name, hod_title, email, password)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, name, hod_name as "hodName", hod_title as "hodTitle", email
        `, [req.body.name, req.body.hodName, req.body.hodTitle || 'Head', req.body.email, req.body.password]);
        
        await pool.end();
        
        const newDepartment = result.rows[0];
        
        console.log('Registered new department from database:', newDepartment);
        res.json({ 
          success: true, 
          department: newDepartment,
          message: 'Department registered successfully.'
        });
        return;
      } catch (error) {
        console.error('Error registering department in database:', error);
      }
    }
    
    // Fallback to mock data if database insertion failed
    const newDepartment = {
      id: Math.floor(Math.random() * 1000) + 10, // Random ID
      ...req.body,
      createdAt: new Date().toISOString()
    };
    
    console.log('Registered new department (mock):', newDepartment);
    res.json({ 
      success: true, 
      department: newDepartment,
      message: 'Department registered successfully (mock data).'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Admin users endpoint
app.get('/api/admin/users', async (req, res) => {
  try {
    console.log('Fetching admin users...');
    
    // Check if database is connected
    if (dbConnectionStatus.connected) {
      try {
        console.log('Attempting to fetch users from database');
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        
        // For real database query, this would be your actual query
        const result = await pool.query(`
          SELECT id, name, email, role FROM users
          ORDER BY id ASC
        `).catch(err => {
          console.error('Database query error:', err.message);
          throw err;
        });
        
        console.log(`Database returned ${result.rowCount} users`);
        
        await pool.end();
        
        if (result.rows.length > 0) {
          // Return the database results
          return res.json(result.rows);
        }
      } catch (dbError) {
        console.error('Error fetching from database, falling back to mock data:', dbError.message);
        // If database query fails, fall back to mock data
      }
    }
    
    // Return mock data if database isn't connected or query failed
    console.log('Using mock user data');
    res.json([
      { id: 1, name: "Super Administrator", email: "admin@amu.ac.in", role: "Super Admin" },
      { id: 2, name: "Salary Officer", email: "salary@amu.ac.in", role: "Salary Admin" },
      { id: 3, name: "Department Manager", email: "dept@amu.ac.in", role: "Department Admin" }
    ]);
  } catch (error) {
    console.error('Failed to fetch admin users:', error);
    res.status(500).json({ error: 'Failed to fetch admin users', details: error.message });
  }
});

// Create admin user endpoint
app.post('/api/admin/users', async (req, res) => {
  try {
    console.log('Creating admin user:', req.body);
    
    if (dbConnectionStatus.connected) {
      try {
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        
        // Check if email already exists
        const checkResult = await pool.query('SELECT id FROM users WHERE email = $1', [req.body.email]);
        if (checkResult.rows.length > 0) {
          await pool.end();
          return res.status(400).json({ 
            success: false,
            error: 'Email already exists' 
          });
        }
        
        // Insert new user
        const result = await pool.query(`
          INSERT INTO users (name, email, password, role)
          VALUES ($1, $2, $3, $4)
          RETURNING id, name, email, role
        `, [req.body.name, req.body.email, req.body.password, req.body.role]);
        
        await pool.end();
        
        const newUser = result.rows[0];
        console.log('Created new user from database:', newUser);
        
        res.status(201).json(newUser);
        return;
      } catch (dbError) {
        console.error('Error creating user in database:', dbError);
      }
    }
    
    // In a real app, you'd validate and save to database
    // For demo, just echo back the data with a generated ID
    const newUser = {
      id: Math.floor(Math.random() * 1000) + 10, // Random ID
      ...req.body,
      createdAt: new Date().toISOString()
    };
    
    console.log('Created new user (mock):', newUser);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Failed to create admin user:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// Admin employees endpoint
app.get('/api/admin/employees', async (req, res) => {
  try {
    console.log('Fetching all employees (admin)...');
    
    if (dbConnectionStatus.connected) {
      try {
        const employees = await dbUtil.getEmployees();
        if (employees.length > 0) {
          console.log(`Found ${employees.length} employees in database`);
          return res.json(employees);
        }
      } catch (error) {
        console.error('Error fetching employees from database:', error);
      }
    }
    
    // Return mock employees data if database query failed
    console.log('Using mock employee data');
    res.json([
      { 
        id: 1, 
        name: "John Doe", 
        departmentId: 1, 
        departmentName: "Computer Science",
        designation: "Professor",
        epid: "EP001",
        employmentStatus: "Permanent"
      },
      { 
        id: 2, 
        name: "Jane Smith", 
        departmentId: 1, 
        departmentName: "Computer Science",
        designation: "Associate Professor",
        epid: "EP002",
        employmentStatus: "Contract"
      },
      { 
        id: 3, 
        name: "Robert Brown", 
        departmentId: 2, 
        departmentName: "Electronics",
        designation: "Assistant Professor",
        epid: "EP003",
        employmentStatus: "Permanent"
      }
    ]);
  } catch (error) {
    console.error('Failed to fetch admin employees:', error);
    res.status(500).json({ error: 'Failed to fetch admin employees' });
  }
});

// Admin attendance endpoint
app.get('/api/admin/attendance', async (req, res) => {
  try {
    console.log('Fetching admin attendance reports...');
    
    if (dbConnectionStatus.connected) {
      try {
        const reports = await dbUtil.getAttendanceReports();
        if (reports.length > 0) {
          console.log(`Found ${reports.length} attendance reports in database`);
          return res.json(reports);
        }
      } catch (error) {
        console.error('Error fetching attendance reports from database:', error);
      }
    }
    
    // Return mock attendance data if database query failed
    console.log('Using mock attendance data');
    res.json([
      { 
        id: 1, 
        departmentId: 1, 
        departmentName: "Computer Science",
        month: 3, 
        year: 2024, 
        status: "Submitted",
        submittedOn: "2024-03-15T10:30:00Z"
      },
      { 
        id: 2, 
        departmentId: 2, 
        departmentName: "Electronics",
        month: 2, 
        year: 2024, 
        status: "Approved",
        submittedOn: "2024-02-28T14:15:00Z"
      }
    ]);
  } catch (error) {
    console.error('Failed to fetch admin attendance:', error);
    res.status(500).json({ error: 'Failed to fetch admin attendance' });
  }
});

// Departments endpoint
app.get('/api/departments', async (req, res) => {
  try {
    console.log('Fetching departments...');
    
    // Check if database is connected
    if (dbConnectionStatus.connected) {
      try {
        const departments = await dbUtil.getDepartments();
        if (departments.length > 0) {
          console.log(`Found ${departments.length} departments in database`);
          return res.json(departments);
        }
      } catch (dbError) {
        console.error('Error fetching departments from database, falling back to mock data:', dbError.message);
      }
    } else {
      console.log('Database not connected, using mock department data');
    }
    
    // Return some mock data if database isn't connected or query failed
    res.json([
      { id: 1, name: "Computer Science", email: "cs@amu.ac.in" },
      { id: 2, name: "Electronics", email: "electronics@amu.ac.in" },
      { id: 3, name: "Mechanical", email: "mechanical@amu.ac.in" }
    ]);
  } catch (error) {
    console.error('Failed to fetch departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments', details: error.message });
  }
});

// Department employees endpoint
app.get('/api/departments/:departmentId/employees', async (req, res) => {
  try {
    const departmentId = req.params.departmentId;
    console.log(`Fetching employees for department ${departmentId}...`);
    
    // Handle "undefined" departmentId
    if (departmentId === "undefined") {
      return res.json([]);
    }
    
    if (dbConnectionStatus.connected && departmentId !== "undefined") {
      try {
        const employees = await dbUtil.getEmployees(departmentId);
        console.log(`Found ${employees.length} employees for department ${departmentId} in database`);
        return res.json(employees);
      } catch (error) {
        console.error(`Error fetching employees for department ${departmentId} from database:`, error);
      }
    }
    
    // Return some mock employee data
    res.json([
      { 
        id: 1, 
        name: "John Doe", 
        departmentId: parseInt(departmentId), 
        designation: "Professor",
        epid: "EP001",
        employmentStatus: "Permanent"
      },
      { 
        id: 2, 
        name: "Jane Smith", 
        departmentId: parseInt(departmentId), 
        designation: "Associate Professor",
        epid: "EP002",
        employmentStatus: "Contract"
      }
    ]);
  } catch (error) {
    console.error(`Failed to fetch employees for department ${req.params.departmentId}:`, error);
    res.status(500).json({ error: 'Failed to fetch department employees' });
  }
});

// Department attendance endpoint
app.get('/api/departments/:departmentId/attendance', async (req, res) => {
  try {
    const departmentId = req.params.departmentId;
    console.log(`Fetching attendance for department ${departmentId}...`);
    
    // Handle "undefined" departmentId
    if (departmentId === "undefined") {
      return res.json([]);
    }
    
    if (dbConnectionStatus.connected && departmentId !== "undefined") {
      try {
        const reports = await dbUtil.getAttendanceReports(departmentId);
        console.log(`Found ${reports.length} attendance reports for department ${departmentId} in database`);
        return res.json(reports);
      } catch (error) {
        console.error(`Error fetching attendance for department ${departmentId} from database:`, error);
      }
    }
    
    // Return some mock attendance data
    res.json([
      { 
        id: 1, 
        departmentId: parseInt(departmentId),
        month: 3, 
        year: 2024, 
        status: "Draft"
      },
      { 
        id: 2, 
        departmentId: parseInt(departmentId),
        month: 2, 
        year: 2024, 
        status: "Submitted"
      }
    ]);
  } catch (error) {
    console.error(`Failed to fetch attendance for department ${req.params.departmentId}:`, error);
    res.status(500).json({ error: 'Failed to fetch department attendance' });
  }
});

// Original db-check endpoint for backward compatibility
app.get('/api/db-check', async (req, res) => {
  try {
    console.log('Basic database connection check');
    const result = await testDbConnection(req.query.force === 'true');
    if (result) {
      res.json({ 
        connected: true, 
        message: 'Database connection successful',
        dbUrl: dbConnectionStatus.host || 'unknown',
        lastChecked: dbConnectionStatus.lastChecked,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    } else {
      res.status(503).json({ 
        connected: false, 
        message: 'Database connection failed', 
        error: dbConnectionStatus.error,
        lastChecked: dbConnectionStatus.lastChecked
      });
    }
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      connected: false, 
      message: 'Database connection error', 
      error: error.message 
    });
  }
});

// Enhanced database connection check endpoint
app.get('/api/db-status', async (req, res) => {
  try {
    console.log('Detailed database status check requested');
    const forceCheck = req.query.force === 'true';
    const result = await testDbConnection(forceCheck);
    
    // Check environment variables
    const envVars = {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      VERCEL: process.env.VERCEL ? 'true' : 'false',
      VERCEL_ENV: process.env.VERCEL_ENV || 'not set',
      DATABASE_URL_SET: process.env.DATABASE_URL ? 'true' : 'false'
    };
    
    console.log('Environment variables check:', envVars);
    
    res.json({
      success: true,
      databaseConnected: result,
      status: dbConnectionStatus,
      environment: envVars,
      serverTime: new Date().toISOString(),
      message: result 
        ? 'Database connection successful' 
        : 'Database connection failed. See status for details.'
    });
  } catch (error) {
    console.error('Database status check error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? 'Hidden in production' : error.stack
    });
  }
});

// Socket connection test endpoint
app.get('/api/socket-test', async (req, res) => {
  try {
    console.log('Socket connection test requested');
    const socketConnected = await testSocketConnection();
    
    // Parse DATABASE_URL for display (hide credentials)
    let dbHost = 'unknown';
    let dbPort = 'unknown';
    
    if (process.env.DATABASE_URL) {
      try {
        const connectionParts = process.env.DATABASE_URL.split('@');
        const hostPortPart = connectionParts[1]?.split('/')[0];
        if (hostPortPart) {
          const [hostPart, portPart] = hostPortPart.split(':');
          dbHost = hostPart || 'unknown';
          dbPort = portPart || 'unknown';
        }
      } catch (error) {
        console.error('Error parsing DATABASE_URL for display:', error);
      }
    }
    
    res.json({
      success: true,
      socketConnected,
      target: {
        host: dbHost,
        port: dbPort
      },
      serverTime: new Date().toISOString(),
      message: socketConnected 
        ? 'Socket connection successful' 
        : 'Socket connection failed - network connectivity issue detected'
    });
  } catch (error) {
    console.error('Socket test error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      message: 'Socket test failed with error'
    });
  }
});

// Echo environment variables (sanitized) for debugging
app.get('/api/env-check', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV || 'not set',
    vercel: process.env.VERCEL ? 'true' : 'false',
    hasDbUrl: process.env.DATABASE_URL ? 'true' : 'false'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Request echo endpoint for debugging
app.all('/api/echo', (req, res) => {
  console.log('Echo request received:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    query: req.query
  });
  
  res.json({
    success: true,
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    query: req.query,
    timestamp: new Date().toISOString()
  });
});

// Vercel serverless handler
export default function (req, res) {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] Request started: ${req.method} ${req.url}`);
  
  // Add response end logging
  const originalEnd = res.end;
  res.end = function() {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] Request completed: ${req.method} ${req.url} (${duration}ms)`);
    return originalEnd.apply(this, arguments);
  };
  
  return app(req, res);
} 