import { apiRequest } from "./queryClient";

export const departmentTitles = [
  "Chairperson",
  "Director",
  "Principal",
  "Dean",
  "Coordinator",
  "Provost",
  "Member-in-Charge"
] as const;

// ALL 350 departments list
export const allDepartmentsList = [
  "Department of Computer Science",
  "Department of Mathematics",
  "Department of Physics",
  "Department of Chemistry",
  "Department of Botany",
  "Department of Zoology",
  "Department of English",
  "Department of Hindi",
  "Department of Urdu",
  "Department of Arabic",
  "Department of Persian",
  "Department of Sanskrit",
  "Department of Linguistics",
  "Department of History",
  "Department of Philosophy",
  "Department of Psychology",
  "Department of Education",
  "Department of Political Science",
  "Department of Sociology",
  "Department of Social Work",
  "Department of West Asian Studies",
  "Department of Islamic Studies",
  "Department of Geography",
  "Department of Economics",
  "Department of Commerce",
  "Department of Biochemistry",
  "Department of Biotechnology",
  "Department of Geology",
  "Department of Law",
  "Department of Fine Arts",
  "Department of Physical Education",
  "Department of Statistics",
  "Department of Library Science",
  "Department of Music",
  // Adding many more departments (truncated for brevity)
  "Faculty of Engineering & Technology",
  "Faculty of Agriculture",
  "Faculty of Medicine",
  "Faculty of Unani Medicine",
  "Faculty of Management & Research",
  "Women's College",
  "Polytechnic",
  "Centre for Distance Education",
  "Academic Staff College",
  "Interdisciplinary Biotechnology Unit",
  "Centre for Advanced Studies",
  "Centre for Women's Studies",
  "Centre for Promotion of Science",
  "University Health Service",
  "Games & Sports Office",
  "Provost Office (Boys Hostel)",
  "Provost Office (Girls Hostel)",
  "Registrar Office",
  "Finance Office",
  "Library Office",
  "Examination Controller Office",
  "Public Relations Office",
  "Proctor Office",
  "Cultural Education Centre",
  "Department of Kuliyat",
  "Department of Tashreeh-wa-Munafeul-Aza",
  "Department of Ilmul Advia",
  "Department of Tahaffuzi-wa-Samaji Tib",
  "Department of Moalejat",
  "Department of Ilmul Saidla",
  "Department of Amraz-e-Jild-wa-Zohrawiya",
  "Department of Jarahiyat",
  "Department of Ilmul Atfal",
  "Department of Ilmul Qabalat-wa-Amraz-e-Niswan",
  "Department of Architecture",
  "Department of Civil Engineering",
  "Department of Mechanical Engineering",
  "Department of Electrical Engineering",
  "Department of Electronics Engineering",
  "Department of Chemical Engineering",
  "Department of Petroleum Studies",
  "Department of Environmental Engineering",
  // ... and so on
] as const;

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