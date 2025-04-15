import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Loading from "@/components/layout/loading";
import AttendanceForm from "@/components/forms/attendance-form";
import { Plus, Eye, Upload, Trash2, Loader2, FileCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import React from "react";

// Types
interface AttendanceReport {
  id: number;
  departmentId: number;
  month: number;
  year: number;
  status: 'draft' | 'submitted' | 'sent';
  transactionId?: string;
  fileUrl?: string;
  despatchNo?: string;
  despatchDate?: string;
  receiptNo?: number;
  receiptDate?: string;
}

interface DespatchDetails {
  despatchNo: string;
  despatchDate: string;
}

interface AttendanceEntry {
  id: number;
  reportId: number;
  employeeId: number;
  periods: {
    fromDate: string;
    toDate: string;
    days: number;
    remarks: string;
  }[];
}

// Add a new component for PDF dialog content
const PDFDialogContent = ({ 
  report, 
  department, 
  handleUpload, 
  formatDate,
  toast 
}: { 
  report: AttendanceReport;
  department: any; 
  handleUpload: (file: File, reportId: number, despatchDetails?: DespatchDetails) => Promise<any>;
  formatDate: (date: string | Date) => string;
  toast: any;
}) => {
  const [refreshedReport, setRefreshedReport] = React.useState<AttendanceReport>(report);
  
  // State for file handling
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [processedFile, setProcessedFile] = React.useState<File | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Use effect hook at the top level of the component
  React.useEffect(() => {
    const fetchReportDetails = async () => {
      try {
        const response = await fetch(`/api/attendance/${report.id}`);
        if (response.ok) {
          const updatedReport = await response.json();
          console.log("Fetched updated report:", updatedReport);
          setRefreshedReport(updatedReport);
        }
      } catch (error) {
        console.error("Error fetching report details:", error);
      }
    };

    if (!report.fileUrl && report.status === "sent") {
      fetchReportDetails();
    } else {
      setRefreshedReport(report);
    }
  }, [report.id, report.fileUrl, report.status]);

  const currentReport = refreshedReport;

  const getProperFileUrl = (url: string | undefined): string[] => {
    if (!url) return [];
    console.log("Original file URL:", url);
    const possibleUrls = [];
    const fileName = url.split('/').pop();
    if (url.startsWith('/')) {
      possibleUrls.push(`${window.location.origin}${url}`);
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      possibleUrls.push(`${window.location.origin}/${url}`);
    }
    possibleUrls.push(url);
    if (fileName) {
      const baseFileName = fileName.split('.')[0];
      const fileExt = fileName.split('.').pop() || 'pdf';
      possibleUrls.push(`${window.location.origin}/uploads/${fileName}`);
      possibleUrls.push(`/uploads/${fileName}`);
      possibleUrls.push(`${window.location.origin}/api/uploads/${fileName}`);
      possibleUrls.push(`/api/uploads/${fileName}`);
      possibleUrls.push(`${window.location.origin}/uploads/${baseFileName}_*.${fileExt}`);
      possibleUrls.push(`${window.location.origin}/uploads/${baseFileName}*.${fileExt}`);
      const reportId = currentReport.id;
      if (reportId) {
        possibleUrls.push(`${window.location.origin}/uploads/${reportId}_*.${fileExt}`);
        possibleUrls.push(`${window.location.origin}/uploads/report_${reportId}.${fileExt}`);
      }
    }
    const reportId = currentReport.id;
    if (fileName) {
      const fileExt = fileName.split('.').pop() || 'pdf';
      possibleUrls.push(`${window.location.origin}/uploads/*_${reportId}.${fileExt}`);
      possibleUrls.push(`${window.location.origin}/uploads/*${reportId}*.${fileExt}`);
    }
    console.log("Trying these URLs:", possibleUrls);
    return possibleUrls;
  };

  const [fileExists, setFileExists] = React.useState<boolean>(false);
  const [isCheckingFile, setIsCheckingFile] = React.useState<boolean>(true);
  const [workingFileUrl, setWorkingFileUrl] = React.useState<string>('');
  const [errorDetails, setErrorDetails] = React.useState<string>('');

  React.useEffect(() => {
    const checkFileExists = async () => {
      if (!currentReport.fileUrl) {
        setFileExists(false);
        setIsCheckingFile(false);
        setErrorDetails("No file URL provided");
        return;
      }
      setIsCheckingFile(true);
      setErrorDetails('');
      try {
        const possibleUrls = getProperFileUrl(currentReport.fileUrl);
        for (const url of possibleUrls) {
          try {
            console.log(`Checking URL: ${url}`);
            const response = await fetch(url, { method: 'HEAD', cache: 'no-cache', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' } });
            console.log(`Response for ${url}:`, response.status);
            if (response.ok) {
              setFileExists(true);
              setWorkingFileUrl(url);
              console.log("Found working URL:", url);
              return;
            }
          } catch (urlError) {
            console.error(`Error checking URL ${url}:`, urlError);
          }
        }
        try {
          const url = possibleUrls[0];
          const response = await fetch(url);
          if (response.ok && response.headers.get('content-type')?.includes('pdf')) {
            setFileExists(true);
            setWorkingFileUrl(url);
            console.log("Found working URL via GET:", url);
            return;
          }
          const blob = await response.blob();
          console.log("Response blob:", blob.type, blob.size);
          if (blob.type === 'application/pdf' || blob.size > 1000) {
            setFileExists(true);
            setWorkingFileUrl(url);
            return;
          } else {
            setErrorDetails(`Server returned: ${response.status} ${response.statusText}, Content-Type: ${blob.type}, Size: ${blob.size} bytes`);
          }
        } catch (getError) {
          console.error("Error with GET request:", getError);
        }
        setFileExists(false);
        setErrorDetails(`Tried ${possibleUrls.length} URLs, all returned 404 or errors`);
      } catch (error) {
        console.error("Error checking file existence:", error);
        setFileExists(false);
        setErrorDetails(error instanceof Error ? error.message : String(error));
      } finally {
        setIsCheckingFile(false);
      }
    };
    checkFileExists();
  }, [currentReport.fileUrl]);

  // Function to process image files (resize and compress)
  const processImageFile = async (file: File): Promise<File | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event.target?.result) return resolve(null);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null); // Could not get context
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(null);
              const originalName = file.name.substring(0, file.name.lastIndexOf('.') || file.name.length);
              const newFilename = `compressed_${originalName}.jpg`;
              const processedImageFile = new File([blob], newFilename, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(processedImageFile);
            },
            'image/jpeg',
            0.7 // 70% quality
          );
        };
        img.onerror = () => resolve(null); // Image load error
        img.src = event.target.result as string;
      };
      reader.onerror = () => resolve(null); // File read error
      reader.readAsDataURL(file);
    });
  };

  // Handler for file input changes
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
    setProcessedFile(null); // Reset processed file on new selection
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const isAllowedType = allowedTypes.includes(file.type) || fileExtension === 'pdf';

    if (!isAllowedType) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please select a PDF or an image file (JPEG/PNG)."
      });
      if (fileInputRef.current) fileInputRef.current.value = ''; // Clear the input
      setSelectedFile(null);
      return;
    }

    // If it's an image, process it
    if (file.type.startsWith('image/')) {
      setIsProcessing(true);
      toast({ title: "Processing Image", description: "Compressing and resizing...", duration: 2000 });
      try {
        const result = await processImageFile(file);
        if (result) {
          setProcessedFile(result);
          toast({ title: "Processing Complete", description: `Image compressed to ${Math.round(result.size / 1024)} KB.` });
        } else {
          throw new Error("Processing returned null");
        }
      } catch (error) {
        console.error("Image processing error:", error);
        toast({
          variant: "destructive",
          title: "Processing Failed",
          description: "Could not process the image file. Please try another one."
        });
        if (fileInputRef.current) fileInputRef.current.value = ''; // Clear the input on error
        setSelectedFile(null);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  React.useEffect(() => {
    const attemptToFindFile = async () => {
      if (!currentReport.fileUrl && !currentReport.id) return;

      try {
        const response = await fetch('/api/list-files?dir=uploads');
        if (response.ok) {
          const files = await response.json();
          console.log("Files in uploads directory:", files);

          const reportId = currentReport.id;
          const possibleFiles = files.filter((file: string) => {
            return file.includes(`${reportId}`) || 
                   (currentReport.fileUrl && file.includes(currentReport.fileUrl.split('/').pop() || ''));
          });

          if (possibleFiles.length > 0) {
            console.log("Possible matching files:", possibleFiles);
            const mostLikelyFile = possibleFiles[0];
            const fileUrl = `/uploads/${mostLikelyFile}`;
            setWorkingFileUrl(fileUrl);
            setFileExists(true);
          }
        } else {
          console.log("Could not list files in uploads directory");
        }
      } catch (error) {
        console.error("Error listing files:", error);
      }
    };

    // Only attempt if file isn't already found by URL check
    if (!fileExists && isCheckingFile === false) {
       attemptToFindFile();
    }
  }, [currentReport.id, currentReport.fileUrl, fileExists, isCheckingFile]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {currentReport.fileUrl && fileExists ? "View Signed Attendance Report" : "Upload Signed Attendance Report"}
        </DialogTitle>
        <DialogDescription>
          {currentReport.fileUrl && fileExists
            ? "Review the uploaded signed attendance report file."
            : currentReport.fileUrl && !fileExists
              ? "The report file could not be found. Please upload it again."
              : "Upload the signed PDF or image version of this attendance report and provide despatch details."}
        </DialogDescription>
      </DialogHeader>

      {currentReport.fileUrl && fileExists ? (
        <>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              <p>
                <strong>Despatch No:</strong> {currentReport.despatchNo}
              </p>
              <p>
                <strong>Despatch Date:</strong>{" "}
                {formatDate(currentReport.despatchDate!)}
              </p>
            </div>
          </div>
          <div className="w-full h-[600px] border rounded-lg overflow-hidden">
            {workingFileUrl ? (
              workingFileUrl.toLowerCase().endsWith('.pdf') ? (
                <object
                  data={workingFileUrl}
                  type="application/pdf"
                  className="w-full h-full"
                >
                  <div className="p-4 text-center">
                    <p className="mb-4">
                      Unable to display PDF in browser.
                    </p>
                    <a
                      href={workingFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
                    >
                      Open PDF in new tab
                    </a>
                  </div>
                </object>
              ) : (
                 <img src={workingFileUrl} alt="Uploaded Report Document" className="w-full h-full object-contain" />
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="mb-6 text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2">File Not Found</h3>
                <p className="text-muted-foreground mb-4">
                  The file could not be loaded. It may have been deleted or moved.
                </p>
                {isCheckingFile ? (
                  <div className="flex items-center justify-center mb-4">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Checking file locations...</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          const urls = getProperFileUrl(currentReport.fileUrl);
                          if (urls.length > 0) {
                            window.open(urls[0], '_blank');
                          }
                        }}
                      >
                        Try Opening in New Tab
                      </Button>
                      <Button 
                        variant="default" 
                        onClick={() => {
                          const rerequestFile = async () => {
                            try {
                              const response = await fetch(`/api/attendance/${currentReport.id}`);
                              if (response.ok) {
                                const updatedReport = await response.json();
                                setRefreshedReport(updatedReport);
                                // Re-trigger checkFileExists
                                setIsCheckingFile(true);
                                setFileExists(false); // Reset state to force re-check
                              }
                            } catch (error) {
                              console.error("Error requesting file:", error);
                            }
                          };
                          rerequestFile();
                        }}
                      >
                        Refresh File Status
                      </Button>
                    </div>
                    
                    {errorDetails && (
                      <div className="mt-4 text-left w-full">
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground">Show technical details</summary>
                          <div className="mt-2 p-3 bg-gray-50 rounded border text-xs font-mono overflow-auto max-h-32">
                            <p>File URL: {currentReport.fileUrl}</p>
                            <p>Error: {errorDetails}</p>
                          </div>
                        </details>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <form className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <label htmlFor="despatchNo" className="text-sm font-medium">
                Despatch No
              </label>
              <Input
                id="despatchNo"
                placeholder="Enter despatch number"
                defaultValue={report.despatchNo}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="despatchDate" className="text-sm font-medium">
                Despatch Date
              </label>
              <Input 
                id="despatchDate" 
                type="date" 
                defaultValue={report.despatchDate ? new Date(report.despatchDate).toISOString().split('T')[0] : undefined}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="pdfOrImageFile" className="text-sm font-medium">
                PDF or Image File
              </label>
              <Input 
                ref={fileInputRef}
                id="pdfOrImageFile" 
                type="file" 
                accept=".pdf,application/pdf,image/jpeg,image/png,image/jpg" 
                className="cursor-pointer"
                onChange={handleFileChange}
              />
              {isProcessing && (
                <div className="flex items-center text-sm text-muted-foreground mt-2">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing image...
                </div>
              )}
              {processedFile && (
                <div className="text-sm text-green-600 mt-2">
                  Processed Image Ready: {processedFile.name} ({Math.round(processedFile.size / 1024)} KB)
                </div>
              )}
              {!processedFile && selectedFile && selectedFile.type.startsWith('application/pdf') && (
                 <div className="text-sm text-blue-600 mt-2">
                   PDF Selected: {selectedFile.name}
                 </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              onClick={async (e) => {
                e.preventDefault();
                const form = e.currentTarget.closest("form");
                if (form) {
                  try {
                    const despatchNoInput = form.querySelector("#despatchNo") as HTMLInputElement;
                    const despatchDateInput = form.querySelector("#despatchDate") as HTMLInputElement;
                    
                    const fileToUpload = processedFile || selectedFile;
                    
                    const despatchNo = despatchNoInput?.value || report.despatchNo || '';
                    const despatchDate = despatchDateInput?.value || (report.despatchDate ? new Date(report.despatchDate).toISOString().split('T')[0] : '');

                    if (!fileToUpload || !despatchNo || !despatchDate) {
                      toast({
                        variant: "destructive",
                        title: "Error",
                        description: "Please fill in all fields and select a file",
                      });
                      return;
                    }
                    
                    const button = e.currentTarget;
                    const originalText = button.innerHTML;
                    button.innerHTML = '<span class="animate-spin mr-2">⏳</span> Uploading...';
                    button.disabled = true;
                    
                    try {
                      const result = await handleUpload(fileToUpload, report.id, {
                        despatchNo,
                        despatchDate,
                      });
                      
                      await queryClient.refetchQueries({ 
                        queryKey: [`/api/departments/${department?.id}/attendance`] 
                      });
                      
                      const closeButton = document.querySelector("[data-dialog-close]");
                      if (closeButton instanceof HTMLButtonElement) {
                        closeButton.click();
                      }
                      
                      setTimeout(() => {
                        window.location.reload();
                      }, 500);
                    } catch (uploadError) {
                      console.error("Upload error:", uploadError);
                      button.innerHTML = originalText;
                      button.disabled = false;
                    }
                  } catch (error) {
                    console.error("Error in form submission:", error);
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: "An unexpected error occurred"
                    });
                    
                    const button = e.currentTarget;
                    if (button.disabled) {
                       button.innerHTML = '<span>Submit</span>';
                       button.disabled = false;
                    }
                  }
                }
              }}
            >
              <span>Submit</span>
            </Button>
          </DialogFooter>
        </form>
      )}
    </>
  );
};

export default function Attendance() {
  const { toast } = useToast();
  const department = getCurrentDepartment();
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const { data: reports = [], isLoading } = useQuery<AttendanceReport[]>({
    queryKey: [`/api/departments/${department?.id}/attendance`],
    // Sort reports by receiptNo in descending order
    select: (data) => {
      if (!Array.isArray(data)) return [];
      // Sort a shallow copy to avoid potential mutation issues
      return [...data].sort((a, b) => { 
        const aValue = a.receiptNo ?? -Infinity; // Treat null/undefined as lowest
        const bValue = b.receiptNo ?? -Infinity;
        return bValue - aValue; // Descending order
      });
    },
  });

  const { data: entries = [], isLoading: loadingEntries } = useQuery<AttendanceEntry[]>({
    queryKey: [`/api/attendance/${selectedReport}/entries`],
    enabled: !!selectedReport,
    select: (data: any) => Array.isArray(data) ? data : [],
  });

  const createReport = useMutation({
    mutationFn: async (data: any) => {
      const formattedData = {
        departmentId: department?.id,
        month: parseInt(data.month),
        year: parseInt(data.year),
        status: "draft",
      };

      const response = await apiRequest(
        "POST",
        `/api/departments/${department?.id}/attendance`,
        formattedData,
      );

      const report = await response.json();

      for (const entry of data.entries) {
        if (!entry.periods || entry.periods.length === 0) continue;

        const periods = entry.periods.map((period: any) => ({
          fromDate: period.fromDate,
          toDate: period.toDate,
          days: period.days,
          remarks: period.remarks || "",
        }));

        await apiRequest("POST", `/api/attendance/${report.id}/entries`, {
          employeeId: entry.employeeId,
          periods,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/departments/${department?.id}/attendance`],
      });
      setIsCreatingReport(false);
      toast({
        title: "Success",
        description: "Attendance report created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create attendance report",
      });
    },
  });

  const handleUpload = async (
    file: File,
    reportId: number,
    despatchDetails?: DespatchDetails,
  ) => {
    try {
      console.log("Starting PDF upload for report", reportId);
      
      // Based on server code examination, the server uses multer with the following format:
      // file.fieldname + '-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + original extension
      // The fieldname is "file" for single file uploads
      // We'll use the standard FormData to let the server handle naming as it normally does
      
      const formData = new FormData();
      formData.append("file", file);
      
      console.log("Uploading PDF file using native FormData");
      console.log("Original file name:", file.name);
      
      const uploadResponse = await fetch(`/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        console.error("General upload failed with status:", uploadResponse.status);
        const errorText = await uploadResponse.text();
        console.error("Upload error response:", errorText);
        throw new Error("Failed to upload PDF file");
      }

      // Parse the upload response to get the file URL
      const uploadData = await uploadResponse.json();
      console.log("Complete upload response:", uploadData);
      
      // Extract the server-generated filename from the response
      // The server might return either { fileUrl: "/uploads/filename" } or { imageUrl: "/uploads/filename" }
      let fileUrlToSave = '';
      
      if (uploadData?.fileUrl) {
        fileUrlToSave = uploadData.fileUrl;
        console.log("Found fileUrl in response:", fileUrlToSave);
      } else if (uploadData?.imageUrl) {
        fileUrlToSave = uploadData.imageUrl;
        console.log("Found imageUrl in response:", fileUrlToSave);
      } else {
        // Try a few common fields from server response
        const possibleFields = ['url', 'path', 'file', 'filePath', 'location'];
        
        for (const field of possibleFields) {
          if (uploadData && uploadData[field]) {
            fileUrlToSave = uploadData[field];
            console.log(`Found alternative field "${field}" in response:`, fileUrlToSave);
            break;
          }
        }
        
        // If we still don't have a URL, check if uploadData itself is a string URL
        if (!fileUrlToSave && typeof uploadData === 'string' && (uploadData.startsWith('/') || uploadData.startsWith('http'))) {
          fileUrlToSave = uploadData;
          console.log("Response appears to be a direct URL string:", fileUrlToSave);
        }
        
        // Last resort: Log the issue if no URL is found. An error will be thrown later if fileUrlToSave is still empty.
        if (!fileUrlToSave) {
          console.error("Server response doesn't contain recognizable URL fields:", uploadData);
        }
      }
      
      if (!fileUrlToSave) {
        throw new Error("Server did not return a recognizable file URL");
      }
      
      console.log("Final URL to use:", fileUrlToSave);
      
      // Verify the file is accessible at the exact URL the server provided
      try {
        const verifyResponse = await fetch(fileUrlToSave, { 
          method: 'HEAD',
          cache: 'no-cache'
        });
        
        console.log("File verification response:", verifyResponse.status);
        
        if (!verifyResponse.ok) {
          console.warn("Warning: Could not verify file at the server URL. Status:", verifyResponse.status);
        } else {
          console.log("Successfully verified file exists at server URL");
        }
      } catch (error) {
        console.error("Error verifying file existence:", error);
      }
      
      // Step 2: Now update the attendance report with our consistent filename URL
      console.log("Updating attendance report with consistent URL:", fileUrlToSave);
      
      // Update the updatePayload to use this URL
      const updatePayload = {
        status: "sent",
        fileUrl: fileUrlToSave,
        despatchNo: despatchDetails?.despatchNo || '',
        despatchDate: despatchDetails?.despatchDate ? new Date(despatchDetails.despatchDate) : new Date(),
        receiptDate: new Date(),
      };
      
      console.log("Update payload:", JSON.stringify(updatePayload));
      
      const updateResponse = await fetch(`/api/attendance/${reportId}`, {
        method: "PATCH",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        console.error("Report update failed with status:", updateResponse.status);
        const errorText = await updateResponse.text();
        console.error("Update error response:", errorText);
        throw new Error("Failed to update report with file URL");
      }

      const updateData = await updateResponse.json();
      console.log("Report updated successfully:", updateData);

      // Update local state
      setUploadedPdfUrl(fileUrlToSave);
      setSelectedReport(reportId);

      // Force a refetch of the reports data to ensure UI is updated
      await queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      await queryClient.refetchQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      
      toast({
        title: "Success",
        description: "PDF uploaded successfully",
      });

      return { fileUrl: fileUrlToSave, report: updateData };
    } catch (error) {
      console.error("Error in handleUpload:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload PDF",
      });
      throw error;
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatPeriod = (year: number, month: number) => {
    return new Date(year, month - 1).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "default";
      case "submitted":
        return "secondary";
      case "sent":
        return "success";
      default:
        return "default";
    }
  };

  const deleteAttendance = useMutation({
    mutationFn: async (reportId: number) => {
      await apiRequest("DELETE", `/api/attendance/${reportId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "Attendance report deleted",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete attendance report",
      });
    },
  });

  const changeStatus = useMutation({
    mutationFn: async (report: AttendanceReport) => {
      await apiRequest("PATCH", `/api/attendance/${report.id}`, { status: "submitted" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "Report submitted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit report",
      });
    },
  });

  if (isLoading || loadingEntries) return <Loading />;

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Attendance Reports</h1>
            <Dialog open={isCreatingReport} onOpenChange={setIsCreatingReport}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-primary/90 hover:to-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Report
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-7xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle className="text-xl font-semibold">Create Attendance Report</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto flex-grow pr-1">
                  <AttendanceForm
                    onSubmit={async (data) => {
                      try {
                        await createReport.mutateAsync(data);
                        setIsCreatingReport(false);
                      } catch (error) {
                        console.error("Failed to create report:", error);
                      }
                    }}
                    isLoading={createReport.isPending}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rec. No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Despatch Details</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports?.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      {report.receiptNo || "-"}
                    </TableCell>
                    <TableCell>
                      {report.receiptDate ? formatDate(report.receiptDate) : "-"}
                    </TableCell>
                    <TableCell>
                      {formatPeriod(report.year, report.month)}
                    </TableCell>
                    <TableCell>
                      {report.transactionId || "Not generated"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getStatusColor(report.status)}
                        className={report.status === "sent" ? "font-bold text-green-600" : ""}
                      >
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {report.status === "sent" && report.despatchNo ? (
                        <div className="text-sm">
                          <p>
                            <span className="font-medium">No:</span> {report.despatchNo}
                          </p>
                          <p>
                            <span className="font-medium">Date:</span>{" "}
                            {formatDate(report.despatchDate!)}
                          </p>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {report.status === "draft" && (
                          <>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Delete Report</DialogTitle>
                                  <DialogDescription>
                                    Are you sure you want to delete this
                                    attendance report? This action cannot be
                                    undone.
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                  <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                  </DialogClose>
                                  <Button
                                    variant="destructive"
                                    onClick={() => deleteAttendance.mutate(report.id)}
                                    disabled={deleteAttendance.isPending}
                                  >
                                    {deleteAttendance.isPending ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Deleting...
                                      </>
                                    ) : (
                                      <>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                      </>
                                    )}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <Button
                              size="sm"
                              onClick={() => changeStatus.mutate(report)}
                              disabled={changeStatus.isPending}
                            >
                              {changeStatus.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <FileCheck className="h-4 w-4 mr-2" />
                              )}
                              Finalize
                            </Button>
                          </>
                        )}
                        {report.status !== "draft" && (
                          <>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" title={report.fileUrl || report.status === "sent" ? "View Signed Attendance Report" : "Upload Signed Attendance Report"}>
                                  {report.fileUrl || report.status === "sent" ? (
                                    <>
                                      <Eye className="h-4 w-4 mr-2" /> View Signed Report
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="h-4 w-4 mr-2" /> Upload Signed Report
                                    </>
                                  )}
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <PDFDialogContent 
                                  report={report}
                                  department={department}
                                  handleUpload={handleUpload}
                                  formatDate={formatDate}
                                  toast={toast}
                                />
                              </DialogContent>
                            </Dialog>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setLocation(`/dashboard/reports/${report.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                              View Details
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </main>
      </div>
    </div>
  );
}