// Frame for the Email pages (Mailbox + Email Settings).
// These pages are shared by Admin (/admin/...) and Department (/dashboard/...)
// users, so they pick the right navigation themselves:
//   • Admin      → the shared top header (AdminHeader) with menu + breadcrumb
//   • Department → the usual left sidebar + top header (like other dashboard pages)
// Before this, both pages rendered without any navigation, so the menu vanished.
import { ReactNode } from "react";
import AdminHeader from "./admin-header";
import Sidebar from "./sidebar";
import Header from "./header";
import { cn } from "@/lib/utils";

export function EmailLayout({
  isAdmin,
  className,
  children,
}: {
  isAdmin: boolean;
  /** classes for the content area (background, padding, alignment) */
  className?: string;
  children: ReactNode;
}) {
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader />
        <div className={cn("p-4 md:p-6", className)}>{children}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar className="hidden md:flex md:w-64 md:flex-col border-r bg-white" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className={cn("flex-1 overflow-y-auto p-4 md:p-6", className)}>{children}</main>
      </div>
    </div>
  );
}
