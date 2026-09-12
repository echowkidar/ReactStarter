import { apiRequest } from "./queryClient";
import { DepartmentName } from "../../../shared/schema";

export const employmentStatuses = [
  "Permanent",
  "Probation",
  "Temporary",
  "Court Case",
  "Compensation",
  "Till Further Order"
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
    const response = await apiRequest("GET", url);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    const departments: DepartmentName[] = await response.json();
    return departments;
  } catch (error) {
    console.error("Error fetching all base department names:", error);
    return [];
  }
}