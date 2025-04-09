import { apiRequest } from "./queryClient";
import { Department } from "@shared/schema";

interface LoginCredentials {
  email: string;
  password: string;
}

export async function login(credentials: LoginCredentials) {
  const res = await apiRequest("POST", "/api/auth/login", credentials);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "Login failed");
  }
  localStorage.setItem("department", JSON.stringify(data.department));
  return data.department;
}

export async function register(departmentData: Record<string, string>) {
  try {
    const res = await apiRequest("POST", "/api/auth/register", departmentData);
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Registration failed');
    }
    const department = await res.json();
    localStorage.setItem("department", JSON.stringify(department));
    return department;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

export function logout() {
  localStorage.removeItem("department");
}

export function getCurrentDepartment(): Department | null {
  const data = localStorage.getItem("department");
  return data ? JSON.parse(data) : null;
}

interface AdminInfo {
  email: string;
  role: "superadmin" | "salary";
}

export function getCurrentAdmin(): AdminInfo | null {
  const data = localStorage.getItem("admin");
  try {
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("Failed to parse admin data from localStorage", e);
    localStorage.removeItem("admin"); // Clear corrupted data
    localStorage.removeItem("adminType"); // Also clear related type
    return null;
  }
}

// Function to check for department name updates
export async function checkDepartmentName() {
  const department = getCurrentDepartment();
  if (!department) return null;
  
  // Only attempt to update if the name follows the "Department ID -XXXX" pattern
  if (department.name.startsWith("Department ID -")) {
    try {
      const res = await apiRequest("GET", `/api/departments/${department.id}/check-name`);
      if (!res.ok) return department;
      
      const data = await res.json();
      
      // If name was updated, update local storage
      if (data.updated) {
        const updatedDepartment = { ...department, name: data.name };
        localStorage.setItem("department", JSON.stringify(updatedDepartment));
        return updatedDepartment;
      }
      
      return department;
    } catch (error) {
      console.error("Error checking department name:", error);
      return department;
    }
  }
  
  return department;
}