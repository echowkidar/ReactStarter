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

// n8n chat integration
// Add n8n chat styles
const N8nChatStyles = () => (
  <>
    <link href="https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css" rel="stylesheet" />
    <style>
      {`
        .chat-window-toggle svg {
          display: none !important;
        }
        .chat-window-toggle {
          background-image: url('/logo_favicon/amuai_logo.webp') !important;
          background-size: cover !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
          overflow: visible !important;
          z-index: 50 !important;
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

        /* Neural network container */
        .neural-net-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: -1;
        }
        .neural-net-container svg {
          overflow: visible;
          display: block;
        }

        /* Outer glow ring */
        .neural-glow-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 110%;
          height: 110%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          pointer-events: none;
          z-index: -1;
          box-shadow:
            0 0 10px 3px rgba(99, 102, 241, 0.4),
            0 0 25px 5px rgba(139, 92, 246, 0.2),
            0 0 40px 8px rgba(236, 72, 153, 0.1);
          animation: glowPulse 3s ease-in-out infinite;
        }

        @keyframes glowPulse {
          0%, 100% {
            box-shadow:
              0 0 10px 3px rgba(99, 102, 241, 0.4),
              0 0 25px 5px rgba(139, 92, 246, 0.2),
              0 0 40px 8px rgba(236, 72, 153, 0.1);
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            box-shadow:
              0 0 15px 5px rgba(139, 92, 246, 0.5),
              0 0 35px 8px rgba(236, 72, 153, 0.25),
              0 0 50px 12px rgba(59, 130, 246, 0.15);
            transform: translate(-50%, -50%) scale(1.06);
          }
        }

        /* Orbit groups rotation */
        .orbit-ring-1 {
          animation: orbitSpin1 12s linear infinite;
          transform-origin: center;
        }
        .orbit-ring-2 {
          animation: orbitSpin2 18s linear infinite;
          transform-origin: center;
        }
        .orbit-ring-3 {
          animation: orbitSpin3 25s linear infinite;
          transform-origin: center;
        }

        @keyframes orbitSpin1 {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes orbitSpin2 {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        @keyframes orbitSpin3 {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Node pulse animations */
        .neural-node {
          animation: nodePulse 2s ease-in-out infinite;
        }
        .neural-node:nth-child(2) { animation-delay: 0.3s; }
        .neural-node:nth-child(3) { animation-delay: 0.6s; }
        .neural-node:nth-child(4) { animation-delay: 0.9s; }
        .neural-node:nth-child(5) { animation-delay: 1.2s; }

        @keyframes nodePulse {
          0%, 100% { opacity: 0.5; r: 2.5; }
          50% { opacity: 1; r: 4; }
        }

        /* Connection lines pulse */
        .neural-line {
          animation: linePulse 3s ease-in-out infinite;
        }
        .neural-line:nth-child(2n) { animation-delay: 0.5s; }
        .neural-line:nth-child(3n) { animation-delay: 1s; }

        @keyframes linePulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.45; }
        }

        /* Hover: speed up + brighten */
        .chat-window-toggle:hover .orbit-ring-1 {
          animation-duration: 5s;
        }
        .chat-window-toggle:hover .orbit-ring-2 {
          animation-duration: 8s;
        }
        .chat-window-toggle:hover .orbit-ring-3 {
          animation-duration: 12s;
        }
        .chat-window-toggle:hover .neural-node {
          animation-duration: 1s;
        }
        .chat-window-toggle:hover .neural-line {
          animation-duration: 1.5s;
        }
        .chat-window-toggle:hover .neural-glow-ring {
          box-shadow:
            0 0 18px 6px rgba(99, 102, 241, 0.6),
            0 0 40px 10px rgba(139, 92, 246, 0.35),
            0 0 60px 15px rgba(236, 72, 153, 0.2);
          animation-duration: 1.5s;
        }
      `}
    </style>
  </>
);

// Neural Network SVG injection
const NeuralNetworkOverlay = () => {
  useEffect(() => {
    const injectNeuralNet = () => {
      const toggleBtn = document.querySelector('.chat-window-toggle') as HTMLElement;
      if (!toggleBtn || toggleBtn.querySelector('.neural-net-container')) return;

      // Make button position relative for absolute children
      toggleBtn.style.position = 'relative';

      const size = 140; // SVG viewBox size
      const center = size / 2;

      // Create SVG
      const svgNS = 'http://www.w3.org/2000/svg';
      const container = document.createElement('div');
      container.className = 'neural-net-container';
      container.style.width = size + 'px';
      container.style.height = size + 'px';

      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

      // Gradient definitions
      const defs = document.createElementNS(svgNS, 'defs');

      // Blue-purple gradient
      const grad1 = document.createElementNS(svgNS, 'linearGradient');
      grad1.id = 'nn-grad-1';
      ['0%', '100%'].forEach((offset, i) => {
        const stop = document.createElementNS(svgNS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', i === 0 ? '#3b82f6' : '#8b5cf6');
        stop.setAttribute('stop-opacity', '0.6');
        grad1.appendChild(stop);
      });
      defs.appendChild(grad1);

      // Purple-pink gradient
      const grad2 = document.createElementNS(svgNS, 'linearGradient');
      grad2.id = 'nn-grad-2';
      ['0%', '100%'].forEach((offset, i) => {
        const stop = document.createElementNS(svgNS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', i === 0 ? '#a855f7' : '#ec4899');
        stop.setAttribute('stop-opacity', '0.5');
        grad2.appendChild(stop);
      });
      defs.appendChild(grad2);

      // Cyan-blue gradient
      const grad3 = document.createElementNS(svgNS, 'linearGradient');
      grad3.id = 'nn-grad-3';
      ['0%', '100%'].forEach((offset, i) => {
        const stop = document.createElementNS(svgNS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', i === 0 ? '#22d3ee' : '#6366f1');
        stop.setAttribute('stop-opacity', '0.5');
        grad3.appendChild(stop);
      });
      defs.appendChild(grad3);

      // Node glow filter
      const filter = document.createElementNS(svgNS, 'filter');
      filter.id = 'nn-glow';
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');
      const blur = document.createElementNS(svgNS, 'feGaussianBlur');
      blur.setAttribute('stdDeviation', '2');
      blur.setAttribute('result', 'coloredBlur');
      filter.appendChild(blur);
      const merge = document.createElementNS(svgNS, 'feMerge');
      const mn1 = document.createElementNS(svgNS, 'feMergeNode');
      mn1.setAttribute('in', 'coloredBlur');
      const mn2 = document.createElementNS(svgNS, 'feMergeNode');
      mn2.setAttribute('in', 'SourceGraphic');
      merge.appendChild(mn1);
      merge.appendChild(mn2);
      filter.appendChild(merge);
      defs.appendChild(filter);

      svg.appendChild(defs);

      // Define node positions for 3 orbit rings
      const rings = [
        { radius: 32, count: 5, className: 'orbit-ring-1', colors: ['#3b82f6', '#6366f1', '#8b5cf6', '#3b82f6', '#22d3ee'] },
        { radius: 45, count: 7, className: 'orbit-ring-2', colors: ['#a855f7', '#ec4899', '#f472b6', '#8b5cf6', '#6366f1', '#22d3ee', '#a855f7'] },
        { radius: 58, count: 6, className: 'orbit-ring-3', colors: ['#22d3ee', '#3b82f6', '#a855f7', '#ec4899', '#6366f1', '#2dd4bf'] },
      ];

      const allNodes: { x: number; y: number }[] = [];

      rings.forEach((ring) => {
        const group = document.createElementNS(svgNS, 'g');
        group.setAttribute('class', ring.className);

        const ringNodes: { x: number; y: number }[] = [];

        for (let i = 0; i < ring.count; i++) {
          const angle = (2 * Math.PI * i) / ring.count;
          const x = center + ring.radius * Math.cos(angle);
          const y = center + ring.radius * Math.sin(angle);
          ringNodes.push({ x, y });
          allNodes.push({ x, y });

          // Node circle
          const circle = document.createElementNS(svgNS, 'circle');
          circle.setAttribute('cx', String(x));
          circle.setAttribute('cy', String(y));
          circle.setAttribute('r', '3');
          circle.setAttribute('fill', ring.colors[i]);
          circle.setAttribute('filter', 'url(#nn-glow)');
          circle.setAttribute('class', 'neural-node');
          circle.style.animationDelay = `${(i * 0.4)}s`;
          group.appendChild(circle);
        }

        // Connection lines within ring
        for (let i = 0; i < ringNodes.length; i++) {
          for (let j = i + 1; j < ringNodes.length; j++) {
            if (Math.random() > 0.5) continue; // Random connections
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', String(ringNodes[i].x));
            line.setAttribute('y1', String(ringNodes[i].y));
            line.setAttribute('x2', String(ringNodes[j].x));
            line.setAttribute('y2', String(ringNodes[j].y));
            line.setAttribute('stroke', `url(#nn-grad-${Math.floor(Math.random() * 3) + 1})`);
            line.setAttribute('stroke-width', '0.6');
            line.setAttribute('class', 'neural-line');
            line.style.animationDelay = `${Math.random() * 2}s`;
            group.appendChild(line);
          }

          // Lines from node to center
          if (Math.random() > 0.4) {
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', String(ringNodes[i].x));
            line.setAttribute('y1', String(ringNodes[i].y));
            line.setAttribute('x2', String(center));
            line.setAttribute('y2', String(center));
            line.setAttribute('stroke', `url(#nn-grad-${Math.floor(Math.random() * 3) + 1})`);
            line.setAttribute('stroke-width', '0.4');
            line.setAttribute('class', 'neural-line');
            line.style.animationDelay = `${Math.random() * 2}s`;
            group.appendChild(line);
          }
        }

        svg.appendChild(group);
      });

      // Cross-ring connections
      const crossGroup = document.createElementNS(svgNS, 'g');
      crossGroup.setAttribute('class', 'orbit-ring-1');
      for (let i = 0; i < 8; i++) {
        const a = allNodes[Math.floor(Math.random() * allNodes.length)];
        const b = allNodes[Math.floor(Math.random() * allNodes.length)];
        if (a === b) continue;
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(a.x));
        line.setAttribute('y1', String(a.y));
        line.setAttribute('x2', String(b.x));
        line.setAttribute('y2', String(b.y));
        line.setAttribute('stroke', `url(#nn-grad-${Math.floor(Math.random() * 3) + 1})`);
        line.setAttribute('stroke-width', '0.3');
        line.setAttribute('class', 'neural-line');
        line.style.animationDelay = `${Math.random() * 3}s`;
        crossGroup.appendChild(line);
      }
      svg.appendChild(crossGroup);

      container.appendChild(svg);

      // Add glow ring
      const glowRing = document.createElement('div');
      glowRing.className = 'neural-glow-ring';
      toggleBtn.appendChild(glowRing);

      toggleBtn.appendChild(container);
    };

    // Watch for the chat button to appear
    const observer = new MutationObserver(() => {
      injectNeuralNet();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also try immediately
    const timer = setTimeout(injectNeuralNet, 2000);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return null;
};

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
  { name: "Global Search", href: "/dashboard/global-search", icon: Search },
  { name: "Document Gallery", href: "/dashboard/documents", icon: FileImage },
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
    <div className={cn("flex h-full flex-col gap-4", className)}>
      <N8nChatStyles />
      <N8nChatScript />
      <NeuralNetworkOverlay />
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

      {/* Notices Section */}
      {notices.length > 0 && (
        <div className="px-3 py-2 border-t">
          <div className="flex items-center gap-2 px-4 mb-2">
            <Megaphone className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold text-gray-700">Notices</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {notices.slice(0, 5).map((notice) => (
              <Button
                key={notice.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-left h-auto py-2 px-4 hover:bg-blue-50"
                onClick={() => setSelectedNotice(notice)}
              >
                <span className="truncate">{notice.subject}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

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