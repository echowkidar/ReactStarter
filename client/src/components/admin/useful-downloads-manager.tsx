import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit, FileText, Link as LinkIcon, Image as ImageIcon, Globe } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type UsefulDownload = {
    id: number;
    title: string;
    description: string | null;
    fileUrl: string | null;
    externalLink: string | null;
    thumbnailUrl: string | null;
    createdAt: string;
};

export function UsefulDownloadsManager() {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [editingDownload, setEditingDownload] = useState<UsefulDownload | null>(null);
    const [type, setType] = useState<"file" | "link">("file");
    const [file, setFile] = useState<File | null>(null);
    const [thumbnail, setThumbnail] = useState<File | null>(null);

    const { data: downloads = [], isLoading } = useQuery<UsefulDownload[]>({
        queryKey: ["/api/admin/downloads"],
    });

    const createMutation = useMutation({
        mutationFn: async (formData: FormData) => {
            const res = await fetch("/api/admin/downloads", {
                method: "POST",
                headers: {
                    "x-session-token": localStorage.getItem("adminSessionToken") || ""
                },
                body: formData,
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/downloads"] });
            toast({ title: "Success", description: "Download added successfully." });
            resetForm();
        },
        onError: (err: any) => {
            toast({ variant: "destructive", title: "Error", description: err.message });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, formData }: { id: number, formData: FormData }) => {
            const res = await fetch(`/api/admin/downloads/${id}`, {
                method: "PATCH",
                headers: {
                    "x-session-token": localStorage.getItem("adminSessionToken") || ""
                },
                body: formData,
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/downloads"] });
            toast({ title: "Success", description: "Download updated successfully." });
            resetForm();
        },
        onError: (err: any) => {
            toast({ variant: "destructive", title: "Error", description: err.message });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`/api/admin/downloads/${id}`, {
                method: "DELETE",
                headers: {
                    "x-session-token": localStorage.getItem("adminSessionToken") || ""
                }
            });
            if (!res.ok) throw new Error(await res.text());
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/downloads"] });
            toast({ title: "Deleted", description: "Download removed." });
        },
        onError: (err: any) => {
            toast({ variant: "destructive", title: "Error", description: err.message });
        },
    });

    const resetForm = () => {
        setIsOpen(false);
        setEditingDownload(null);
        setFile(null);
        setType("file");
    };

    const openEdit = (download: UsefulDownload) => {
        setEditingDownload(download);
        setType(download.fileUrl ? "file" : "link");
        setFile(null);
        setIsOpen(true);
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        // Validate
        const title = formData.get("title") as string;
        if (!title) return toast({ variant: "destructive", description: "Title is required" });

        if (type === "file" && !file && !editingDownload?.fileUrl) {
            return toast({ variant: "destructive", description: "Please select a file to upload" });
        }
        if (type === "link" && !formData.get("externalLink")) {
            return toast({ variant: "destructive", description: "Please enter a valid link" });
        }

        // Pass file
        if (file) formData.set("file", file);

        if (editingDownload) {
            if (type === "link") formData.set("removeFile", "true");
            updateMutation.mutate({ id: editingDownload.id, formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    if (isLoading) return <div>Loading downloads...</div>;

    return (
        <Card className="max-w-4xl mt-8">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-lg">Useful Downloads</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage files and links shown in the department dashboard sidebar.
                    </p>
                </div>
                <Dialog open={isOpen} onOpenChange={(open) => {
                    if (!open) resetForm();
                    else setIsOpen(true);
                }}>
                    <DialogTrigger asChild>
                        <Button><Plus className="h-4 w-4 mr-2" /> Add Resource</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>{editingDownload ? "Edit Resource" : "Add New Resource"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="title">Title *</Label>
                                <Input id="title" name="title" defaultValue={editingDownload?.title} placeholder="e.g. Leave Application Form" required />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description (optional)</Label>
                                <Textarea id="description" name="description" defaultValue={editingDownload?.description || ""} placeholder="Briefly describe this resource" />
                            </div>

                            <div className="space-y-3 pt-2">
                                <Label>Resource Type</Label>
                                <RadioGroup
                                    value={type}
                                    onValueChange={(val: "file" | "link") => setType(val)}
                                    className="flex flex-col space-y-1"
                                >
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="file" id="r1" />
                                        <Label htmlFor="r1" className="flex items-center gap-1 cursor-pointer"><FileText className="w-4 h-4" /> File Upload</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="link" id="r2" />
                                        <Label htmlFor="r2" className="flex items-center gap-1 cursor-pointer"><LinkIcon className="w-4 h-4" /> External Link</Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            {type === "file" && (
                                <div className="space-y-2 pt-2">
                                    <Label htmlFor="file">Upload File {editingDownload?.fileUrl ? "(leave empty to keep current)" : "*"}</Label>
                                    <Input
                                        id="file"
                                        type="file"
                                        onChange={e => setFile(e.target.files?.[0] || null)}
                                        className="cursor-pointer"
                                    />
                                    {editingDownload?.fileUrl && <p className="text-xs text-muted-foreground">Current: {editingDownload.fileUrl.split('/').pop()}</p>}
                                </div>
                            )}

                            {type === "link" && (
                                <div className="space-y-2 pt-2">
                                    <Label htmlFor="externalLink">Website link *</Label>
                                    <Input
                                        id="externalLink"
                                        name="externalLink"
                                        defaultValue={editingDownload?.externalLink || ""}
                                        placeholder="https://example.com"
                                    />
                                </div>
                            )}

                            {/* Thumbnail upload removed in favor of automatic professional icons */}

                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                                    {editingDownload ? "Update Resource" : "Create Resource"}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {downloads.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                        No useful downloads added yet.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {downloads.map(item => (
                            <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded bg-slate-50 flex flex-shrink-0 items-center justify-center overflow-hidden border">
                                        {item.fileUrl && item.fileUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                                            <img src={item.fileUrl} alt="File Preview" className="h-full w-full object-cover" />
                                        ) : item.fileUrl ? (
                                            <FileText className="h-6 w-6 text-blue-500" />
                                        ) : (
                                            <Globe className="h-6 w-6 text-emerald-500" />
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm">{item.title}</h4>
                                        {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                                                {item.fileUrl ? "File" : "Link"}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                {new Date(item.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                                        <Edit className="h-4 w-4 text-slate-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => {
                                        if (confirm("Are you sure you want to delete this resource?")) {
                                            deleteMutation.mutate(item.id);
                                        }
                                    }}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
