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
    // Check authentication status
    const admin = getCurrentAdmin();
    if (admin) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
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