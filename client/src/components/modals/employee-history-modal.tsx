import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Loader2, History } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EmployeeHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeId: number;
    employeeName: string;
}

interface HistoryEntry {
    id: number;
    action: string;
    field: string;
    previousValue: string;
    changedBy: string;
    changedByRole: string;
    timestamp: string;
    departmentId: number | null;
    departmentName?: string;
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

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'update': return 'Updated';
            case 'create': return 'Created';
            case 'delete': return 'Deleted';
            case 'transfer': return 'Transferred';
            case 'document_update': return 'Document Updated';
            case 'document_delete': return 'Document Deleted';
            default: return action;
        }
    };

    const formatPreviousValue = (value: string | null) => {
        if (!value) return <span className="text-muted-foreground italic">None</span>;
        // Check if it looks like a JSON object (for complex previous values)
        if (value.startsWith('{') || value.startsWith('[')) {
            try {
                return <code className="text-xs bg-slate-100 p-1 rounded">{value}</code>;
            } catch {
                return value;
            }
        }
        return value;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
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
                                        <TableHead className="w-[180px]">Date & Time</TableHead>
                                        <TableHead className="w-[120px]">Action</TableHead>
                                        <TableHead className="w-[150px]">Field</TableHead>
                                        <TableHead className="w-[200px]">Previous Value</TableHead>
                                        <TableHead>Changed By</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell className="text-xs">
                                                {format(new Date(entry.timestamp), "dd MMM yyyy, hh:mm a")}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <span className={`inline-flex px-2 py-1 rounded-full text-xs ${entry.action === 'transfer' ? 'bg-orange-100 text-orange-800' :
                                                    entry.action === 'create' ? 'bg-green-100 text-green-800' :
                                                        'bg-slate-100 text-slate-800'
                                                    }`}>
                                                    {getActionLabel(entry.action)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-sm font-mono text-muted-foreground">
                                                {entry.field}
                                            </TableCell>
                                            <TableCell className="text-sm break-all">
                                                {formatPreviousValue(entry.previousValue)}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {entry.departmentName && (
                                                    <div className="font-medium text-foreground/80">{entry.departmentName}</div>
                                                )}
                                                <div>{entry.changedBy}</div>
                                                <div className="italic opacity-70">({entry.changedByRole})</div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
