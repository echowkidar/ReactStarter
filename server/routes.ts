import express, { Express } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from 'url';
import multer from "multer";
import { DbStorage } from "./dbStorage";
import { 
  Department, 
  Employee, 
  AttendanceReport,
  AttendanceEntry,
  insertEmployeeSchema, 
  insertAttendanceReportSchema, 
  insertAttendanceEntrySchema,
  insertDepartmentSchema,
  DepartmentName,
  InsertDepartment
} from "../shared/schema";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { setupTestEmailAccount, sendPasswordResetEmail } from "./emailService";

// Add type declaration for global adminResetTokens
declare global {
  var adminResetTokens: Map<string, { token: string; expiry: Date }>;
}

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database storage
const storage = new DbStorage();

// Define the type expected by the client components for this route
// Note: Adjust fields based on what's *actually* needed by the client dropdowns

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Initialize test email service (in development)
  try {
    await setupTestEmailAccount();
  } catch (error) {
    console.error("Failed to setup test email account:", error);
  }

  // Admin auth routes
  app.post("/api/auth/admin/login", async (req, res) => {
    const { email, password } = req.body;

    // For demonstration purposes, using hardcoded admin credentials
    // In production, this should be stored securely in a database
    const ADMIN_EMAIL = "admin@amu.ac.in";
    const ADMIN_PASSWORD = "admin123";

    // New admin account for salary section
    const SALARY_ADMIN_EMAIL = "salary@amu.ac.in";
    const SALARY_ADMIN_PASSWORD = "admin123";

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      return res.json({ 
        role: "admin",
        adminType: "super",
        message: "Admin logged in successfully" 
      });
    } else if (email === SALARY_ADMIN_EMAIL && password === SALARY_ADMIN_PASSWORD) {
      return res.json({ 
        role: "admin",
        adminType: "salary",
        message: "Admin logged in successfully" 
      });
    }

    return res.status(401).json({ message: "Invalid admin credentials" });
  });

  // Password reset routes
  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;
    
    try {
      // Check if email exists in departments
      const department = await storage.getDepartmentByEmail(email);
      if (!department) {
        return res.status(404).json({ message: "Email not found" });
      }
      
      // Generate reset token (expires in 1 hour)
      const resetToken = uuid();
      const tokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
      
      // Store token in database
      await storage.storeResetToken(department.id, resetToken, tokenExpiry);
      
      // Create reset URL with configurable base URL
      const baseUrl = process.env.APP_URL || 
        (process.env.NODE_ENV === 'production' 
          ? 'https://amu-salary.com'  // Replace with your actual production domain
          : 'http://localhost:5001');
      
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
      
      // Send email with reset link
      const emailResult = await sendPasswordResetEmail(email, resetUrl, false);
      
      const response: any = { 
        message: "Password reset link has been sent to your email"
      };
      
      // For development only - include reset token and preview URL
      if (process.env.NODE_ENV !== 'production') {
        response.resetToken = resetToken;
        response.resetUrl = resetUrl;
        
        if (emailResult.previewUrl) {
          response.emailPreviewUrl = emailResult.previewUrl;
        }
        
        // Include isEthereal flag for UI customization
        response.isEthereal = emailResult.isEthereal;
      }
      
      return res.json(response);
    } catch (error) {
      console.error("Forgot password error:", error);
      return res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { email, token, newPassword } = req.body;
    
    try {
      // Validate that all required fields are present
      if (!email || !token || !newPassword) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Find department by email
      const department = await storage.getDepartmentByEmail(email);
      if (!department) {
        return res.status(404).json({ message: "Email not found" });
      }
      
      // Verify token validity
      const isValidToken = await storage.validateResetToken(department.id, token);
      if (!isValidToken) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }
      
      // Update password
      await storage.updateDepartment(department.id, { password: newPassword });
      
      // Clear used token
      await storage.clearResetToken(department.id);
      
      return res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Admin forgot/reset password routes
  app.post("/api/auth/admin/forgot-password", async (req, res) => {
    const { email } = req.body;
    
    try {
      // For demo purposes, we'll only handle the two hardcoded admin accounts
      const ADMIN_EMAIL = "admin@amu.ac.in";
      const SALARY_ADMIN_EMAIL = "salary@amu.ac.in";
      
      if (email !== ADMIN_EMAIL && email !== SALARY_ADMIN_EMAIL) {
        return res.status(404).json({ message: "Admin email not found" });
      }
      
      // Generate reset token (expires in 1 hour)
      const resetToken = uuid();
      const tokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
      
      // Store token (in a real app this would be in the database)
      // For demo, we'll use a global Map to store tokens
      if (!global.adminResetTokens) {
        global.adminResetTokens = new Map();
      }
      global.adminResetTokens.set(email, { token: resetToken, expiry: tokenExpiry });
      
      // Create reset URL with configurable base URL
      const baseUrl = process.env.APP_URL || 
        (process.env.NODE_ENV === 'production' 
          ? 'https://amu-salary.com'  // Replace with your actual production domain
          : 'http://localhost:5001');
      
      const resetUrl = `${baseUrl}/admin/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
      
      // Send email with reset link
      const emailResult = await sendPasswordResetEmail(email, resetUrl, true);
      
      const response: any = { 
        message: "Password reset link has been sent to your email"
      };
      
      // For development only - include reset token and preview URL
      if (process.env.NODE_ENV !== 'production') {
        response.resetToken = resetToken;
        response.resetUrl = resetUrl;
        
        if (emailResult.previewUrl) {
          response.emailPreviewUrl = emailResult.previewUrl;
        }
        
        // Include isEthereal flag for UI customization
        response.isEthereal = emailResult.isEthereal;
      }
      
      return res.json(response);
    } catch (error) {
      console.error("Admin forgot password error:", error);
      return res.status(500).json({ message: "Failed to process admin password reset request" });
    }
  });

  app.post("/api/auth/admin/reset-password", async (req, res) => {
    const { email, token, newPassword } = req.body;
    
    try {
      // Validate that all required fields are present 
      if (!email || !token || !newPassword) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // For demo purposes only
      const ADMIN_EMAIL = "admin@amu.ac.in";
      const SALARY_ADMIN_EMAIL = "salary@amu.ac.in";
      
      if (email !== ADMIN_EMAIL && email !== SALARY_ADMIN_EMAIL) {
        return res.status(404).json({ message: "Admin email not found" });
      }
      
      // Check if token is valid
      if (!global.adminResetTokens || !global.adminResetTokens.has(email)) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }
      
      const tokenData = global.adminResetTokens.get(email);
      if (!tokenData || tokenData.token !== token || tokenData.expiry < new Date()) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }
      
      // In a real app, you would update the admin password in the database
      
      // Clear used token
      global.adminResetTokens.delete(email);
      
      return res.json({ message: "Admin password has been reset successfully" });
    } catch (error) {
      console.error("Admin reset password error:", error);
      return res.status(500).json({ message: "Failed to reset admin password" });
    }
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    console.log('[POST /api/auth/register] Registration attempt with data:', {
      ...req.body,
      password: '[REDACTED]'
    });

    try {
      const { id: departmentNameId, name, hodTitle, hodName, email, password } = req.body;
      
      if (!name || !hodTitle || !hodName || !email || !password) {
        console.log('[POST /api/auth/register] Missing required fields');
        return res.status(400).json({ 
          message: "Missing required fields",
          required: ["name", "hodTitle", "hodName", "email", "password"]
        });
      }

      // First check if email is already registered
      console.log('[POST /api/auth/register] Checking if email exists:', email);
      const existingDepartment = await storage.getDepartmentByEmail(email);
      if (existingDepartment) {
        console.log('[POST /api/auth/register] Email already registered:', email);
        return res.status(400).json({ message: "Email already registered" });
      }

      // Check if department with same name exists (case insensitive)
      console.log('[POST /api/auth/register] Checking if department name exists:', name);
      const departments = await storage.getAllDepartments();
      const existingDeptByName = departments.find(
        dept => dept.name.toLowerCase() === name.toLowerCase()
      );

      if (existingDeptByName) {
        console.log('[POST /api/auth/register] Updating existing department:', existingDeptByName.id);
        // Update the existing department with new credentials
        const updatedDepartment = await storage.updateDepartment(existingDeptByName.id, {
          hodTitle,
          hodName,
          email,
          password
        });
        console.log('[POST /api/auth/register] Department updated successfully');
        return res.status(200).json(updatedDepartment);
      }

      // Create new department
      console.log('[POST /api/auth/register] Creating new department');
      const department = await storage.createDepartment({
        name,
        hodTitle,
        hodName,
        email,
        password
      });

      console.log('[POST /api/auth/register] Department registered successfully:', {
        id: department.id,
        name: department.name,
        email: department.email
      });

      res.status(201).json(department);
    } catch (error) {
      console.error('[POST /api/auth/register] Error:', error);
      // Send a proper error response
      res.status(400).json({ 
        message: "Failed to register department",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log('Login attempt for:', email);

      const department = await storage.getDepartmentByEmail(email);
      console.log('Found department:', department);

      if (!department) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Make sure both the stored password and provided password are strings
      const storedPassword = String(department.password);
      const providedPassword = String(password);

      if (storedPassword !== providedPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Return the department data in the expected format
      res.json({
        success: true,
        department: {
          id: department.id,
          name: department.name,
          email: department.email,
          hodName: department.hodName,
          hodTitle: department.hodTitle
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Ensure uploads directory exists
  const uploadDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Configure multer for file uploads
  const fileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ 
    storage: fileStorage,
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
      
      console.log(`Validating file: ${file.originalname}, mimetype: ${file.mimetype}`);
      
      if (allowedTypes.includes(file.mimetype)) {
        console.log(`File accepted: ${file.originalname} (${file.mimetype})`);
        cb(null, true);
      } else {
        console.error(`File rejected: ${file.originalname} (${file.mimetype}) - Invalid mimetype`);
        cb(null, false);
      }
    }
  });

  // Serve uploaded files statically
  app.use('/uploads', express.static(uploadDir));

  // Multi-file upload fields configuration
  const documentFields = [
    { name: 'panCardDoc', maxCount: 1 },
    { name: 'bankAccountDoc', maxCount: 1 },
    { name: 'aadharCardDoc', maxCount: 1 },
    { name: 'officeMemoDoc', maxCount: 1 },
    { name: 'joiningReportDoc', maxCount: 1 },
    { name: 'termExtensionDoc', maxCount: 1 }
  ];

  // Get all department names (for UI lists, etc.)
  app.get("/api/department-names", async (req, res) => {
    try {
      const names = await storage.getAllDepartmentNames();
      res.json(names);
    } catch (error) {
      console.error("Error fetching department names:", error);
      res.status(500).json({ message: "Failed to fetch department names" });
    }
  });

  // Get available departments (for registration dropdown)
  app.get("/api/departments", async (req, res) => {
    console.log(`[GET /api/departments] Called with params:`, {
      showAll: req.query.showAll,
      showRegistered: req.query.showRegistered,
      registeredOnly: req.query.registeredOnly
    });

    try {
      let departmentList: Array<{ id: number; name: string; code?: string | null }> = [];

      if (req.query.registeredOnly === 'true') {
        console.log('[GET /api/departments] Fetching only registered departments (from departments table)');
        const registeredDepartments = await storage.getAllDepartments();
        departmentList = registeredDepartments.map(dept => ({
          id: dept.id,
          name: dept.name,
          code: null
        }));
        console.log(`[GET /api/departments] Fetched ${departmentList.length} registered departments`);
      } else {
        console.log('[GET /api/departments] Fetching all department names (from department_names table)');
        // Simply fetch all departments from department_names table
        const allDepartmentNames = await storage.getAllDepartmentNames();
        console.log(`[GET /api/departments] Fetched ${allDepartmentNames.length} departments from names table`);
        departmentList = allDepartmentNames.map(deptName => ({
          id: deptName.id,
          name: deptName.name,
          code: deptName.code
        }));
      }

      // Log sample of results
      if (departmentList.length > 0) {
        console.log(`[GET /api/departments] Sample of results:`,
          departmentList.slice(0, 3).map(d => ({
            id: d.id,
            name: d.name,
            code: d.code
          }))
        );
      }

      res.json(departmentList);

    } catch (error) {
      console.error('[GET /api/departments] Error:', error);
      res.status(500).json({
        message: "Failed to fetch departments",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get employees for a department
  app.get("/api/departments/:departmentId/employees", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      console.log('Fetching employees for department:', departmentId);

      // Verify department exists
      const department = await storage.getDepartment(departmentId);
      if (!department) {
        console.log('Department not found:', departmentId);
        return res.status(404).json({ message: "Department not found" });
      }
      console.log('Found department:', department);

      const employees = await storage.getEmployeesByDepartment(departmentId);
      console.log('Found employees:', employees.length ? employees : 'No employees found');
      
      // Transform the response to match the expected format
      const transformedEmployees = employees.map(emp => ({
        ...emp,
        departmentName: department.name
      }));
      
      res.json(transformedEmployees);
    } catch (error) {
      console.error('Error fetching department employees:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  // Create employee (department)
  app.post("/api/departments/:departmentId/employees", upload.fields(documentFields), async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      console.log("Department - Received raw employee data:", req.body);

      // Handle uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const employeeData = {
        ...req.body,
        departmentId,
        // Preserve existing URLs if files aren't being updated
        panCardUrl: files?.panCardDoc ? `/uploads/${files.panCardDoc[0].filename}` : req.body.panCardUrl || null,
        bankProofUrl: files?.bankAccountDoc ? `/uploads/${files.bankAccountDoc[0].filename}` : req.body.bankProofUrl || null,
        aadharCardUrl: files?.aadharCardDoc ? `/uploads/${files.aadharCardDoc[0].filename}` : req.body.aadharCardUrl || null,
        officeMemoUrl: files?.officeMemoDoc ? `/uploads/${files.officeMemoDoc[0].filename}` : req.body.officeMemoUrl || null,
        joiningReportUrl: files?.joiningReportDoc ? `/uploads/${files.joiningReportDoc[0].filename}` : req.body.joiningReportUrl || null,
        termExtensionUrl: files?.termExtensionDoc ? `/uploads/${files.termExtensionDoc[0].filename}` : req.body.termExtensionUrl || null
      };

      const parsedData = insertEmployeeSchema.parse(employeeData);
      console.log("Department - Parsed employee data:", parsedData);
      console.log("Creating employee in storage:", parsedData);

      const employee = await storage.createEmployee(parsedData);
      res.status(201).json(employee);
    } catch (error) {
      console.error('Error creating employee:', error);
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

  // Update employee (admin)
  app.patch("/api/employees/:id", upload.fields(documentFields), async (req, res) => {
    try {
      // Handle uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const updates = {
        ...req.body,
        // Only update URLs if new files are uploaded
        ...(files?.panCardDoc && { panCardUrl: `/uploads/${files.panCardDoc[0].filename}` }),
        ...(files?.bankAccountDoc && { bankProofUrl: `/uploads/${files.bankAccountDoc[0].filename}` }),
        ...(files?.aadharCardDoc && { aadharCardUrl: `/uploads/${files.aadharCardDoc[0].filename}` }),
        ...(files?.officeMemoDoc && { officeMemoUrl: `/uploads/${files.officeMemoDoc[0].filename}` }),
        ...(files?.joiningReportDoc && { joiningReportUrl: `/uploads/${files.joiningReportDoc[0].filename}` }),
        ...(files?.termExtensionDoc && { termExtensionUrl: `/uploads/${files.termExtensionDoc[0].filename}` })
      };

      const employee = await storage.updateEmployee(Number(req.params.id), updates);
      res.json(employee);
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(400).json({ message: "Invalid employee update" });
    }
  });

  // Add this new route for department employee updates
  app.patch("/api/departments/:departmentId/employees/:id", upload.fields(documentFields), async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const employeeId = Number(req.params.id);

      // Verify employee belongs to department
      const employee = await storage.getEmployee(employeeId);
      if (!employee || employee.departmentId !== departmentId) {
        return res.status(404).json({ message: "Employee not found in department" });
      }

      console.log(`Department employee update - request received for employee ${employeeId} in department ${departmentId}`);
      
      // Log files received (if any)
      if (req.files && Object.keys(req.files).length > 0) {
        console.log("Department employee update - files received:", Object.keys(req.files));
        const filesInfo = Object.entries(req.files as { [fieldname: string]: Express.Multer.File[] })
          .map(([key, files]) => {
            return `${key}: ${files.map(f => `${f.filename} (${f.size} bytes, ${f.mimetype})`).join(', ')}`;
          });
        console.log("Files details:");
        filesInfo.forEach(info => console.log(`- ${info}`));
      } else {
        console.log("Department employee update - no files received");
      }
      
      // Log body data
      console.log("Department employee update - body fields:", Object.keys(req.body));
      
      // Handle uploaded files exactly like admin route
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const updates = {
        ...req.body,
        // Only update URLs if new files are uploaded (same as admin side)
        ...(files?.panCardDoc && { panCardUrl: `/uploads/${files.panCardDoc[0].filename}` }),
        ...(files?.bankAccountDoc && { bankProofUrl: `/uploads/${files.bankAccountDoc[0].filename}` }),
        ...(files?.aadharCardDoc && { aadharCardUrl: `/uploads/${files.aadharCardDoc[0].filename}` }),
        ...(files?.officeMemoDoc && { officeMemoUrl: `/uploads/${files.officeMemoDoc[0].filename}` }),
        ...(files?.joiningReportDoc && { joiningReportUrl: `/uploads/${files.joiningReportDoc[0].filename}` }),
        ...(files?.termExtensionDoc && { termExtensionUrl: `/uploads/${files.termExtensionDoc[0].filename}` })
      };

      console.log("Department employee update - processed updates:", JSON.stringify(updates, null, 2));

      const updatedEmployee = await storage.updateEmployee(employeeId, updates);
      console.log("Successfully updated employee:", JSON.stringify(updatedEmployee, null, 2));
      res.json(updatedEmployee);
    } catch (error) {
      console.error('Error updating employee from department:', error);
      if (error instanceof Error) {
        res.status(400).json({ 
          message: "Invalid employee update", 
          details: error.message,
          stack: error.stack
        });
      } else {
        res.status(400).json({ 
          message: "Invalid employee update",
          details: String(error)
        });
      }
    }
  });

  // Add this new endpoint for file uploads
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      console.log("Upload API called");
      
      if (!req.file) {
        console.error('Upload API - No file received or invalid file type');
        return res.status(400).json({ message: "No file uploaded or invalid file type" });
      }

      console.log(`Upload API - File received: ${req.file.originalname}, size: ${req.file.size}, type: ${req.file.mimetype}`);
      
      // Return the URL that can be used to access the file
      const fileUrl = `/uploads/${req.file.filename}`;
      console.log(`Upload API - File saved as: ${fileUrl}`);
      
      res.json({ fileUrl });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ message: "Failed to upload file", error: String(error) });
    }
  });

  // Add endpoint to delete a file
  app.delete("/api/upload", async (req, res) => {
    try {
      console.log("Delete file API called with body:", req.body);
      
      const { fileUrl } = req.body;
      
      if (!fileUrl) {
        console.log("No file URL provided in request body");
        return res.status(400).json({ message: "No file URL provided" });
      }
      
      console.log(`Delete file API called for: ${fileUrl}`);
      
      // Extract the filename from the URL
      // Expected format: /uploads/filename.ext
      const urlParts = fileUrl.split('/');
      const filename = urlParts[urlParts.length - 1];
      
      if (!filename) {
        console.log("Invalid file URL format, couldn't extract filename");
        return res.status(400).json({ message: "Invalid file URL format" });
      }
      
      // Get the absolute path to the uploads directory
      const uploadDir = path.join(__dirname, '../uploads');
      console.log(`Upload directory absolute path: ${uploadDir}`);
      
      // Build the absolute file path
      const filePath = path.join(uploadDir, filename);
      console.log(`Full absolute file path: ${filePath}`);
      
      // Double check that the file path is within the uploads directory
      if (!filePath.startsWith(uploadDir)) {
        console.error(`Security issue: File path ${filePath} is outside upload directory ${uploadDir}`);
        return res.status(400).json({ message: "Invalid file path" });
      }
      
      console.log(`Checking if file exists at: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log(`File does not exist: ${filePath}`);
        // Still return success if file doesn't exist, as the end result is the same (no file)
        return res.status(200).json({ message: "File already removed or does not exist" });
      }
      
      console.log(`File exists, attempting to delete file at: ${filePath}`);
      
      try {
        // Delete the file
        fs.unlinkSync(filePath);
        
        // Verify the file was deleted
        const fileStillExists = fs.existsSync(filePath);
        if (fileStillExists) {
          console.error(`Failed to delete file: ${filePath} - File still exists after deletion attempt`);
          return res.status(500).json({ message: "Failed to delete file: File still exists after deletion attempt" });
        }
        
        console.log(`File successfully deleted: ${filePath}`);
        
        // Ensure we're sending a proper JSON response
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json({ message: "File deleted successfully" });
      } catch (unlinkError) {
        // Handle specific unlink errors
        console.error(`Error when trying to delete file ${filePath}:`, unlinkError);
        return res.status(500).json({ 
          message: "Failed to delete file", 
          error: String(unlinkError),
          details: "Error occurred during fs.unlinkSync operation"
        });
      }
    } catch (error) {
      console.error('Error in delete file route:', error);
      
      // Ensure we're sending a proper JSON response
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ 
        message: "Failed to delete file", 
        error: String(error) 
      });
    }
  });

  // User management endpoints
  
  // Get all users
  app.get("/api/admin/users", async (req, res) => {
    try {
      // For the MVP, we'll use a simplified approach
      // In production, these would be stored in the database
      
      // Hardcoded super admin and salary admin
      const hardcodedUsers = [
        {
          id: 1,
          name: "Super Administrator",
          email: "admin@amu.ac.in",
          role: "superadmin",
          departmentId: null,
          departmentName: null
        },
        {
          id: 2,
          name: "Salary Officer",
          email: "salary@amu.ac.in",
          role: "salary",
          departmentId: null,
          departmentName: null
        }
      ];
      
      // Get department admins from the departments table
      const departments = await storage.getAllDepartments();
      
      // Only include departments with valid emails (non-empty and NOT placeholder emails)
      const validDepartments = departments.filter(dept => 
        dept.email && 
        dept.email.trim() !== '' && 
        !dept.email.includes('unused_dept_') && // Filter out placeholder emails for deleted users
        !dept.email.includes('@placeholder.com') // Additional check for placeholder domain
      );
      
      console.log(`Found ${departments.length} total departments, ${validDepartments.length} have valid emails`);
      
      const departmentUsers = validDepartments.map((dept, index) => {
        // REMOVED: Logic to resolve names starting with "Department ID -"
        // The name should be correct in the database now.
        let departmentName = dept.name;
        
        return {
          id: index + 3, // Start IDs after hardcoded users
          name: dept.hodName,
          email: dept.email,
          role: "department",
          departmentId: dept.id,
          departmentName: departmentName // Use the name directly from the department record
        };
      });
      
      // Combine all users
      const allUsers = [...hardcodedUsers, ...departmentUsers];
      
      res.json(allUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  
  // Create a new user
  app.post("/api/admin/users", async (req, res) => {
    try {
      const { name, email, password, role, departmentId } = req.body;
      
      console.log("POST /api/admin/users - Creating user with data:", {
        name,
        email,
        role,
        departmentId: departmentId,
        departmentIdType: typeof departmentId
      });
      
      // Validate required fields
      if (!name || !email || !password || !role) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Check if email already exists in departments
      const existingDeptByEmail = await storage.getDepartmentByEmail(email);
      if (existingDeptByEmail) {
        return res.status(400).json({ message: "Email already in use" });
      }
      
      // For department role, associate with an existing department
      if (role === "department") {
        if (!departmentId) {
          return res.status(400).json({ message: "Department ID is required for department users" });
        }
        
        const selectedDeptNameId = Number(departmentId); // ID from department_names table
        if (isNaN(selectedDeptNameId)) {
          return res.status(400).json({ message: "Invalid department ID format" });
        }
        
        console.log(`Fetching details for department name ID: ${selectedDeptNameId}`);
        // Fetch details from department_names table using the ID from the dropdown
        const deptNameDetails = await storage.getDepartmentName(selectedDeptNameId);

        if (!deptNameDetails) {
            return res.status(404).json({ message: `