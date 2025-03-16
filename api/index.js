// Vercel API serverless function
import express from 'express';
import { DbStorage } from '../server/dbStorage';

// Create and configure Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize database storage
const db = new DbStorage();

// Debugging middleware
app.use((req, res, next) => {
  console.log(`API Request: ${req.method} ${req.url}`);
  next();
});

// API endpoints
app.get('/api/test', (req, res) => {
  console.log('Test API endpoint called');
  res.json({ message: 'API is working' });
});

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
  try {
    console.log('Admin login attempt:', req.body.email);
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const admin = await db.adminLogin(email, password);
    if (admin) {
      console.log('Admin login successful:', email);
      res.json({ success: true, admin });
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
app.post('/api/login', async (req, res) => {
  try {
    console.log('Department login attempt:', req.body.email);
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const department = await db.departmentLogin(email, password);
    if (department) {
      console.log('Department login successful:', email);
      res.json({ success: true, department });
    } else {
      console.log('Department login failed:', email);
      res.status(401).json({ error: 'Invalid department credentials' });
    }
  } catch (error) {
    console.error('Department login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.get('/api/departments', async (req, res) => {
  try {
    console.log('Fetching departments...');
    const departments = await db.getAllDepartments();
    res.json(departments);
  } catch (error) {
    console.error('Failed to fetch departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
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
    const result = await db.checkConnection();
    if (result) {
      console.log('Database connection successful');
      res.json({ 
        connected: true, 
        message: 'Database connection successful',
        dbUrl: process.env.DATABASE_URL ? 
          `${process.env.DATABASE_URL.split('@')[1].split('/')[0]}` : 
          'Unknown'
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

// Vercel serverless handler
export default function (req, res) {
  console.log(`Received request: ${req.method} ${req.url}`);
  return app(req, res);
} 