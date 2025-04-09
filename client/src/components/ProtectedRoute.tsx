import React from "react";
import { Route, Redirect, RouteProps } from "wouter";
import { getCurrentDepartment } from "@/lib/auth"; // Adjust path if necessary

interface ProtectedRouteProps extends RouteProps {
  component: React.ComponentType<any>;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  component: Component,
  ...rest
}) => {
  const isAuthenticated = !!getCurrentDepartment();

  return (
    <Route
      {...rest}
      component={(props: any) =>
        isAuthenticated ? <Component {...props} /> : <Redirect to="/" />
      }
    />
  );
};

export default ProtectedRoute; 