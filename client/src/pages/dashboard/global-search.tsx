
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Search, Loader2, UserPlus, ArrowRightLeft } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { getCurrentDepartment } from "@/lib/auth";
import { TransferModal } from "@/components/ui/transfer-modal";

interface GlobalEmployee {
    id: number;
    name: string;
    epid: string;
    designation: string;
    departmentName: string;
    isActive: string; // "active" | "disabled"
    departmentId: number;
}

export default function GlobalSearch() {
    const { toast } = useToast();
    const department = getCurrentDepartment();
    const [searchTerm, setSearchTerm] = useState("");
    const [results, setResults] = useState<GlobalEmployee[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Modal State
    const [selectedEmployee, setSelectedEmployee] = useState<GlobalEmployee | null>(null);
    const [remarks, setRemarks] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Search Function
    const handleSearch = async () => {
        if (searchTerm.length < 2) {
            toast({ title: "Search too short", description: "Please enter at least 2 characters", variant: "destructive" });
            return;
        }

        setIsSearching(true);
        try {
            const res = await apiRequest('GET', `/api/employees/global-search?query=${encodeURIComponent(searchTerm)}`);
            const data = await res.json();
            setResults(data);
            setHasSearched(true);
        } catch (error) {
            console.error("Search failed:", error);
            toast({ title: "Search failed", description: "Please try again", variant: "destructive" });
        } finally {
            setIsSearching(false);
        }
    };

    // Mutation for Request/Pull
    const requestMutation = useMutation({
        mutationFn: async (data: { targetEmployeeId: number, remarks: string }) => {
            const res = await apiRequest(
                'POST',
                `/api/departments/${department?.id}/transfer-requests/request-release`,
                data
            );
            return res.json();
        },
        onSuccess: (data) => {
            setIsModalOpen(false);
            setRemarks("");
            toast({
                title: data.transferred ? "Transferred Successfully" : "Request Sent",
                description: data.message,
                variant: data.transferred ? "default" : "default"
            });
            // Optionally refresh search results
            handleSearch();
        },
        onError: (err) => {
            toast({
                title: "Action Failed",
                description: (err as Error).message,
                variant: "destructive"
            });
        }
    });

    const openRequestModal = (employee: GlobalEmployee) => {
        setSelectedEmployee(employee);
        setRemarks("");
        setIsModalOpen(true);
    };

    const handleConfirmRequest = () => {
        if (!selectedEmployee) return;
        requestMutation.mutate({
            targetEmployeeId: selectedEmployee.id,
            remarks
        });
    };

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Global Employee Search</h1>
                    <p className="text-slate-500">Search and request employees from other departments.</p>
                </div>

                {/* Search Bar */}
                <div className="flex gap-2 max-w-xl">
                    <Input
                        placeholder="Search by Name or EPID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Button onClick={handleSearch} disabled={isSearching}>
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        <span className="ml-2">Search</span>
                    </Button>
                </div>

                {/* Results */}
                <div className="bg-white border rounded-lg shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>EPID</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Designation</TableHead>
                                <TableHead>Current Department</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {results.length === 0 && hasSearched ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                        No employees found matching "{searchTerm}" in other departments.
                                    </TableCell>
                                </TableRow>
                            ) : !hasSearched ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                                        Search to see results
                                    </TableCell>
                                </TableRow>
                            ) : (
                                results.map((emp) => (
                                    <TableRow key={emp.id}>
                                        <TableCell className="font-mono text-xs">{emp.epid}</TableCell>
                                        <TableCell className="font-medium">{emp.name}</TableCell>
                                        <TableCell>{emp.designation}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-slate-50">
                                                {emp.departmentName}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={emp.isActive === 'active' ? "success" : "secondary"}>
                                                {emp.isActive === 'active' ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className={emp.isActive === 'active' ? "text-blue-600 border-blue-200" : "text-green-600 border-green-200"}
                                                onClick={() => openRequestModal(emp)}
                                            >
                                                {emp.isActive === 'active' ? (
                                                    <><ArrowRightLeft className="h-3 w-3 mr-1" /> Request Release</>
                                                ) : (
                                                    <><UserPlus className="h-3 w-3 mr-1" /> Pull Employee</>
                                                )}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Transfer/Release Modal */}
                {selectedEmployee && (
                    selectedEmployee.isActive === 'active' ? (
                        <TransferModal
                            isOpen={isModalOpen}
                            onClose={() => setIsModalOpen(false)}
                            onSuccess={handleSearch} // Refresh results
                            employeeId={selectedEmployee.id}
                            employeeName={selectedEmployee.name}
                            currentDepartmentId={department?.id || 0}
                            currentDepartmentName={department?.name || ""}
                            hodName={department?.hodName || "HOD"}
                            isReleaseRequest={true}
                        />
                    ) : (
                        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Pull Inactive Employee</DialogTitle>
                                </DialogHeader>

                                <div className="py-4 space-y-4">
                                    <div className="p-3 bg-slate-50 rounded-md text-sm border">
                                        <p><span className="font-semibold">Employee:</span> {selectedEmployee?.name} ({selectedEmployee?.epid})</p>
                                        <p><span className="font-semibold">Current Dept:</span> {selectedEmployee?.departmentName}</p>
                                        <p><span className="font-semibold">Status:</span>
                                            <span className="text-slate-500 ml-1">Inactive</span>
                                        </p>
                                    </div>

                                    <p className="text-sm text-green-700 bg-green-50 p-2 rounded">
                                        <strong>Auto-Transfer:</strong> Since this employee is inactive, they will be transferred to your department immediately upon confirmation.
                                    </p>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Remarks</label>
                                        <Textarea
                                            value={remarks}
                                            onChange={(e) => setRemarks(e.target.value)}
                                            placeholder="Enter reason for pulling employee..."
                                        />
                                    </div>
                                </div>

                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                    <Button
                                        onClick={handleConfirmRequest}
                                        disabled={requestMutation.isPending}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {requestMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                        Confirm Transfer
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )
                )}
            </div>
        </DashboardLayout>
    );
}
