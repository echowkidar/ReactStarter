import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import AdminHeader from "@/components/layout/admin-header";
import Loading from "@/components/layout/loading";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Megaphone, Trash2, Image, Globe, Users, Send, Eye } from "lucide-react";
import { format } from "date-fns";

interface Notice {
    id: number;
    subject: string;
    message: string;
    image_url: string | null;
    is_global: boolean;
    created_by: string;
    created_at: string;
}

interface Department {
    id: number;
    name: string;
}

export default function AdminNotices() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
    const [isGlobal, setIsGlobal] = useState(true);
    const [selectedDepts, setSelectedDepts] = useState<number[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const formRef = useRef<HTMLFormElement>(null);

    // Fetch notices
    const { data: notices = [], isLoading } = useQuery<Notice[]>({
        queryKey: ["/api/notices"],
    });

    // Fetch departments for selection
    const { data: departments = [] } = useQuery<Department[]>({
        queryKey: ["/api/departments?registeredOnly=true"],
    });

    // Create notice mutation
    const createNotice = useMutation({
        mutationFn: async (formData: FormData) => {
            const response = await fetch("/api/notices", {
                method: "POST",
                body: formData,
            });
            if (!response.ok) throw new Error("Failed to create notice");
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
            setShowCreateDialog(false);
            setImageFile(null);
            setSelectedDepts([]);
            setIsGlobal(true);
            formRef.current?.reset();
            toast({
                title: "Notice Sent",
                description: "Notice has been sent successfully.",
            });
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to send notice",
            });
        },
    });

    // Delete notice mutation
    const deleteNotice = useMutation({
        mutationFn: async (id: number) => {
            await apiRequest("DELETE", `/api/notices/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
            toast({
                title: "Notice Deleted",
                description: "Notice has been deleted.",
            });
        },
    });

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData();

        const subject = (form.elements.namedItem("subject") as HTMLInputElement).value;
        const message = (form.elements.namedItem("message") as HTMLTextAreaElement).value;
        const adminUsername = localStorage.getItem("adminUsername") || "Admin";

        formData.append("subject", subject);
        formData.append("message", message);
        formData.append("isGlobal", String(isGlobal));
        formData.append("createdBy", adminUsername);

        if (!isGlobal) {
            formData.append("departmentIds", JSON.stringify(selectedDepts));
        }

        if (imageFile) {
            formData.append("image", imageFile);
        }

        createNotice.mutate(formData);
    };

    if (isLoading) return <Loading />;

    return (
        <div className="min-h-screen flex flex-col">
            <AdminHeader />
            <div className="p-6 flex-1">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/dashboard")}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="flex items-center gap-2">
                            <Megaphone className="h-6 w-6 text-blue-600" />
                            <h1 className="text-2xl font-bold">Notice Management</h1>
                        </div>
                    </div>
                    <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                        <Send className="h-4 w-4 mr-2" />
                        Send New Notice
                    </Button>
                </div>

                {/* Notices List */}
                <div className="grid gap-4">
                    {notices.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No notices sent yet.</p>
                                <Button onClick={() => setShowCreateDialog(true)} className="mt-4">
                                    Send First Notice
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        notices.map((notice) => (
                            <Card key={notice.id} className="hover:shadow-md transition-shadow">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                {notice.subject}
                                                {notice.is_global ? (
                                                    <Badge variant="secondary" className="text-xs">
                                                        <Globe className="h-3 w-3 mr-1" />
                                                        All Departments
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs">
                                                        <Users className="h-3 w-3 mr-1" />
                                                        Selected Departments
                                                    </Badge>
                                                )}
                                            </CardTitle>
                                            <CardDescription>
                                                By {notice.created_by} • {format(new Date(notice.created_at), "dd MMM yyyy, HH:mm")}
                                            </CardDescription>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setSelectedNotice(notice)}
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => deleteNotice.mutate(notice.id)}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground line-clamp-2">{notice.message}</p>
                                    {notice.image_url && (
                                        <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                                            <Image className="h-3 w-3" />
                                            Attachment included
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>

                {/* Create Notice Dialog */}
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Megaphone className="h-5 w-5 text-blue-600" />
                                Send Notice
                            </DialogTitle>
                            <DialogDescription>
                                Create and send a notice to departments.
                            </DialogDescription>
                        </DialogHeader>
                        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="subject">Subject *</Label>
                                <Input id="subject" name="subject" placeholder="Notice subject" required />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="message">Message *</Label>
                                <Textarea
                                    id="message"
                                    name="message"
                                    placeholder="Enter your notice message here..."
                                    rows={5}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Attachment (Optional)</Label>
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                                />
                                {imageFile && (
                                    <p className="text-sm text-muted-foreground">
                                        Selected: {imageFile.name}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="isGlobal"
                                        checked={isGlobal}
                                        onCheckedChange={(checked) => setIsGlobal(checked as boolean)}
                                    />
                                    <Label htmlFor="isGlobal" className="flex items-center gap-2">
                                        <Globe className="h-4 w-4" />
                                        Send to All Departments
                                    </Label>
                                </div>

                                {!isGlobal && (
                                    <div className="border rounded-lg p-4 max-h-48 overflow-y-auto">
                                        <Label className="mb-2 block">Select Departments:</Label>
                                        <div className="space-y-2">
                                            {departments.map((dept) => (
                                                <div key={dept.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`dept-${dept.id}`}
                                                        checked={selectedDepts.includes(dept.id)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedDepts([...selectedDepts, dept.id]);
                                                            } else {
                                                                setSelectedDepts(selectedDepts.filter((id) => id !== dept.id));
                                                            }
                                                        }}
                                                    />
                                                    <Label htmlFor={`dept-${dept.id}`}>{dept.name}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={createNotice.isPending} className="bg-blue-600 hover:bg-blue-700">
                                    {createNotice.isPending ? "Sending..." : "Send Notice"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* View Notice Dialog */}
                <Dialog open={!!selectedNotice} onOpenChange={() => setSelectedNotice(null)}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{selectedNotice?.subject}</DialogTitle>
                            <DialogDescription>
                                By {selectedNotice?.created_by} • {selectedNotice?.created_at && format(new Date(selectedNotice.created_at), "dd MMM yyyy, HH:mm")}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="whitespace-pre-wrap text-sm">{selectedNotice?.message}</div>
                            {selectedNotice?.image_url && (
                                <div className="border rounded-lg overflow-hidden">
                                    <img
                                        src={selectedNotice.image_url}
                                        alt="Notice attachment"
                                        className="w-full max-h-96 object-contain"
                                    />
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
