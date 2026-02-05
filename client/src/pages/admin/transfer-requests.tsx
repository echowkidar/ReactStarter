
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import AdminHeader from "@/components/layout/admin-header";
import {
    ArrowLeft,
    Search,
    ArrowRightLeft,
    CheckCircle,
    XCircle,
    Clock,
    FileText,
    Download
} from "lucide-react";
import Loading from "@/components/layout/loading";
import { format } from "date-fns";
import * as XLSX from 'xlsx';

export default function TransferRequests() {
    const [, setLocation] = useLocation();
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [monthFilter, setMonthFilter] = useState("all");

    // Fetch all requests
    const { data: requests = [], isLoading } = useQuery<any[]>({
        queryKey: ["/api/admin/transfer-requests"],
        queryFn: async () => {
            const res = await fetch("/api/admin/transfer-requests");
            if (!res.ok) throw new Error("Failed to fetch requests");
            return res.json();
        }
    });

    // Helper to format months for filter
    const uniqueMonths = useMemo(() => {
        const months = new Set<string>();
        requests.forEach(r => {
            const date = r.createdAt ? new Date(r.createdAt) : new Date();
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            months.add(key);
        });
        return Array.from(months).sort().reverse().map(key => {
            const [year, month] = key.split('-');
            const date = new Date(parseInt(year), parseInt(month));
            return {
                value: key,
                label: format(date, "MMMM yyyy")
            };
        });
    }, [requests]);

    // Filter Logic
    const filteredRequests = useMemo(() => {
        return requests.filter(req => {
            const searchLower = searchTerm.toLowerCase();

            // Search match
            const matchesSearch =
                req.employeeName?.toLowerCase().includes(searchLower) ||
                req.employeeEpid?.toLowerCase().includes(searchLower) ||
                req.fromDepartmentName?.toLowerCase().includes(searchLower) ||
                req.toDepartmentName?.toLowerCase().includes(searchLower);

            // Status match
            const matchesStatus = statusFilter === 'all' || req.status === statusFilter;

            // Type match (Transfer vs Release)
            // Transfer: status is pending, accepted, rejected (Standard)
            // Release: status is release_requested (or was release_requested). 
            // Distinguishing resolved ones is tricky without a 'type' field in DB.
            // But we can infer: if 'release_requested' status -> Release.
            // If we want to filter strictly, we might need to rely on remarks or other heuristics if DB doesn't store 'type'.
            // However, for Pending:
            //   - pending = Transfer
            //   - release_requested = Release
            // For Resolved: Both become 'accepted'/'rejected'.
            // The user wanted to count them on dashboard.
            // For the list, maybe simplified filter: "Pending Transfer" vs "Pending Release".
            // Let's rely on status logic.
            let matchesType = true;
            if (typeFilter === 'transfer') {
                // Show standard transfers (pending) or accepted/rejected (assumed standard)
                matchesType = req.status !== 'release_requested';
            } else if (typeFilter === 'release') {
                matchesType = req.status === 'release_requested';
            }

            // Month match
            const reqDate = req.createdAt ? new Date(req.createdAt) : new Date();
            const reqMonthKey = `${reqDate.getFullYear()}-${reqDate.getMonth()}`;
            const matchesMonth = monthFilter === 'all' || reqMonthKey === monthFilter;

            return matchesSearch && matchesStatus && matchesType && matchesMonth;
        });
    }, [requests, searchTerm, statusFilter, typeFilter, monthFilter]);

    // Export to Excel
    const handleExport = () => {
        const data = filteredRequests.map(r => ({
            "Employee Name": r.employeeName,
            "EPID": r.employeeEpid,
            "From Department": r.fromDepartmentName,
            "To Department": r.toDepartmentName,
            "Type": r.status === 'release_requested' ? "Release Request" : "Transfer Request",
            "Status": r.status,
            "Order No": r.orderNumber || '-',
            "Order Date": r.orderDate ? format(new Date(r.orderDate), 'dd-MM-yyyy') : '-',
            "Relieving Date": r.relievingDate ? format(new Date(r.relievingDate), 'dd-MM-yyyy') : '-',
            "Remarks": r.remarks,
            "Created At": r.createdAt ? format(new Date(r.createdAt), 'dd-MM-yyyy HH:mm') : '-'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transfers");
        XLSX.writeFile(wb, "Transfer_Requests.xlsx");
    };

    if (isLoading) return <Loading />;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <AdminHeader />

            <div className="p-6 flex-1 max-w-[1600px] mx-auto w-full">
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/dashboard")}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <ArrowRightLeft className="h-6 w-6 text-blue-600" />
                            Transfer Requests
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            View and manage employee transfer and release requests
                        </p>
                    </div>
                    <div className="ml-auto flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleExport}>
                            <Download className="h-4 w-4 mr-2" />
                            Export Excel
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-lg border shadow-sm mb-6 flex flex-wrap gap-4 items-center">
                    <div className="relative w-[300px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search employee, EPID or department..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="release_requested">Release Requested</SelectItem>
                            <SelectItem value="accepted">Accepted</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={monthFilter} onValueChange={setMonthFilter}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Months</SelectItem>
                            {uniqueMonths.map(m => (
                                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {(statusFilter !== 'all' || monthFilter !== 'all' || searchTerm) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearchTerm("");
                                setStatusFilter("all");
                                setMonthFilter("all");
                                setTypeFilter("all");
                            }}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                            Reset
                        </Button>
                    )}
                </div>

                {/* Table */}
                <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Employee</TableHead>
                                <TableHead>From Dept</TableHead>
                                <TableHead>To Dept</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Order Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRequests.length > 0 ? (
                                filteredRequests.map((req) => (
                                    <TableRow key={req.id}>
                                        <TableCell className="text-xs">
                                            {req.createdAt ? format(new Date(req.createdAt), 'dd MMM yyyy') : '-'}
                                            <div className="text-[10px] text-muted-foreground">
                                                {req.createdAt ? format(new Date(req.createdAt), 'HH:mm') : ''}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{req.employeeName}</div>
                                            <div className="text-xs text-muted-foreground">{req.employeeEpid}</div>
                                        </TableCell>
                                        <TableCell>{req.fromDepartmentName}</TableCell>
                                        <TableCell>{req.toDepartmentName}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                req.status === 'release_requested'
                                                    ? "text-indigo-600 border-indigo-200 bg-indigo-50"
                                                    : "text-orange-600 border-orange-200 bg-orange-50"
                                            }>
                                                {req.status === 'release_requested' ? "Release Req" : "Transfer"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={
                                                req.status === 'accepted' ? 'default' :
                                                    req.status === 'rejected' ? 'destructive' :
                                                        'secondary'
                                            } className={
                                                req.status === 'accepted' ? "bg-green-600 hover:bg-green-700" : ""
                                            }>
                                                {req.status === 'accepted' && <CheckCircle className="h-3 w-3 mr-1" />}
                                                {req.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                                                {(req.status === 'pending' || req.status === 'release_requested') && <Clock className="h-3 w-3 mr-1" />}
                                                {req.status === 'release_requested' ? 'Pending Approval' : req.status.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {req.orderNumber ? (
                                                <div className="text-xs">
                                                    <div className="font-semibold">Order: {req.orderNumber}</div>
                                                    <div>Relieving: {req.relievingDate ? format(new Date(req.relievingDate), 'dd MMM yyyy') : '-'}</div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No transfer requests found matching your filters.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
