import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import Dashboard from "@/pages/dashboard";
import Employees from "@/pages/dashboard/employees";
import Attendance from "@/pages/dashboard/attendance";
import ReportDetails from "@/pages/dashboard/report-details";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminEmployees from "@/pages/admin/employees";
import AdminUsers from "@/pages/admin/users";
import AdminReportDetails from "@/pages/admin/report-details";
import AttendanceReports from "@/pages/admin/attendance-reports";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/employees" component={Employees} />
      <Route path="/dashboard/attendance" component={Attendance} />
      <Route path="/dashboard/reports/:id" component={ReportDetails} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/employees" component={AdminEmployees} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/reports/:id" component={AdminReportDetails} />
      <Route path="/admin/attendance-reports" component={AttendanceReports} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;