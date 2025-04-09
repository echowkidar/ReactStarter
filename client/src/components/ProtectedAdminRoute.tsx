import React from "react";
import { Route, Redirect, RouteProps } from "wouter";
import { getCurrentAdmin } from "@/lib/auth"; // Adjust path if necessary

interface ProtectedAdminRouteProps extends RouteProps {
  component: React.ComponentType<any>;
}

const ProtectedAdminRoute: React.FC<ProtectedAdminRouteProps> = ({
  component: Component,
  ...rest
}) => {
  const isAdminAuthenticated = !!getCurrentAdmin();

  return (
    <Route
      {...rest}
      component={(props: any) =>
        isAdminAuthenticated ? (
          <Component {...props} />
        ) : (
          <Redirect to="/admin/login" />
        )
      }
    />
  );
};

export default ProtectedAdminRoute; 