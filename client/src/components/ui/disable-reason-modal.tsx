import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

// Disable reason options
export const DISABLE_REASONS = [
    { value: "retire", label: "Retire/VRS" },
    { value: "resign", label: "Resign" },
    { value: "term_complete", label: "Term Complete" },
    { value: "terminate", label: "Terminate" },
] as const;

export type DisableReason = typeof DISABLE_REASONS[number]["value"];

interface DisableReasonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: DisableReason, wefDate: string) => void;
    employeeName: string;
}

export function DisableReasonModal({ isOpen, onClose, onConfirm, employeeName }: DisableReasonModalProps) {
    const [reason, setReason] = useState<DisableReason | "">("");
    const [wefDate, setWefDate] = useState<string>("");
    const [errors, setErrors] = useState<{ reason?: string; wefDate?: string }>({});

    const handleConfirm = () => {
        const newErrors: { reason?: string; wefDate?: string } = {};

        if (!reason) {
            newErrors.reason = "Please select a reason for disabling";
        }
        if (!wefDate) {
            newErrors.wefDate = "Please select the effective date";
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        onConfirm(reason as DisableReason, wefDate);
        // Reset state
        setReason("");
        setWefDate("");
        setErrors({});
    };

    const handleClose = () => {
        setReason("");
        setWefDate("");
        setErrors({});
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-5 w-5" />
                        Disable Employee
                    </DialogTitle>
                    <DialogDescription>
                        You are about to disable <strong>{employeeName}</strong>. This action will prevent the employee from being included in attendance reports.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="disable-reason">Reason for Disabling *</Label>
                        <Select value={reason} onValueChange={(value) => {
                            setReason(value as DisableReason);
                            setErrors(prev => ({ ...prev, reason: undefined }));
                        }}>
                            <SelectTrigger id="disable-reason" className={errors.reason ? "border-red-500" : ""}>
                                <SelectValue placeholder="Select reason..." />
                            </SelectTrigger>
                            <SelectContent>
                                {DISABLE_REASONS.map((r) => (
                                    <SelectItem key={r.value} value={r.value}>
                                        {r.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.reason && <p className="text-red-500 text-xs">{errors.reason}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="wef-date">With Effect From (WEF) Date *</Label>
                        <input
                            id="wef-date"
                            type="date"
                            value={wefDate}
                            onChange={(e) => {
                                setWefDate(e.target.value);
                                setErrors(prev => ({ ...prev, wefDate: undefined }));
                            }}
                            className={`w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all ${errors.wefDate ? "border-red-500" : "border-slate-300"
                                }`}
                        />
                        {errors.wefDate && <p className="text-red-500 text-xs">{errors.wefDate}</p>}
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        Confirm Disable
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
