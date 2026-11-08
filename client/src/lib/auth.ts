import { apiRequest } from "./queryClient";
export { handleSessionExpired } from "./session-expired";
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

/** End the server login (cookie session) for admin or department. Fire-and-forget. */
export function serverLogout(who: "admin" | "department") {
  const body = JSON.stringify({ who });
  try {
    if (navigator.sendBeacon(
      "/api/auth/logout",
      new Blob([body], { type: "application/json" }),
    )) return;
  } catch {
    // fall through to fetch
  }
  fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "include",
    keepalive: true,
  }).catch(() => { });
}

export function logout(redirectToLogin = true) {
  // Send logout signal to remove from active users
  const sessionId = sessionStorage.getItem('heartbeat_session_id');
  if (sessionId) {
    // Use Blob for sendBeacon to set correct Content-Type
    const data = JSON.stringify({ sessionId });
    const blob = new Blob([data], { type: 'application/json' });

    try {
      navigator.sendBeacon('/api/heartbeat/logout', blob);
    } catch {
      // Fallback to fetch if sendBeacon fails
      fetch('/api/heartbeat/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true
      }).catch(() => { });
    }
    sessionStorage.removeItem('heartbeat_session_id');
  }

  // End the department login on the server too
  serverLogout("department");

  // Clear all auth-related data
  localStorage.removeItem("department");
  localStorage.removeItem("staff");

  // Force page reload to reset application state
  if (redirectToLogin) {
    window.location.href = "/";
  }
}

export interface StaffInfo {
  id: number;
  name: string;
  role: "hod" | "section_officer" | "dealing_assistant" | "diary_clerk";
  email?: string;
  designation?: string | null;
}

export const STAFF_ROLE_LABELS: Record<string, string> = {
  hod: "HOD",
  section_officer: "Section Officer",
  dealing_assistant: "Dealing Assistant",
  diary_clerk: "Diary Clerk",
};

/** Staff person logged in inside the department (null = the department login itself) */
export function getCurrentStaff(): StaffInfo | null {
  try {
    const data = localStorage.getItem("staff");
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/** Department login, HOD and Section Officer may manage staff and approve */
export function isDeptSupervisor(): boolean {
  const staff = getCurrentStaff();
  return !staff || staff.role === "hod" || staff.role === "section_officer";
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

// Function to update department profile
export async function updateDepartmentProfile(id: string, data: {
  name?: string;
  email?: string;
  hodName?: string;
  hodTitle?: string;
  password?: string;
  currentPassword?: string;
}) {
  try {
    const res = await apiRequest("PUT", `/api/departments/${id}/profile`, data);
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Profile update failed');
    }

    const updatedDepartment = await res.json();

    // Update local storage with the new department data
    const currentDepartment = getCurrentDepartment();
    if (currentDepartment) {
      const newDepartmentData = {
        ...currentDepartment,
        name: updatedDepartment.name || currentDepartment.name,
        email: updatedDepartment.email || currentDepartment.email,
        hodName: updatedDepartment.hodName || currentDepartment.hodName,
        hodTitle: updatedDepartment.hodTitle || currentDepartment.hodTitle
      };
      localStorage.setItem("department", JSON.stringify(newDepartmentData));
    }

    return updatedDepartment;
  } catch (error) {
    console.error('Profile update error:', error);
    throw error;
  }
}