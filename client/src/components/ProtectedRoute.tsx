import React, { useEffect, useState } from "react";
import { Route, Redirect } from "wouter";
import { getCurrentDepartment } from "@/lib/auth"; // Adjust path if necessary
import { useAutoLogout } from "@/hooks/useAutoLogout";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  component: Component,
  path,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check authentication status: stored login AND a live server session for it
    const department = getCurrentDepartment();
    if (!department) {
      setIsAuthenticated(false);
      return;
    }
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (Number(data?.departmentId) === Number(department.id)) {
          if (data.staff) localStorage.setItem("staff", JSON.stringify(data.staff));
          else localStorage.removeItem("staff");
          setIsAuthenticated(true);
        } else {
          // Server login missing or for another department → log in again
          localStorage.removeItem("department");
          localStorage.removeItem("staff");
          setIsAuthenticated(false);
        }
      })
      // Network error: let the page open; API calls will still be checked by the server
      .catch(() => setIsAuthenticated(true));
  }, []);

  // Show nothing during the authentication check
  if (isAuthenticated === null) {
    return null;
  }

  return (
    <Route
      path={path}
      component={(props: any) =>
        isAuthenticated ? (
          <>
            <AutoLogoutWrapper />
            <Component {...props} />
          </>
        ) : (
          <Redirect to="/" />
        )
      }
    />
  );
};

// Wrapper completely isolates the hook
const AutoLogoutWrapper = () => {
  useAutoLogout();
  return null;
};

export default ProtectedRoute; 