import { useState, ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import AdminHeader from "@/components/layout/admin-header";
import Loading from "@/components/layout/loading";
import { Plus, Search, FileImage, ArrowLeft, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { Document, Department } from "@shared/schema";

// Helper function for image compression
const compressImage = async (file: File, maxWidthHeight = 800, quality = 0.7): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
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

                if (ctx) {
                    const watermarkText = "Document Gallery, Salary Section";
                    ctx.fillStyle = 'rgba(100, 100, 100, 0.2)';
                    ctx.font = 'bold 16px Arial';
                    ctx.textAlign = 'center';
                    ctx.save();
                    ctx.translate(width / 2, height / 2);
                    ctx.rotate(-Math.PI / 8);
                    ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
                    ctx.shadowBlur = 2;
                    ctx.shadowOffsetX = 1;
                    ctx.shadowOffsetY = 1;
                    ctx.fillText(watermarkText, 0, 0);
                    ctx.restore();
                }

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Canvas to Blob conversion failed'));
                            return;
                        }
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

export default function AdminDocuments() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [isAddingDocument, setIsAddingDocument] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [isCompressing, setIsCompressing] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");
    const itemsPerPage = 20;

    // Delete confirmation state
    const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    // Edit state
    const [documentToEdit, setDocumentToEdit] = useState<Document | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    // Form state for add
    const [documentImage, setDocumentImage] = useState<File | null>(null);
    const [documentType, setDocumentType] = useState("");
    const [issuingAuthority, setIssuingAuthority] = useState("");
    const [subject, setSubject] = useState("");
    const [refNo, setRefNo] = useState("");
    const [date, setDate] = useState("");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");

    // Form state for edit
    const [editDocumentType, setEditDocumentType] = useState("");
    const [editIssuingAuthority, setEditIssuingAuthority] = useState("");
    const [editSubject, setEditSubject] = useState("");
    const [editRefNo, setEditRefNo] = useState("");
    const [editDate, setEditDate] = useState("");

    // Fetch all documents
    const { data: documents = [], isLoading } = useQuery<Document[]>({
        queryKey: [`/api/documents`],
        queryFn: async () => {
            const response = await apiRequest("GET", `/api/documents`);
            return response.json();
        },
    });

    // Fetch all departments for dropdown
    const { data: departments = [] } = useQuery<Department[]>({
        queryKey: [`/api/departments?registeredOnly=true`],
        queryFn: async () => {
            const response = await apiRequest("GET", `/api/departments?registeredOnly=true`);
            return response.json();
        },
    });

    const addDocument = useMutation({
        mutationFn: async () => {
            if (!documentImage || !documentType || !issuingAuthority || !subject || !refNo || !date || !selectedDepartmentId) {
                throw new Error("All fields are required");
            }

            // Find selected department
            const selectedDept = departments.find(d => d.id.toString() === selectedDepartmentId);

            const formData = new FormData();
            formData.append("documentImage", documentImage);
            formData.append("documentType", documentType);
            formData.append("issuingAuthority", issuingAuthority);
            formData.append("subject", subject);
            formData.append("refNo", refNo);
            formData.append("date", date);
            // Use selected department info
            formData.append("departmentId", selectedDepartmentId);
            formData.append("departmentName", selectedDept?.name || "SALARY SECTION (Admin)");

            const response = await apiRequest("POST", "/api/documents", formData, false);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to upload document");
            }

            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/documents`] });
            resetForm();
            setIsAddingDocument(false);
            toast({
                title: "Success",
                description: "Document uploaded successfully",
            });
        },
        onError: (error: any) => {
            console.error("Error uploading document:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to upload document",
            });
        },
    });

    const deleteDocument = useMutation({
        mutationFn: async (id: number) => {
            const response = await apiRequest("DELETE", `/api/documents/${id}`);
            if (!response.ok) {
                throw new Error("Failed to delete document");
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/documents`] });
            setDocumentToDelete(null);
            setIsDeleteDialogOpen(false);
            toast({
                title: "Success",
                description: "Document deleted successfully",
            });
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to delete document",
            });
        },
    });

    const updateDocument = useMutation({
        mutationFn: async ({ id, data }: { id: number; data: any }) => {
            const response = await apiRequest("PATCH", `/api/documents/${id}`, data);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to update document");
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/documents`] });
            setDocumentToEdit(null);
            setIsEditDialogOpen(false);
            toast({
                title: "Success",
                description: "Document updated successfully",
            });
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to update document",
            });
        },
    });

    const resetForm = () => {
        setDocumentImage(null);
        setDocumentType("");
        setIssuingAuthority("");
        setSubject("");
        setRefNo("");
        setDate("");
        setPreviewUrl(null);
        setSelectedDepartmentId("");
    };

    const openEditDialog = (doc: Document) => {
        setDocumentToEdit(doc);
        setEditDocumentType(doc.documentType);
        setEditIssuingAuthority(doc.issuingAuthority);
        setEditSubject(doc.subject);
        setEditRefNo(doc.refNo);
        setEditDate(doc.date);
        setIsEditDialogOpen(true);
    };

    const handleEditSubmit = () => {
        if (!documentToEdit) return;

        updateDocument.mutate({
            id: documentToEdit.id,
            data: {
                documentType: editDocumentType,
                issuingAuthority: editIssuingAuthority,
                subject: editSubject,
                refNo: editRefNo,
                date: editDate,
            },
        });
    };

    const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
            if (!allowedTypes.includes(file.type)) {
                toast({
                    variant: "destructive",
                    title: "Invalid file type",
                    description: "Please upload only JPEG, JPG or PNG images",
                });
                e.target.value = '';
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                toast({
                    variant: "destructive",
                    title: "File too large",
                    description: "Please upload an image smaller than 5MB",
                });
                e.target.value = '';
                return;
            }

            try {
                setIsCompressing(true);
                const compressedFile = await compressImage(file);
                setDocumentImage(compressedFile);

                const reader = new FileReader();
                reader.onloadend = () => {
                    setPreviewUrl(reader.result as string);
                    setIsCompressing(false);
                };
                reader.readAsDataURL(compressedFile);
            } catch (error) {
                console.error("Image compression failed:", error);
                setIsCompressing(false);
                toast({
                    variant: "destructive",
                    title: "Image compression failed",
                    description: "Using original image instead.",
                });
                setDocumentImage(file);
                const reader = new FileReader();
                reader.onloadend = () => {
                    setPreviewUrl(reader.result as string);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    // Filter documents
    const filteredDocuments = documents.filter(doc => {
        if (startDate && endDate) {
            const docDate = new Date(doc.date);
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (docDate < start || docDate > end) return false;
        } else if (startDate) {
            const docDate = new Date(doc.date);
            const start = new Date(startDate);
            if (docDate < start) return false;
        } else if (endDate) {
            const docDate = new Date(doc.date);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (docDate > end) return false;
        }

        if (!searchTerm) return true;

        const searchTermLower = searchTerm.toLowerCase();
        return (
            doc.documentType.toLowerCase().includes(searchTermLower) ||
            doc.issuingAuthority.toLowerCase().includes(searchTermLower) ||
            doc.subject.toLowerCase().includes(searchTermLower) ||
            doc.refNo.toLowerCase().includes(searchTermLower) ||
            doc.date.includes(searchTerm) ||
            doc.departmentName.toLowerCase().includes(searchTermLower)
        );
    });

    const sortedDocuments = [...filteredDocuments].sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    // Pagination
    const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPageDocuments = sortedDocuments.slice(startIndex, endIndex);

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const getPageNumbers = () => {
        const pages = [];
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = startPage + maxVisiblePages - 1;

        if (endPage > totalPages) {
            endPage = totalPages;
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        return pages;
    };

    if (isLoading) return <Loading />;

    return (
        <div className="min-h-screen flex flex-col">
            <AdminHeader />
            <div className="p-6 flex-1">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLocation("/admin/dashboard")}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-2xl font-bold">Document Gallery</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search documents..."
                                className="pl-8 w-[300px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                type="date"
                                className="w-[140px]"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                            <span className="text-sm text-muted-foreground">to</span>
                            <Input
                                type="date"
                                className="w-[140px]"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                            {(startDate || endDate) && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setStartDate("");
                                        setEndDate("");
                                        setCurrentPage(1);
                                    }}
                                    className="h-8 w-8"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6 6 18" />
                                        <path d="m6 6 12 12" />
                                    </svg>
                                </Button>
                            )}
                        </div>
                        <Dialog open={isAddingDocument} onOpenChange={setIsAddingDocument}>
                            <DialogTrigger asChild>
                                <Button className="bg-gradient-to-r from-primary to-primary/90 hover:to-primary">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Upload Document
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl">
                                <DialogHeader>
                                    <DialogTitle className="text-xl font-semibold">Upload New Document</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    addDocument.mutate();
                                }} className="pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="documentImage">Document Image <span className="text-red-500">*</span></Label>
                                            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-4 cursor-pointer hover:bg-gray-50 transition-colors h-[400px]"
                                                onClick={() => document.getElementById('documentImage')?.click()}>
                                                <input
                                                    id="documentImage"
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/jpg"
                                                    className="hidden"
                                                    onChange={handleImageChange}
                                                />
                                                {isCompressing ? (
                                                    <div className="flex flex-col items-center text-muted-foreground">
                                                        <FileImage className="h-12 w-12 mb-2 animate-pulse" />
                                                        <p>Compressing image...</p>
                                                    </div>
                                                ) : previewUrl ? (
                                                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                                                        <img
                                                            src={previewUrl}
                                                            alt="Document preview"
                                                            className="w-full h-full object-contain rounded-md max-h-[360px]"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center text-muted-foreground p-4 text-center">
                                                        <FileImage className="h-16 w-16 mb-4 text-gray-300" />
                                                        <p className="font-medium text-lg">Click to upload image</p>
                                                        <p className="text-sm mt-2">JPEG, JPG, PNG allowed</p>
                                                        <p className="text-xs mt-1 text-amber-600">Max size: 5MB</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="department">Department <span className="text-red-500">*</span></Label>
                                                <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId} required>
                                                    <SelectTrigger id="department">
                                                        <SelectValue placeholder="Select department" />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-[300px]">
                                                        {departments.sort((a, b) => a.name.localeCompare(b.name)).map((dept) => (
                                                            <SelectItem key={dept.id} value={dept.id.toString()}>
                                                                {dept.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="documentType">Document Type</Label>
                                                <Select value={documentType} onValueChange={setDocumentType} required>
                                                    <SelectTrigger id="documentType">
                                                        <SelectValue placeholder="Select type" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Office Memo">Office Memo</SelectItem>
                                                        <SelectItem value="Office Order">Office Order</SelectItem>
                                                        <SelectItem value="Circular / Notice">Circular / Notice</SelectItem>
                                                        <SelectItem value="Other Important Document">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="issuingAuthority">Issuing Authority</Label>
                                                <Input
                                                    id="issuingAuthority"
                                                    value={issuingAuthority}
                                                    onChange={(e) => setIssuingAuthority(e.target.value)}
                                                    placeholder="e.g. Finance Officer"
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="subject">Subject</Label>
                                                <Input
                                                    id="subject"
                                                    value={subject}
                                                    onChange={(e) => setSubject(e.target.value)}
                                                    placeholder="Document subject line"
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="refNo">Ref. No. (Digits only)</Label>
                                                <Input
                                                    id="refNo"
                                                    value={refNo}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        if (/^\d*$/.test(value)) {
                                                            setRefNo(value);
                                                        }
                                                    }}
                                                    placeholder="e.g. 1234"
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="date">Dispatch Date</Label>
                                                <Input
                                                    id="date"
                                                    type="date"
                                                    value={date}
                                                    onChange={(e) => setDate(e.target.value)}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button type="button" variant="outline" onClick={() => {
                                            resetForm();
                                            setIsAddingDocument(false);
                                        }}>
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={!documentImage || !documentType || !issuingAuthority || !subject || !refNo || !date || !selectedDepartmentId || addDocument.isPending || isCompressing}
                                        >
                                            {addDocument.isPending ? "Uploading..." : "Upload"}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Active filters indicator */}
                {(startDate || endDate) && (
                    <div className="mb-4 flex items-center gap-2">
                        <span className="text-sm font-medium">Active filters:</span>
                        <div className="flex gap-2 flex-wrap">
                            {startDate && endDate && (
                                <div className="bg-primary/10 text-primary text-xs rounded-full px-3 py-1">
                                    <span>Date: {format(new Date(startDate), "dd MMM yyyy")} to {format(new Date(endDate), "dd MMM yyyy")}</span>
                                </div>
                            )}
                            {startDate && !endDate && (
                                <div className="bg-primary/10 text-primary text-xs rounded-full px-3 py-1">
                                    <span>Date: After {format(new Date(startDate), "dd MMM yyyy")}</span>
                                </div>
                            )}
                            {!startDate && endDate && (
                                <div className="bg-primary/10 text-primary text-xs rounded-full px-3 py-1">
                                    <span>Date: Before {format(new Date(endDate), "dd MMM yyyy")}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {sortedDocuments.length === 0 ? (
                    <div className="text-center py-12">
                        <FileImage className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">No documents found</h3>
                        <p className="mt-1 text-muted-foreground">
                            {searchTerm || startDate || endDate
                                ? "Try adjusting your search terms or date filters"
                                : "Upload your first document to get started"}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {currentPageDocuments.map((doc) => (
                                <div key={doc.id} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group">
                                    {/* Action buttons - visible on hover */}
                                    <div className="absolute top-2 right-2 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            size="icon"
                                            variant="secondary"
                                            className="h-8 w-8 bg-white/90 hover:bg-white shadow"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openEditDialog(doc);
                                            }}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="destructive"
                                            className="h-8 w-8 shadow"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDocumentToDelete(doc);
                                                setIsDeleteDialogOpen(true);
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="aspect-video overflow-hidden bg-gray-100">
                                        <a href={doc.imageUrl} target="_blank" rel="noopener noreferrer">
                                            <img
                                                src={doc.imageUrl}
                                                alt={doc.subject}
                                                className="w-full h-full object-cover hover:scale-105 transition-transform object-top"
                                            />
                                        </a>
                                    </div>
                                    <div className="p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                                                {doc.documentType}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {format(new Date(doc.date), "dd MMM yyyy")}
                                            </span>
                                        </div>
                                        <h3 className="font-medium line-clamp-2 mb-1">{doc.subject}</h3>
                                        <div className="text-sm text-muted-foreground space-y-1">
                                            <p>Authority: {doc.issuingAuthority}</p>
                                            <p>Ref. No.: {doc.refNo}</p>
                                            <p className="text-xs">
                                                Uploaded by: {doc.departmentName} on {format(new Date(doc.uploadedAt), "dd MMM yyyy")}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="mt-8 flex justify-center">
                                <Pagination>
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious
                                                onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                                                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                            />
                                        </PaginationItem>

                                        {currentPage > 2 && totalPages > 5 && (
                                            <>
                                                <PaginationItem>
                                                    <PaginationLink onClick={() => handlePageChange(1)}>1</PaginationLink>
                                                </PaginationItem>
                                                {currentPage > 3 && (
                                                    <PaginationItem>
                                                        <PaginationEllipsis />
                                                    </PaginationItem>
                                                )}
                                            </>
                                        )}

                                        {getPageNumbers().map(page => (
                                            <PaginationItem key={page}>
                                                <PaginationLink
                                                    onClick={() => handlePageChange(page)}
                                                    isActive={page === currentPage}
                                                >
                                                    {page}
                                                </PaginationLink>
                                            </PaginationItem>
                                        ))}

                                        {currentPage < totalPages - 1 && totalPages > 5 && (
                                            <>
                                                {currentPage < totalPages - 2 && (
                                                    <PaginationItem>
                                                        <PaginationEllipsis />
                                                    </PaginationItem>
                                                )}
                                                <PaginationItem>
                                                    <PaginationLink onClick={() => handlePageChange(totalPages)}>
                                                        {totalPages}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            </>
                                        )}

                                        <PaginationItem>
                                            <PaginationNext
                                                onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                                                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        )}

                        <div className="mt-4 text-center text-sm text-muted-foreground">
                            Showing {startIndex + 1}-{Math.min(endIndex, sortedDocuments.length)} of {sortedDocuments.length} documents
                        </div>
                    </>
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Document</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this document? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    {documentToDelete && (
                        <div className="py-4">
                            <p className="font-medium">{documentToDelete.subject}</p>
                            <p className="text-sm text-muted-foreground">Ref. No.: {documentToDelete.refNo}</p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => documentToDelete && deleteDocument.mutate(documentToDelete.id)}
                            disabled={deleteDocument.isPending}
                        >
                            {deleteDocument.isPending ? "Deleting..." : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit Document</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        handleEditSubmit();
                    }} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="editDocumentType">Document Type</Label>
                            <Select value={editDocumentType} onValueChange={setEditDocumentType}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Office Memo">Office Memo</SelectItem>
                                    <SelectItem value="Office Order">Office Order</SelectItem>
                                    <SelectItem value="Circular / Notice">Circular / Notice</SelectItem>
                                    <SelectItem value="Other Important Document">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="editIssuingAuthority">Issuing Authority</Label>
                            <Input
                                id="editIssuingAuthority"
                                value={editIssuingAuthority}
                                onChange={(e) => setEditIssuingAuthority(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="editSubject">Subject</Label>
                            <Input
                                id="editSubject"
                                value={editSubject}
                                onChange={(e) => setEditSubject(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="editRefNo">Ref. No.</Label>
                            <Input
                                id="editRefNo"
                                value={editRefNo}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (/^\d*$/.test(value)) {
                                        setEditRefNo(value);
                                    }
                                }}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="editDate">Dispatch Date</Label>
                            <Input
                                id="editDate"
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                required
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={updateDocument.isPending}>
                                {updateDocument.isPending ? "Saving..." : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
