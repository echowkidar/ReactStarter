import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Loader2, History, ArrowRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EmployeeHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeId: number;
    employeeName: string;
}

// Shape returned by GET /api/employees/:id/history (server/employeeHistoryView.ts)
interface HistoryEntry {
    id: number;
    action: string;
    field: string;
    previousValue: string | null;
    newValue: string | null;
    changedBy: string;
    changedByRole: string;
    timestamp: string;
    departmentId: number | null;
    departmentName?: string;
    isSync?: boolean;
}

// Field changes show "previous → new"; other actions are events with a description
const FIELD_CHANGE_ACTIONS = new Set(["update", "oracle_sync", "oracle_sync_undo"]);

const FIELD_LABELS: Record<string, string> = {
    epid: "EPID", name: "Name", designation: "Designation", employmentStatus: "Employment Status",
    payLevel: "Pay Level", termExpiry: "Term Expiry", joiningDate: "Joining Date", joiningShift: "Joining Shift",
    salaryRegisterNo: "Register No", officeMemoNo: "Office Memo No", salary_asstt: "Dealing Assistant",
    panNumber: "PAN", bankAccount: "Bank Account", aadharCard: "Aadhar", bankName: "Bank Name", ifsc: "IFSC",
    employeeCategory: "Category", isActive: "Status", disableReason: "Disable Reason", disableWefDate: "Disable w.e.f.",
    remarks: "Remarks", departmentId: "Department", transferStatus: "Transfer",
    panCardUrl: "PAN Card (file)", bankProofUrl: "Bank Proof (file)", aadharCardUrl: "Aadhar Card (file)",
    officeMemoUrl: "Office Memo (file)", joiningReportUrl: "Joining Report (file)", termExtensionUrl: "Term Extension (file)",
    created: "Employee", reporting: "Reporting", "reporting.fromDate": "Reporting from",
};

const ACTION_LABELS: Record<string, string> = {
    update: "Updated", create: "Created", delete: "Deleted", transfer: "Transferred",
    transfer_request: "Transfer Request", document_update: "Document Updated", document_delete: "Document Deleted",
    oracle_sync: "Sync", oracle_sync_undo: "Sync Undone",
    reporting_attach: "Reporting", reporting_update: "Reporting", reporting_close: "Reporting",
    reporting_reopen: "Reporting", reporting_delete: "Reporting",
};

const ACTION_STYLES: Record<string, string> = {
    transfer: "bg-orange-100 text-orange-800",
    create: "bg-green-100 text-green-800",
    oracle_sync: "bg-indigo-100 text-indigo-800",
    oracle_sync_undo: "bg-rose-100 text-rose-800",
};

function showValue(field: string, value: string | null) {
    if (value === null || value === undefined || value === "" || value === "none") {
        return <span className="text-muted-foreground italic">—</span>;
    }
    // ISO dates → dd-mm-yyyy
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return value.slice(0, 10).split("-").reverse().join("-");
    if (field === "isActive") return value === "active" ? "Active" : value === "inactive" || value === "disabled" ? "Inactive" : value;
    if (field.endsWith("Url")) return <span className="text-xs">file</span>;
    return value;
}

export function EmployeeHistoryModal({ isOpen, onClose, employeeId, employeeName }: EmployeeHistoryModalProps) {
    const { data: history = [], isLoading } = useQuery<HistoryEntry[]>({
        queryKey: [`/api/employees/${employeeId}/history`],
        queryFn: async () => {
            if (!employeeId) return [];
            const response = await apiRequest("GET", `/api/employees/${employeeId}/history`);
            return response.json();
        },
        enabled: isOpen && !!employeeId,
    });

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        History: {employeeName}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden mt-4">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No history found for this employee.
                        </div>
                    ) : (
                        <ScrollArea className="h-[60vh]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[160px]">Date & Time</TableHead>
                                        <TableHead className="w-[110px]">Action</TableHead>
                                        <TableHead className="w-[150px]">Field</TableHead>
                                        <TableHead>Previous <ArrowRight className="inline h-3 w-3 mx-1" /> New</TableHead>
                                        <TableHead className="w-[170px]">Changed By</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.map((entry) => {
                                        const isFieldChange = FIELD_CHANGE_ACTIONS.has(entry.action) && entry.field !== "created";
                                        const isDoc = entry.action === "document_update" || entry.action === "document_delete";
                                        return (
                                            <TableRow key={entry.id}>
                                                <TableCell className="text-xs whitespace-nowrap">
                                                    {format(new Date(entry.timestamp), "dd MMM yyyy, hh:mm a")}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${ACTION_STYLES[entry.action] || "bg-slate-100 text-slate-800"}`}>
                                                        {ACTION_LABELS[entry.action] || entry.action}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-sm font-medium">
                                                    {FIELD_LABELS[entry.field] || entry.field}
                                                </TableCell>
                                                <TableCell className="text-sm break-words">
                                                    {isFieldChange ? (
                                                        <span className="inline-flex flex-wrap items-center gap-1">
                                                            <span className="text-red-700 line-through decoration-red-300">{showValue(entry.field, entry.previousValue)}</span>
                                                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                                            <span className="text-green-800 font-medium">{showValue(entry.field, entry.newValue)}</span>
                                                        </span>
                                                    ) : isDoc ? (
                                                        <span>{entry.action === "document_delete" ? "File removed" : entry.previousValue && entry.previousValue !== "none" ? "File replaced" : "File added"}</span>
                                                    ) : entry.field === "created" ? (
                                                        <span>{entry.newValue || "Added"}</span>
                                                    ) : (
                                                        <span>{entry.previousValue}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {entry.isSync ? (
                                                        <span>-</span>
                                                    ) : (
                                                        <>
                                                            {entry.departmentName && (
                                                                <div className="font-medium text-foreground/80">{entry.departmentName}</div>
                                                            )}
                                                            <div>{entry.changedBy}</div>
                                                            <div className="italic opacity-70">({entry.changedByRole})</div>
                                                        </>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
