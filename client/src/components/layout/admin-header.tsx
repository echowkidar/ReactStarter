// Admin top bar — shared by every admin page
// ─────────────────────────────────────────────────────────────────────────────
// Left: who is logged in. Right: the admin menu (same on every page, the open
// page highlighted). Phones/tablets get a ☰ menu. Sub-pages also show a small
// breadcrumb ("Dashboard › Page") so the way back is always one click.
// Which menu items an admin sees comes from lib/admin-access.ts — the same
// rules ProtectedAdminRoute uses, so nobody sees a button they cannot open.
// "Dashboard" is styled as the home button (outlined, separated from the rest)
// so the way back to the main page is easy to spot from any other page.
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  User, ShieldCheck, Briefcase, LayoutDashboard, FileCheck, Users, Mail, FileImage, ScrollText,
  Send, Ticket, Megaphone, UserCog, Phone, Settings, LogOut, Menu, ChevronRight,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { getAdminAccess } from "@/lib/admin-access";

interface AdminHeaderProps {
  className?: string;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** other routes that belong to this menu item (highlighting + breadcrumb) */
  match?: string[];
  badge?: "email" | "tickets";
  /** show the text label already on medium-large screens */
  primary?: boolean;
};

// Titles for the breadcrumb of pages that are not menu items themselves
const EXTRA_TITLES: Array<{ prefix: string; title: string; parent?: string }> = [
  { prefix: "/admin/reports/", title: "Report Details", parent: "/admin/attendance-reports" },
  { prefix: "/admin/missing-employees", title: "Missing Employees", parent: "/admin/attendance-reports" },
  { prefix: "/admin/transfer-requests", title: "Transfer Requests" },
  { prefix: "/admin/email", title: "Email Settings", parent: "/admin/mailbox" },
];

function readAdmin() {
  try { return JSON.parse(localStorage.getItem("admin") || "{}"); } catch { return {}; }
}

export function logoutAdmin(navigate: (to: string) => void) {
  // Remove from "active users"
  const sessionId = sessionStorage.getItem("heartbeat_session_id");
  if (sessionId) {
    const data = JSON.stringify({ sessionId });
    try {
      navigator.sendBeacon("/api/heartbeat/logout", new Blob([data], { type: "application/json" }));
    } catch {
      fetch("/api/heartbeat/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: data, keepalive: true }).catch(() => { });
    }
    sessionStorage.removeItem("heartbeat_session_id");
  }
  localStorage.removeItem("admin");
  localStorage.removeItem("adminType");
  localStorage.removeItem("adminEmail");
  localStorage.removeItem("adminUsername");
  localStorage.removeItem("adminSessionToken");
  navigate("/admin/login");
}

export default function AdminHeader({ className }: AdminHeaderProps) {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const adminInfo = readAdmin();
  const access = getAdminAccess();
  const { email, isViewOnly, isQasim } = access;

  useEffect(() => { setMenuOpen(false); }, [location]);

  // Same queries (and cache keys) the dashboard uses → no extra load
  const { data: unreadEmailData } = useQuery<{ success: boolean; count: number }>({
    queryKey: ["/api/email/unread-count", email, "admin"],
    queryFn: async () => {
      const res = await fetch(`/api/email/unread-count?userId=${encodeURIComponent(email)}&userType=admin`);
      if (!res.ok) throw new Error("Network error");
      return res.json();
    },
    enabled: !!email && !isQasim,
    refetchInterval: 60000,
  });
  const { data: ticketStats } = useQuery<{ open: number }>({
    queryKey: ["/api/tickets/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/tickets/stats")).json(),
    enabled: !!email && !isViewOnly && !isQasim,
    refetchInterval: 120000,
  });
  const badgeCount = (b?: NavItem["badge"]) =>
    b === "email" ? unreadEmailData?.count || 0 : b === "tickets" ? ticketStats?.open || 0 : 0;

  const dashboardItem: NavItem = { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true };
  const onDashboard = location === "/admin/dashboard";
  const items: NavItem[] = [
    dashboardItem,
    ...(access.detailedView ? [{ href: "/admin/attendance-reports", label: "Detailed View", icon: FileCheck, primary: true,
      match: ["/admin/reports/", "/admin/missing-employees"] }] : []),
    ...(access.users ? [{ href: "/admin/users", label: "Users", icon: UserCog }] : []),
    ...(access.employees ? [{ href: "/admin/employees", label: "Employees", icon: Users, primary: true }] : []),
    { href: "/admin/mailbox", label: "Email", icon: Mail, badge: "email" as const, match: ["/admin/email"] },
    { href: "/admin/documents", label: "Documents", icon: FileImage },
    { href: "/admin/lpc", label: "LPC", icon: ScrollText },
    { href: "/admin/dispatch", label: "Dak", icon: Send },
    ...(access.tickets ? [{ href: "/admin/tickets", label: "Tickets", icon: Ticket, badge: "tickets" as const }] : []),
    ...(access.notices ? [{ href: "/admin/notices", label: "Notices", icon: Megaphone }] : []),
    ...(access.contacts ? [{ href: "/admin/department-contacts", label: "Contacts", icon: Phone }] : []),
    ...(access.settings ? [{ href: "/admin/settings", label: "Settings", icon: Settings }] : []),
  ];
  const otherItems = items.filter((i) => i !== dashboardItem);

  const isActive = (item: NavItem) =>
    location === item.href || location.startsWith(item.href + "/") ||
    (item.match || []).some((m) => location.startsWith(m));

  // Breadcrumb: Dashboard › [parent ›] current page
  const crumbs: Array<{ href?: string; label: string }> = [];
  if (location !== "/admin/dashboard") {
    crumbs.push({ href: "/admin/dashboard", label: "Dashboard" });
    const extra = EXTRA_TITLES.find((e) => location.startsWith(e.prefix));
    if (extra) {
      const parent = extra.parent ? items.find((i) => i.href === extra.parent) : undefined;
      if (parent) crumbs.push({ href: parent.href, label: parent.label });
      crumbs.push({ label: location.endsWith("/edit") ? "Edit Report" : extra.title });
    } else {
      const own = items.find((i) => location === i.href || location.startsWith(i.href + "/"));
      if (own) crumbs.push({ label: own.label });
    }
  }

  // Who is logged in
  const display = (() => {
    if (email === "admin@amu.ac.in") return { name: "Super Administrator", role: "Super Admin", Icon: ShieldCheck, color: "text-rose-600", bg: "bg-rose-50" };
    if (email === "salary@amu.ac.in") return { name: "Salary Officer", role: "Salary Admin", Icon: Briefcase, color: "text-emerald-600", bg: "bg-emerald-50" };
    const name = adminInfo.name && adminInfo.name !== "Admin"
      ? adminInfo.name
      : email ? email.split("@")[0].charAt(0).toUpperCase() + email.split("@")[0].slice(1) : "";
    const role = (adminInfo.role === "superadmin" || adminInfo.role === "super" || adminInfo.role === "super_admin") ? "Super Admin" : "Salary Admin";
    return { name, role, Icon: User, color: "text-blue-600", bg: "bg-blue-50" };
  })();
  const AdminIcon = display.Icon;

  const Badge = ({ n, className: c }: { n: number; className?: string }) =>
    n > 0 ? (
      <span className={cn("min-w-[18px] rounded-full bg-red-500 px-1.5 text-center text-[10px] font-bold leading-[18px] text-white", c)}>
        {n > 99 ? "99+" : n}
      </span>
    ) : null;

  return (
    <div className={cn("sticky top-0 z-40 print:hidden", className)}>
      <header className="flex items-center justify-between gap-3 border-b bg-white/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        {/* Who is logged in */}
        <Link href="/admin/dashboard" className="flex min-w-0 items-center gap-3" title="Go to Dashboard">
          <img src="/logo_favicon/favicon-32x32.png" alt="AMU Logo" className="h-8 w-auto shrink-0" />
          <div className={cn("hidden shrink-0 rounded-full p-2 sm:block lg:hidden min-[1700px]:block", display.bg)}>
            <AdminIcon className={cn("h-5 w-5", display.color)} />
          </div>
          <div className="min-w-0">
            <div className="truncate whitespace-nowrap font-medium leading-tight">{display.name}</div>
            <div className={cn("text-xs", display.color)}>{display.role}</div>
          </div>
        </Link>

        {/* Menu – large screens (right aligned) */}
        <nav className="hidden shrink-0 items-center gap-0.5 lg:flex" aria-label="Admin menu">
          {/* Home button: always outlined + labelled so it stands apart from the other menu items */}
          <Link
            href="/admin/dashboard"
            title="Back to main Dashboard"
            aria-current={onDashboard ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-sm font-semibold transition-colors",
              onDashboard
                ? "border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                : "border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-500 hover:bg-blue-100",
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span>Dashboard</span>
          </Link>
          <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />
          {otherItems.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            const n = badgeCount(item.badge);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors",
                  active ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={item.primary ? "hidden xl:inline" : "hidden 2xl:inline"}>{item.label}</span>
                {n > 0 && <Badge n={n} className="absolute -right-1.5 -top-1.5 border-2 border-white" />}
              </Link>
            );
          })}
          <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />
          <button
            type="button"
            onClick={() => logoutAdmin(setLocation)}
            title="Logout"
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden xl:inline">Logout</span>
          </button>
        </nav>

        {/* Menu – phones and tablets */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="relative inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
              <span>Menu</span>
              <Badge n={badgeCount("email") + badgeCount("tickets")} className="absolute -right-2 -top-2 border-2 border-white" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 overflow-y-auto bg-white p-0">
            <SheetTitle className="border-b px-4 py-3 text-base">Admin Menu</SheetTitle>
            <nav className="flex flex-col gap-0.5 p-2" aria-label="Admin menu">
              <Link
                href="/admin/dashboard"
                aria-current={onDashboard ? "page" : undefined}
                className={cn(
                  "mb-1 flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm font-semibold",
                  onDashboard ? "border-blue-600 bg-blue-600 text-white" : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100",
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="flex-1">Dashboard</span>
              </Link>
              {otherItems.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                const n = badgeCount(item.badge);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                      active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    <Badge n={n} />
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => logoutAdmin(setLocation)}
                className="mt-2 flex items-center gap-3 rounded-md border-t px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </nav>
          </SheetContent>
        </Sheet>
      </header>

      {/* Breadcrumb on sub-pages */}
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="border-b bg-slate-50/95 px-4 py-1.5 text-sm backdrop-blur">
          <ol className="flex flex-wrap items-center gap-1 text-slate-500">
            {crumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                {c.href ? (
                  <Link href={c.href} className="hover:text-slate-900 hover:underline">{c.label}</Link>
                ) : (
                  <span className="font-medium text-slate-900" aria-current="page">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}
