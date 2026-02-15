import { User, ShieldCheck, Briefcase } from "lucide-react";

interface AdminHeaderProps {
  className?: string;
}

export default function AdminHeader({ className }: AdminHeaderProps) {
  const adminInfo = JSON.parse(localStorage.getItem("admin") || "{}");

  // Display name based on email
  const getDisplayName = (email: string) => {
    if (!email) return "";

    if (email === "admin@amu.ac.in") {
      return "Super Administrator";
    } else if (email === "salary@amu.ac.in") {
      return "Salary Officer";
    } else {
      // If it's another email, show the first part of the email capitalized
      return email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);
    }
  };

  // Determine icon, colors and style based on email
  const getAdminStyles = (email: string) => {
    if (email === "admin@amu.ac.in") {
      return {
        icon: ShieldCheck,
        textColor: "text-rose-600",
        bgColor: "bg-rose-50",
        roleText: "Super Admin"
      };
    } else if (email === "salary@amu.ac.in") {
      return {
        icon: Briefcase,
        textColor: "text-emerald-600",
        bgColor: "bg-emerald-50",
        roleText: "Salary Admin"
      };
    } else {
      return {
        icon: User,
        textColor: "text-blue-600",
        bgColor: "bg-blue-50",
        roleText: (adminInfo.role === "superadmin" || adminInfo.role === "super" || adminInfo.role === "super_admin") ? "Super Admin" : "Salary Admin"
      };
    }
  };

  const styles = getAdminStyles(adminInfo.email);
  const AdminIcon = styles.icon;

  return (
    <header className={`flex items-center justify-between p-4 border-b ${className}`}>
      <div className="flex items-center space-x-4">
        <img src="/logo_favicon/favicon-32x32.png" alt="AMU Logo" className="h-8 w-auto mr-2" />
        <div className={`p-2 rounded-full ${styles.bgColor}`}>
          <AdminIcon className={`h-5 w-5 ${styles.textColor}`} />
        </div>
        <div>
          <h2 className="font-medium">{getDisplayName(adminInfo.email)}</h2>
          <p className={`text-xs ${styles.textColor}`}>{styles.roleText}</p>
        </div>
      </div>
    </header>
  );
}