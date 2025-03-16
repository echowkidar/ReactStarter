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

// Vercel serverless handler
export default function (req, res) {
  console.log(`Received request: ${req.method} ${req.url}`);
  return app(req, res);
} 