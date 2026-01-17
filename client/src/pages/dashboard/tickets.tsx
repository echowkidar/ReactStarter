import { useState, ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Loading from "@/components/layout/loading";
import { Plus, MessageSquare, Clock, CheckCircle, AlertCircle, FileImage, Send, Image } from "lucide-react";
import { format } from "date-fns";
import { Ticket, TicketReply } from "@shared/schema";

// Image compression helper
const compressImage = async (file: File, maxWidthHeight = 800, quality = 0.7): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new window.Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const aspectRatio = width / height;
                if (width > height) {
                    width = Math.min(width, maxWidthHeight);
                    height = Math.round(width / aspectRatio);
                } else {
                    height = Math.min(height, maxWidthHeight);
                    width = Math.round(height * aspectRatio);
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Compression failed'));
                            return;
                        }
                        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
};

type TicketWithReplies = Ticket & { replies?: TicketReply[] };

export default function Tickets() {
    const { toast } = useToast();
    const department = getCurrentDepartment();
    const [isCreating, setIsCreating] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<TicketWithReplies | null>(null);
    const [isViewingTicket, setIsViewingTicket] = useState(false);

    // Create form state
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState("medium");
    const [screenshot, setScreenshot] = useState<File | null>(null);
    const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
    const [isCompressing, setIsCompressing] = useState(false);

    // Reply state
    const [replyMessage, setReplyMessage] = useState("");
    const [replyScreenshot, setReplyScreenshot] = useState<File | null>(null);
    const [replyPreview, setReplyPreview] = useState<string | null>(null);

    // Fetch tickets
    const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
        queryKey: [`/api/departments/${department?.id}/tickets`],
        queryFn: async () => {
            const response = await apiRequest("GET", `/api/departments/${department?.id}/tickets`);
            return response.json();
        },
        enabled: !!department?.id,
    });

    // Create ticket mutation
    const createTicket = useMutation({
        mutationFn: async () => {
            if (!subject || !description) throw new Error("Subject and description are required");

            const formData = new FormData();
            formData.append("departmentId", department?.id.toString() || "");
            formData.append("subject", subject);
            formData.append("description", description);
            formData.append("priority", priority);
            if (screenshot) formData.append("screenshot", screenshot);

            const response = await apiRequest("POST", "/api/tickets", formData, false);
            if (!response.ok) throw new Error("Failed to create ticket");
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/tickets`] });
            resetForm();
            setIsCreating(false);
            toast({ title: "Success", description: "Ticket created successfully" });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        },
    });

    // Fetch ticket details
    const fetchTicketDetails = async (id: number) => {
        try {
            const response = await apiRequest("GET", `/api/tickets/${id}`);
            const data = await response.json();
            setSelectedTicket(data);
            setIsViewingTicket(true);
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Failed to load ticket" });
        }
    };

    // Add reply mutation
    const addReply = useMutation({
        mutationFn: async () => {
            if (!replyMessage || !selectedTicket) throw new Error("Message is required");

            const formData = new FormData();
            formData.append("message", replyMessage);
            formData.append("isAdminReply", "false");
            if (replyScreenshot) formData.append("screenshot", replyScreenshot);

            const response = await apiRequest("POST", `/api/tickets/${selectedTicket.id}/replies`, formData, false);
            if (!response.ok) throw new Error("Failed to send reply");
            return response.json();
        },
        onSuccess: () => {
            if (selectedTicket) fetchTicketDetails(selectedTicket.id);
            setReplyMessage("");
            setReplyScreenshot(null);
            setReplyPreview(null);
            queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/tickets`] });
            toast({ title: "Success", description: "Reply sent" });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        },
    });

    const resetForm = () => {
        setSubject("");
        setDescription("");
        setPriority("medium");
        setScreenshot(null);
        setScreenshotPreview(null);
    };

    const handleScreenshotChange = async (e: ChangeEvent<HTMLInputElement>, isReply = false) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
                toast({ variant: "destructive", title: "Invalid file", description: "Only JPEG/PNG allowed" });
                return;
            }
            try {
                setIsCompressing(true);
                const compressed = await compressImage(file);
                if (isReply) {
                    setReplyScreenshot(compressed);
                    const reader = new FileReader();
                    reader.onloadend = () => setReplyPreview(reader.result as string);
                    reader.readAsDataURL(compressed);
                } else {
                    setScreenshot(compressed);
                    const reader = new FileReader();
                    reader.onloadend = () => setScreenshotPreview(reader.result as string);
                    reader.readAsDataURL(compressed);
                }
            } catch (error) {
                toast({ variant: "destructive", title: "Error", description: "Failed to process image" });
            } finally {
                setIsCompressing(false);
            }
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: { [key: string]: { color: string; icon: any; label: string } } = {
            Open: { color: "bg-blue-100 text-blue-700", icon: AlertCircle, label: "Open" },
            'In Progress': { color: "bg-yellow-100 text-yellow-700", icon: Clock, label: "In Progress" },
            Resolved: { color: "bg-green-100 text-green-700", icon: CheckCircle, label: "Resolved" },
            Closed: { color: "bg-gray-100 text-gray-700", icon: CheckCircle, label: "Closed" },
        };
        const v = variants[status] || variants.Open;
        const Icon = v.icon;
        return (
            <Badge className={`${v.color} flex items-center gap-1`}>
                <Icon className="h-3 w-3" /> {v.label}
            </Badge>
        );
    };

    const getPriorityBadge = (priority: string) => {
        const colors: { [key: string]: string } = {
            low: "bg-gray-100 text-gray-600",
            medium: "bg-orange-100 text-orange-600",
            high: "bg-red-100 text-red-600",
        };
        return <Badge className={colors[priority] || colors.medium}>{priority}</Badge>;
    };

    if (isLoading) return <Loading />;

    return (
        <div className="flex min-h-screen">
            <Sidebar className="w-64 border-r" />
            <div className="flex-1 flex flex-col">
                <Header />
                <main className="flex-1 p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold">Support Tickets</h1>
                        <Dialog open={isCreating} onOpenChange={setIsCreating}>
                            <DialogTrigger asChild>
                                <Button className="bg-gradient-to-r from-primary to-primary/90">
                                    <Plus className="h-4 w-4 mr-2" /> New Ticket
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                                <DialogHeader>
                                    <DialogTitle>Create Support Ticket</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={(e) => { e.preventDefault(); createTicket.mutate(); }} className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="subject">Subject <span className="text-red-500">*</span></Label>
                                        <Input
                                            id="subject"
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            placeholder="Brief description of the issue"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
                                        <Textarea
                                            id="description"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Detailed description of your problem..."
                                            rows={4}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="priority">Priority</Label>
                                        <Select value={priority} onValueChange={setPriority}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="low">Low</SelectItem>
                                                <SelectItem value="medium">Medium</SelectItem>
                                                <SelectItem value="high">High</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Screenshot (Optional)</Label>
                                        <div
                                            onClick={() => document.getElementById('screenshot')?.click()}
                                            className="border-2 border-dashed rounded-md p-4 cursor-pointer hover:bg-gray-50 transition-colors text-center"
                                        >
                                            <input id="screenshot" type="file" accept="image/*" className="hidden" onChange={(e) => handleScreenshotChange(e)} />
                                            {isCompressing ? (
                                                <p className="text-muted-foreground">Compressing...</p>
                                            ) : screenshotPreview ? (
                                                <img src={screenshotPreview} alt="Preview" className="max-h-32 mx-auto rounded" />
                                            ) : (
                                                <div className="text-muted-foreground">
                                                    <Image className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                                    <p>Click to attach screenshot</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button type="button" variant="outline" onClick={() => { resetForm(); setIsCreating(false); }}>Cancel</Button>
                                        <Button type="submit" disabled={!subject || !description || createTicket.isPending || isCompressing}>
                                            {createTicket.isPending ? "Creating..." : "Create Ticket"}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>

                    {tickets.length === 0 ? (
                        <div className="text-center py-12">
                            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-medium">No tickets yet</h3>
                            <p className="mt-1 text-muted-foreground">Create a ticket to get help from admin</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {tickets.map((ticket) => (
                                <div
                                    key={ticket.id}
                                    onClick={() => fetchTicketDetails(ticket.id)}
                                    className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-medium text-lg">{ticket.subject}</h3>
                                        <div className="flex gap-2">
                                            {getPriorityBadge(ticket.priority)}
                                            {getStatusBadge(ticket.status)}
                                        </div>
                                    </div>
                                    <p className="text-muted-foreground text-sm line-clamp-2 mb-2">{ticket.description}</p>

                                    {/* Admin Response Preview */}
                                    {ticket.adminResponse && (
                                        <div className="bg-blue-50 border-l-4 border-blue-400 p-2 rounded mb-2">
                                            <span className="text-xs font-medium text-blue-700">Admin Response:</span>
                                            <p className="text-sm text-blue-900 line-clamp-1">{ticket.adminResponse}</p>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span>Created: {format(new Date(ticket.createdAt), "dd MMM yyyy, HH:mm")}</span>
                                        {ticket.imageUrl && <span className="flex items-center gap-1"><FileImage className="h-3 w-3" /> Attachment</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>

            {/* Ticket Detail Dialog */}
            <Dialog open={isViewingTicket} onOpenChange={setIsViewingTicket}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    {selectedTicket && (
                        <>
                            <DialogHeader>
                                <div className="flex justify-between items-start">
                                    <DialogTitle>{selectedTicket.subject}</DialogTitle>
                                    <div className="flex gap-2">
                                        {getPriorityBadge(selectedTicket.priority)}
                                        {getStatusBadge(selectedTicket.status)}
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="space-y-4 pt-4">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm text-muted-foreground mb-1">
                                        {format(new Date(selectedTicket.createdAt), "dd MMM yyyy, HH:mm")}
                                    </p>
                                    <p className="whitespace-pre-wrap">{selectedTicket.description}</p>
                                    {selectedTicket.imageUrl && (
                                        <a href={selectedTicket.imageUrl} target="_blank" rel="noopener noreferrer">
                                            <img src={selectedTicket.imageUrl} alt="Screenshot" className="mt-2 max-h-48 rounded border" />
                                        </a>
                                    )}
                                </div>

                                {/* Admin Response */}
                                {selectedTicket.adminResponse && (
                                    <div className="bg-blue-50 p-4 rounded-lg ml-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-sm font-medium text-blue-700">Admin Response</span>
                                        </div>
                                        <p className="whitespace-pre-wrap">{selectedTicket.adminResponse}</p>
                                    </div>
                                )}

                                {/* Status Note */}
                                {selectedTicket.status === 'Open' && !selectedTicket.adminResponse && (
                                    <div className="text-center text-muted-foreground text-sm py-4 border-t">
                                        Awaiting admin response...
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
