import { apiRequest } from "./queryClient";
import { DepartmentName } from "../../../shared/schema";

export const employmentStatuses = [
  "Permanent",
  "Probation",
  "Temporary"
] as const;

// Define the type for the response from /api/departments
export type DepartmentRegistrationInfo = DepartmentName;

export const departmentTitles = [
  "Chairperson",
  "Director",
  "Principal",
  "Dean",
  "Coordinator",
  "Provost",
  "Member-in-Charge"
] as const;

// Updated function to fetch departments
export async function fetchDepartmentsForRegistration(showAll = false): Promise<DepartmentRegistrationInfo[]> {
  try {
    const url = `/api/departments?showAll=${showAll}`;
    console.log(`[fetchDepartmentsForRegistration] Fetching from URL: ${url}`);
    
    const response = await apiRequest("GET", url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[fetchDepartmentsForRegistration] API request failed:`, {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const departments: DepartmentRegistrationInfo[] = await response.json();
    console.log(`[fetchDepartmentsForRegistration] Success! Received ${departments.length} departments:`, departments);
    return departments;

  } catch (error) {
    console.error("[fetchDepartmentsForRegistration] Error:", error);
    throw error;
  }
}

// Keep the old function if it's used elsewhere to specifically get all names
export async function fetchAllDepartmentBaseNames(): Promise<DepartmentName[]> {
  try {
    const url = `/api/department-names`;
    console.log(`Fetching all base department names with URL: ${url}`);
    const response = await apiRequest("GET", url);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    const departments: DepartmentName[] = await response.json();
    console.log(`Received ${departments.length} base department names from API`);
    return departments;
  } catch (error) {
    console.error("Error fetching all base department names:", error);
    return [];
  }
}