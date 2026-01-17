import { Link, useLocation } from "wouter";
import { logout, getCurrentDepartment, checkDepartmentName } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  LogOut,
  Menu,
  Settings,
  FileImage,
  HelpCircle,
  Ticket,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect } from "react";

// n8n chat integration
// Add n8n chat styles
const N8nChatStyles = () => (
  <link href="https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css" rel="stylesheet" />
);

// Add n8n chat script
const N8nChatScript = () => {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "module";
    script.innerHTML = `
      import { createChat } from "https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js";
      createChat({ 
        webhookUrl: "https://agent.echowkidar.in/webhook/336cd62e-fd49-462a-bc21-83dae5195819/chat",
        initialMessages: [
          'Hi there! ',
          'I am AMU AI. How can I assist you today?'
        ],
        i18n: {
          en: {
            title: 'AMU AI',
            subtitle: "Start a chat. We're here to help you 24/7.",
            footer: '',
            getStarted: 'New Conversation',
            inputPlaceholder: 'Type your question..',
          }
        }
      });
    `;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return null;
};

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Employees", href: "/dashboard/employees", icon: Users },
  { name: "Attendance", href: "/dashboard/attendance", icon: ClipboardList },
  { name: "Document Gallery", href: "/dashboard/documents", icon: FileImage },
  { name: "Support Tickets", href: "/dashboard/tickets", icon: Ticket },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Help", href: "/dashboard/help", icon: HelpCircle },
];

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const [department, setDepartment] = useState(getCurrentDepartment());
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

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
  };

  const content = (
    <div className={cn("flex h-full flex-col gap-4", className)}>
      <N8nChatStyles />
      <N8nChatScript />
      <div className="px-3 py-2">
        <div className="mb-4 px-4 flex items-center gap-2">
          <img src="/logo_favicon/favicon-32x32.png" alt="AMU Logo" className="h-8 w-auto" />
          <h2 className="text-lg font-semibold">
            {department?.name}
          </h2>
        </div>
        <p className="mb-4 px-4 text-sm text-gray-500">
          {department?.email ? `${department.email}` : ""}
        </p>
        <div className="space-y-1">
          {navigation.map((item) => (
            <Link key={item.name} href={item.href}>
              <Button
                variant={location === item.href ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => setOpen(false)}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.name}
              </Button>
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-auto px-3 py-2">
        <Button
          variant="ghost"
          className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return content;
}