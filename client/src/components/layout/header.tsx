import { getCurrentDepartment } from "@/lib/auth";
import { User } from "lucide-react";

interface HeaderProps {
  className?: string;
}

export default function Header({ className }: HeaderProps) {
  const department = getCurrentDepartment();

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