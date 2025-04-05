import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck,
  LogOut 
} from "lucide-react";
import { useState, useEffect } from "react";
import { logout, getCurrentDepartment, checkDepartmentName } from "@/lib/auth";
import { Department } from "@shared/schema";

export function Navigation() {
  const [department, setDepartment] = useState<Department | null>(getCurrentDepartment());
  
  // Check and update department name if needed
  useEffect(() => {
    const updateDepartmentName = async () => {
      const updatedDepartment = await checkDepartmentName();
      if (updatedDepartment) {
        setDepartment(updatedDepartment);
      }
    };
    
    updateDepartmentName();
  }, []);
  
  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  return (
    <nav className="w-64 min-h-screen bg-background border-r">
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-6">{department?.name}</h2>
        
        <p className="mb-4 text-sm text-gray-500">
          {department?.email ? `User: ${department.email}` : ""}
        </p>
        
        <div className="space-y-2">
          <Link href="/department/dashboard">
            <Button variant="ghost" className="w-full justify-start">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          
          <Link href="/department/employees">
            <Button variant="ghost" className="w-full justify-start">
              <Users className="mr-2 h-4 w-4" />
              Employees
            </Button>
          </Link>
          
          <Link href="/department/attendance">
            <Button variant="ghost" className="w-full justify-start">
              <CalendarCheck className="mr-2 h-4 w-4" />
              Attendance
            </Button>
          </Link>
        </div>
      </div>
      
      <div className="absolute bottom-0 w-full p-4 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start text-red-500 hover:text-red-600"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </nav>
  );
}
