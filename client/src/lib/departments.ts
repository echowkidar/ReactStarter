import { apiRequest } from "./queryClient";
import { allDepartmentsList, departmentTitles } from "../../../shared/departments";

// Re-export these from the shared file
export { allDepartmentsList, departmentTitles };

// Development mode - show only a few departments
const isDevelopment = process.env.NODE_ENV !== 'production';

// Using only 6 departments for development, all departments for production
export const departmentList = isDevelopment ? 
  ["Department of Computer Science",
  "Department of Mathematics",
  "Department of Physics",
  "Department of Chemistry",
  "Department of Botany",
  "Department of Zoology"] as const : 
  allDepartmentsList;

export const employmentStatuses = [
  "Permanent",
  "Probation",
  "Temporary"
] as const;

export const bankNames = [
  "State Bank",
  "Indian Bank",
  "Bank of Baroda",
  "Central Bank of India",
  "Canara Bank",
  "Punjab National Bank",
  "Union Bank of India"
] as const;

// Helper function to get all departments list regardless of environment
export const getAllDepartments = () => [...allDepartmentsList] as string[];

// Helper function to fetch departments from API
// This will automatically filter out already registered departments
export async function fetchAvailableDepartments(showAll = false): Promise<string[]> {
  try {
    // When showAll is true, we want to show all departments including registered ones
    // When showAll is false, we want to only show departments that are not yet registered
    const url = showAll 
      ? `/api/departments?showAll=${showAll}&showRegistered=true` 
      : `/api/departments?showAll=${showAll}&showRegistered=false`;
      
    console.log(`Fetching departments with URL: ${url}`);
    const response = await apiRequest("GET", url);
    const departments = await response.json();
    
    console.log(`Received ${departments.length} departments from API`);
    
    // Both API response formats include a 'name' property we can extract
    // For both formats (showAll=true and showAll=false)
    return departments.map((dept: { name: string }) => dept.name);
  } catch (error) {
    console.error("Error fetching departments:", error);
    // Fallback to local list if API fails
    return showAll ? [...allDepartmentsList] as string[] : departmentList as unknown as string[];
  }
} 