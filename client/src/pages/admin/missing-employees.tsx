import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import Loading from "@/components/layout/loading";
import AdminHeader from "@/components/layout/admin-header";
import { ArrowLeft, Search, Download, UserX, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MultiSelect } from "@/components/ui/multi-select";

type MissingEmployee = {
    id: number;
    epid: string;
    name: string;
    designation: string;
    employment_status: string;
    term_expiry: string | null;
    salary_asstt: string | null;
    salary_register_no: string | null;
    is_active: string;
    department_name: string;
};

// localStorage key format: missing_confirmed_YYYY_M
function getStorageKey(month: number, year: number) {
    return `missing_confirmed_${year}_${month}`;
}

function getConfirmedIds(month: number, year: number): Set<number> {
    try {
        const raw = localStorage.getItem(getStorageKey(month, year));
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

function saveConfirmedIds(month: number, year: number, ids: Set<number>) {
    localStorage.setItem(getStorageKey(month, year), JSON.stringify([...ids]));
}

export default function MissingEmployees() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [searchTerm, setSearchTerm] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
    const [salaryAssistantFilter, setSalaryAssistantFilter] = useState<string[]>([]);
    const [showConfirmed, setShowConfirmed] = useState(false);
    const [confirmedIds, setConfirmedIds] = useState<Set<number>>(() => getConfirmedIds(currentMonth, currentYear));
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    const [isSalaryAdmin, setIsSalaryAdmin] = useState(false);

    useEffect(() => {
        // Check if user is salary admin
        const adminType = localStorage.getItem("adminType");
        const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
        const userCode = adminData.userCode;

        if (adminType === "salary") {
            if (userCode && userCode !== "ALL" && userCode !== "VEW") {
                setIsSalaryAdmin(true);
                setSalaryAssistantFilter([userCode]);
            }
        }
    }, []);

    const { data: employees = [], isLoading } = useQuery<MissingEmployee[]>({
        queryKey: ["/api/admin/all-missing-employees", currentMonth, currentYear],
        queryFn: async () => {
            const response = await apiRequest("GET", `/api/admin/all-missing-employees?month=${currentMonth}&year=${currentYear}`);
            return response.json();
        },
    });

    // Extract unique departments and salary assistants for filters
    const departments = useMemo(() => {
        const set = new Set<string>();
        employees.forEach(e => e.department_name && set.add(e.department_name));
        return Array.from(set).sort();
    }, [employees]);

    const salaryAssistants = useMemo(() => {
        const set = new Set<string>();
        employees.forEach(e => e.salary_asstt && set.add(e.salary_asstt));
        return Array.from(set).sort();
    }, [employees]);

    // Filter employees
    const filteredEmployees = useMemo(() => {
        let result = employees;

        // Hide confirmed unless toggled on
        if (!showConfirmed) {
            result = result.filter(e => !confirmedIds.has(e.id));
        }

        // Search filter
        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            result = result.filter(e =>
                e.name?.toLowerCase().includes(s) ||
                e.epid?.toLowerCase().includes(s) ||
                e.designation?.toLowerCase().includes(s) ||
                e.department_name?.toLowerCase().includes(s) ||
                e.salary_register_no?.toLowerCase().includes(s)
            );
        }

        // Department filter
        if (departmentFilter.length > 0) {
            result = result.filter(e => departmentFilter.includes(e.department_name));
        }

        // Salary assistant filter
        if (salaryAssistantFilter.length > 0) {
            result = result.filter(e => e.salary_asstt && salaryAssistantFilter.includes(e.salary_asstt));
        }

        return result;
    }, [employees, searchTerm, departmentFilter, salaryAssistantFilter, confirmedIds, showConfirmed]);

    // Pagination
    const totalPages = Math.ceil(filteredEmployees.length / pageSize);
    const paginatedEmployees = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredEmployees.slice(start, start + pageSize);
    }, [filteredEmployees, currentPage]);

    // Reset page when filters change
    useEffect(() => { setCurrentPage(1); }, [searchTerm, departmentFilter, salaryAssistantFilter, showConfirmed]);

    const toggleConfirm = (empId: number) => {
        setConfirmedIds(prev => {
            const next = new Set(prev);
            if (next.has(empId)) {
                next.delete(empId);
            } else {
                next.add(empId);
            }
            saveConfirmedIds(currentMonth, currentYear, next);
            return next;
        });
    };

    const handleDownload = () => {
        if (filteredEmployees.length === 0) {
            toast({ title: 'No data', description: 'No employees to export', variant: 'destructive' });
            return;
        }
        const headers = ['Department', 'EPID', 'Name', 'Designation', 'Status', 'Term Expiry', 'Salary Asst.', 'Reg. No.'];
        const rows = filteredEmployees.map(emp => [
            emp.department_name || '',
            emp.epid || '',
            emp.name || '',
            emp.designation || '',
            emp.employment_status || '',
            emp.term_expiry || '',
            emp.salary_asstt || '',
            emp.salary_register_no || ''
        ]);
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const monthName = new Date(currentYear, currentMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        link.setAttribute('download', `Missing_Employees_${monthName}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({ title: 'Downloaded', description: `Exported ${filteredEmployees.length} employees to CSV` });
    };

    const monthLabel = new Date(currentYear, currentMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
                                <h1 className="text-2xl font-bold">Missing Employees</h1>
                                <Badge variant="outline" className="text-lg bg-orange-50 text-orange-700 border-orange-200">
                                    {monthLabel}
                                </Badge>
                                <Badge variant="secondary" className="text-sm">
                                    {filteredEmployees.length} of {employees.length} employees
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={handleDownload} className="flex items-center gap-2">
                                    <Download className="h-4 w-4" /> Download CSV
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setLocation("/admin/attendance-reports")} className="flex items-center gap-2">
                                    <ArrowLeft className="h-4 w-4" /> Back
                                </Button>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <div className="relative flex-1 min-w-[250px]">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name, EPID, designation..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                            <MultiSelect
                                options={departments.map(d => ({ label: d, value: d }))}
                                selected={departmentFilter}
                                onChange={setDepartmentFilter}
                                placeholder="Filter by department"
                                className="w-[220px]"
                            />
                            <MultiSelect
                                options={salaryAssistants.map(s => ({ label: s, value: s }))}
                                selected={salaryAssistantFilter}
                                onChange={setSalaryAssistantFilter}
                                placeholder="Filter by salary assistant"
                                className="w-[220px]"
                                disabled={isSalaryAdmin}
                            />
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="showConfirmed"
                                    checked={showConfirmed}
                                    onCheckedChange={(checked) => setShowConfirmed(checked === true)}
                                />
                                <label htmlFor="showConfirmed" className="text-sm text-muted-foreground cursor-pointer">
                                    Show confirmed ({confirmedIds.size})
                                </label>
                            </div>
                        </div>

                        {/* Info text */}
                        <div className="text-xs text-muted-foreground mb-3">
                            Showing {paginatedEmployees.length} of {filteredEmployees.length} missing employees.
                            Check the box next to an employee to confirm their attendance is not expected — they will be hidden from this list on this computer.
                        </div>

                        {/* Table */}
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[40px]"></TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead className="w-[80px]">EPID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Designation</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Term Expiry</TableHead>
                                        <TableHead>Salary Asst.</TableHead>
                                        <TableHead>Reg. No.</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedEmployees.map((emp) => {
                                        const isConfirmed = confirmedIds.has(emp.id);
                                        return (
                                            <TableRow key={emp.id} className={isConfirmed ? "opacity-50 bg-muted/30" : ""}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={isConfirmed}
                                                        onCheckedChange={() => toggleConfirm(emp.id)}
                                                        title={isConfirmed ? "Unmark — show in list again" : "Confirm — hide from list"}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-sm font-medium">{emp.department_name}</TableCell>
                                                <TableCell className="font-mono text-sm">{emp.epid || '—'}</TableCell>
                                                <TableCell className="font-medium">{emp.name}</TableCell>
                                                <TableCell className="text-sm">{emp.designation || '—'}</TableCell>
                                                <TableCell>
                                                    <Badge variant={emp.employment_status === 'Permanent' ? 'default' : 'secondary'} className="text-xs">
                                                        {emp.employment_status || '—'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm">{(emp.employment_status === 'Temporary' || emp.employment_status === 'Probation') ? (emp.term_expiry || '—') : '—'}</TableCell>
                                                <TableCell className="text-sm">{emp.salary_asstt || '—'}</TableCell>
                                                <TableCell className="text-sm">{emp.salary_register_no || '—'}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {paginatedEmployees.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                                {employees.length === 0 ? "All employees have attendance reported!" : "No employees match your filters."}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4">
                                <div className="text-sm text-muted-foreground">
                                    Page {currentPage} of {totalPages}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline" size="sm"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronLeft className="h-4 w-4" /> Previous
                                    </Button>
                                    <Button
                                        variant="outline" size="sm"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Next <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
