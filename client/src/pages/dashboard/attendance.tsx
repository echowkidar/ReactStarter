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
  status: 'draft' | 'submitted' | 'sent' | 'cancel_requested' | 'cancelled' | 'recall_requested';
  transactionId?: string;
  fileUrl?: string;
  despatchNo?: string;
  despatchDate?: string;
  receiptNo?: number;
  receiptDate?: string;
  cancelRequestedAt?: string;
  cancelledAt?: string;
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
            const response = await fetch(url, { method: 'HEAD', cache: 'no-cache', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' } });
            if (response.ok) {
              setFileExists(true);
              setWorkingFileUrl(url);
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
            return;
          }
          const blob = await response.blob();
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

          const reportId = currentReport.id;
          const possibleFiles = files.filter((file: string) => {
            return file.includes(`${reportId}`) ||
              (currentReport.fileUrl && file.includes(currentReport.fileUrl.split('/').pop() || ''));
          });

          if (possibleFiles.length > 0) {
            const mostLikelyFile = possibleFiles[0];
            const fileUrl = `/uploads/${mostLikelyFile}`;
            setWorkingFileUrl(fileUrl);
            setFileExists(true);
          }
        } else {
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
  const [cancelDialogReportId, setCancelDialogReportId] = useState<number | null>(null);
  const [recallDialogReportId, setRecallDialogReportId] = useState<number | null>(null);

  // Check if cancellation is allowed (only before 23rd of each month)
  const today = new Date();
  const canRequestCancellation = today.getDate() <= 23;


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

      // Based on server code examination, the server uses multer with the following format:
      // file.fieldname + '-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + original extension
      // The fieldname is "file" for single file uploads
      // We'll use the standard FormData to let the server handle naming as it normally does

      const formData = new FormData();
      formData.append("file", file);


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

      // Extract the server-generated filename from the response
      // The server might return either { fileUrl: "/uploads/filename" } or { imageUrl: "/uploads/filename" }
      let fileUrlToSave = '';

      if (uploadData?.fileUrl) {
        fileUrlToSave = uploadData.fileUrl;
      } else if (uploadData?.imageUrl) {
        fileUrlToSave = uploadData.imageUrl;
      } else {
        // Try a few common fields from server response
        const possibleFields = ['url', 'path', 'file', 'filePath', 'location'];

        for (const field of possibleFields) {
          if (uploadData && uploadData[field]) {
            fileUrlToSave = uploadData[field];
            break;
          }
        }

        // If we still don't have a URL, check if uploadData itself is a string URL
        if (!fileUrlToSave && typeof uploadData === 'string' && (uploadData.startsWith('/') || uploadData.startsWith('http'))) {
          fileUrlToSave = uploadData;
        }

        // Last resort: Log the issue if no URL is found. An error will be thrown later if fileUrlToSave is still empty.
        if (!fileUrlToSave) {
          console.error("Server response doesn't contain recognizable URL fields:", uploadData);
        }
      }

      if (!fileUrlToSave) {
        throw new Error("Server did not return a recognizable file URL");
      }


      // Verify the file is accessible at the exact URL the server provided
      try {
        const verifyResponse = await fetch(fileUrlToSave, {
          method: 'HEAD',
          cache: 'no-cache'
        });


        if (!verifyResponse.ok) {
          console.warn("Warning: Could not verify file at the server URL. Status:", verifyResponse.status);
        } else {
        }
      } catch (error) {
        console.error("Error verifying file existence:", error);
      }

      // Step 2: Now update the attendance report with our consistent filename URL

      // Update the updatePayload to use this URL
      const updatePayload = {
        status: "sent",
        fileUrl: fileUrlToSave,
        despatchNo: despatchDetails?.despatchNo || '',
        despatchDate: despatchDetails?.despatchDate ? new Date(despatchDetails.despatchDate) : new Date(),
        receiptDate: new Date(),
      };


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
      case "cancel_requested":
      case "recall_requested":
        return "outline"; // Yellow/orange indicator
      case "cancelled":
        return "destructive";
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/attendance/${variables.id}`] });
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

  const requestCancellation = useMutation({
    mutationFn: async (reportId: number) => {
      await apiRequest("POST", `/api/attendance/${reportId}/request-cancel`);
    },
    onSuccess: () => {
      setCancelDialogReportId(null); // Close the dialog
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "Cancellation request sent to admin",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to request cancellation",
      });
    },
  });

  // Request Recall mutation
  const requestRecall = useMutation({
    mutationFn: async (reportId: number) => {
      await apiRequest("POST", `/api/attendance/${reportId}/request-recall`);
    },
    onSuccess: () => {
      setRecallDialogReportId(null);
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "Recall request sent to admin",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to request recall",
      });
    },
  });

  const [editingReportData, setEditingReportData] = useState<any>(null);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);

  const editReport = useMutation({
    mutationFn: async ({ reportId, data }: { reportId: number; data: any }) => {

      // 1. Update report metadata (month, year)
      await apiRequest("PATCH", `/api/attendance/${reportId}`, {
        month: parseInt(data.month),
        year: parseInt(data.year),
      });

      // 2. Clear existing entries completely
      await apiRequest("POST", `/api/attendance/${reportId}/clear-entries`);

      // 3. Re-create entries
      for (const entry of data.entries) {
        if (!entry.periods || entry.periods.length === 0) continue;

        const periods = entry.periods.map((period: any) => ({
          fromDate: period.fromDate,
          toDate: period.toDate,
          days: period.days,
          remarks: period.remarks || "",
        }));

        await apiRequest("POST", `/api/attendance/${reportId}/entries`, {
          employeeId: entry.employeeId,
          periods,
        });
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate the general list
      queryClient.invalidateQueries({
        queryKey: [`/api/departments/${department?.id}/attendance`],
      });
      // Invalidate the specific report entries (CRITICAL for View Details to show new data)
      queryClient.invalidateQueries({
        queryKey: [`/api/attendance/${variables.reportId}/entries`],
      });
      // Invalidate specific report details
      queryClient.invalidateQueries({
        queryKey: [`/api/attendance/${variables.reportId}`],
      });
      // Invalidate admin report details (used by report-details page)
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/attendance/${variables.reportId}`],
      });

      setIsCreatingReport(false);
      setEditingReportData(null);
      setEditingReportId(null);
      toast({
        title: "Success",
        description: "Attendance report updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("[editReport] Error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update attendance report",
      });
    },
  });

  const handleEditClick = async (report: AttendanceReport) => {
    try {
      // Fetch entries for this report
      const res = await apiRequest("GET", `/api/attendance/${report.id}/entries`);
      const entries = await res.json();

      // Parse JSON periods if they are strings (schema says periods is text/JSON)
      const parsedEntries = entries.map((entry: any) => ({
        ...entry,
        periods: typeof entry.periods === 'string' ? JSON.parse(entry.periods) : entry.periods
      }));

      const formData = {
        month: String(report.month),
        year: String(report.year),
        entries: parsedEntries.map((entry: any) => ({
          employeeId: entry.employeeId,
          periods: entry.periods
        }))
      };

      setEditingReportId(report.id);
      setEditingReportData(formData);
      setIsCreatingReport(true);
    } catch (error) {
      console.error("Failed to fetch report details for editing", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load report details",
      });
    }
  };



  // Calculate deadline countdown (reusing 'today' from above)
  const deadlineDay = 15;
  const currentDay = today.getDate();
  const daysRemaining = deadlineDay - currentDay;
  const isPastDeadline = currentDay > deadlineDay;


  // Check if department is permitted to create reports
  const { data: attendanceStatus } = useQuery<{ permitted: boolean; allowSupplementaryReport: boolean; daysRemaining: number; isPastDeadline: boolean }>({
    queryKey: [`/api/departments/${department?.id}/attendance-status`],
    enabled: !!department?.id,
  });

  // Check if a report already exists for the current month (and is not cancelled)
  // Note: 'today' is defined above
  const currentMonthYear = today.getFullYear();
  const currentMonthIdx = today.getMonth() + 1;
  const existingReport = reports?.find(r => r.year === currentMonthYear && r.month === currentMonthIdx && r.status !== 'cancelled');

  // Logic for canCreateReport:
  // 1. If department is explicitly permitted by admin (permitted === true): ignore deadline
  // 2. If department is NOT permitted (permitted === false): ALWAYS disable (regardless of deadline)
  // 3. If permitted is undefined (loading/error): respect deadline as fallback
  // 
  // ADDITIONALLY: If existingReport exists, check allowSupplementaryReport
  const canCreateReport = attendanceStatus?.permitted === true
    ? (!existingReport || attendanceStatus?.allowSupplementaryReport) // Permitted: ignore deadline, check if report exists OR supp allowed
    : attendanceStatus?.permitted === false
      ? false  // Explicitly NOT permitted: always disable
      : (!isPastDeadline && (!existingReport || attendanceStatus?.allowSupplementaryReport));  // Undefined/loading: respect deadline, check existing report OR supp allowed

  // Override canRequestCancellation: allow if permitted OR before 23rd
  // Note: canRequestCancellation was initially defined above as today.getDate() <= 23
  // Now we override it to also allow when department has special permission
  const canRequestCancellationFinal = canRequestCancellation || attendanceStatus?.permitted === true;

  if (isLoading || loadingEntries) return <Loading />;

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          {/* Countdown Banner - show when permitted OR when deadline has passed */}
          {(attendanceStatus?.permitted !== false || isPastDeadline) && (
            <div className={`mb-4 p-3 rounded-lg flex items-center justify-between ${isPastDeadline
              ? (attendanceStatus?.permitted === true
                ? 'bg-green-100 border border-green-300 text-green-800'  // Permitted after deadline - show green
                : 'bg-red-100 border border-red-300 text-red-800')
              : daysRemaining <= 5
                ? 'bg-orange-100 border border-orange-300 text-orange-800'
                : 'bg-blue-100 border border-blue-300 text-blue-800'
              }`}>
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                {isPastDeadline ? (
                  <span className="font-medium">
                    {attendanceStatus?.permitted === true
                      ? "⚠️ Deadline passed! Attendance report submission deadline was 15th. (Special permission granted)"
                      : "⚠️ Deadline passed! Attendance report submission deadline was 15th."
                    }
                  </span>
                ) : (
                  <span className="font-medium">
                    {daysRemaining === 0
                      ? "🔔 Today is the last day to submit attendance report!"
                      : `⏳ ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} remaining to submit attendance report (Deadline: 15th)`
                    }
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Existing Report Warning Banner */}
          {existingReport && !isPastDeadline && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 flex items-center gap-2">
              <span className="text-xl">ℹ️</span>
              <span className="font-medium">
                You have already created a report for this month ({existingReport.status}).
                {existingReport.status === 'draft' && " Please delete the existing draft to create a new one."}
                {(existingReport.status === 'submitted' || existingReport.status === 'recall_requested') && " Please recall the report to modify it."}
                {existingReport.status === 'sent' && " Please request cancellation to create a new one."}
              </span>
            </div>
          )}

          {/* Permission blocked message - only show BEFORE deadline passes */}
          {attendanceStatus?.permitted === false && !isPastDeadline && (
            <div className="mb-4 p-4 bg-orange-50 border border-orange-300 rounded-lg text-orange-800">
              <span className="font-medium">⚠️ Currently, the facility to submit attendance reports is not available.</span>
            </div>
          )}

          {/* Supplementary Report Allowed Banner */}
          {attendanceStatus?.allowSupplementaryReport && existingReport && (
            <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 flex items-center gap-2">
              <span className="text-xl">✨</span>
              <span className="font-medium">
                You have been granted one-time permission to create a supplementary attendance report for this month.
              </span>
            </div>
          )}


          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Attendance Reports</h1>
            <Dialog open={isCreatingReport} onOpenChange={setIsCreatingReport}>
              <DialogTrigger asChild>
                <Button
                  className="bg-gradient-to-r from-primary to-primary/90 hover:to-primary"
                  disabled={!canCreateReport}
                  title={
                    !canCreateReport
                      ? (existingReport
                        ? (existingReport.status === 'draft' ? "Draft report already exists. Please delete it to create new."
                          : existingReport.status === 'submitted' || existingReport.status === 'recall_requested' ? "Report submitted. Use 'Recall' to modify."
                            : attendanceStatus?.allowSupplementaryReport ? "Create Supplementary Report" : "Report sent. Request cancellation to recreate or ask Admin for supplementary permission.")
                        : (isPastDeadline && attendanceStatus?.permitted !== true)
                          ? "Deadline passed"
                          : "Attendance submission disabled")
                      : (existingReport ? "Create Supplementary Report" : "Create new report")
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Report
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-[95vw] w-[1400px] max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle className="text-xl font-semibold">
                    {editingReportId ? "Edit Attendance Report" : "Create Attendance Report"}
                  </DialogTitle>
                </DialogHeader>
                <div className="overflow-auto flex-grow pr-1">

                  <AttendanceForm
                    onSubmit={async (data) => {
                      try {
                        if (editingReportId) {
                          await editReport.mutateAsync({ reportId: editingReportId, data });
                        } else {
                          await createReport.mutateAsync(data);
                        }
                      } catch (error) {
                        console.error("Failed to create/update report:", error);
                      }
                    }}
                    isLoading={createReport.isPending || editReport.isPending}
                    initialData={editingReportData}
                    isSupplementary={!!(existingReport && attendanceStatus?.allowSupplementaryReport)}
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
                      {(report.status === "sent" || report.status === "cancelled" || report.status === "cancel_requested") && report.despatchNo ? (
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
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditClick(report)}
                              title="Edit Report"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
                              </svg>
                            </Button>
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
                          </>
                        )}
                        {/* Request to Cancel button for sent reports - only for CURRENT MONTH and (before 23rd OR with special permission) */}
                        {report.status === "sent" && canRequestCancellationFinal && report.year === currentMonthYear && report.month === currentMonthIdx && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-orange-600 border-orange-300 hover:bg-orange-50"
                              onClick={() => setCancelDialogReportId(report.id)}
                            >
                              Request to Cancel
                            </Button>
                            <Dialog open={cancelDialogReportId === report.id} onOpenChange={(open) => !open && setCancelDialogReportId(null)}>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Request Cancellation</DialogTitle>
                                  <DialogDescription>
                                    Are you sure you want to request cancellation of this report?
                                    This will send a request to the admin for approval.
                                    The entries will be deleted but the PDF and receipt number will be preserved.
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setCancelDialogReportId(null)}>Cancel</Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => requestCancellation.mutate(report.id)}
                                    disabled={requestCancellation.isPending}
                                  >
                                    {requestCancellation.isPending ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Requesting...
                                      </>
                                    ) : (
                                      "Request Cancellation"
                                    )}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </>
                        )}
                        {/* Show when cancellation not allowed (after 23rd AND no special permission) - ONLY for current month */}
                        {report.status === "sent" && !canRequestCancellationFinal && report.year === currentMonthYear && report.month === currentMonthIdx && (
                          <span className="text-xs text-gray-500">
                            Cancel N/A after 23rd
                          </span>
                        )}
                        {/* Request Recall for Submitted reports */}
                        {report.status === "submitted" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-yellow-600 border-yellow-300 hover:bg-yellow-50"
                              onClick={() => setRecallDialogReportId(report.id)}
                            >
                              Request Recall
                            </Button>
                            <Dialog open={recallDialogReportId === report.id} onOpenChange={(open) => !open && setRecallDialogReportId(null)}>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Request Recall</DialogTitle>
                                  <DialogDescription>
                                    Are you sure you want to recall this submitted report?
                                    This will send a request to the admin to revert it to draft status, allowing you to modify it.
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setRecallDialogReportId(null)}>Cancel</Button>
                                  <Button
                                    variant="default"
                                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                                    onClick={() => requestRecall.mutate(report.id)}
                                    disabled={requestRecall.isPending}
                                  >
                                    {requestRecall.isPending ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Requesting...
                                      </>
                                    ) : (
                                      "Request Recall"
                                    )}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </>
                        )}
                        {report.status === "recall_requested" && (
                          <span className="text-sm font-medium text-yellow-600">
                            ⏳ Recall Pending
                          </span>
                        )}
                        {/* Show status for cancel_requested and cancelled */}
                        {report.status === "cancel_requested" && (
                          <span className="text-sm font-medium text-orange-600">
                            ⏳ Cancellation Pending
                          </span>
                        )}
                        {report.status === "cancelled" && (
                          <span className="text-sm font-medium text-green-600">
                            ✅ Cancellation Accepted
                          </span>
                        )}

                        {/* View Details button - hidden for cancelled reports */}
                        {report.status !== "cancelled" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/dashboard/reports/${report.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {report.status === "submitted" || report.status === "sent"
                              ? "View / Print Report"
                              : "View Details"}
                          </Button>
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