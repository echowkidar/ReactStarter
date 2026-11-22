// Who may open which admin page — ONE place for the rules.
// ─────────────────────────────────────────────────────────────────────────────
// Used by the admin menu (AdminHeader) to decide which buttons to show, and by
// ProtectedAdminRoute to stop someone opening a page by typing its address.
// Keep both in sync by changing the rules only here.
//
//   • Detailed View          – everyone except qasim@amu.ac.in
//   • Users, Settings        – Super admins only (not view-only VEW, not qasim)
//   • Employees, Contacts    – Salary and Super admins
//   • Tickets                – not for view-only (VEW) admins / qasim@amu.ac.in
//   • Notices                – not for view-only (VEW) admins
//   • Email, Documents, LPC, Dak – everyone

export type AdminAccess = {
  email: string;
  isSuperAdmin: boolean;
  isSalaryAdmin: boolean;
  isViewOnly: boolean;
  isQasim: boolean;
  detailedView: boolean;
  users: boolean;
  settings: boolean;
  employees: boolean;
  contacts: boolean;
  tickets: boolean;
  notices: boolean;
};

export function getAdminAccess(): AdminAccess {
  let admin: any = {};
  let adminType = "";
  try { admin = JSON.parse(localStorage.getItem("admin") || "{}"); } catch { admin = {}; }
  try { adminType = localStorage.getItem("adminType") || ""; } catch { adminType = ""; }

  const email: string = admin.email || "";
  // adminType is the main source; fall back to the role stored with the admin
  const isSalaryAdmin = adminType ? adminType === "salary" : admin.role === "salary";
  const isSuperAdmin = adminType ? adminType === "super" : (admin.role === "superadmin" || admin.role === "super");
  const isViewOnly = admin.userCode === "VEW";
  const isQasim = email === "qasim@amu.ac.in";
  const fullSuper = isSuperAdmin && !isViewOnly && !isQasim;

  return {
    email,
    isSuperAdmin,
    isSalaryAdmin,
    isViewOnly,
    isQasim,
    detailedView: !isQasim,
    users: fullSuper,
    settings: fullSuper,
    employees: isSalaryAdmin || isSuperAdmin,
    contacts: isSalaryAdmin || isSuperAdmin,
    tickets: !isViewOnly && !isQasim,
    notices: !isViewOnly,
  };
}

// Pages that need a permission (prefix match). Pages not listed are open to every admin.
const PAGE_RULES: Array<{ prefix: string; allowed: (a: AdminAccess) => boolean }> = [
  { prefix: "/admin/users", allowed: (a) => a.users },
  { prefix: "/admin/settings", allowed: (a) => a.settings },
  { prefix: "/admin/attendance-reports", allowed: (a) => a.detailedView },
  { prefix: "/admin/employees", allowed: (a) => a.employees },
  { prefix: "/admin/department-contacts", allowed: (a) => a.contacts },
  { prefix: "/admin/tickets", allowed: (a) => a.tickets },
  { prefix: "/admin/notices", allowed: (a) => a.notices },
];

export function canOpenAdminPage(path: string, access: AdminAccess = getAdminAccess()): boolean {
  const rule = PAGE_RULES.find((r) => path === r.prefix || path.startsWith(r.prefix + "/"));
  return rule ? rule.allowed(access) : true;
}

// ─── Section view (Salary / Accounts / Bill / Students) ─────────────────────
// A section login (ACC, BIL, STU) is fixed to its own section. A real Super Admin
// picks the section to look at from the header (kept in localStorage, default salary).
// Everyone else always works in the Salary Section.
import { useEffect, useState } from "react";
import { sectionOfAdmin, isSectionLoginCode, SECTIONS, type SectionKey } from "@shared/sections";

const SECTION_EVENT = "admin-section-change";

function readAdminForSection(): { adminType: string; userCode: string; role: string } {
  let admin: any = {};
  let adminType = "";
  try { admin = JSON.parse(localStorage.getItem("admin") || "{}"); } catch { admin = {}; }
  try { adminType = localStorage.getItem("adminType") || ""; } catch { adminType = ""; }
  return { adminType, userCode: String(admin.userCode || ""), role: String(admin.role || "") };
}

export function isSectionLogin(): boolean {
  const { adminType, userCode, role } = readAdminForSection();
  const isSalary = adminType ? adminType === "salary" : role === "salary";
  return isSalary && isSectionLoginCode(userCode);
}

export function getAdminSection(): SectionKey {
  const { adminType, userCode, role } = readAdminForSection();
  const isSalary = adminType ? adminType === "salary" : role === "salary";
  if (isSalary) return sectionOfAdmin(userCode);
  const isSuper = adminType ? adminType === "super" : (role === "superadmin" || role === "super");
  if (!isSuper || userCode.toUpperCase() === "ALL") return "salary";
  try {
    const v = localStorage.getItem("adminSectionView");
    if (SECTIONS.some((s) => s.key === v)) return v as SectionKey;
  } catch { /* ignore */ }
  return "salary";
}

export function setAdminSectionView(key: SectionKey) {
  try { localStorage.setItem("adminSectionView", key); } catch { /* ignore */ }
  window.dispatchEvent(new Event(SECTION_EVENT));
}

export function useAdminSection(): SectionKey {
  const [section, setSection] = useState<SectionKey>(() => getAdminSection());
  useEffect(() => {
    const update = () => setSection(getAdminSection());
    window.addEventListener(SECTION_EVENT, update);
    window.addEventListener("storage", update);
    update();
    return () => {
      window.removeEventListener(SECTION_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return section;
}
