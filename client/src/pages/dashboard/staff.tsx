// Staff logins of a department (e-Office): HOD, Section Officer, Dealing Assistant,
// Diary Clerk. Each person logs in with their own e-mail and password, and every
// dak / e-file action is recorded under their name.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCurrentDepartment, getCurrentStaff, isDeptSupervisor, STAFF_ROLE_LABELS } from "@/lib/auth";
import Sidebar from "@/components/layout/sidebar";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCog, Plus, KeyRound, Loader2, Pencil } from "lucide-react";
import { format } from "date-fns";

interface StaffRow {
  id: number;
  employeeId: number | null;
  name: string;
  designation: string | null;
  email: string;
  role: string;
  roleLabel: string;
  isActive: boolean;
  lastLogin: string | null;
}

const ROLES = Object.entries(STAFF_ROLE_LABELS);
const emptyForm = { name: "", designation: "", email: "", password: "", role: "dealing_assistant", employeeId: "" };

export default function StaffPage() {
  const department = getCurrentDepartment();
  const me = getCurrentStaff();
  const canManage = isDeptSupervisor();
  const { toast } = useToast();

  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [showMyPassword, setShowMyPassword] = useState(false);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });

  const staffKey = [`/api/departments/${department?.id}/staff`];
  const { data: staff = [], isLoading } = useQuery<StaffRow[]>({ queryKey: staffKey, enabled: !!department?.id });
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: [`/api/departments/${department?.id}/employees`],
    enabled: !!department?.id && canManage,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {
        name: form.name,
        designation: form.designation,
        role: form.role,
        employeeId: form.employeeId || null,
      };
      if (form.password) body.password = form.password;
      if (editing) {
        return (await apiRequest("PATCH", `/api/departments/${department!.id}/staff/${editing.id}`, body)).json();
      }
      body.email = form.email;
      return (await apiRequest("POST", `/api/departments/${department!.id}/staff`, body)).json();
    },
    onSuccess: () => {
      toast({ title: editing ? "Staff login updated" : "Staff login created" });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: staffKey });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async (row: StaffRow) =>
      (await apiRequest("PATCH", `/api/departments/${department!.id}/staff/${row.id}`, { isActive: !row.isActive })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: staffKey }),
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const changeMyPassword = useMutation({
    mutationFn: async () => {
      if (pw.newPassword !== pw.confirm) throw new Error("New passwords do not match");
      return (await apiRequest("POST", "/api/staff/me/password", { currentPassword: pw.currentPassword, newPassword: pw.newPassword })).json();
    },
    onSuccess: () => {
      toast({ title: "Password changed" });
      setShowMyPassword(false);
      setPw({ currentPassword: "", newPassword: "", confirm: "" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (row: StaffRow) => {
    setEditing(row);
    setForm({ name: row.name, designation: row.designation || "", email: row.email, password: "", role: row.role, employeeId: row.employeeId ? String(row.employeeId) : "" });
    setShowForm(true);
  };

  if (!department) return null;

  return (
    <div className="flex h-screen">
      <Sidebar className="hidden md:flex md:w-64 md:flex-col border-r" />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-4 pt-16 md:p-6 max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <UserCog className="h-6 w-6 text-indigo-600" /> Staff Logins
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Each staff member gets an own login. Dak and e-file actions are recorded under their name.
              </p>
            </div>
            <div className="flex gap-2">
              {me && (
                <Button variant="outline" onClick={() => setShowMyPassword(true)}>
                  <KeyRound className="h-4 w-4 mr-2" /> Change my password
                </Button>
              )}
              {canManage && (
                <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="h-4 w-4 mr-2" /> Add Staff Login
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {isLoading ? (
                <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>
              ) : staff.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">
                  No staff logins yet. Add the HOD, Section Officer, Dealing Assistants and Diary Clerk.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left text-gray-600">
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Role</th>
                      <th className="px-4 py-2.5">Login e-mail</th>
                      <th className="px-4 py-2.5">Last login</th>
                      <th className="px-4 py-2.5">Active</th>
                      {canManage && <th className="px-4 py-2.5"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((row) => (
                      <tr key={row.id} className={`border-b last:border-b-0 ${row.isActive ? "" : "text-gray-400"}`}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{row.name}{me?.id === row.id && <span className="ml-2 text-xs text-indigo-600">(you)</span>}</div>
                          {row.designation && <div className="text-xs text-gray-500">{row.designation}</div>}
                        </td>
                        <td className="px-4 py-2.5">{row.roleLabel}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{row.email}</td>
                        <td className="px-4 py-2.5 text-xs">{row.lastLogin ? format(new Date(row.lastLogin), "dd MMM yyyy, HH:mm") : "Never"}</td>
                        <td className="px-4 py-2.5">
                          <Switch checked={row.isActive} disabled={!canManage || me?.id === row.id || toggleActive.isPending}
                            onCheckedChange={() => toggleActive.mutate(row)} />
                        </td>
                        {canManage && (
                          <td className="px-4 py-2.5 text-right">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                              <Pencil className="h-4 w-4 mr-1" /> Edit
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-gray-400 mt-3">
            Staff log in on the normal department login page with their own e-mail. A deactivated login stops working at once.
          </p>
        </div>

        {/* Add / edit staff */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Staff Login" : "Add Staff Login"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Role *</Label>
                  <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))} disabled={editing?.id === me?.id}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Designation</Label>
                  <Input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Employee record (optional)</Label>
                <Select value={form.employeeId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name} ({e.epid})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Login e-mail *</Label>
                <Input type="email" value={form.email} disabled={!!editing}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">{editing ? "New password (leave empty to keep)" : "Password * (min. 8 characters)"}</Label>
                <Input type="password" autoComplete="new-password" value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
              </div>
              <Button className="w-full" disabled={save.isPending || !form.name || (!editing && (!form.email || form.password.length < 8))}
                onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editing ? "Save" : "Create Login"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Own password (staff) */}
        <Dialog open={showMyPassword} onOpenChange={setShowMyPassword}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Change my password</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Current password</Label>
                <Input type="password" autoComplete="current-password" value={pw.currentPassword}
                  onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">New password (min. 8 characters)</Label>
                <Input type="password" autoComplete="new-password" value={pw.newPassword}
                  onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Repeat new password</Label>
                <Input type="password" autoComplete="new-password" value={pw.confirm}
                  onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
              </div>
              <Button className="w-full" disabled={changeMyPassword.isPending || pw.newPassword.length < 8 || !pw.currentPassword}
                onClick={() => changeMyPassword.mutate()}>
                {changeMyPassword.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Change Password
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
