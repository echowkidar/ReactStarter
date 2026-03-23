import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import Loading from "@/components/layout/loading";
import AdminHeader from "@/components/layout/admin-header";
import {
    ArrowLeft, Search, Download, Plus, Pencil, Trash2, Phone, UserCheck, Mail
} from "lucide-react";
import { useState, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Department, Employee } from "@shared/schema";

interface DepartmentContact {
    id: number;
    departmentId: number;
    employeeId: number;
    contactPhone: string;
    internalPhone: string | null;
    contactEmail: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    departmentName: string | null;
    employeeName: string | null;
    employeeEpid: string | null;
    employeeDesignation: string | null;
}

export default function DepartmentContacts() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<DepartmentContact | null>(null);
    const [deleteContact, setDeleteContact] = useState<DepartmentContact | null>(null);

    // Form state
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
    const [contactPhone, setContactPhone] = useState("");
    const [internalPhone, setInternalPhone] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [notes, setNotes] = useState("");
    const [employeeSearch, setEmployeeSearch] = useState("");
    const [departmentSearch, setDepartmentSearch] = useState("");

    // Fetch all contacts
    const { data: contacts = [], isLoading } = useQuery<DepartmentContact[]>({
        queryKey: ["/api/admin/department-contacts"],
        queryFn: async () => {
            const response = await apiRequest("GET", "/api/admin/department-contacts");
            return response.json();
        },
    });

    // Fetch departments
    const { data: departments = [] } = useQuery<Department[]>({
        queryKey: ["/api/departments"],
        queryFn: async () => {
            const response = await apiRequest("GET", "/api/departments");
            return response.json();
        },
        staleTime: 5 * 60 * 1000,
    });

    // Fetch employees
    const { data: allEmployees = [] } = useQuery<Employee[]>({
        queryKey: ["/api/admin/employees"],
        queryFn: async () => {
            const response = await apiRequest("GET", "/api/admin/employees");
            return response.json();
        },
        staleTime: 5 * 60 * 1000,
    });

    // Filter departments by search in dialog
    const filteredDepartments = useMemo(() => {
        const sorted = [...departments].sort((a, b) => a.name.localeCompare(b.name));
        if (!departmentSearch) return sorted;
        const s = departmentSearch.toLowerCase();
        return sorted.filter(dept => dept.name.toLowerCase().includes(s));
    }, [departments, departmentSearch]);

    // Filter employees by selected department
    const departmentEmployees = useMemo(() => {
        if (!selectedDepartmentId) return [];
        const deptId = Number(selectedDepartmentId);
        return allEmployees
            .filter(emp => emp.departmentId === deptId && (emp.isActive === "active" || emp.isActive === "Active"))
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }, [allEmployees, selectedDepartmentId]);

    // Filter employees by search in dropdown
    const filteredDepartmentEmployees = useMemo(() => {
        if (!employeeSearch) return departmentEmployees;
        const s = employeeSearch.toLowerCase();
        return departmentEmployees.filter(emp =>
            (emp.name || "").toLowerCase().includes(s) ||
            (emp.epid || "").toLowerCase().includes(s) ||
            (emp.designation || "").toLowerCase().includes(s)
        );
    }, [departmentEmployees, employeeSearch]);

    // Filter contacts by search
    const filteredContacts = useMemo(() => {
        if (!searchTerm) return contacts;
        const s = searchTerm.toLowerCase();
        return contacts.filter(c =>
            (c.departmentName || "").toLowerCase().includes(s) ||
            (c.employeeName || "").toLowerCase().includes(s) ||
            (c.employeeEpid || "").toLowerCase().includes(s) ||
            (c.contactPhone || "").toLowerCase().includes(s) ||
            (c.internalPhone || "").toLowerCase().includes(s) ||
            (c.contactEmail || "").toLowerCase().includes(s) ||
            (c.employeeDesignation || "").toLowerCase().includes(s)
        );
    }, [contacts, searchTerm]);

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            const response = await apiRequest("POST", "/api/admin/department-contacts", data);
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/department-contacts"] });
            toast({ title: "Success", description: "Contact added successfully" });
            closeDialog();
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to add contact" });
        },
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: async ({ id, ...data }: any) => {
            const response = await apiRequest("PUT", `/api/admin/department-contacts/${id}`, data);
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/department-contacts"] });
            toast({ title: "Success", description: "Contact updated successfully" });
            closeDialog();
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update contact" });
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            await apiRequest("DELETE", `/api/admin/department-contacts/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/department-contacts"] });
            toast({ title: "Success", description: "Contact deleted successfully" });
            setDeleteContact(null);
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete contact" });
        },
    });

    const closeDialog = () => {
        setIsDialogOpen(false);
        setEditingContact(null);
        setSelectedDepartmentId("");
        setSelectedEmployeeId("");
        setContactPhone("");
        setInternalPhone("");
        setContactEmail("");
        setNotes("");
        setEmployeeSearch("");
        setDepartmentSearch("");
    };

    const openEditDialog = (contact: DepartmentContact) => {
        setEditingContact(contact);
        setSelectedDepartmentId(contact.departmentId.toString());
        setSelectedEmployeeId(contact.employeeId.toString());
        setContactPhone(contact.contactPhone);
        setInternalPhone(contact.internalPhone || "");
        setContactEmail(contact.contactEmail || "");
        setNotes(contact.notes || "");
        setIsDialogOpen(true);
    };

    const handleSubmit = () => {
        if (!contactPhone.trim()) {
            toast({ variant: "destructive", title: "Error", description: "Phone number is required" });
            return;
        }

        if (editingContact) {
            updateMutation.mutate({
                id: editingContact.id,
                employeeId: Number(selectedEmployeeId),
                contactPhone: contactPhone.trim(),
                internalPhone: internalPhone.trim() || undefined,
                contactEmail: contactEmail.trim() || undefined,
                notes: notes.trim() || undefined,
            });
        } else {
            if (!selectedDepartmentId || !selectedEmployeeId) {
                toast({ variant: "destructive", title: "Error", description: "Please select department and employee" });
                return;
            }
            createMutation.mutate({
                departmentId: Number(selectedDepartmentId),
                employeeId: Number(selectedEmployeeId),
                contactPhone: contactPhone.trim(),
                internalPhone: internalPhone.trim() || undefined,
                contactEmail: contactEmail.trim() || undefined,
                notes: notes.trim() || undefined,
            });
        }
    };

    // CSV Download
    const handleDownload = () => {
        if (filteredContacts.length === 0) {
            toast({ title: "No data", description: "No contacts to export", variant: "destructive" });
            return;
        }
        const headers = ["Department", "Employee Name", "EPID", "Designation", "Phone", "Internal Phone", "Email", "Notes"];
        const rows = filteredContacts.map(c => [
            c.departmentName || "", c.employeeName || "", c.employeeEpid || "",
            c.employeeDesignation || "", c.contactPhone || "", c.internalPhone || "",
            c.contactEmail || "", c.notes || "",
        ]);
        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        ].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "Department_Contacts.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({ title: "Downloaded", description: `Exported ${filteredContacts.length} contacts to CSV` });
    };

    // Get selected department name
    const selectedDeptName = departments.find(d => d.id.toString() === selectedDepartmentId)?.name || "";

    if (isLoading) return <Loading />;

    return (
        <div className="min-h-screen flex flex-col">
            <AdminHeader />
            <div className="p-6 flex-1">
                <Card className="w-full">
                    <CardContent className="p-6">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <h1 className="text-2xl font-bold flex items-center gap-2">
                                    <Phone className="h-6 w-6 text-blue-600" />
                                    Department Contacts
                                </h1>
                                <Badge variant="secondary" className="text-sm">
                                    {filteredContacts.length} contacts
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => setIsDialogOpen(true)}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                                >
                                    <Plus className="h-4 w-4" /> Add Contact
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleDownload} className="flex items-center gap-2">
                                    <Download className="h-4 w-4" /> CSV
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setLocation("/admin/dashboard")} className="flex items-center gap-2">
                                    <ArrowLeft className="h-4 w-4" /> Back
                                </Button>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <div className="relative flex-1 min-w-[300px]">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by department, name, EPID, phone, email, designation..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {/* Info text */}
                        <div className="text-xs text-muted-foreground mb-3">
                            Attendance report contact persons for each department. Click on a phone number to dial directly.
                        </div>

                        {/* Table */}
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">#</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead className="w-[80px]">EPID</TableHead>
                                        <TableHead>Contact Person</TableHead>
                                        <TableHead>Designation</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>Internal Phone</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Notes</TableHead>
                                        <TableHead className="w-[100px] text-center">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredContacts.map((contact, index) => (
                                        <TableRow key={contact.id}>
                                            <TableCell className="text-sm text-muted-foreground">{index + 1}</TableCell>
                                            <TableCell className="text-sm font-medium">{contact.departmentName || "—"}</TableCell>
                                            <TableCell className="font-mono text-sm">{contact.employeeEpid || "—"}</TableCell>
                                            <TableCell className="font-medium">{contact.employeeName || "—"}</TableCell>
                                            <TableCell className="text-sm">{contact.employeeDesignation || "—"}</TableCell>
                                            <TableCell>
                                                <a
                                                    href={`tel:${contact.contactPhone}`}
                                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-sm hover:underline"
                                                    title="Click to call"
                                                >
                                                    <Phone className="h-3.5 w-3.5" />
                                                    {contact.contactPhone}
                                                </a>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {contact.internalPhone ? (
                                                    <a
                                                        href={`tel:${contact.internalPhone}`}
                                                        className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 text-sm hover:underline"
                                                        title="Internal phone"
                                                    >
                                                        <Phone className="h-3 w-3" />
                                                        {contact.internalPhone}
                                                    </a>
                                                ) : "—"}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {contact.contactEmail ? (
                                                    <a
                                                        href={`mailto:${contact.contactEmail}`}
                                                        className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 text-sm hover:underline"
                                                        title="Send email"
                                                    >
                                                        <Mail className="h-3 w-3" />
                                                        {contact.contactEmail}
                                                    </a>
                                                ) : "—"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" title={contact.notes || ""}>
                                                {contact.notes || "—"}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openEditDialog(contact)}
                                                        className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                                        title="Edit"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setDeleteContact(contact)}
                                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredContacts.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                                                {contacts.length === 0
                                                    ? "No contacts added yet. Click \"Add Contact\" to get started."
                                                    : "No contacts match your search."}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
                <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserCheck className="h-5 w-5 text-blue-600" />
                            {editingContact ? "Edit Contact" : "Add Department Contact"}
                        </DialogTitle>
                        <DialogDescription>
                            {editingContact
                                ? "Update the contact details."
                                : "Select a department, choose an employee, and enter their contact details."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Department Select with Search */}
                        <div className="space-y-2">
                            <Label>Department <span className="text-red-500">*</span></Label>
                            {editingContact ? (
                                <div className="px-3 py-2 border rounded-md bg-muted text-sm">
                                    {selectedDeptName || "Unknown Department"}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                            placeholder="Search department..."
                                            value={departmentSearch}
                                            onChange={(e) => setDepartmentSearch(e.target.value)}
                                            className="pl-9 text-sm"
                                        />
                                    </div>
                                    <div className="border rounded-md max-h-[180px] overflow-y-auto">
                                        {filteredDepartments.length === 0 ? (
                                            <div className="text-sm text-muted-foreground text-center py-4">
                                                No departments match your search
                                            </div>
                                        ) : (
                                            filteredDepartments.map(dept => (
                                                <div
                                                    key={dept.id}
                                                    onClick={() => {
                                                        setSelectedDepartmentId(dept.id.toString());
                                                        setSelectedEmployeeId("");
                                                        setEmployeeSearch("");
                                                    }}
                                                    className={`px-3 py-2 cursor-pointer hover:bg-blue-50 border-b last:border-b-0 transition-colors text-sm ${selectedDepartmentId === dept.id.toString()
                                                            ? "bg-blue-50 border-l-4 border-l-blue-600 font-medium"
                                                            : ""
                                                        }`}
                                                >
                                                    {dept.name}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Employee Select */}
                        {selectedDepartmentId && (
                            <div className="space-y-2">
                                <Label>Employee <span className="text-red-500">*</span></Label>
                                <div className="space-y-2">
                                    <Input
                                        placeholder="Search employee by name or EPID..."
                                        value={employeeSearch}
                                        onChange={(e) => setEmployeeSearch(e.target.value)}
                                        className="text-sm"
                                    />
                                    <div className="border rounded-md max-h-[180px] overflow-y-auto">
                                        {filteredDepartmentEmployees.length === 0 ? (
                                            <div className="text-sm text-muted-foreground text-center py-4">
                                                {departmentEmployees.length === 0
                                                    ? "No active employees in this department"
                                                    : "No employees match your search"}
                                            </div>
                                        ) : (
                                            filteredDepartmentEmployees.map(emp => (
                                                <div
                                                    key={emp.id}
                                                    onClick={() => setSelectedEmployeeId(emp.id.toString())}
                                                    className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-blue-50 border-b last:border-b-0 transition-colors ${selectedEmployeeId === emp.id.toString()
                                                            ? "bg-blue-50 border-l-4 border-l-blue-600"
                                                            : ""
                                                        }`}
                                                >
                                                    <div>
                                                        <div className="font-medium text-sm">{emp.name}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {emp.designation || "—"} • EPID: {emp.epid}
                                                        </div>
                                                    </div>
                                                    {selectedEmployeeId === emp.id.toString() && (
                                                        <UserCheck className="h-4 w-4 text-blue-600 shrink-0" />
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    {departmentEmployees.length > 0 && (
                                        <div className="text-xs text-muted-foreground">
                                            {departmentEmployees.length} active employee{departmentEmployees.length !== 1 ? "s" : ""} in this department
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Phone Number */}
                        <div className="space-y-2">
                            <Label htmlFor="contactPhone">Phone Number <span className="text-red-500">*</span></Label>
                            <Input
                                id="contactPhone"
                                placeholder="e.g., 9876543210"
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                                type="tel"
                                maxLength={15}
                            />
                        </div>

                        {/* Internal Phone Number */}
                        <div className="space-y-2">
                            <Label htmlFor="internalPhone">Internal Phone Number</Label>
                            <Input
                                id="internalPhone"
                                placeholder="e.g., 1234"
                                value={internalPhone}
                                onChange={(e) => setInternalPhone(e.target.value)}
                                type="tel"
                                maxLength={15}
                            />
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <Label htmlFor="contactEmail">Email ID</Label>
                            <Input
                                id="contactEmail"
                                placeholder="e.g., name@amu.ac.in"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                type="email"
                            />
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes (optional)</Label>
                            <Textarea
                                id="notes"
                                placeholder="e.g., Available after 2 PM, alternate contact..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={createMutation.isPending || updateMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editingContact ? "Update" : "Add Contact"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteContact} onOpenChange={(open) => { if (!open) setDeleteContact(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Contact</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete the contact for{" "}
                            <span className="font-medium">{deleteContact?.employeeName}</span> from{" "}
                            <span className="font-medium">{deleteContact?.departmentName}</span>?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteContact && deleteMutation.mutate(deleteContact.id)}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {deleteMutation.isPending ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
