// Vercel API serverless function
import express from 'express';
import pg from 'pg';
import 'dotenv/config';

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
        admin: { id: 1, email, role: "admin" } 
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
    
    // Implement real login logic here - for now return demo success
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
    
    // In a real app, you would validate and save to database
    // For demo, just echo back with success message and generated ID
    const newDepartment = {
      id: Math.floor(Math.random() * 1000) + 10, // Random ID
      ...req.body,
      createdAt: new Date().toISOString()
    };
    
    console.log('Registered new department:', newDepartment);
    res.json({ 
      success: true, 
      department: newDepartment,
      message: 'Department registered successfully.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Departments endpoint
app.get('/api/departments', async (req, res) => {
  try {
    console.log('Fetching departments...');
    
    // Check if database is connected
    if (dbConnectionStatus.connected) {
      try {
        console.log('Attempting to fetch departments from database');
        const { Pool } = pg;
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        
        // For real database query, this would be your actual query
        const result = await pool.query(`
          SELECT id, name, email FROM departments
          ORDER BY id ASC
        `).catch(err => {
          console.error('Database query error:', err.message);
          throw err;
        });
        
        console.log(`Database returned ${result.rowCount} departments`);
        
        await pool.end();
        
        // Return the database results
        return res.json(result.rows);
      } catch (dbError) {
        console.error('Error fetching departments from database, falling back to mock data:', dbError.message);
        // If database query fails, fall back to mock data
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

// Admin users endpoint
app.get('/api/admin/users', async (req, res) => {
  try {
    console.log('Fetching admin users...');
    
    // Check if database is connected
    if (dbConnectionStatus.connected) {
      try {
        console.log('Attempting to fetch users from database');
        const { Pool } = pg;
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        
        // For real database query, this would be your actual query
        // This is just an example - modify according to your schema
        const result = await pool.query(`
          SELECT id, name, email, role FROM users
          WHERE role IN ('admin', 'manager', 'super_admin')
          ORDER BY id ASC
        `).catch(err => {
          console.error('Database query error:', err.message);
          throw err;
        });
        
        console.log(`Database returned ${result.rowCount} users`);
        
        await pool.end();
        
        // Return the database results
        return res.json(result.rows);
      } catch (dbError) {
        console.error('Error fetching from database, falling back to mock data:', dbError.message);
        // If database query fails, fall back to mock data
      }
    }
    
    // Return mock data if database isn't connected or query failed
    console.log('Using mock user data');
    res.json([
      { id: 1, name: "Admin User", email: "admin@amu.ac.in", role: "admin" },
      { id: 2, name: "Department Manager", email: "dept@amu.ac.in", role: "manager" }
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
    
    // In a real app, you'd validate and save to database
    // For demo, just echo back the data with a generated ID
    const newUser = {
      id: Math.floor(Math.random() * 1000) + 10, // Random ID
      ...req.body,
      createdAt: new Date().toISOString()
    };
    
    console.log('Created new user:', newUser);
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
    // Return some mock employees data
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
    // Return some mock attendance data
    res.json([
      { 
        id: 1, 
        departmentId: 1, 
        departmentName: "Computer Science",
        month: "March", 
        year: 2024, 
        status: "Submitted",
        submittedOn: "2024-03-15T10:30:00Z"
      },
      { 
        id: 2, 
        departmentId: 2, 
        departmentName: "Electronics",
        month: "February", 
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

// Department employees endpoint
app.get('/api/departments/:departmentId/employees', async (req, res) => {
  try {
    const departmentId = req.params.departmentId;
    console.log(`Fetching employees for department ${departmentId}...`);
    
    // Return some mock employee data
    if (departmentId === "undefined") {
      return res.json([]);
    }
    
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
    
    // Return some mock attendance data
    if (departmentId === "undefined") {
      return res.json([]);
    }
    
    res.json([
      { 
        id: 1, 
        departmentId: parseInt(departmentId),
        month: "March", 
        year: 2024, 
        status: "Draft"
      },
      { 
        id: 2, 
        departmentId: parseInt(departmentId),
        month: "February", 
        year: 2024, 
        status: "Submitted"
      }
    ]);
  } catch (error) {
    console.error(`Failed to fetch attendance for department ${req.params.departmentId}:`, error);
    res.status(500).json({ error: 'Failed to fetch department attendance' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
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

// Echo environment variables (sanitized) for debugging
app.get('/api/env-check', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV || 'not set',
    vercel: process.env.VERCEL ? 'true' : 'false',
    hasDbUrl: process.env.DATABASE_URL ? 'true' : 'false'
  });
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