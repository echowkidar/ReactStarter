import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentDepartment, checkDepartmentName } from "@/lib/auth";
import { Employee, AttendanceReport } from "@shared/schema";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Loading from "@/components/layout/loading";
import { Users, ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const [department, setDepartment] = useState(getCurrentDepartment());
  const [, setLocation] = useLocation();
  
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

  if (loadingEmployees || loadingReports) return <Loading />;

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Employees
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{employees?.length || 0}</div>
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
          </div>
        </main>
      </div>
    </div>
  );
}