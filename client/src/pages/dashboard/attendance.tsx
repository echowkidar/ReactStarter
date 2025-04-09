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
      // FIXED APPROACH: First upload the file using the general file upload endpoint
      // which is known to work correctly with other uploads
      console.log("Starting PDF upload for report", reportId);
      
      // Step 1: Upload the file to the general upload endpoint
      const formData = new FormData();
      formData.append("file", file);
      
      console.log("Uploading PDF file to general upload endpoint");
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
      console.log("Upload successful, received URL:", uploadData.fileUrl);
      
      // Step 2: Now update the attendance report with the file URL
      console.log("Updating attendance report with file URL");
      const updateResponse = await fetch(`/api/attendance/${reportId}`, {
        method: "PATCH",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: "sent",
          fileUrl: uploadData.fileUrl,
          despatchNo: despatchDetails?.despatchNo,
          despatchDate: despatchDetails?.despatchDate ? new Date(despatchDetails.despatchDate) : undefined,
          receiptDate: new Date(),
        }),
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
      setUploadedPdfUrl(uploadData.fileUrl);
      setSelectedReport(reportId);

      // Update local state with the new data
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "PDF uploaded successfully",
      });

      return { fileUrl: uploadData.fileUrl, report: updateData };
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
                                <Button variant="outline" size="sm">
                                  {report.fileUrl ? (
                                    <>
                                      <Eye className="h-4 w-4 mr-2" />
                                      View PDF
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="h-4 w-4 mr-2" />
                                      Upload PDF
                                    </>
                                  )}
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>
                                    {report.fileUrl ? "View PDF Report" : "Upload PDF Report"}
                                  </DialogTitle>
                                  <DialogDescription>
                                    {report.fileUrl
                                      ? "Review the uploaded PDF report"
                                      : "Upload the signed PDF version of this attendance report and provide despatch details."}
                                  </DialogDescription>
                                </DialogHeader>
                                {report.fileUrl ? (
                                  <>
                                    <div className="space-y-2">
                                      <div className="text-sm text-muted-foreground">
                                        <p>
                                          <strong>Despatch No:</strong> {report.despatchNo}
                                        </p>
                                        <p>
                                          <strong>Despatch Date:</strong>{" "}
                                          {formatDate(report.despatchDate!)}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="w-full h-[600px] border rounded-lg overflow-hidden">
                                      <object
                                        data={report.fileUrl}
                                        type="application/pdf"
                                        className="w-full h-full"
                                      >
                                        <p>
                                          Unable to display PDF.{" "}
                                          <a
                                            href={report.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            Click here to download
                                          </a>
                                        </p>
                                      </object>
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
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <label htmlFor="despatchDate" className="text-sm font-medium">
                                          Despatch Date
                                        </label>
                                        <Input id="despatchDate" type="date" />
                                      </div>
                                      <div className="space-y-2">
                                        <label htmlFor="pdfFile" className="text-sm font-medium">
                                          PDF File
                                        </label>
                                        <Input 
                                          id="pdfFile" 
                                          type="file" 
                                          accept=".pdf,application/pdf" 
                                          className="cursor-pointer"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file && !file.type.includes('pdf')) {
                                              toast({
                                                variant: "destructive",
                                                title: "Error",
                                                description: "Please select a PDF file"
                                              });
                                              e.target.value = '';
                                            }
                                          }}
                                        />
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
                                              const fileInput = form.querySelector("#pdfFile") as HTMLInputElement;
                                              const despatchNoInput = form.querySelector("#despatchNo") as HTMLInputElement;
                                              const despatchDateInput = form.querySelector("#despatchDate") as HTMLInputElement;
                                              
                                              const file = fileInput?.files?.[0];
                                              const despatchNo = despatchNoInput?.value;
                                              const despatchDate = despatchDateInput?.value;

                                              if (!file || !despatchNo || !despatchDate) {
                                                toast({
                                                  variant: "destructive",
                                                  title: "Error",
                                                  description: "Please fill in all fields",
                                                });
                                                return;
                                              }
                                              
                                              // Set button to loading state
                                              const button = e.currentTarget;
                                              const originalText = button.innerHTML;
                                              button.innerHTML = '<span class="animate-spin mr-2">⏳</span> Uploading...';
                                              button.disabled = true;
                                              
                                              try {
                                                await handleUpload(file, report.id, {
                                                  despatchNo,
                                                  despatchDate,
                                                });
                                                
                                                // Close the dialog after successful upload
                                                const closeButton = document.querySelector("[data-dialog-close]");
                                                if (closeButton instanceof HTMLButtonElement) {
                                                  closeButton.click();
                                                }
                                              } catch (uploadError) {
                                                console.error("Upload error:", uploadError);
                                                // Reset button on error
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
                                            }
                                          }
                                        }}
                                      >
                                        <span>Submit</span>
                                      </Button>
                                    </DialogFooter>
                                  </form>
                                )}
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