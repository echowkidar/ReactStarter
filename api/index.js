// Vercel API serverless function
import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import { DbStorage } from '../server/dbStorage';

// Initialize app
const app = express();
app.use(express.json());

// Ensure __dirname works in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database storage
const db = new DbStorage();

// Basic API endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working' });
});

// Import all your API routes here
app.get('/api/departments', async (req, res) => {
  try {
    const departments = await db.getAllDepartments();
    res.json(departments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Create HTTP server
const server = createServer(app);

// Export for Vercel
export default app; 