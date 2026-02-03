import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentDepartment, checkDepartmentName } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Employee, AttendanceReport, Ticket } from "@shared/schema";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Loading from "@/components/layout/loading";
import { Users, ClipboardCheck, Ticket as TicketIcon, AlertCircle, Clock, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";

export default function Dashboard() {
  const [department, setDepartment] = useState(getCurrentDepartment());
  const [, setLocation] = useLocation();

  // Track visitor with department ID
  useVisitorTracking({ pageVisited: '/dashboard', departmentId: department?.id });

  // Check and update department name if needed
  useEffect(() => {
    const updateDepartmentName = async () => {
      const updatedDepartment = await checkDepartmentName();
      if (updatedDepartment) {
        setDepartment(updatedDepartment);

        // Check if HOD name is default or email contains @example.com
        if (
          updatedDepartment.hodName === "Default HOD Name" ||
          updatedDepartment.email?.includes("@example.com")
        ) {
          setLocation("/dashboard/settings");
        }
      }
    };

    updateDepartmentName();
  }, [setLocation]);

  const { data: employees, isLoading: loadingEmployees } = useQuery<Employee[]>({
    queryKey: [`/api/departments/${department?.id}/employees`],
  });

  const { data: reports, isLoading: loadingReports } = useQuery<AttendanceReport[]>({
    queryKey: [`/api/departments/${department?.id}/attendance`],
  });

  // Fetch department tickets
  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: [`/api/departments/${department?.id}/tickets`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/departments/${department?.id}/tickets`);
      return response.json();
    },
    enabled: !!department?.id,
  });

  // Calculate ticket stats
  const ticketStats = {
    open: tickets.filter(t => t.status === 'Open').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
    closed: tickets.filter(t => t.status === 'Closed').length,
    total: tickets.length,
  };

  if (loadingEmployees || loadingReports) return <Loading />;

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Active Employees
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{employees?.filter(emp => emp.isActive === "active")?.length || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Attendance Reports
                </CardTitle>
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reports?.length || 0}</div>
              </CardContent>
            </Card>

            {/* Support Tickets Status Card */}
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation("/dashboard/tickets")}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Support Tickets
                </CardTitle>
                <TicketIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-3">{ticketStats.total}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-blue-500" />
                    <span className="text-muted-foreground">Open:</span>
                    <span className="font-medium">{ticketStats.open}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-yellow-500" />
                    <span className="text-muted-foreground">In Progress:</span>
                    <span className="font-medium">{ticketStats.inProgress}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-muted-foreground">Resolved:</span>
                    <span className="font-medium">{ticketStats.resolved}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-gray-400" />
                    <span className="text-muted-foreground">Closed:</span>
                    <span className="font-medium">{ticketStats.closed}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}