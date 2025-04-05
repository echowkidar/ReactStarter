import { getCurrentDepartment, checkDepartmentName } from "@/lib/auth";
import { User } from "lucide-react";
import { useState, useEffect } from "react";

interface HeaderProps {
  className?: string;
}

export default function Header({ className }: HeaderProps) {
  const [department, setDepartment] = useState(getCurrentDepartment());
  
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

  return (
    <header className={`flex items-center justify-end border-b bg-background p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <User className="h-5 w-5 text-muted-foreground" />
        <div className="text-sm">
          <p className="font-medium">{department?.name}</p>
          <p className="text-muted-foreground">{department?.email}</p>
        </div>
      </div>
    </header>
  );
} 