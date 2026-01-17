import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import AdminHeader from "@/components/layout/admin-header";
import Loading from "@/components/layout/loading";
import { ArrowLeft, MessageSquare, Clock, CheckCircle, AlertCircle, FileImage, Send, Image, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Ticket, TicketReply } from "@shared/schema";

type TicketWithReplies = Ticket & { replies?: TicketReply[] };

export default function AdminTickets() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [selectedTicket, setSelectedTicket] = useState<TicketWithReplies | null>(null);
    const [isViewingTicket, setIsViewingTicket] = useState(false);
    const [statusFilter, setStatusFilter] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");

    // Reply state
    const [replyMessage, setReplyMessage] = useState("");

    // Fetch all tickets
    const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
        queryKey: ["/api/admin/tickets"],
        queryFn: async () => {
            const response = await apiRequest("GET", "/api/admin/tickets");
            return response.json();
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

    // Update ticket status
    const updateTicketStatus = useMutation({
        mutationFn: async ({ id, status }: { id: number; status: string }) => {
            const response = await apiRequest("PATCH", `/api/tickets/${id}`, { status });
            if (!response.ok) throw new Error("Failed to update status");
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tickets/stats"] });
            if (selectedTicket) fetchTicketDetails(selectedTicket.id);
            toast({ title: "Success", description: "Status updated" });
        },
        onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Failed to update status" });
        },
    });

    // Add reply mutation (updates admin_response column)
    const addReply = useMutation({
        mutationFn: async () => {
            if (!replyMessage || !selectedTicket) throw new Error("Message is required");

            const response = await apiRequest("POST", `/api/tickets/${selectedTicket.id}/replies`, { message: replyMessage });
            if (!response.ok) throw new Error("Failed to send reply");
            return response.json();
        },
        onSuccess: () => {
            if (selectedTicket) fetchTicketDetails(selectedTicket.id);
            setReplyMessage("");
            queryClient.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tickets/stats"] });
            toast({ title: "Success", description: "Response sent" });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        },
    });

    // Delete ticket
    const deleteTicket = useMutation({
        mutationFn: async (id: number) => {
            const response = await apiRequest("DELETE", `/api/tickets/${id}`);
            if (!response.ok) throw new Error("Failed to delete");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tickets/stats"] });
            setIsViewingTicket(false);
            setSelectedTicket(null);
            toast({ title: "Success", description: "Ticket deleted" });
        },
        onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Failed to delete" });
        },
    });

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

    // Filter tickets
    const filteredTickets = tickets.filter(t => {
        const matchesStatus = statusFilter === "all" || t.status === statusFilter;
        const matchesSearch = !searchTerm ||
            t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.departmentName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
        return matchesStatus && matchesSearch;
    });

    if (isLoading) return <Loading />;

    return (
        <div className="min-h-screen flex flex-col">
            <AdminHeader />
            <div className="p-6 flex-1">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/dashboard")}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-2xl font-bold">Support Tickets</h1>
                        <Badge variant="outline">{tickets.length} Total</Badge>
                    </div>
                    <div className="flex items-center gap-4">
                        <Input
                            placeholder="Search tickets..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-[250px]"
                        />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="Open">Open</SelectItem>
                                <SelectItem value="In Progress">In Progress</SelectItem>
                                <SelectItem value="Resolved">Resolved</SelectItem>
                                <SelectItem value="Closed">Closed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {filteredTickets.length === 0 ? (
                    <div className="text-center py-12">
                        <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">No tickets found</h3>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredTickets.map((ticket) => (
                            <div
                                key={ticket.id}
                                onClick={() => fetchTicketDetails(ticket.id)}
                                className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer bg-white"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs text-muted-foreground">#{ticket.id}</span>
                                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{ticket.departmentName}</span>
                                        </div>
                                        <h3 className="font-medium">{ticket.subject}</h3>
                                        <p className="text-sm text-muted-foreground line-clamp-1">{ticket.description}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex gap-2">
                                            {getPriorityBadge(ticket.priority)}
                                            {getStatusBadge(ticket.status)}
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {format(new Date(ticket.createdAt), "dd MMM, HH:mm")}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Ticket Detail Dialog */}
            <Dialog open={isViewingTicket} onOpenChange={setIsViewingTicket}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    {selectedTicket && (
                        <>
                            <DialogHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm text-muted-foreground">#{selectedTicket.id}</span>
                                            <Badge variant="outline">{selectedTicket.departmentName}</Badge>
                                        </div>
                                        <DialogTitle>{selectedTicket.subject}</DialogTitle>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Select
                                            value={selectedTicket.status}
                                            onValueChange={(v) => updateTicketStatus.mutate({ id: selectedTicket.id, status: v })}
                                        >
                                            <SelectTrigger className="w-[130px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Open">Open</SelectItem>
                                                <SelectItem value="In Progress">In Progress</SelectItem>
                                                <SelectItem value="Resolved">Resolved</SelectItem>
                                                <SelectItem value="Closed">Closed</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant="destructive"
                                            size="icon"
                                            onClick={() => deleteTicket.mutate(selectedTicket.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="space-y-4 pt-4">
                                {/* Original message */}
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-sm font-medium">{selectedTicket.departmentName}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {format(new Date(selectedTicket.createdAt), "dd MMM yyyy, HH:mm")}
                                        </span>
                                    </div>
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

                                {/* Reply Form */}
                                {selectedTicket.status !== 'Closed' && (
                                    <div className="border-t pt-4">
                                        <div className="flex gap-2">
                                            <Textarea
                                                placeholder="Type your reply..."
                                                value={replyMessage}
                                                onChange={(e) => setReplyMessage(e.target.value)}
                                                rows={2}
                                                className="flex-1"
                                            />
                                            <Button
                                                onClick={() => addReply.mutate()}
                                                disabled={!replyMessage || addReply.isPending}
                                            >
                                                <Send className="h-4 w-4 mr-2" />
                                                Send
                                            </Button>
                                        </div>
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
