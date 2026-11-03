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
    // Sticky: stays at the top while the page scrolls. On phones the "Menu" button
    // (rendered by the Sidebar) sits in its left corner, so the text gets left padding.
    <header className={`sticky top-0 z-30 flex min-h-[64px] items-center justify-end border-b bg-background/95 p-4 pl-32 backdrop-blur md:pl-4 ${className || ""}`}>
      <div className="flex min-w-0 items-center gap-2 text-right">
        <User className="h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{department?.name}</p>
          <p className="truncate text-muted-foreground">{department?.hodName || department?.email}</p>
        </div>
      </div>
    </header>
  );
} 