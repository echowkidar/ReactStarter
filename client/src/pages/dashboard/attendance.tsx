import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Loading from "@/components/layout/loading";
import AttendanceForm from "@/components/forms/attendance-form";
import { Plus, Printer, FileCheck, Eye, Upload, Trash2 } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function Attendance() {
  const { toast } = useToast();
  const department = getCurrentDepartment();
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const [selectedReportForPrint, setSelectedReportForPrint] = useState<any>(null);

  const { data: reports, isLoading } = useQuery({
    queryKey: [`/api/departments/${department?.id}/attendance`],
  });

  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: [`/api/attendance/${selectedReport}/entries`],
    enabled: !!selectedReport,
    select: (data: any) => {
      return Array.isArray(data) ? data : [];
    }
  });

  const { data: employees, isLoading: loadingEmployees } = useQuery({
    queryKey: ['/api/employees'],
    enabled: !!selectedReport
  })


  const createReport = useMutation({
    mutationFn: async (data: any) => {
      const formattedData = {
        departmentId: department?.id,
        month: parseInt(data.month),
        year: parseInt(data.year),
        status: "draft"
      };

      const response = await apiRequest(
        "POST",
        `/api/departments/${department?.id}/attendance`,
        formattedData
      );

      const report = await response.json();

      for (const entry of data.entries) {
        if (!entry.periods || entry.periods.length === 0) continue;

        const periods = entry.periods.map(period => ({
          fromDate: period.fromDate,
          toDate: period.toDate,
          days: period.days,
          remarks: period.remarks || ""
        }));

        await apiRequest("POST", `/api/attendance/${report.id}/entries`, {
          employeeId: entry.employeeId,
          periods
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
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

  const finalizeReport = useMutation({
    mutationFn: async (report: any) => {
      await apiRequest("PATCH", `/api/attendance/${report.id}`, {
        status: "submitted"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "Report finalized successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to finalize report",
      });
    },
  });

  const deleteReport = useMutation({
    mutationFn: async (reportId: number) => {
      await apiRequest("DELETE", `/api/attendance/${reportId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "Report deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete report",
      });
    },
  });

  if (isLoading || loadingEntries || loadingEmployees) return <Loading />;

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

  const formatShortDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];

    return `${day}-${month}-${year.slice(-2)}`;
  };

  const PrintPreview = ({ report, onClose }: { report: any; onClose: () => void }) => {
    const department = getCurrentDepartment();
    const { data: employees = [] } = useQuery({
      queryKey: [`/api/departments/${department?.id}/employees`],
      select: (data: any) => data || [],
    });

    const { data: entries = [], isLoading: loadingEntries } = useQuery({
      queryKey: [`/api/attendance/${report.id}/entries`],
      enabled: !!report.id,
      select: (data: any) => {
        return Array.isArray(data) ? data : [];
      }
    });

    const handlePrint = () => {
      onClose();
      window.print();
    };

    if (loadingEntries) {
      return (
        <div className="flex justify-center p-4">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      );
    }

    return (
      <div className="space-y-6 p-6 @print:p-0">
        <style type="text/css" media="print">{`
            @page { 
              size: auto;
              margin: 10mm 15mm;
            }
            @media print {
              body { 
                visibility: hidden;
                margin: 0;
                padding: 0;
              }
              .print-content { 
                visibility: visible;
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 0;
              }
              .print-content * { 
                visibility: visible;
              }
            }
          `}</style>

        <div className="print-content w-full space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Attendance Report</h2>
            <p className="text-muted-foreground">
              {department?.name} - {formatPeriod(report.year, report.month)}
            </p>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Days Present</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry: any) => {
                  try {
                    const periods = typeof entry.periods === 'string' ? JSON.parse(entry.periods) : entry.periods;
                    const employee = employees?.find((emp: any) => emp.id === entry.employeeId);

                    return periods.map((period: any, periodIndex: number) => (
                      <TableRow key={`${entry.id}-${periodIndex}`}>
                        {periodIndex === 0 && (
                          <>
                            <TableCell className="align-middle" rowSpan={periods.length}>
                              {employee?.employeeId}
                            </TableCell>
                            <TableCell className="align-middle" rowSpan={periods.length}>
                              {employee?.name}
                            </TableCell>
                            <TableCell className="align-middle" rowSpan={periods.length}>
                              {employee?.designation}
                            </TableCell>
                          </>
                        )}
                        <TableCell>
                          {formatShortDate(period.fromDate)} to {formatShortDate(period.toDate)}
                        </TableCell>
                        <TableCell>{period.days}</TableCell>
                        <TableCell>{period.remarks || "-"}</TableCell>
                      </TableRow>
                    ));
                  } catch (error) {
                    console.error('Error parsing periods:', error);
                    return null;
                  }
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-8 space-y-4 text-right">
            <p>Certified that the above attendance report is correct.</p>
            <div className="space-y-1">
              <p>{department?.hodTitle}</p>
              <p>{department?.hodName}</p>
              <p>{department?.name}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 @print:hidden">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>
    );
  };

  const handleUpload = async (file: File, reportId: number, despatchDetails?: { despatchNo: string, despatchDate: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`/api/attendance/${reportId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setUploadedPdfUrl(data.fileUrl);
      setSelectedReport(reportId);

      // Update status to "sent" after successful PDF upload along with despatch details
      await apiRequest("PATCH", `/api/attendance/${reportId}`, {
        status: "sent",
        fileUrl: data.fileUrl,
        despatchNo: despatchDetails?.despatchNo,
        despatchDate: despatchDetails?.despatchDate
      });

      // Update local state
      const updatedReports = reports?.map(report =>
        report.id === reportId
          ? {
              ...report,
              fileUrl: data.fileUrl,
              status: "sent",
              despatchNo: despatchDetails?.despatchNo,
              despatchDate: despatchDetails?.despatchDate
            }
          : report
      );
      queryClient.setQueryData([`/api/departments/${department?.id}/attendance`], updatedReports);

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

  const handleFinalize = (report: any) => {
    finalizeReport.mutate(report);
  };

  const PdfPreview = ({ pdfUrl, onClose, onFinalize }: { pdfUrl: string, onClose: () => void, onFinalize: () => void }) => {
    return (
      <div className="space-y-6">
        <div className="w-full h-[600px] border rounded-lg overflow-hidden">
          <object
            data={pdfUrl}
            type="application/pdf"
            className="w-full h-full"
          >
            <p>Unable to display PDF. <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Click here to download</a></p>
          </object>
        </div>
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onFinalize}>
            <FileCheck className="h-4 w-4 mr-2" />
            Confirm & Finalize
          </Button>
        </div>
      </div>
    );
  };

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
                <TableHead>Period</TableHead>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Despatch Details</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports?.map((report: any) => (
                <TableRow key={report.id}>
                  <TableCell>
                    {formatPeriod(report.year, report.month)}
                  </TableCell>
                  <TableCell>
                    {report.transactionId || "Not generated"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(report.status)} className={`${report.status === 'sent' ? 'font-bold text-green-600' : ''}`}>
                      {report.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {report.status === 'sent' && report.despatchNo ? (
                      <div className="text-sm">
                        <p><span className="font-medium">No:</span> {report.despatchNo}</p>
                        <p><span className="font-medium">Date:</span> {formatDate(report.despatchDate)}</p>
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
                                  Are you sure you want to delete this attendance report? This action cannot be undone.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <DialogClose asChild>
                                  <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button
                                  variant="destructive"
                                  onClick={async () => {
                                    try {
                                      await deleteReport.mutateAsync(report.id);
                                      const closeButton = document.querySelector('[data-dialog-close]');
                                      if (closeButton instanceof HTMLButtonElement) {
                                        closeButton.click();
                                      }
                                    } catch (error) {
                                      console.error('Failed to delete report:', error);
                                    }
                                  }}
                                  disabled={deleteReport.isPending}
                                >
                                  {deleteReport.isPending ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Deleting...
                                    </>
                                  ) : (
                                    'Delete Report'
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>

                          <Button
                            size="sm"
                            onClick={() => handleFinalize(report)}
                            disabled={finalizeReport.isPending}
                          >
                            {finalizeReport.isPending ? (
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
                                    : "Upload the signed PDF version of this attendance report and provide despatch details."
                                  }
                                </DialogDescription>
                              </DialogHeader>
                              {report.fileUrl ? (
                                <>
                                  <div className="space-y-2">
                                    <div className="text-sm text-muted-foreground">
                                      <p><strong>Despatch No:</strong> {report.despatchNo}</p>
                                      <p><strong>Despatch Date:</strong> {formatDate(report.despatchDate)}</p>
                                    </div>
                                  </div>
                                  <div className="w-full h-[600px] border rounded-lg overflow-hidden">
                                    <object
                                      data={report.fileUrl}
                                      type="application/pdf"
                                      className="w-full h-full"
                                    >
                                      <p>Unable to display PDF. <a href={report.fileUrl} target="_blank" rel="noopener noreferrer">Click here to download</a></p>
                                    </object>
                                  </div>
                                </>
                              ) : (
                                <div className="space-y-4">
                                  <div className="grid gap-4">
                                    <div className="space-y-2">
                                      <label htmlFor="despatchNo" className="text-sm font-medium">Despatch No</label>
                                      <Input
                                        id="despatchNo"
                                        placeholder="Enter despatch number"
                                        onChange={(e) => {
                                          const form = e.target.closest('form');
                                          if (form) {
                                            form.querySelector<HTMLInputElement>('#despatchNo')!.value = e.target.value;
                                          }
                                        }}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label htmlFor="despatchDate" className="text-sm font-medium">Despatch Date</label>
                                      <Input
                                        id="despatchDate"
                                        type="date"
                                        onChange={(e) => {
                                          const form = e.target.closest('form');
                                          if (form) {
                                            form.querySelector<HTMLInputElement>('#despatchDate')!.value = e.target.value;
                                          }
                                        }}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label htmlFor="pdfFile" className="text-sm font-medium">PDF File</label>
                                      <Input
                                        id="pdfFile"
                                        type="file"
                                        accept=".pdf"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          const form = e.target.closest('form');
                                          if (file && form) {
                                            const despatchNo = form.querySelector<HTMLInputElement>('#despatchNo')?.value;
                                            const despatchDate = form.querySelector<HTMLInputElement>('#despatchDate')?.value;

                                            if (!despatchNo || !despatchDate) {
                                              toast({
                                                variant: "destructive",
                                                title: "Error",
                                                description: "Please fill in both Despatch No and Despatch Date",
                                              });
                                              return;
                                            }

                                            handleUpload(file, report.id, {
                                              despatchNo,
                                              despatchDate
                                            });
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/dashboard/reports/${report.id}`)}
                            className="flex items-center gap-2"
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