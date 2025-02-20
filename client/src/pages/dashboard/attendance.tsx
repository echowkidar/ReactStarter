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
import Loading from "@/components/layout/loading";
import AttendanceForm from "@/components/forms/attendance-form";
import { Plus, Printer, FileCheck, Eye, Upload, Trash2, Loader2 } from "lucide-react";
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
  receiptNo?: string;
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
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(`/api/attendance/${reportId}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setUploadedPdfUrl(data.fileUrl);
      setSelectedReport(reportId);

      // Update status to "sent" after successful PDF upload along with receipt and despatch details
      const updateResponse = await apiRequest("PATCH", `/api/attendance/${reportId}`, {
        status: "sent",
        fileUrl: data.fileUrl,
        despatchNo: despatchDetails?.despatchNo,
        despatchDate: despatchDetails?.despatchDate,
        receiptDate: new Date().toISOString(),
      });

      const updatedData = await updateResponse.json();

      // Update local state with the new receipt number from the backend
      const updatedReports = reports?.map((report) =>
        report.id === reportId
          ? {
              ...report,
              fileUrl: data.fileUrl,
              status: "sent",
              despatchNo: despatchDetails?.despatchNo,
              despatchDate: despatchDetails?.despatchDate,
              receiptDate: new Date().toISOString(),
              receiptNo: updatedData.receiptNo, // Use the receipt number from the backend response
            }
          : report,
      );

      queryClient.setQueryData(
        [`/api/departments/${department?.id}/attendance`],
        updatedReports,
      );

      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to upload file",
      });
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

  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      await apiRequest("DELETE", `/api/attendance/${reportId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({ title: "Success", description: "Report deleted successfully" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete report" });
    },
  });

  const finalizeReportMutation = useMutation({
    mutationFn: async (report: AttendanceReport) => {
      await apiRequest("PATCH", `/api/attendance/${report.id}`, { status: "submitted" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({ title: "Success", description: "Report finalized successfully" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to finalize report" });
    },
  });


  if (isLoading || loadingEntries) return <Loading />;

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <main className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Attendance Reports</h1>
          <Dialog open={isCreatingReport} onOpenChange={setIsCreatingReport}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Create Attendance Report</DialogTitle>
              </DialogHeader>
              <AttendanceForm
                onSubmit={async (data) => {
                  await createReport.mutateAsync(data);
                }}
                isLoading={createReport.isPending}
              />
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
                                  onClick={() => deleteReportMutation.mutate(report.id)}
                                  disabled={deleteReportMutation.isLoading}
                                >
                                  {deleteReportMutation.isLoading ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Deleting...
                                    </>
                                  ) : (
                                    "Delete Report"
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          <Button
                            size="sm"
                            onClick={() => finalizeReportMutation.mutate(report)}
                            disabled={finalizeReportMutation.isLoading}
                          >
                            {finalizeReportMutation.isLoading ? (
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
                                      <Input id="pdfFile" type="file" accept=".pdf" />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <DialogClose asChild>
                                      <Button variant="outline">Cancel</Button>
                                    </DialogClose>
                                    <Button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        const form = e.currentTarget.closest("form");
                                        if (form) {
                                          const file = (form.querySelector("#pdfFile") as HTMLInputElement)?.files?.[0];
                                          const despatchNo = (form.querySelector("#despatchNo") as HTMLInputElement)?.value;
                                          const despatchDate = (form.querySelector("#despatchDate") as HTMLInputElement)?.value;

                                          if (!file || !despatchNo || !despatchDate) {
                                            toast({
                                              variant: "destructive",
                                              title: "Error",
                                              description: "Please fill in all fields",
                                            });
                                            return;
                                          }

                                          handleUpload(file, report.id, {
                                            despatchNo,
                                            despatchDate,
                                          });

                                          // Close the dialog after successful upload
                                          const closeButton = document.querySelector("[data-dialog-close]");
                                          if (closeButton instanceof HTMLButtonElement) {
                                            closeButton.click();
                                          }
                                        }
                                      }}
                                    >
                                      Submit
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
  );
}