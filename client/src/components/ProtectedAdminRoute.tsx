import React, { useEffect, useState } from "react";
import { Route, Redirect } from "wouter";
import { getCurrentAdmin } from "@/lib/auth"; // Adjust path if necessary

interface ProtectedAdminRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

const ProtectedAdminRoute: React.FC<ProtectedAdminRouteProps> = ({
  component: Component,
  path,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check authentication status and verify session
    const verifySession = async () => {
      const admin = getCurrentAdmin();
      if (!admin) {
        setIsAuthenticated(false);
        return;
      }

      // Verify session with server (checks if password changed)
      const sessionToken = localStorage.getItem("adminSessionToken");
      if (sessionToken) {
        try {
          const response = await fetch("/api/auth/admin/verify-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: admin.email, sessionToken }),
          });

          if (!response.ok) {
            // Session invalid - password changed, force logout
            localStorage.removeItem("admin");
            localStorage.removeItem("adminType");
            localStorage.removeItem("adminSessionToken");
            localStorage.removeItem("adminUsername");
            setIsAuthenticated(false);
            return;
          }

          // Session valid - refresh admin details if returned (Fix for data loss on refresh)
          const data = await response.json();
          if (data.admin) {
            localStorage.setItem("adminType", data.admin.role);
            localStorage.setItem("admin", JSON.stringify({
              email: data.admin.email,
              name: data.admin.name,
              role: data.admin.role === "salary" ? "salary" : "superadmin",
              userCode: data.admin.userCode
            }));
          }

          setIsAuthenticated(true);
        } catch (error) {
          console.error("Session verification failed:", error);
          // On network error, allow access if admin data exists (offline tolerance)
          setIsAuthenticated(true);
        }
      } else {
        // No session token found — not authenticated
        localStorage.removeItem("admin");
        localStorage.removeItem("adminType");
        localStorage.removeItem("adminUsername");
        setIsAuthenticated(false);
      }
    };

    verifySession();
  }, []);

  // Show nothing during the authentication check
  if (isAuthenticated === null) {
    return null;
  }

  return (
    <Route
      path={path}
      component={(props: any) =>
        isAuthenticated ? <Component {...props} /> : <Redirect to="/admin/login" />
      }
    />
  );
};

export default ProtectedAdminRoute; 