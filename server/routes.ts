import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { insertDepartmentSchema, insertEmployeeSchema, insertAttendanceReportSchema, insertAttendanceEntrySchema } from "@shared/schema";

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const departmentData = insertDepartmentSchema.parse(req.body);
      const existingDepartment = await storage.getDepartmentByEmail(departmentData.email);

      if (existingDepartment) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const department = await storage.createDepartment(departmentData);
      res.status(201).json(department);
    } catch (error) {
      res.status(400).json({ message: "Invalid department data" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const department = await storage.getDepartmentByEmail(email);

    if (!department || department.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json(department);
  });

  // Employee routes
  app.get("/api/departments/:departmentId/employees", async (req, res) => {
    const employees = await storage.getEmployeesByDepartment(Number(req.params.departmentId));
    res.json(employees);
  });

  app.post("/api/departments/:departmentId/employees", async (req, res) => {
    try {
      const employeeData = insertEmployeeSchema.parse({
        ...req.body,
        departmentId: Number(req.params.departmentId)
      });
      const employee = await storage.createEmployee(employeeData);
      res.status(201).json(employee);
    } catch (error) {
      res.status(400).json({ message: "Invalid employee data" });
    }
  });

  app.delete("/api/employees/:id", async (req, res) => {
    await storage.deleteEmployee(Number(req.params.id));
    res.status(204).send();
  });

  // Attendance routes
  app.get("/api/departments/:departmentId/attendance", async (req, res) => {
    const reports = await storage.getAttendanceReportsByDepartment(Number(req.params.departmentId));
    res.json(reports);
  });

  app.post("/api/departments/:departmentId/attendance", async (req, res) => {
    try {
      const reportData = insertAttendanceReportSchema.parse({
        ...req.body,
        departmentId: Number(req.params.departmentId)
      });
      const report = await storage.createAttendanceReport(reportData);
      res.status(201).json(report);
    } catch (error) {
      res.status(400).json({ message: "Invalid report data" });
    }
  });

  app.patch("/api/attendance/:id", async (req, res) => {
    try {
      const report = await storage.updateAttendanceReport(Number(req.params.id), req.body);
      res.json(report);
    } catch (error) {
      res.status(400).json({ message: "Invalid report update" });
    }
  });

  app.get("/api/attendance/:reportId/entries", async (req, res) => {
    const entries = await storage.getAttendanceEntriesByReport(Number(req.params.reportId));
    res.json(entries);
  });

  app.post("/api/attendance/:reportId/entries", async (req, res) => {
    try {
      const reportId = Number(req.params.reportId);
      const { employeeId, periods } = req.body;

      if (!periods || !Array.isArray(periods)) {
        return res.status(400).json({ message: "Invalid periods data" });
      }

      // Calculate total days and combine remarks
      const totalDays = periods.reduce((sum, period) => sum + (period.days || 0), 0);
      const remarks = periods.map(p => p.remarks).filter(Boolean).join("; ");

      // Get the first and last period dates
      const firstPeriod = periods[0];
      const lastPeriod = periods[periods.length - 1];

      // Log the received data for debugging
      console.log('Received periods:', periods);
      console.log('First period:', firstPeriod);
      console.log('Last period:', lastPeriod);

      const entryData = insertAttendanceEntrySchema.parse({
        reportId: reportId,
        employeeId: Number(employeeId),
        days: totalDays,
        fromDate: firstPeriod?.fromDate || "", 
        toDate: lastPeriod?.toDate || "", 
        remarks: remarks || ""
      });

      const entry = await storage.createAttendanceEntry(entryData);
      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating attendance entry:', error);
      res.status(400).json({ message: "Invalid entry data", error: String(error) });
    }
  });

  app.patch("/api/attendance/:reportId/entries/:entryId", async (req, res) => {
    try {
      const entry = await storage.updateAttendanceEntry(
        Number(req.params.entryId),
        { days: req.body.days, remarks: req.body.remarks }
      );
      res.json(entry);
    } catch (error) {
      res.status(400).json({ message: "Invalid entry update" });
    }
  });

  // Admin routes
  app.get("/api/admin/attendance", async (req, res) => {
    const reports = await storage.getAllAttendanceReports();
    res.json(reports);
  });

  return httpServer;
}