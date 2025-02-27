import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck,
  LogOut 
} from "lucide-react";

export function Navigation() {
  const department = JSON.parse(localStorage.getItem("department") || "{}");
  
  const handleLogout = () => {
    localStorage.removeItem("department");
    window.location.href = "/";
  };

  return (
    <nav className="w-64 min-h-screen bg-background border-r">
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-6">{department.name}</h2>
        
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
