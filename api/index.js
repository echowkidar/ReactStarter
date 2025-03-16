// Vercel API serverless function
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { DbStorage } from '../server/dbStorage';

// Create and configure Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize database storage
const db = new DbStorage();

// API endpoints
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working' });
});

app.get('/api/departments', async (req, res) => {
  try {
    const departments = await db.getAllDepartments();
    res.json(departments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Add more API routes as needed to match your server routes

// Vercel serverless handler
export default function handler(req, res) {
  // Run the app with the Vercel request and response
  return app(req, res);
} 