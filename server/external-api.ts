import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import {
    employees,
    attendanceEntries,
    attendanceReports,
    departments,
    departmentNames,
    insertEmployeeSchema
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";

// --- Middleware: Verify API Key ---
const API_KEY = process.env.EXTERNAL_API_KEY || "secret-key-2026"; // Fallback for dev

export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({
            error: "Unauthorized",
            message: "Invalid or missing API Key"
        });
    }
    next();
};

export function registerExternalRoutes(app: any) {

    // --- 1. GET Attendance Data (Joined) ---
    // Returns: Dept Name, Dept Code, D_Ast, Emp ID, Name, Desig, Sal Asst, Reg No, Period, Days
    app.get("/api/external/attendance", requireApiKey, async (req: Request, res: Response) => {
        try {
            // Default to current month/year if not provided
            const now = new Date();
            const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1; // 0-indexed in JS
            const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();

            const data = await db.select({
                departmentName: departments.name,
                departmentCode: departmentNames.code,
                dealingAssistant: departmentNames.dealingAssistantCode, // d_ast
                employeeId: employees.epid,
                employeeName: employees.name,
                designation: employees.designation,
                salaryAssistant: employees.salary_asstt,
                registerNo: employees.salaryRegisterNo,
                days: attendanceEntries.days,
                fromDate: attendanceEntries.fromDate,
                toDate: attendanceEntries.toDate,
                periods: attendanceEntries.periods,
                reportStatus: attendanceReports.status,
            })
                .from(attendanceEntries)
                .innerJoin(attendanceReports, eq(attendanceEntries.reportId, attendanceReports.id))
                .innerJoin(employees, eq(attendanceEntries.employeeId, employees.id))
                .innerJoin(departments, eq(employees.departmentId, departments.id))
                .leftJoin(departmentNames, eq(departments.name, departmentNames.name)) // Join for code/d_ast
                // Filter by verified reports or specific month
                .where(and(
                    eq(attendanceReports.month, month),
                    eq(attendanceReports.year, year),
                    // Optional: Only include submitted/received reports? user didn't specify, but usually final data needed.
                    // letting them filter by status if needed, or returning all.
                ));

            res.json({
                meta: { month, year, count: data.length },
                data
            });
        } catch (error) {
            console.error("External API Error (Attendance):", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // --- 2. GET Employee Data ---
    app.get("/api/external/employees", requireApiKey, async (req: Request, res: Response) => {
        try {
            const allEmployees = await db.select({
                epid: employees.epid,
                name: employees.name,
                department: departments.name,
                departmentCode: departmentNames.code,
                designation: employees.designation,
                employmentStatus: employees.employmentStatus,
                status: employees.isActive, // Active/Inactive
                termExpiry: employees.termExpiry,
                payLevel: employees.payLevel,
                joiningDate: employees.joiningDate,
                dealingAssistant: departmentNames.dealingAssistantCode,
                registerNo: employees.salaryRegisterNo,
            })
                .from(employees)
                .innerJoin(departments, eq(employees.departmentId, departments.id))
                .leftJoin(departmentNames, eq(departments.name, departmentNames.name));

            res.json({
                count: allEmployees.length,
                data: allEmployees
            });
        } catch (error) {
            console.error("External API Error (Employees):", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    // --- 3. POST Create Employee ---
    app.post("/api/external/employees", requireApiKey, async (req: Request, res: Response) => {
        try {
            // Validate with schema (loosely, allowing some missing fields to be filled with defaults)
            const employeeData = insertEmployeeSchema.parse(req.body);

            // Need to resolve department_id from name or code if provided?
            // Assuming they send 'departmentId' valid integer as per schema.
            // If they send text, we might need logic here. 
            // For now, adhering to schema which expects departmentId.

            const result = await db.insert(employees).values(employeeData).returning();
            res.status(201).json(result[0]);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: "Validation Error", details: error.errors });
            }
            console.error("External API Create Error:", error);
            res.status(500).json({ error: "Failed to create employee" });
        }
    });

    // --- 4. PATCH Update Employee ---
    app.patch("/api/external/employees/:epid", requireApiKey, async (req: Request, res: Response) => {
        try {
            const { epid } = req.params;
            const updates = req.body;

            // Prevent updating ID or EPID via this route generally, but allowing updates if valid
            delete updates.id;

            const result = await db.update(employees)
                .set(updates)
                .where(eq(employees.epid, epid))
                .returning();

            if (result.length === 0) {
                return res.status(404).json({ error: "Employee not found" });
            }

            res.json(result[0]);
        } catch (error) {
            console.error("External API Update Error:", error);
            res.status(500).json({ error: "Failed to update employee" });
        }
    });

}
