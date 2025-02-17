import { apiRequest } from "./queryClient";
import { Department } from "@shared/schema";

interface LoginCredentials {
  email: string;
  password: string;
}

export async function login(credentials: LoginCredentials) {
  const res = await apiRequest("POST", "/api/auth/login", credentials);
  const department = await res.json();
  localStorage.setItem("department", JSON.stringify(department));
  return department;
}

export async function register(departmentData: Record<string, string>) {
  const res = await apiRequest("POST", "/api/auth/register", departmentData);
  const department = await res.json();
  localStorage.setItem("department", JSON.stringify(department));
  return department;
}

export function logout() {
  localStorage.removeItem("department");
}

export function getCurrentDepartment(): Department | null {
  const data = localStorage.getItem("department");
  return data ? JSON.parse(data) : null;
}