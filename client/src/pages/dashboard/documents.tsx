import { useState, ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Loading from "@/components/layout/loading";
import { Plus, Search, FileImage, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Document } from "@shared/schema";

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
        
        // Calculate new dimensions - more aggressive scaling
        const aspectRatio = width / height;
        
        // Scale down the image to fit within maxWidthHeight
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
        
        // Add watermark
        if (ctx) {
          // Configure watermark text
          const watermarkText = "Document Gallery, Salary Section";
          ctx.fillStyle = 'rgba(100, 100, 100, 0.2)'; // Reduce opacity for better readability
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          
          // Save context before applying transformations
          ctx.save();
          
          // Translate to center and rotate
          ctx.translate(width / 2, height / 2);
          ctx.rotate(-Math.PI / 8); // Slight adjustment to rotation
          
          // Add text shadow for better readability on various backgrounds
          ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
          ctx.shadowBlur = 2;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          
          // Draw main watermark in center
          ctx.fillText(watermarkText, 0, 0);
          
          // Use larger spacing to avoid overlapping
          // Adjust spacing based on the image size
          const spacingX = Math.max(width / 2, 300); // Ensure minimum spacing
          const spacingY = Math.max(height / 2, 200); // Ensure minimum spacing
          
          // Draw fewer watermarks with better spacing
          // Only add 4 additional watermarks at corners (instead of 8)
          // ctx.fillText(watermarkText, -spacingX/2, -spacingY/2); // Top left
          // ctx.fillText(watermarkText, spacingX/2, -spacingY/2);  // Top right
          // ctx.fillText(watermarkText, -spacingX/2, spacingY/2);  // Bottom left
          // ctx.fillText(watermarkText, spacingX/2, spacingY/2);   // Bottom right
          
          // Restore original context
          ctx.restore();
        }
        
        // Convert to blob and then to File with lower quality
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas to Blob conversion failed'));
              return;
            }
            
            // Create a new file with the same name but compressed
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

export default function Documents() {
  const { toast } = useToast();
  const department = getCurrentDepartment();
  const [isAddingDocument, setIsAddingDocument] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCompressing, setIsCompressing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const itemsPerPage = 20;
  
  // Form state
  const [documentImage, setDocumentImage] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [subject, setSubject] = useState("");
  const [refNo, setRefNo] = useState("");
  const [date, setDate] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Fetch documents either for the current department or all documents
  const { data: documents = [], isLoading } = useQuery<Document[]>({
    // All users should be able to see all documents
    queryKey: [`/api/documents`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/documents`);
      return response.json();
    },
    enabled: !!department?.id
  });

  const addDocument = useMutation({
    mutationFn: async () => {
      if (!documentImage || !documentType || !issuingAuthority || !subject || !refNo || !date) {
        throw new Error("All fields are required");
      }

      const formData = new FormData();
      formData.append("documentImage", documentImage);
      formData.append("documentType", documentType);
      formData.append("issuingAuthority", issuingAuthority);
      formData.append("subject", subject);
      formData.append("refNo", refNo);
      formData.append("date", date);
      
      // Add department info from client-side since session might not work correctly
      if (department) {
        formData.append("departmentId", department.id.toString());
        formData.append("departmentName", department.name);
      }
      
      const response = await apiRequest("POST", "/api/documents", formData, false);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to upload document");
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both queries to ensure data is refreshed
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
      let message = "Failed to upload document";
      
      // Use the error message from the server if available
      if (error.message) {
        message = error.message;
      }
      
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
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
  };

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // More strict check for image file types
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please upload only JPEG, JPG or PNG images",
        });
        // Reset the file input
        e.target.value = '';
        return;
      }
      
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Please upload an image smaller than 5MB",
        });
        // Reset the file input
        e.target.value = '';
        return;
      }
      
      try {
        // Show compression indicator
        setIsCompressing(true);
        
        // Compress the image before setting it
        const compressedFile = await compressImage(file);
        setDocumentImage(compressedFile);
        
        // Create preview URL from the compressed image
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
          setIsCompressing(false); // Hide compression indicator
        };
        reader.readAsDataURL(compressedFile);
        
        // Log compression results
        console.log(`Original size: ${(file.size / 1024).toFixed(2)} KB`);
        console.log(`Compressed size: ${(compressedFile.size / 1024).toFixed(2)} KB`);
        console.log(`Compression ratio: ${((1 - compressedFile.size / file.size) * 100).toFixed(2)}%`);
        
      } catch (error) {
        console.error("Image compression failed:", error);
        setIsCompressing(false);
        
        toast({
          variant: "destructive",
          title: "Image compression failed",
          description: "Using original image instead. The upload may be slower.",
        });
        
        // Fall back to original file if compression fails
        setDocumentImage(file);
        
        // Create preview URL from the original image
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Filter documents based on search term and date range
  const filteredDocuments = documents.filter(doc => {
    // First check if the document falls within the selected date range
    if (startDate && endDate) {
      const docDate = new Date(doc.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      // Set end date to end of day
      end.setHours(23, 59, 59, 999);
      
      if (docDate < start || docDate > end) {
        return false;
      }
    } else if (startDate) {
      const docDate = new Date(doc.date);
      const start = new Date(startDate);
      if (docDate < start) {
        return false;
      }
    } else if (endDate) {
      const docDate = new Date(doc.date);
      const end = new Date(endDate);
      // Set end date to end of day
      end.setHours(23, 59, 59, 999);
      if (docDate > end) {
        return false;
      }
    }
    
    // Then check for search term
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

  // Sort by upload date (newest first)
  const sortedDocuments = [...filteredDocuments].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );

  // Pagination logic
  const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageDocuments = sortedDocuments.slice(startIndex, endIndex);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Generate page numbers for pagination
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
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Document Gallery</h1>
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
                <div className="flex items-center gap-1">
                  <Input
                    type="date"
                    placeholder="From"
                    className="w-[140px]"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCurrentPage(1); // Reset to first page when filter changes
                    }}
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="date"
                    placeholder="To"
                    className="w-[140px]"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setCurrentPage(1); // Reset to first page when filter changes
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
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x">
                        <path d="M18 6 6 18"/>
                        <path d="m6 6 12 12"/>
                      </svg>
                    </Button>
                  )}
                </div>
              </div>
              <Dialog open={isAddingDocument} onOpenChange={setIsAddingDocument}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-primary to-primary/90 hover:to-primary">
                    <Plus className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-semibold">Upload New Document</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    addDocument.mutate();
                  }} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="documentImage">Document Image <span className="text-red-500">*</span></Label>
                      <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-4 cursor-pointer hover:bg-gray-50 transition-colors"
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
                          <div className="relative w-full">
                            <img 
                              src={previewUrl} 
                              alt="Document preview" 
                              className="w-full h-auto rounded-md max-h-[300px] object-contain"
                            />
                            <div className="mt-2 text-center text-sm text-muted-foreground">
                              Click to change image
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center text-muted-foreground p-4">
                            <FileImage className="h-12 w-12 mb-2" />
                            <p className="font-medium">Click to upload document image</p>
                            <p className="text-xs mt-1">Only JPEG, JPG and PNG files are allowed</p>
                            <p className="text-xs mt-1 text-amber-600">Max size: 5MB</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="documentType">Document Type</Label>
                      <Select value={documentType} onValueChange={setDocumentType} required>
                        <SelectTrigger id="documentType">
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Office Memo">Office Memo</SelectItem>
                          <SelectItem value="Office Order">Office Order</SelectItem>
                          <SelectItem value="Circular / Notice">Circular / Notice</SelectItem>
                          <SelectItem value="Other Important Document">Other Important Document</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="issuingAuthority">Issuing Authority</Label>
                      <Input
                        id="issuingAuthority"
                        value={issuingAuthority}
                        onChange={(e) => setIssuingAuthority(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="refNo">Ref. No.</Label>
                      <Input
                        id="refNo"
                        value={refNo}
                        onChange={(e) => setRefNo(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                      />
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
                        disabled={!documentImage || !documentType || !issuingAuthority || !subject || !refNo || !date || addDocument.isPending || isCompressing}
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
                  <div className="bg-primary/10 text-primary text-xs rounded-full px-3 py-1 flex items-center">
                    <span>Date: {format(new Date(startDate), "dd MMM yyyy")} to {format(new Date(endDate), "dd MMM yyyy")}</span>
                  </div>
                )}
                {startDate && !endDate && (
                  <div className="bg-primary/10 text-primary text-xs rounded-full px-3 py-1 flex items-center">
                    <span>Date: After {format(new Date(startDate), "dd MMM yyyy")}</span>
                  </div>
                )}
                {!startDate && endDate && (
                  <div className="bg-primary/10 text-primary text-xs rounded-full px-3 py-1 flex items-center">
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
                  <div key={doc.id} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
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
        </main>
      </div>
    </div>
  );
} 