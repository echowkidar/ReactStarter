/** Server says the login is gone: clear the stored login and go to the right login page */
export function handleSessionExpired() {
  const path = window.location.pathname;
  const onAdminPage = path.startsWith("/admin") && !/^\/admin\/(login|forgot-password|reset-password)/.test(path);
  const onDeptPage = path.startsWith("/dashboard");
  if (onAdminPage) {
    ["admin", "adminType", "adminEmail", "adminUsername", "adminSessionToken"].forEach((k) => localStorage.removeItem(k));
    window.location.href = "/admin/login";
  } else if (onDeptPage) {
    localStorage.removeItem("department");
    localStorage.removeItem("staff");
    window.location.href = "/";
  }
}

/** Call with a failed response: true when it means "log in again" (and redirects) */
export function checkSessionExpired(status: number, body: any): boolean {
  if (status === 401 && body && body.code === "AUTH_REQUIRED") {
    handleSessionExpired();
    return true;
  }
  return false;
}
