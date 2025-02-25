import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { insertDepartmentSchema, insertEmployeeSchema, insertAttendanceReportSchema, insertAttendanceEntrySchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import { fileURLToPath } from 'url';
import fs from "fs";
import express from 'express';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Configure multer for file uploads
  const fileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'attendance-' + uniqueSuffix + '.pdf');
    }
  });

  const upload = multer({ 
    storage: fileStorage,
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(null, false);
      }
    }
  });

  // Add this new endpoint for file uploads
  app.post("/api/attendance/:reportId/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded or invalid file type" });
      }

      // Generate the file URL
      const fileUrl = `/uploads/${req.file.filename}`;

      // Update the report with the file URL if needed
      await storage.updateAttendanceReport(Number(req.params.reportId), {
        fileUrl: fileUrl
      });

      res.json({ fileUrl });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Serve uploaded files statically
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  // Admin auth routes
  app.post("/api/auth/admin/login", async (req, res) => {
    const { email, password } = req.body;

    // For demonstration purposes, using hardcoded admin credentials
    // In production, this should be stored securely in a database
    const ADMIN_EMAIL = "admin@amu.ac.in";
    const ADMIN_PASSWORD = "admin123";

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      return res.json({ 
        role: "admin",
        message: "Admin logged in successfully" 
      });
    }

    return res.status(401).json({ message: "Invalid admin credentials" });
  });

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

  // Create employee (admin)
  app.post("/api/admin/employees", async (req, res) => {
    try {
      // Log the raw request body
      console.log("Received raw employee data:", req.body);

      const employeeData = insertEmployeeSchema.parse({
        ...req.body,
        departmentId: Number(req.body.departmentId),
        joiningDate: req.body.joiningDate || new Date().toISOString().split('T')[0],
        employmentStatus: req.body.employmentStatus || "Permanent",
        joiningShift: req.body.joiningShift || "morning",
        officeMemoNo: req.body.officeMemoNo || "",
        salaryRegisterNo: req.body.salaryRegisterNo || "",
        bankAccount: req.body.bankAccount || "",
        panNumber: req.body.panNumber || "",
        aadharCard: req.body.aadharCard || ""
      });

      // Log the parsed data
      console.log("Parsed employee data:", employeeData);

      const employee = await storage.createEmployee(employeeData);
      res.status(201).json(employee);
    } catch (error) {
      console.error('Error creating employee:', error);
      // Send back detailed error information for debugging
      if (error instanceof Error) {
        res.status(400).json({ 
          message: "Invalid employee data",
          details: error.message,
          stack: error.stack
        });
      } else {
        res.status(400).json({ 
          message: "Invalid employee data",
          details: String(error)
        });
      }
    }
  });

  // Create employee (department)
  app.post("/api/departments/:departmentId/employees", async (req, res) => {
    try {
      // Log the raw request body
      console.log("Department - Received raw employee data:", req.body);

      const employeeData = insertEmployeeSchema.parse({
        ...req.body,
        departmentId: Number(req.params.departmentId),
        joiningDate: req.body.joiningDate || new Date().toISOString().split('T')[0],
        employmentStatus: req.body.employmentStatus || "Permanent",
        joiningShift: req.body.joiningShift || "morning",
        officeMemoNo: req.body.officeMemoNo || "",
        salaryRegisterNo: req.body.salaryRegisterNo || "",
        bankAccount: req.body.bankAccount || "",
        panNumber: req.body.panNumber || "",
        aadharCard: req.body.aadharCard || ""
      });

      // Log the parsed data
      console.log("Department - Parsed employee data:", employeeData);

      const employee = await storage.createEmployee(employeeData);
      res.status(201).json(employee);
    } catch (error) {
      console.error('Error creating employee in department:', error);
      // Send back detailed error information for debugging
      if (error instanceof Error) {
        res.status(400).json({ 
          message: "Invalid employee data",
          details: error.message,
          stack: error.stack
        });
      } else {
        res.status(400).json({ 
          message: "Invalid employee data",
          details: String(error)
        });
      }
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
      const reportId = Number(req.params.id);
      const updates = req.body;

      // If status is being changed to "sent", set receipt details
      if (updates.status === "sent") {
        const report = await storage.getAttendanceReport(reportId);
        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Only set receipt details if they haven't been set yet
        if (!report.receiptDate) {
          updates.receiptDate = new Date();
        }
      }

      const report = await storage.updateAttendanceReport(reportId, updates);
      res.json(report);
    } catch (error) {
      console.error('Error updating attendance report:', error);
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
        periods: JSON.stringify(periods), // Store all periods as JSON string
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
    const reportsWithDepartments = await Promise.all(
      reports.map(async (report) => {
        const department = await storage.getDepartment(report.departmentId);
        return {
          ...report,
          department,
          // Ensure these fields are included in the response
          receiptNo: report.receiptNo,
          receiptDate: report.receiptDate,
        };
      })
    );
    res.json(reportsWithDepartments);
  });

  // Add receipt details to single report endpoint
  app.get("/api/admin/attendance/:id", async (req, res) => {
    try {
      const report = await storage.getAttendanceReport(Number(req.params.id));
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      const department = await storage.getDepartment(report.departmentId);
      const entries = await storage.getAttendanceEntriesByReport(report.id);

      // Fetch all employees for this department
      const employees = await storage.getEmployeesByDepartment(report.departmentId);
      const employeesMap = new Map(employees.map(emp => [emp.id, emp]));

      // Add employee details to entries
      const entriesWithEmployeeDetails = entries.map(entry => ({
        ...entry,
        employee: employeesMap.get(entry.employeeId)
      }));

      res.json({
        ...report,
        department,
        entries: entriesWithEmployeeDetails,
        // Ensure these fields are included
        receiptNo: report.receiptNo,
        receiptDate: report.receiptDate,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch report details" });
    }
  });

  app.delete("/api/attendance/:id", async (req, res) => {
    try {
      await storage.deleteAttendanceReport(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting attendance report:', error);
      res.status(500).json({ message: "Failed to delete attendance report" });
    }
  });


  // Get all employees (admin)
  app.get("/api/admin/employees", async (req, res) => {
    try {
      const allEmployees = [];
      const departments = await storage.getAllDepartments();

      for (const department of departments) {
        const employees = await storage.getEmployeesByDepartment(department.id);
        allEmployees.push(...employees.map(emp => ({
          ...emp,
          departmentName: department.name
        })));
      }

      res.json(allEmployees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  // Update employee (admin)
  app.patch("/api/employees/:id", async (req, res) => {
    try {
      const employee = await storage.updateEmployee(Number(req.params.id), req.body);
      res.json(employee);
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(400).json({ message: "Invalid employee update" });
    }
  });

  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getAllDepartments();
      // Create a list of predefined departments if no departments exist
      if (!departments || departments.length === 0) {
        const defaultDepartments = [
          { name: "Department of Computer Science", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
          { name: "Department of Mathematics", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
          { name: "Department of Physics", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
          { name: "Department of Chemistry", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
          { name: "Department of Botany", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
          { name: "Department of Zoology", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" }
        ];

        // Create each department
        for (const dept of defaultDepartments) {
          await storage.createDepartment(dept);
        }

        // Fetch the newly created departments
        const newDepartments = await storage.getAllDepartments();
        return res.json(newDepartments);
      }

      res.json(departments);
    } catch (error) {
      console.error('Error fetching departments:', error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  return httpServer;
}