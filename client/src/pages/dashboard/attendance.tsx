import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Loading from "@/components/layout/loading";
import AttendanceForm from "@/components/forms/attendance-form";
import { Plus, Printer, FileCheck, Eye, Upload } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function Attendance() {
  const { toast } = useToast();
  const department = getCurrentDepartment();
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
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
      if (!report.fileUrl) {
        throw new Error("Please upload a PDF file first");
      }

      await apiRequest("PATCH", `/api/attendance/${report.id}`, {
        status: "submitted"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      setShowPdfPreview(false);
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

  if (isLoading || loadingEntries || loadingEmployees) return <Loading />;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "default";
      case "submitted":
        return "secondary";
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

  const handleUpload = async (file: File, reportId: number) => {
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
      setShowPdfPreview(true);

      const updatedReports = reports?.map(report =>
        report.id === reportId
          ? { ...report, fileUrl: data.fileUrl }
          : report
      );
      queryClient.setQueryData([`/api/departments/${department?.id}/attendance`], updatedReports);

      toast({
        title: "Success",
        description: "File uploaded successfully. Please review before finalizing.",
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
    if (!report.fileUrl) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please upload a PDF file first",
      });
      return;
    }

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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports?.map((report: any) => (
                <TableRow key={report.id}>
                  <TableCell>
                    {new Date(report.year, report.month - 1).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                    })}
                  </TableCell>
                  <TableCell>
                    {report.status === "draft"
                      ? "*****"
                      : (report.transactionId || "Not generated")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(report.status)}>
                      {report.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {report.status === "draft" ? (
                        <>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                Edit
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl">
                              <DialogHeader>
                                <DialogTitle>Edit Attendance Report</DialogTitle>
                                <DialogDescription>
                                  Modify the attendance report details below.
                                </DialogDescription>
                              </DialogHeader>
                              <AttendanceForm
                                reportId={report.id}
                                initialData={{
                                  month: String(report.month),
                                  year: String(report.year),
                                  entries: entries.map(entry => ({
                                    employeeId: entry.employeeId,
                                    periods: typeof entry.periods === 'string'
                                      ? JSON.parse(entry.periods)
                                      : entry.periods
                                  }))
                                }}
                                onSubmit={async (data) => {
                                  // First, delete existing entries
                                  await apiRequest("DELETE", `/api/attendance/${report.id}/entries`);

                                  // Then create new entries
                                  await Promise.all(
                                    data.entries.map((entry) =>
                                      apiRequest("POST", `/api/attendance/${report.id}/entries`, {
                                        employeeId: entry.employeeId,
                                        periods: entry.periods.map(period => ({
                                          fromDate: period.fromDate,
                                          toDate: period.toDate,
                                          days: period.days,
                                          remarks: period.remarks || ""
                                        }))
                                      })
                                    )
                                  );

                                  // Update the queries to reflect changes
                                  queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
                                  queryClient.invalidateQueries({ queryKey: [`/api/attendance/${report.id}/entries`] });

                                  // Close the dialog
                                  const dialogTrigger = document.querySelector('[aria-label="Close"]');
                                  if (dialogTrigger instanceof HTMLButtonElement) {
                                    dialogTrigger.click();
                                  }
                                }}
                                isLoading={false}
                              />
                            </DialogContent>
                          </Dialog>

                          <Dialog open={selectedReportForPrint === report.id} onOpenChange={(open) => !open && setSelectedReportForPrint(null)}>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedReportForPrint(report.id)}
                              >
                                <Printer className="h-4 w-4 mr-2" />
                                Print
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl">
                              <DialogHeader>
                                <DialogTitle>Print Preview</DialogTitle>
                              </DialogHeader>
                              {selectedReportForPrint === report.id && (
                                <PrintPreview
                                  report={report}
                                  onClose={() => setSelectedReportForPrint(null)}
                                />
                              )}
                            </DialogContent>
                          </Dialog>

                          <Button variant="outline" size="sm" className="relative">
                            <Input
                              type="file"
                              accept=".pdf"
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUpload(file, report.id);
                                }
                              }}
                            />
                            <Upload className="h-4 w-4 mr-2" />
                            Upload
                          </Button>

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
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/dashboard/reports/${report.id}`)}
                          className="flex items-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          View Details
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

      <Dialog open={showPdfPreview} onOpenChange={setShowPdfPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Review Report</DialogTitle>
            <DialogDescription>
              Please review the uploaded report before finalizing.
            </DialogDescription>
          </DialogHeader>
          {uploadedPdfUrl && selectedReport && (
            <PdfPreview
              pdfUrl={uploadedPdfUrl}
              onClose={() => setShowPdfPreview(false)}
              onFinalize={() => {
                const report = reports?.find((r: any) => r.id === selectedReport);
                if (report) {
                  handleFinalize(report);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}