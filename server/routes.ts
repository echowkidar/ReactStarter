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

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database storage
const storage = new DbStorage();

// Define the type expected by the client components for this route
// Note: Adjust fields based on what's *actually* needed by the client dropdowns

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

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
            return res.status(404).json({ message: `Department details not found for ID ${selectedDeptNameId}. Cannot create user.` });
        }

        console.log(`Found details: ${deptNameDetails.name} (Code: ${deptNameDetails.code})`);

        // Check if a department with this NAME is already registered in the 'departments' table
        const existingRegisteredDept = await storage.getDepartmentByName(deptNameDetails.name);

        if (existingRegisteredDept) {
            // If it exists and has a valid email, prevent creating another user for it.
            if (existingRegisteredDept.email && !existingRegisteredDept.email.includes('unused_dept_') && !existingRegisteredDept.email.includes('@placeholder.com')) {
                console.log(`Department "${deptNameDetails.name}" is already registered with user ${existingRegisteredDept.email}.`);
                return res.status(400).json({ message: `Department "${deptNameDetails.name}" is already registered.` });
            } else {
                // If it exists but has a placeholder email, we can update it (effectively assigning the new user)
                console.log(`Department "${deptNameDetails.name}" exists but has no active user. Updating it.`);
                const updatedDepartment = await storage.updateDepartment(existingRegisteredDept.id, {
            hodName: name,
            email: email,
                    password: password // Consider hashing
                });
                // Recalculate UI ID (Fragile)
                const allDepts = await storage.getAllDepartments();
                const validDepts = allDepts.filter(d => d.email && !d.email.includes('unused_dept_') && !d.email.includes('@placeholder.com'));
                const userIndex = validDepts.findIndex(d => d.id === updatedDepartment.id);
                const uiId = (userIndex !== -1) ? userIndex + 3 : Date.now(); 
                return res.status(200).json({ // 200 OK for update
                    id: uiId,
            name: name,
            email: email,
            role: "department",
                    departmentId: updatedDepartment.id,
                    departmentName: updatedDepartment.name
                });
            }
        }

        // If not found in 'departments', create a new department entry
        console.log(`Creating new entry in 'departments' table for "${deptNameDetails.name}"`);
        try {
            const newDepartment = await storage.createDepartment({
                name: deptNameDetails.name, // Use name from department_names
                hodTitle: "Chairperson", // Default or fetch from somewhere?
              hodName: name,
              email: email,
                password: password // Consider hashing
            });
            console.log(`Created new registered department: ${newDepartment.id} "${newDepartment.name}"`);

            // Recalculate UI ID (Fragile)
            const allDepts = await storage.getAllDepartments();
            const validDepts = allDepts.filter(d => d.email && !d.email.includes('unused_dept_') && !d.email.includes('@placeholder.com'));
            const userIndex = validDepts.findIndex(d => d.id === newDepartment.id);
            const uiId = (userIndex !== -1) ? userIndex + 3 : Date.now(); 
            
            return res.status(201).json({
                id: uiId, 
              name: name,
              email: email,
              role: "department",
                departmentId: newDepartment.id, // The new ID from the 'departments' table
              departmentName: newDepartment.name
            });
        } catch (creationError) {
            console.error('Error creating new department entry:', creationError);
            return res.status(500).json({ message: "Failed to register new department user." });
        }
      }
      
      // Handle other roles (superadmin, salary) - For MVP, these are not stored/created via API
      if (role === "superadmin" || role === "salary") {
         return res.status(400).json({ message: `Cannot create '${role}' user via API in this version.` });
      }

      // Fallback for unhandled roles or errors
      res.status(400).json({ message: "Invalid role or parameters for user creation." });

    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });
  
  // Update an existing user
  app.put("/api/admin/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { name, email, password, role, departmentId } = req.body;
      
      console.log("PUT /api/admin/users/:id - Updating user:", {
        userId, name, email, role, departmentId
      });
      
      // Handle hardcoded users (superadmin, salary) - cannot be updated via API
      if (userId <= 2) {
        return res.json({ message: "System users cannot be modified via API." });
      }
      
      // Find the current department for this user
        const allDepts = await storage.getAllDepartments();
      const validDepartments = allDepts.filter(dept => 
        dept.email && !dept.email.includes('unused_dept_') && !dept.email.includes('@placeholder.com')
      );

      const currentDepartment = validDepartments.find((dept, index) => {
         const calculatedUserId = index + 3;
         return calculatedUserId === userId;
      });

      if (!currentDepartment) {
         return res.status(404).json({ message: `User with UI ID ${userId} not found (no corresponding department).` });
      }

      console.log(`Found current department for UI user ID ${userId}: Dept ID ${currentDepartment.id} (${currentDepartment.name})`);

      // Get the target department name from department_names
      const targetDeptNameId = Number(departmentId);
      if (isNaN(targetDeptNameId)) {
         return res.status(400).json({ message: "Invalid target department ID format." });
      }

      const targetDeptNameDetails = await storage.getDepartmentName(targetDeptNameId);
      if (!targetDeptNameDetails) {
          return res.status(404).json({ message: `Target department details not found for ID ${targetDeptNameId}.` });
      }

      // Check for email conflict with other departments
      if (email !== currentDepartment.email) {
          const existingUserWithEmail = await storage.getDepartmentByEmail(email);
          if (existingUserWithEmail && existingUserWithEmail.id !== currentDepartment.id) {
             return res.status(400).json({ message: `Email ${email} is already in use by department ${existingUserWithEmail.name}.` });
          }
      }

      // Update the current department with new details
      console.log(`Updating department ${currentDepartment.id} with new name "${targetDeptNameDetails.name}" and user details`);
      await storage.updateDepartment(currentDepartment.id, {
          name: targetDeptNameDetails.name, // Update the department name
              hodName: name,
              email: email,
              ...(password && password.trim() !== '' ? { password } : {})
            });
            
            return res.json({
              id: userId,
              name,
              email,
              role: "department",
          departmentId: currentDepartment.id,
          departmentName: targetDeptNameDetails.name
      });

    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  
  // Delete a user
  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id); // Fragile UI ID
      console.log(`Attempting to delete user with UI ID: ${userId}`);
      
      // Prevent deleting hardcoded users
      if (userId <= 2) {
        console.log(`Cannot delete system user with ID: ${userId}`);
        return res.status(403).json({ message: "Cannot delete system users" });
      }
      
      // Find the department matching this UI user ID using .find()
      const allDepts = await storage.getAllDepartments();
      
      const validDepartments = allDepts.filter(dept => 
         dept.email && !dept.email.includes('unused_dept_') && !dept.email.includes('@placeholder.com')
      );

      const departmentToDelete = validDepartments.find((dept, index) => {
         const calculatedUserId = index + 3;
         return calculatedUserId === userId;
      });
      
      if (!departmentToDelete) {
        // No need for extra null check here
        console.log(`No department found for user ID: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      // departmentToDelete is guaranteed to be a Department object here
      const deptId = departmentToDelete.id;
      const deptName = departmentToDelete.name;

      console.log(`Found department to delete: ${deptId} (${deptName})`);

      // Check for associated employees before deleting
      const employees = await storage.getEmployeesByDepartment(deptId);
      if (employees.length > 0) {
         console.log(`Cannot delete department ${deptId} - it has ${employees.length} employees. Clearing user info instead.`);
         // Instead of deleting, clear the user-specific info (email, HOD, password)
         try {
            const placeholderEmail = `unused_dept_${deptId}_${Date.now()}@placeholder.com`;
            await storage.updateDepartment(deptId, {
               email: placeholderEmail,
               hodName: "(User Deleted)",
               password: uuid()
            });
      return res.json({ 
               message: `User (department ${deptId}) cannot be deleted due to associated employees. User info cleared.`,
        userId: userId,
               departmentId: deptId,
               departmentName: deptName
            });
         } catch (clearError) {
            console.error(`Error clearing user info for department ${deptId} during delete:`, clearError);
            return res.status(500).json({ message: "Failed to clear user info during deletion." });
         }
          } else {
         // No employees, safe to delete the department record
         await storage.deleteDepartment(deptId);
         console.log(`Department ${deptId} deleted successfully.`);
         return res.json({ 
           message: "User deleted successfully",
           userId: userId,
           departmentId: deptId,
           departmentName: deptName // Return the name before deletion
         });
      }
      
      // REMOVED: Old logic trying to resolve names with getDepartmentNameFromNegativeId

    } catch (error) {
      console.error('Error deleting user:', error);
      console.error('Error fetching department employees:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
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
      // Create a safe copy of the request body
      const updates = { ...req.body };
      
      // Handle date fields properly for PostgreSQL
      if (updates.despatchDate && typeof updates.despatchDate === 'string') {
        updates.despatchDate = new Date(updates.despatchDate);
      }
      
      // Handle receipt date
      if (updates.receiptDate) {
        if (typeof updates.receiptDate === 'string') {
          updates.receiptDate = new Date(updates.receiptDate);
        } else if (updates.receiptDate instanceof Date) {
          // Keep it as is (already a Date object)
        } else {
          // If it's neither a string nor a Date, remove it to prevent errors
          delete updates.receiptDate;
        }
      }
      
      const report = await storage.updateAttendanceReport(Number(req.params.id), updates);
      res.json(report);
    } catch (error) {
      console.error(error);
      res.status(400).json({ message: "Failed to update attendance report" });
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
    try {
      const reports = await storage.getAllAttendanceReports();
      const reportsWithDetailsPromises = reports.map(async (report) => {
        const department = await storage.getDepartment(report.departmentId);
        
        // Provide explicit type for entriesWithDetails
        let entriesWithDetails: (AttendanceEntry & { employee?: Employee | undefined })[] = [];
        if (report.status === "sent") {
          const entries = await storage.getAttendanceEntriesByReport(report.id);
          entriesWithDetails = await Promise.all(
            entries.map(async (entry) => {
              const employee = await storage.getEmployee(entry.employeeId);
              return {
                ...entry,
                employee // employee is already Employee | undefined
              };
            })
          );
        }
        
        return {
          ...report,
          department, // department is already Department | undefined
          entries: entriesWithDetails, // Use explicitly typed array
          receiptNo: report.receiptNo,
          receiptDate: report.receiptDate,
        };
      });
      
      const reportsWithDetails = await Promise.all(reportsWithDetailsPromises);
      res.json(reportsWithDetails);
    } catch (error) {
      console.error('Error fetching attendance reports with details:', error);
      res.status(500).json({ message: "Failed to fetch attendance reports with details" });
    }
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
      console.log('[GET /api/admin/employees] Fetching all employees');
      const employees = await storage.getAllEmployees();
      
      // Get all departments to add department names
      const departments = await storage.getAllDepartments();
      const departmentMap = new Map(departments.map(d => [d.id, d]));

      // Add department names to employees
      const employeesWithDepartments = employees.map(emp => ({
          ...emp,
        departmentName: departmentMap.get(emp.departmentId)?.name || 'Unknown Department'
      }));

      console.log(`[GET /api/admin/employees] Returning ${employeesWithDepartments.length} employees`);
      res.json(employeesWithDepartments);
    } catch (error) {
      console.error('[GET /api/admin/employees] Error:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get("/api/departments/registered", async (req, res) => {
    try {
      const registeredDepartments = await storage.getAllDepartments();
      console.log(`Fetched ${registeredDepartments.length} registered departments`);
      res.json(registeredDepartments);
    } catch (error) {
      console.error("Error fetching registered departments:", error);
      res.status(500).json({ error: "Failed to fetch registered departments" });
    }
  });

  // Create employee (admin)
  app.post("/api/admin/employees", upload.fields(documentFields), async (req, res) => {
    try {
      console.log("Admin - Received raw employee data:", req.body);
      
      // Parse departmentId from the request
      const departmentId = Number(req.body.departmentId);
      console.log(`Processing department ID: ${departmentId}`);
      
      // Check if department ID exists in departments table
      let departmentExists = false;
      let actualDepartmentId = departmentId; // The ID to use for employee creation
      
      try {
        const department = await storage.getDepartment(departmentId);
        if (department) {
          departmentExists = true;
          console.log(`Department ${departmentId} exists in departments table: ${department.name}`);
        } else {
          console.log(`Department ${departmentId} does not exist in departments table`);
          
          // Try to find the department in department_names table
          const departmentNameRecord = await storage.getDepartmentName(departmentId);
          
          if (departmentNameRecord) {
            console.log(`Found department in department_names: ${departmentId} - ${departmentNameRecord.name}`);
            
            // Create a placeholder entry in departments table
            try {
              const placeholderDepartment = await storage.createDepartment({
                name: departmentNameRecord.name,
                hodTitle: "Placeholder",
                hodName: "Placeholder", 
                email: `placeholder_${departmentId}@placeholder.com`,
                password: "placeholder_password"
              });
              
              console.log(`Created placeholder department: ID=${placeholderDepartment.id}, Name=${placeholderDepartment.name}`);
              
              // Use the newly created department ID instead of the original one
              actualDepartmentId = placeholderDepartment.id;
              departmentExists = true;
            } catch (createDeptError) {
              console.error("Error creating placeholder department:", createDeptError);
              return res.status(500).json({
                message: "Failed to create required department",
                details: createDeptError instanceof Error ? createDeptError.message : String(createDeptError)
              });
            }
          } else {
            console.log(`Department ${departmentId} not found in department_names table either`);
            return res.status(400).json({
              message: "Invalid department ID",
              details: `Department ID ${departmentId} not found in department_names table`
            });
          }
        }
      } catch (error) {
        console.error("Error checking department:", error);
        return res.status(500).json({
          message: "Error checking department existence",
          details: error instanceof Error ? error.message : String(error)
        });
      }
      
      if (!departmentExists) {
        return res.status(400).json({
          message: "Invalid department ID",
          details: `Department ID ${departmentId} does not exist`
        });
      }

      // Handle uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const employeeData = {
        ...req.body,
        departmentId: actualDepartmentId, // Use the department ID we determined above
        joiningDate: req.body.joiningDate || new Date().toISOString().split('T')[0],
        employmentStatus: req.body.employmentStatus || "Permanent",
        joiningShift: req.body.joiningShift || "FN",
        officeMemoNo: req.body.officeMemoNo || "",
        salaryRegisterNo: req.body.salaryRegisterNo || "",
        bankAccount: req.body.bankAccount || "",
        panNumber: req.body.panNumber || "",
        aadharCard: req.body.aadharCard || "",
        // Map file URLs from the uploaded files
        panCardUrl: files?.panCardDoc ? `/uploads/${files.panCardDoc[0].filename}` : req.body.panCardUrl || null,
        bankProofUrl: files?.bankAccountDoc ? `/uploads/${files.bankAccountDoc[0].filename}` : req.body.bankProofUrl || null,
        aadharCardUrl: files?.aadharCardDoc ? `/uploads/${files.aadharCardDoc[0].filename}` : req.body.aadharCardUrl || null,
        officeMemoUrl: files?.officeMemoDoc ? `/uploads/${files.officeMemoDoc[0].filename}` : req.body.officeMemoUrl || null,
        joiningReportUrl: files?.joiningReportDoc ? `/uploads/${files.joiningReportDoc[0].filename}` : req.body.joiningReportUrl || null,
        termExtensionUrl: files?.termExtensionDoc ? `/uploads/${files.termExtensionDoc[0].filename}` : req.body.termExtensionUrl || null,
      };

      console.log(`Final employee data using department ID: ${actualDepartmentId}`);
      const parsedData = insertEmployeeSchema.parse(employeeData);
      console.log("Admin - Parsed employee data:", parsedData);
      
      try {
        const employee = await storage.createEmployee(parsedData);
        console.log(`Employee created successfully with ID: ${employee.id}`);
        res.status(201).json(employee);
      } catch (createEmployeeError) {
        console.error("Error creating employee:", createEmployeeError);
        return res.status(400).json({ 
          message: "Failed to create employee in database",
          details: createEmployeeError instanceof Error ? createEmployeeError.message : String(createEmployeeError)
        });
      }
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

  return httpServer;
}
