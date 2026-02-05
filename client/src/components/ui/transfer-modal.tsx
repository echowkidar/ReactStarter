import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect, ComboboxOption } from "@/components/ui/searchable-select";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    employeeId: number;
    employeeName: string;
    currentDepartmentId: number;
    currentDepartmentName: string;
    hodName: string;
    isReleaseRequest?: boolean; // New prop for "Request Release" mode
}

interface Department {
    id: number;
    name: string;
    code?: string;
}

export function TransferModal({
    isOpen,
    onClose,
    onSuccess,
    employeeId,
    employeeName,
    currentDepartmentId,
    currentDepartmentName,
    hodName,
    isReleaseRequest = false
}: TransferModalProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [toDepartmentId, setToDepartmentId] = useState<string>("");
    const [orderNumber, setOrderNumber] = useState("");
    const [orderDate, setOrderDate] = useState("");
    const [relievingDate, setRelievingDate] = useState("");
    const [remarks, setRemarks] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Fetch all registered departments for dropdown
    const { data: departments = [] } = useQuery<Department[]>({
        queryKey: ["/api/departments"],
        queryFn: async () => {
            const response = await apiRequest("GET", "/api/departments");
            return response.json();
        }
    });

    // Reset form when modal closes or mode changes
    useEffect(() => {
        if (!isOpen) {
            setToDepartmentId("");
            setOrderNumber("");
            setOrderDate("");
            setRelievingDate("");
            setRemarks("");
            setErrors({});
        } else if (isReleaseRequest) {
            // In Request Release mode, target is ME (current dept)
            setToDepartmentId(String(currentDepartmentId));
        }
    }, [isOpen, isReleaseRequest, currentDepartmentId]);

    // Generate default remarks only for STANDARD transfer
    useEffect(() => {
        if (!isReleaseRequest && relievingDate) {
            const formattedDate = format(new Date(relievingDate), "dd MMM yyyy");
            setRemarks(`${employeeName} was present in ${currentDepartmentName} till his/her relieving i.e. ${formattedDate}. He/She may be allowed to join the new department after this date.`);
        }
    }, [relievingDate, employeeName, currentDepartmentName, isReleaseRequest]);

    const validate = () => {
        const newErrors: Record<string, string> = {};

        if (!toDepartmentId) {
            newErrors.toDepartmentId = "Please select target department";
        }

        // Order details are only required for STANDARD transfer (outgoing)
        if (!isReleaseRequest) {
            if (!orderNumber.trim()) {
                newErrors.orderNumber = "Order number is required";
            }
            if (!orderDate) {
                newErrors.orderDate = "Order date is required";
            }
            if (!relievingDate) {
                newErrors.relievingDate = "Relieving date is required";
            }
        }

        // For release request, simple remarks might be nice, but let's make it required to be safe
        // actually user wanted simple remarks.

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;

        setIsSubmitting(true);
        try {
            if (isReleaseRequest) {
                // Endpoint for Request Release (The one I just made)
                // NOTE: Logic in global-search.tsx was: api/departments/:departmentId/transfer-requests/request-release
                // Body: { targetEmployeeId, remarks }
                // The param :departmentId should be the REQUESTER (currentDepartmentId)
                await apiRequest(
                    "POST",
                    `/api/departments/${currentDepartmentId}/transfer-requests/request-release`,
                    {
                        targetEmployeeId: employeeId,
                        remarks: remarks || "Transfer Requested via Global Search"
                    }
                );

            } else {
                // Standard Transfer Endpoint
                await apiRequest("POST", `/api/departments/${currentDepartmentId}/employees/${employeeId}/transfer`, {
                    toDepartmentId: parseInt(toDepartmentId),
                    orderNumber,
                    orderDate,
                    relievingDate,
                    remarks,
                    hodSignature: `${hodName}, ${currentDepartmentName}`
                });
            }

            toast({
                title: isReleaseRequest ? "Request Sent" : "Transfer Initiated",
                description: isReleaseRequest
                    ? "Release request has been sent to the employee's current department."
                    : "Employee transfer request created successfully.",
            });
            onSuccess?.();
            onClose();
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: (error as Error).message || "Failed to process request",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Filter Logic for Dept Options
    // Standard: Exclude Current Dept
    // Release Request: Only Current Dept (or just show it as read only)
    const departmentOptions: ComboboxOption[] = departments
        .filter(d => isReleaseRequest ? d.id === currentDepartmentId : d.id !== currentDepartmentId)
        .map(d => ({ value: String(d.id), label: d.name }));

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ArrowRightLeft className="h-5 w-5" />
                        {isReleaseRequest ? "Request Employee Release" : "Transfer Employee"}
                    </DialogTitle>
                    <DialogDescription>
                        {isReleaseRequest
                            ? "Request to transfer this employee to your department."
                            : "Transfer this employee to another department."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Transfer To Department *</Label>
                        {isReleaseRequest ? (
                            <Input value={currentDepartmentName} disabled className="bg-slate-100 opacity-100 text-slate-700 font-medium" />
                        ) : (
                            <SearchableSelect
                                options={departmentOptions}
                                value={toDepartmentId}
                                onValueChange={(value) => {
                                    setToDepartmentId(value);
                                    setErrors(prev => ({ ...prev, toDepartmentId: "" }));
                                }}
                                placeholder="Select department..."
                                searchPlaceholder="Search department..."
                                emptyMessage="No department found."
                                className={errors.toDepartmentId ? "border-red-500" : ""}
                                disabled={isSubmitting}
                            />
                        )}
                        {errors.toDepartmentId && <p className="text-xs text-red-500">{errors.toDepartmentId}</p>}
                    </div>

                    {!isReleaseRequest && (
                        <>
                            <div className="space-y-2">
                                <Label>Order Number *</Label>
                                <Input
                                    value={orderNumber}
                                    onChange={(e) => setOrderNumber(e.target.value)}
                                    placeholder="Enter transfer order number"
                                />
                                {errors.orderNumber && <p className="text-xs text-red-500">{errors.orderNumber}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label>Order Date *</Label>
                                <Input
                                    type="date"
                                    value={orderDate}
                                    onChange={(e) => setOrderDate(e.target.value)}
                                />
                                {errors.orderDate && <p className="text-xs text-red-500">{errors.orderDate}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label>Relieving Date *</Label>
                                <Input
                                    type="date"
                                    value={relievingDate}
                                    onChange={(e) => setRelievingDate(e.target.value)}
                                />
                                {errors.relievingDate && <p className="text-xs text-red-500">{errors.relievingDate}</p>}
                            </div>
                        </>
                    )}

                    <div className="space-y-2">
                        <Label>Remarks</Label>
                        <Textarea
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder={isReleaseRequest ? "Enter reason for request (optional)..." : "Additional remarks..."}
                            className="min-h-[100px]"
                        />
                        {!isReleaseRequest && <p className="text-xs text-muted-foreground">Auto-generated based on relieving date. You can edit if needed.</p>}
                    </div>

                    {!isReleaseRequest && (
                        <div className="p-3 bg-slate-50 rounded-md">
                            <Label className="text-xs text-muted-foreground">HOD Signature (Auto-generated)</Label>
                            <p className="text-sm font-medium text-slate-700 mt-1">
                                {hodName}, {currentDepartmentName}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send Transfer Request
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
