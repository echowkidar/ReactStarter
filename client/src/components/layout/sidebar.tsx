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
  Megaphone,
  Search,
  DownloadCloud,
  Mail,
  Inbox,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { NeuralNetworkStyles, NeuralNetworkOverlay } from "@/components/NeuralNetworkOverlay";

// n8n chat integration
// Add n8n chat styles
const N8nChatStyles = () => (
  <>
    <link href="https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css" rel="stylesheet" />
    <style>
      {`
        /* Hide the default floating toggle button */
        .chat-window-toggle {
          display: none !important;
        }
        /* Keep chat window itself visible and positioned nicely */
        .chat-window {
          bottom: 60px !important;
          left: 150px !important;
          right: auto !important;
        }
        .chat-header h1 {
          display: flex !important;
          align-items: center !important;
          width: 100% !important;
        }
        .chat-header h1::after {
          content: '';
          display: inline-block;
          width: 50px;
          height: 50px;
          margin-left: auto !important;
          background-image: url('/logo_favicon/android-chrome-192x192.png');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
        }
      `}
    </style>
    <NeuralNetworkStyles />
  </>
);

// Add n8n chat script
const N8nChatScript = () => {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "module";
    script.innerHTML = `
      import { createChat } from "https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js";
      createChat({ 
        webhookUrl: window.location.origin + '/api/chat-webhook',
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
  { name: "Email", href: "/dashboard/mailbox", icon: Mail },
  { name: "Global Search", href: "/dashboard/global-search", icon: Search },
  { name: "Document Gallery", href: "/dashboard/documents", icon: FileImage },
  { name: "Useful Downloads", href: "/dashboard/downloads", icon: DownloadCloud },
  { name: "Support Tickets", href: "/dashboard/tickets", icon: Ticket },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Help", href: "/dashboard/help", icon: HelpCircle },
];

interface Notice {
  id: number;
  subject: string;
  message: string;
  image_url: string | null;
  created_by: string;
  created_at: string;
}

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const [department, setDepartment] = useState(getCurrentDepartment());
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

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

  // Fetch notices for this department
  const { data: notices = [] } = useQuery<Notice[]>({
    queryKey: [`/api/departments/${department?.id}/notices`],
    enabled: !!department?.id,
  });

  // Fetch unread email count
  const { data: unreadEmailData } = useQuery<{ success: boolean, count: number }>({
    queryKey: [`/api/email/unread-count`, department?.id, 'department'],
    queryFn: async () => {
      const res = await fetch(`/api/email/unread-count?userId=${department?.id}&userType=department`);
      if (!res.ok) throw new Error("Network error");
      return res.json();
    },
    enabled: !!department?.id,
    refetchInterval: 60000, // Refresh every 1 minute
  });
  const unreadEmailCount = unreadEmailData?.count || 0;

  // Send heartbeat for active user tracking
  useHeartbeat({
    type: 'department',
    name: department?.name || 'Unknown Department',
    email: department?.email
  });

  const handleLogout = () => {
    logout();
  };

  const content = (
    <div className={cn("flex h-full flex-col gap-1", className)}>
      <N8nChatStyles />
      <N8nChatScript />
      <NeuralNetworkOverlay />
      <div className="px-3 py-1">
        <div className="mb-2 px-4 flex items-center gap-2">
          <img src="/logo_favicon/favicon-32x32.png" alt="AMU Logo" className="h-8 w-auto" />
          <h2 className="text-base font-semibold leading-tight">
            {department?.name}
          </h2>
        </div>
        <p className="mb-2 px-4 text-xs text-gray-500">
          {department?.email ? `${department.email}` : ""}
        </p>
        <div className="space-y-0.5">
          {navigation.map((item) => (
            <Link key={item.name} href={item.href}>
              <Button
                variant={location === item.href ? "secondary" : "ghost"}
                className="w-full justify-start h-8 text-sm relative"
                onClick={() => setOpen(false)}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.name}
                {item.name === "Email" && unreadEmailCount > 0 && (
                  <span className="absolute right-2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {unreadEmailCount > 99 ? '99+' : unreadEmailCount}
                  </span>
                )}
              </Button>
            </Link>
          ))}

          {/* AMU AI Chat Button — Help ke neeche */}
          <div className="pt-1 pb-0.5">
            <button
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors group"
              onClick={() => {
                const toggleBtn = document.querySelector('.chat-window-toggle') as HTMLElement | null;
                if (toggleBtn) toggleBtn.click();
                // Auto-focus chat input after window opens
                setTimeout(() => {
                  const chatInput = document.querySelector('.chat-input textarea, .chat-input input, [class*="chat"] textarea, [class*="chat"] input[type="text"]') as HTMLElement | null;
                  if (chatInput) chatInput.focus();
                }, 400);
              }}
              title="Chat with AMU AI"
            >
              <div className="relative flex-shrink-0">
                <img
                  src="/logo_favicon/amuai_logo.webp"
                  alt="AMU AI"
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-blue-200 group-hover:ring-blue-400 transition-all"
                />
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{backgroundColor: '#f59e0b'}}></span>
                  <span className="relative inline-flex rounded-full h-3 w-3" style={{backgroundColor: '#d97706'}}></span>
                </span>
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-bold text-gray-800 group-hover:text-blue-700 transition-colors">AMU AI</span>
                <span className="text-[11px] font-medium" style={{color: '#b45309'}}>✦ Active · Ask me anything</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Notices Section */}
      {notices.length > 0 && (
        <div className="px-3 py-1 border-t">
          <div className="flex items-center gap-2 px-4 mb-1">
            <Megaphone className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-gray-700">Notices</span>
          </div>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {notices.slice(0, 5).map((notice) => (
              <Button
                key={notice.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-left h-auto py-1 px-4 hover:bg-blue-50"
                onClick={() => setSelectedNotice(notice)}
              >
                <span className="truncate">{notice.subject}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto px-3 py-1">
        <Button
          variant="ghost"
          className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50 h-8 text-sm"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>

      {/* Notice Detail Dialog */}
      <Dialog open={!!selectedNotice} onOpenChange={() => setSelectedNotice(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
              <Megaphone className="h-7 w-7 text-blue-600" />
              {selectedNotice?.subject}
            </DialogTitle>
            <DialogDescription className="text-base pt-1">
              {selectedNotice?.created_at && format(new Date(selectedNotice.created_at), "dd MMM yyyy, HH:mm")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="whitespace-pre-wrap text-lg leading-relaxed">{selectedNotice?.message}</div>
            {selectedNotice?.image_url && (
              <div className="border rounded-lg overflow-hidden">
                <img
                  src={selectedNotice.image_url}
                  alt="Notice attachment"
                  className="w-full max-h-[500px] object-contain"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
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