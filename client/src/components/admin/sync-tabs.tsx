// Tabs at the top of the Sync pages: employee master sync | paybill history
import { useLocation } from "wouter";
import { Users, ReceiptIndianRupee } from "lucide-react";

const TABS = [
  { href: "/admin/settings/oracle-sync", label: "Employees", icon: Users },
  { href: "/admin/settings/oracle-sync/paybill", label: "Paybill History", icon: ReceiptIndianRupee },
];

export function SyncTabs() {
  const [location, setLocation] = useLocation();
  return (
    <div className="mb-4 inline-flex rounded-lg border bg-white p-1" role="tablist">
      {TABS.map((t) => {
        const active = location === t.href;
        return (
          <button key={t.href} type="button" role="tab" aria-selected={active}
            onClick={() => !active && setLocation(t.href)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-slate-100"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        );
      })}
    </div>
  );
}
