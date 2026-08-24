// Load environment variables first, before any other imports
import 'dotenv/config';

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runMigrations } from "./migrations";
import { setupCronJobs } from "./cronJobs";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));



app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Initialize app function
export async function initApp() {
  try {
    // Run database migrations
    await runMigrations();

    // Initialize PKI Certificate Authority for LPC PDF signing
    try {
      const { initializePKI } = await import('./pki.js');
      await initializePKI();
    } catch (pkiError) {
      console.warn('[PKI] PKI initialization failed (LPC signing may not work):', pkiError);
    }

    const server = await registerRoutes(app);

    // Register External API routes
    const { registerExternalRoutes } = await import("./external-api");
    registerExternalRoutes(app);

    // Register Document Dispatch routes
    const { registerDispatchRoutes } = await import("./dispatchRoutes");
    registerDispatchRoutes(app);

    // Setup Cron Jobs
    setupCronJobs();

    // Log if API Key is not set
    if (!process.env.EXTERNAL_API_KEY) {
      console.log("---------------------------------------------------");
      console.log("NOTICE: EXTERNAL_API_KEY not set. Using default: 'amu-secret-dept-key-2026'");
      console.log("---------------------------------------------------");
    }

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // Set up environment
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Auto-seed salary registers if empty
    try {
      const { db } = await import("./db");
      const { salaryRegisters, departments } = await import("../shared/schema");
      const { sql } = await import("drizzle-orm");
      
      const countResult = await db.execute(sql`SELECT count(*) FROM salary_registers`);
      if (parseInt(countResult.rows[0].count as string) === 0) {
        console.log("Seeding salary registers from JSON...");
        const rawData = fs.readFileSync(path.join(__dirname, "../client/src/lib/register-nos.json"), "utf8");
        const data: { value: string; label: string }[] = JSON.parse(rawData);
        const depts = await db.select({ id: departments.id, name: departments.name }).from(departments);
        
        const mappedData = data.map(item => {
          let departmentId = null;
          const parts = item.label.split(" - ");
          if (parts.length > 1) {
            const deptNamePart = parts[1].trim().toLowerCase();
            let match = depts.find(d => d.name.toLowerCase() === deptNamePart) || 
                        depts.find(d => d.name.toLowerCase().includes(deptNamePart) || deptNamePart.includes(d.name.toLowerCase()));
            if (match) departmentId = match.id;
          }
          return { value: item.value, label: item.label, departmentId };
        });

        for (let i = 0; i < mappedData.length; i += 500) {
          await db.insert(salaryRegisters).values(mappedData.slice(i, i + 500)).onConflictDoNothing();
        }
        console.log(`Seeded ${mappedData.length} salary registers.`);
      }
    } catch (e) {
      console.error("Failed to seed salary registers:", e);
    }

    return { app, server };
  } catch (error) {
    console.error("Failed to initialize application:", error);
    throw error;
  }
}

// Start server for local development

(async () => {
  try {
    const { app, server } = await initApp();
    const PORT = parseInt(process.env.PORT || "5001");
    server.listen(PORT, "0.0.0.0", () => {
      log(`serving on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();

