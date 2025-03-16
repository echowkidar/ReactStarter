// Vercel API serverless function
import express from 'express';
import pg from 'pg';
import 'dotenv/config';

// Create and configure Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Debugging middleware
app.use((req, res, next) => {
  console.log(`API Request: ${req.method} ${req.url}`);
  next();
});

// Simple database check
async function testDbConnection() {
  const { Pool } = pg;
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    min: 0,
    max: 10,
    idleTimeoutMillis: 30000
  });
  
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
    await pool.end();
  }
}

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
    console.log('Registration attempt:', req.body.email);
    res.json({ 
      success: true, 
      message: 'Registration endpoint reached. This is a demo endpoint.' 
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
    // Return some demo data
    res.json([
      { id: 1, name: "Computer Science", email: "cs@amu.ac.in" },
      { id: 2, name: "Electronics", email: "electronics@amu.ac.in" },
      { id: 3, name: "Mechanical", email: "mechanical@amu.ac.in" }
    ]);
  } catch (error) {
    console.error('Failed to fetch departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Admin users endpoint
app.get('/api/admin/users', async (req, res) => {
  try {
    console.log('Fetching admin users...');
    // Return some mock users data
    res.json([
      { id: 1, name: "Admin User", email: "admin@amu.ac.in", role: "admin" },
      { id: 2, name: "Department Manager", email: "dept@amu.ac.in", role: "manager" }
    ]);
  } catch (error) {
    console.error('Failed to fetch admin users:', error);
    res.status(500).json({ error: 'Failed to fetch admin users' });
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

// Database connection check
app.get('/api/db-check', async (req, res) => {
  try {
    console.log('Checking database connection...');
    const result = await testDbConnection();
    if (result) {
      console.log('Database connection successful');
      res.json({ 
        connected: true, 
        message: 'Database connection successful',
        dbUrl: process.env.DATABASE_URL ? 
          `${process.env.DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown-host'}` : 
          'not-set'
      });
    } else {
      console.log('Database connection failed');
      res.status(500).json({ connected: false, message: 'Database connection failed' });
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

// Vercel serverless handler
export default function (req, res) {
  console.log(`Received request: ${req.method} ${req.url}`);
  return app(req, res);
} 