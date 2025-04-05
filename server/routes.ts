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
  insertDepartmentSchema
} from "@shared/schema";
import fs from "fs";
import { allDepartmentsList, getDepartmentHashId } from "../shared/departments";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database storage
const storage = new DbStorage();

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

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
        joiningReportUrl: files?.joiningReportDoc ? `/uploads/${files.joiningReportDoc[0].filename}` : req.body.joiningReportUrl || null
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
        ...(files?.joiningReportDoc && { joiningReportUrl: `/uploads/${files.joiningReportDoc[0].filename}` })
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
        ...(files?.joiningReportDoc && { joiningReportUrl: `/uploads/${files.joiningReportDoc[0].filename}` })
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
      
      const departmentUsers = validDepartments.map((dept, index) => ({
        id: index + 3, // Start IDs after hardcoded users
        name: dept.hodName,
        email: dept.email,
        role: "department",
        departmentId: dept.id,
        departmentName: dept.name
      }));
      
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
      
      // For the MVP, we're implementing a simplified version
      // In a production app, we'd store all users in the database
      
      // Validate required fields
      if (!name || !email || !password || !role) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Check if email already exists in departments
      const existingDept = await storage.getDepartmentByEmail(email);
      if (existingDept) {
        return res.status(400).json({ message: "Email already in use" });
      }
      
      // For superadmin and salary roles, we'd handle differently in production
      // For department role, create a new department
      if (role === "department") {
        if (!departmentId) {
          console.log("Department ID is missing or null");
          return res.status(400).json({ message: "Department ID is required for department users" });
        }
        
        // Ensure departmentId is a number
        const deptId = Number(departmentId);
        if (isNaN(deptId)) {
          console.log(`Invalid department ID format: ${departmentId}`);
          return res.status(400).json({ message: "Invalid department ID format" });
        }
        
        console.log(`Looking up department with ID: ${deptId} (${typeof deptId})`);
        
        // Get all departments first for debugging
        const allDepartments = await storage.getAllDepartments();
        console.log(`Found ${allDepartments.length} total departments in database`);
        
        // Try to find existing department
        const department = await storage.getDepartment(deptId);
        
        if (department) {
          // Update existing department
          const updatedDepartment = await storage.updateDepartment(deptId, {
            hodName: name,
            email: email,
            password: password
          });
          
          return res.status(201).json({
            id: department.id + 2,
            name: name,
            email: email,
            role: "department",
            departmentId: department.id,
            departmentName: department.name
          });
        } else {
          try {
            // Use the imported departments list
            console.log(`Using shared departments list with ${allDepartmentsList.length} entries`);
            
            // Find the department name by checking the negative IDs
            let departmentName = "";
            
            // If it's a negative ID, find the matching department from the list
            if (deptId < 0) {
              // The full list should be loaded at this point
              const response = await fetch(`http://localhost:${process.env.PORT || 5001}/api/departments?showAll=true`);
              if (response.ok) {
                const departmentsList = await response.json();
                // Find the matching department
                const matchingDept = departmentsList.find(d => d.id === deptId);
                if (matchingDept) {
                  departmentName = matchingDept.name;
                  console.log(`Found department name "${departmentName}" from API for ID: ${deptId}`);
                }
              }
            }
            
            // If we still don't have a name, use a default
            if (!departmentName) {
              departmentName = `Department ID ${deptId}`;
              console.log(`Could not find department name for ID: ${deptId}, using default name`);
            }
            
            // Create a new department with the correct name
            const newDepartment = await storage.createDepartment({
              name: departmentName,
              hodTitle: "Chairperson",
              hodName: name,
              email: email,
              password: password
            });
            
            console.log(`Created new department: ${newDepartment.id} "${newDepartment.name}"`);
            
            return res.status(201).json({
              id: newDepartment.id + 2,
              name: name,
              email: email,
              role: "department",
              departmentId: newDepartment.id,
              departmentName: newDepartment.name
            });
          } catch (error) {
            console.error('Error looking up department name:', error);
            
            // Fallback: Create a generic department name
            const newDepartment = await storage.createDepartment({
              name: `Department ID ${deptId}`,
              hodTitle: "Chairperson",
              hodName: name,
              email: email,
              password: password
            });
            
            return res.status(201).json({
              id: newDepartment.id + 2,
              name: name,
              email: email,
              role: "department",
              departmentId: newDepartment.id,
              departmentName: newDepartment.name
            });
          }
        }
      }
      
      // In production, handle other user roles here
      // For the MVP, we'll just return a success message for superadmin and salary
      res.status(201).json({
        id: Date.now(), // Temporary ID for the UI
        name,
        email,
        role,
        departmentId: null,
        departmentName: null
      });
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
        userId,
        name,
        email,
        role,
        departmentId: departmentId,
        departmentIdType: typeof departmentId
      });
      
      // For the MVP, only department users are actually stored in the database
      // For hardcoded users (superadmin, salary), we'll just return success
      if (userId <= 2) {
        return res.json({
          id: userId,
          name,
          email,
          role,
          departmentId: null,
          departmentName: null
        });
      }
      
      // For department users, update the department
      if (role === "department") {
        if (!departmentId) {
          return res.status(400).json({ message: "Department ID is required for department users" });
        }
        
        // Parse departmentId as a number to ensure consistent type
        const deptId = Number(departmentId);
        
        // Find the old department that corresponds to this user ID
        const allDepts = await storage.getAllDepartments();
        console.log(`Found ${allDepts.length} total departments`);
        
        // Map user IDs to departments using the same logic as the GET /api/admin/users route
        let oldDepartment: Department | null = null;
        allDepts.forEach((dept, index) => {
          const calculatedUserId = index + 3; // This matches the logic in GET /api/admin/users
          if (calculatedUserId === userId) {
            oldDepartment = dept;
          }
        });
        
        if (oldDepartment) {
          console.log(`Found user's current department: ${oldDepartment.id} (${oldDepartment.name})`);
          
          // If user is being moved to a different department
          if (oldDepartment.id !== deptId) {
            console.log(`User is being moved to a new department ID: ${deptId}`);
            
            // First, update the old department's email to a placeholder to avoid constraint violations
            try {
              const tempEmail = `unused_dept_${oldDepartment.id}_${Date.now()}@placeholder.com`;
              console.log(`Updating old department ${oldDepartment.id} email to placeholder: ${tempEmail}`);
              await storage.updateDepartment(oldDepartment.id, { 
                email: tempEmail
              });
            } catch (emailUpdateError) {
              console.error(`Error updating old department email: ${emailUpdateError}`);
              // Continue anyway, we'll handle potential errors later
            }
            
            // Check if the target department exists
            const targetDept = await storage.getDepartment(deptId);
            
            if (targetDept) {
              console.log(`Target department exists: ${targetDept.id} (${targetDept.name})`);
              
              // Update the target department with new user details
              await storage.updateDepartment(targetDept.id, { 
                hodName: name,
                email: email,
                ...(password && password.trim() !== '' ? { password } : {})
              });
              
              // Now we can delete the old department
              console.log(`Deleting old department: ${oldDepartment.id} (${oldDepartment.name})`);
              try {
                // Ensure old department email is updated first to avoid constraint violations if deletion fails
                const tempEmail = `unused_dept_${oldDepartment.id}_${Date.now()}@placeholder.com`;
                await storage.updateDepartment(oldDepartment.id, { email: tempEmail });
                
                // Check if there are any employees in the old department
                const employees = await storage.getEmployeesByDepartment(oldDepartment.id);
                if (employees.length === 0) {
                  // Only delete if there are no employees
                  await storage.deleteDepartment(oldDepartment.id);
                  console.log(`Old department ${oldDepartment.id} deleted successfully`);
                } else {
                  console.log(`Cannot delete department ${oldDepartment.id} - it has ${employees.length} employees`);
                }
              } catch (deleteError) {
                console.error(`Error deleting old department ${oldDepartment.id}:`, deleteError);
                // Continue even if deletion fails
              }
              
              return res.json({
                id: userId,
                name,
                email,
                role: "department",
                departmentId: targetDept.id,
                departmentName: targetDept.name
              });
            } else {
              // Target department doesn't exist, we need to create it (for negative IDs)
              if (deptId < 0) {
                console.log(`Target department with ID ${deptId} doesn't exist, auto-registering`);
                try {
                  // Use the imported departments list
                  console.log(`Using shared departments list with ${allDepartmentsList.length} entries for lookup`);
                  
                  // Try to determine the department name from the negative ID
                  // This uses the same hashing function as in the GET /api/departments route
                  let departmentName = null;
                  if (deptId < 0) {
                    departmentName = getDepartmentNameFromNegativeId(deptId);
                  }
                  
                  if (!departmentName) {
                    // If we can't find the department name, use a generic one
                    departmentName = `Department ID ${deptId}`;
                  }
                  
                  // Create the new department
                  const newDepartment = await storage.createDepartment({
                    name: departmentName,
                    hodTitle: "Chairperson",
                    hodName: name,
                    email: email,
                    password: password || "password123" // Fallback password if none provided
                  });
                  
                  console.log(`Auto-registered department: ${newDepartment.id} "${newDepartment.name}"`);
                  
                  // Now we can delete the old department
                  console.log(`Deleting old department: ${oldDepartment.id} (${oldDepartment.name})`);
                  try {
                    // Ensure old department email is updated first to avoid constraint violations if deletion fails
                    const tempEmail = `unused_dept_${oldDepartment.id}_${Date.now()}@placeholder.com`;
                    await storage.updateDepartment(oldDepartment.id, { email: tempEmail });
                    
                    // Check if there are any employees in the old department
                    const employees = await storage.getEmployeesByDepartment(oldDepartment.id);
                    if (employees.length === 0) {
                      // Only delete if there are no employees
                      await storage.deleteDepartment(oldDepartment.id);
                      console.log(`Old department ${oldDepartment.id} deleted successfully`);
                    } else {
                      console.log(`Cannot delete department ${oldDepartment.id} - it has ${employees.length} employees`);
                    }
                  } catch (deleteError) {
                    console.error(`Error deleting old department ${oldDepartment.id}:`, deleteError);
                    // Continue even if deletion fails
                  }
                  
                  // Return the response with the new department
                  return res.json({
                    id: userId,
                    name,
                    email,
                    role: "department",
                    departmentId: newDepartment.id,
                    departmentName: newDepartment.name
                  });
                } catch (error) {
                  console.error('Error auto-registering department:', error);
                  return res.status(500).json({ message: "Failed to register department" });
                }
              } else {
                // Return department not found for non-negative IDs that don't exist
                return res.status(404).json({ 
                  message: "Department not found", 
                  details: `No department found with ID ${deptId}`
                });
              }
            }
          } else {
            // User is staying in the same department, just update the department details
            console.log(`User is staying in the same department: ${oldDepartment.id} (${oldDepartment.name})`);
            
            // Update the department with new details
            await storage.updateDepartment(oldDepartment.id, { 
              hodName: name,
              email: email,
              ...(password && password.trim() !== '' ? { password } : {})
            });
            
            return res.json({
              id: userId,
              name,
              email,
              role: "department",
              departmentId: oldDepartment.id,
              departmentName: oldDepartment.name
            });
          }
        } else {
          // No department found for this user ID, this should not happen
          // but we'll handle it by creating a new department
          console.log(`No current department found for user ID: ${userId}, creating a new one`);
          
          // Check if the target department exists
          const targetDept = await storage.getDepartment(deptId);
          
          if (targetDept) {
            // Target department exists, update it
            await storage.updateDepartment(targetDept.id, { 
              hodName: name,
              email: email,
              ...(password && password.trim() !== '' ? { password } : {})
            });
            
            return res.json({
              id: userId,
              name,
              email,
              role: "department",
              departmentId: targetDept.id,
              departmentName: targetDept.name
            });
          } else if (deptId < 0) {
            // Auto-register the department
            try {
              // Use the imported departments list
              console.log(`Using shared departments list with ${allDepartmentsList.length} entries for lookup`);
              
              // Try to determine the department name from the negative ID
              let departmentName = null;
              if (deptId < 0) {
                departmentName = getDepartmentNameFromNegativeId(deptId);
              }
              
              if (!departmentName) {
                departmentName = `Department ID ${deptId}`;
              }
              
              // Create the department
              const newDepartment = await storage.createDepartment({
                name: departmentName,
                hodTitle: "Chairperson",
                hodName: name,
                email: email,
                password: password || "password123"
              });
              
              console.log(`Auto-registered department: ${newDepartment.id} "${newDepartment.name}"`);
              
              return res.json({
                id: userId,
                name,
                email,
                role: "department",
                departmentId: newDepartment.id,
                departmentName: newDepartment.name
              });
            } catch (error) {
              console.error('Error auto-registering department:', error);
              return res.status(500).json({ message: "Failed to register department" });
            }
          } else {
            return res.status(404).json({ 
              message: "Department not found", 
              details: `No department found with ID ${deptId}`
            });
          }
        }
      }
      
      // For non-department roles (not implemented in MVP)
      res.status(400).json({ message: "Can only update department users in this version" });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  
  // Delete a user
  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      console.log(`Attempting to delete user with ID: ${userId}`);
      
      // Prevent deleting hardcoded users
      if (userId <= 2) {
        console.log(`Cannot delete system user with ID: ${userId}`);
        return res.status(403).json({ message: "Cannot delete system users" });
      }
      
      // Find the department matching this user
      const departments = await storage.getAllDepartments();
      console.log(`Found ${departments.length} departments to check against`);
      
      // Map user IDs to departments using the same logic as the GET /api/admin/users route
      let departmentToDelete: Department | null = null;
      departments.forEach((dept, index) => {
        const calculatedUserId = index + 3; // This matches the logic in GET /api/admin/users
        console.log(`Department ${dept.id} (${dept.name}) maps to user ID: ${calculatedUserId}`);
        
        if (calculatedUserId === userId) {
          departmentToDelete = dept;
        }
      });
      
      if (!departmentToDelete) {
        console.log(`No department found for user ID: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log(`Found department to delete: ${departmentToDelete.id} (${departmentToDelete.name})`);
      
      // Delete the department
      await storage.deleteDepartment(departmentToDelete.id);
      
      return res.json({ 
        message: "User deleted successfully",
        userId: userId,
        departmentId: departmentToDelete.id,
        departmentName: departmentToDelete.name
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      return res.status(500).json({ 
        message: "Failed to delete user", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get all departments (for user management)
  app.get("/api/departments", async (req, res) => {
    try {
      // Get the query parameters
      const showAll = req.query.showAll === 'true';
      const showRegistered = req.query.showRegistered === 'true';
      
      console.log(`GET /api/departments with params: showAll=${showAll}, showRegistered=${showRegistered}`);
      
      // Get existing departments from database
      const existingDepartments = await storage.getAllDepartments();
      console.log(`Found ${existingDepartments.length} departments in database`);
      
      // Default department templates in development mode
      const defaultDepartments = [
        { name: "Department of Computer Science", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
        { name: "Department of Mathematics", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
        { name: "Department of Physics", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
        { name: "Department of Chemistry", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
        { name: "Department of Botany", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" },
        { name: "Department of Zoology", hodTitle: "Chairperson", hodName: "HOD", email: "", password: "" }
      ];

      // Get list of department names that are already registered
      const registeredDepartmentNames = existingDepartments.map(dept => dept.name.toLowerCase());
      
      // Create a map of existing departments by name (case insensitive) 
      const existingDeptMap = new Map();
      existingDepartments.forEach(dept => {
        existingDeptMap.set(dept.name.toLowerCase(), dept);
        // Also map by ID for direct lookup
        existingDeptMap.set(`id:${dept.id}`, dept);
      });
      
      // Debug log for existing departments
      console.log("Existing departments:", existingDepartments.map(d => ({ 
        id: d.id, 
        name: d.name, 
        email: d.email ? (d.email.includes('@') ? 'has email' : 'invalid email') : 'no email' 
      })));
      
      // Always try to return the full department list regardless of parameters
      try {
        // Use the imported departments list
        console.log(`Using shared departments list with ${allDepartmentsList.length} entries`);
        
        // We'll include all departments, regardless of registration status
        let departmentsList = [...allDepartmentsList];
        
        console.log(`Returning ${departmentsList.length} departments from the full list`);
        
        // Return the list of departments
        // For departments that already exist in the database, use their real ID
        // For new departments, use a consistent ID based on the name's hash
        const resultDepartments = departmentsList.map(name => {
          // Check if this department already exists in our database
          const existingDept = existingDeptMap.get(name.toLowerCase());
          
          if (existingDept) {
            console.log(`Department "${name}" exists in database with ID ${existingDept.id}`);
            // Use the existing department's real ID and data
            return {
              id: existingDept.id,
              name: existingDept.name, // Use the stored name (preserves case)
              hodTitle: existingDept.hodTitle,
              hodName: existingDept.hodName,
              email: existingDept.email,
              createdAt: existingDept.createdAt,
              isRegistered: true
            };
          } else {
            // For departments not in the database yet, use a consistent ID
            // This ensures the same department name will always return the same ID
            // Note: This is just for display purposes, not for actual database operations
            const negativeId = getDepartmentHashId(name);
            console.log(`Department "${name}" does NOT exist in database, using hash ID ${negativeId}`);
            return { 
              id: negativeId, // Negative IDs to distinguish from real database IDs
              name,
              hodTitle: "Chairperson",
              hodName: "",
              email: "",
              createdAt: new Date(),
              isRegistered: false
            };
          }
        });
        
        // Log a sample of the departments we're returning
        if (resultDepartments.length > 0) {
          console.log("Sample of departments being returned:", 
            resultDepartments.slice(0, 3).map(d => ({ id: d.id, name: d.name, isRegistered: d.isRegistered }))
          );
        }
        
        return res.json(resultDepartments);
      } catch (importError) {
        console.error("Error importing department list:", importError);
        // If import fails, fall back to a simple list
        console.log("Falling back to default department list");
        return res.json(defaultDepartments);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const departmentData = insertDepartmentSchema.parse(req.body);
      const existingDepartment = await storage.getDepartmentByEmail(departmentData.email);

      if (existingDepartment) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Check if department with same name exists (case insensitive)
      const departments = await storage.getAllDepartments();
      const existingDeptByName = departments.find(
        dept => dept.name.toLowerCase() === departmentData.name.toLowerCase()
      );

      if (existingDeptByName) {
        // Update the existing department with new credentials
        const updatedDepartment = await storage.updateDepartment(existingDeptByName.id, {
          hodTitle: departmentData.hodTitle,
          hodName: departmentData.hodName,
          email: departmentData.email,
          password: departmentData.password
        });
        return res.status(200).json(updatedDepartment);
      }

      const department = await storage.createDepartment(departmentData);
      res.status(201).json(department);
    } catch (error) {
      console.error('Error registering department:', error);
      res.status(400).json({ message: "Invalid department data" });
    }
  });

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

      res.json(department);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Create employee (admin)
  app.post("/api/admin/employees", upload.fields(documentFields), async (req, res) => {
    try {
      console.log("Admin - Received raw employee data:", req.body);

      // Handle uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const employeeData = {
        ...req.body,
        departmentId: Number(req.body.departmentId),
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
      };

      const parsedData = insertEmployeeSchema.parse(employeeData);
      console.log("Admin - Parsed employee data:", parsedData);
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
      console.log('Found employees:', employees);
      res.json(employees);
    } catch (error) {
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
        
        // For status "sent" reports, fetch entries with employee details
        let entriesWithDetails = [];
        if (report.status === "sent") {
          const entries = await storage.getAttendanceEntriesByReport(report.id);
          entriesWithDetails = await Promise.all(
            entries.map(async (entry) => {
              const employee = await storage.getEmployee(entry.employeeId);
              return {
                ...entry,
                employee
              };
            })
          );
        }
        
        return {
          ...report,
          department,
          entries: report.status === "sent" ? entriesWithDetails : [],
          // Ensure these fields are included in the response
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

  // Get attendance report by ID
  app.get("/api/attendance/:id", async (req, res) => {
    try {
      const report = await storage.getAttendanceReport(Number(req.params.id));
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error('Error fetching attendance report:', error);
      res.status(400).json({ message: "Invalid report request" });
    }
  });

  // Upload PDF for attendance report
  app.post("/api/attendance/:reportId/upload", upload.single('file'), async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    
    try {
      const reportId = Number(req.params.reportId);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const fileUrl = `/uploads/${file.filename}`;
      
      // Update the report with the file URL
      try {
        const report = await storage.updateAttendanceReport(reportId, { fileUrl });
        return res.status(200).json({ fileUrl, report });
      } catch (dbError) {
        console.error('Database error during upload:', dbError);
        return res.status(500).json({ message: "Failed to update report with file URL", error: String(dbError) });
      }
    } catch (error) {
      console.error('Error uploading attendance report PDF:', error);
      // Always return JSON, never HTML
      return res.status(500).json({ message: "Failed to upload PDF", error: String(error) });
    }
  });

  // Add a test endpoint to check department name lookup
  app.get("/api/departments/lookup/:id", async (req, res) => {
    try {
      const deptId = Number(req.params.id);
      if (isNaN(deptId)) {
        return res.status(400).json({ message: "Invalid department ID format" });
      }
      
      // First check if it's a real department ID in the database
      const department = await storage.getDepartment(deptId);
      if (department) {
        return res.json({
          source: "database",
          id: department.id,
          name: department.name
        });
      }
      
      // If it's a negative ID, try to find it in our list
      if (deptId < 0) {
        const departmentName = getDepartmentNameFromNegativeId(deptId);
        if (departmentName) {
          return res.json({
            source: "predefined_list",
            id: deptId,
            name: departmentName
          });
        }
      }
      
      // No department found
      return res.status(404).json({
        message: "Department not found",
        fallbackName: `Department ID ${deptId}`
      });
    } catch (error) {
      console.error('Error looking up department:', error);
      res.status(500).json({ message: "Failed to lookup department" });
    }
  });

  return httpServer;
}

// Find department by negative ID helper function
function getDepartmentNameFromNegativeId(negativeId: number): string | null {
  for (const name of allDepartmentsList) {
    if (getDepartmentHashId(name) === negativeId) {
      return name;
    }
  }
  return null;
}
//check git update
