import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import ProtectedRoute from "@/components/ProtectedRoute";
import ProtectedAdminRoute from "@/components/ProtectedAdminRoute";
import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/login";
import Dashboard from "@/pages/dashboard";
import Employees from "@/pages/dashboard/employees";
import Attendance from "@/pages/dashboard/attendance";
import ReportDetails from "@/pages/dashboard/report-details";
import Settings from "@/pages/dashboard/settings";
import Documents from "@/pages/dashboard/documents";
import Help from "@/pages/help";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminEmployees from "@/pages/admin/employees";
import AdminUsers from "@/pages/admin/users";
import AdminReportDetails from "@/pages/admin/report-details";
import AttendanceReports from "@/pages/admin/attendance-reports";
import AdminDocuments from "@/pages/admin/documents";
import AdminTickets from "@/pages/admin/tickets";
import AdminNotices from "@/pages/admin/notices";
import TransferRequests from "@/pages/admin/transfer-requests";
import AdminSettings from "@/pages/admin/settings";
import Tickets from "@/pages/dashboard/tickets";
import GlobalSearch from "@/pages/dashboard/global-search";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import AdminForgotPassword from "@/pages/admin/forgot-password";
import AdminResetPassword from "@/pages/admin/reset-password";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/dashboard/employees" component={Employees} />
      <ProtectedRoute path="/dashboard/attendance" component={Attendance} />
      <ProtectedRoute path="/dashboard/settings" component={Settings} />
      <ProtectedRoute path="/dashboard/documents" component={Documents} />
      <ProtectedRoute path="/dashboard/reports/:id" component={ReportDetails} />
      <ProtectedRoute path="/dashboard/help" component={Help} />
      <ProtectedRoute path="/dashboard/global-search" component={GlobalSearch} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/forgot-password" component={AdminForgotPassword} />
      <Route path="/admin/reset-password" component={AdminResetPassword} />
      <ProtectedAdminRoute path="/admin/dashboard" component={AdminDashboard} />
      <ProtectedAdminRoute path="/admin/employees" component={AdminEmployees} />
      <ProtectedAdminRoute path="/admin/users" component={AdminUsers} />
      <ProtectedAdminRoute path="/admin/reports/:id" component={AdminReportDetails} />
      <ProtectedAdminRoute path="/admin/attendance-reports" component={AttendanceReports} />
      <ProtectedAdminRoute path="/admin/documents" component={AdminDocuments} />
      <ProtectedAdminRoute path="/admin/tickets" component={AdminTickets} />
      <ProtectedAdminRoute path="/admin/notices" component={AdminNotices} />
      <ProtectedAdminRoute path="/admin/transfer-requests" component={TransferRequests} />
      <ProtectedAdminRoute path="/admin/settings" component={AdminSettings} />
      <ProtectedRoute path="/dashboard/tickets" component={Tickets} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter>
        <AppRouter />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;