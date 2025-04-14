import React, { useEffect, useState } from "react";
import { Route, Redirect } from "wouter";
import { getCurrentDepartment } from "@/lib/auth"; // Adjust path if necessary

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
    // Check authentication status
    const department = getCurrentDepartment();
    if (department) {
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
        isAuthenticated ? <Component {...props} /> : <Redirect to="/" />
      }
    />
  );
};

export default ProtectedRoute; 