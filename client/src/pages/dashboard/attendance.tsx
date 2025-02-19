import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
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
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PATCH", `/api/attendance/${id}`, {
        ...data,
        status: "submitted",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "Report finalized successfully",
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

  const formatShortDate = (date: string | Date) => {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear().toString().slice(-2)}`;
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
                  const periods = entry.periods ? JSON.parse(entry.periods) : [];
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

      const updatedReports = reports?.map(report =>
        report.id === reportId
          ? { ...report, fileUrl: data.fileUrl }
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
    if (!report.fileUrl) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please upload a PDF file first",
      });
      return;
    }

    setSelectedReport(report.id);
    setUploadedPdfUrl(report.fileUrl);
    setShowPdfPreview(true);
  };

  const PdfPreview = ({ pdfUrl, onClose, onFinalize }: { pdfUrl: string, onClose: () => void, onFinalize: () => void }) => {
    const [previewError, setPreviewError] = useState(false);

    // Ensure the URL is absolute
    const fullPdfUrl = pdfUrl.startsWith('http') ? pdfUrl : `${window.location.origin}${pdfUrl}`;

    return (
      <div className="space-y-6">
        <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-white">
          {!previewError ? (
            <iframe
              src={fullPdfUrl}
              className="w-full h-full border-0"
              onError={() => setPreviewError(true)}
              title="PDF Preview"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6 space-y-4">
              <p className="text-muted-foreground">Unable to display PDF preview.</p>
              <a
                href={fullPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Click here to download or view in a new tab
              </a>
            </div>
          )}
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
                    {formatDate(new Date(report.year, report.month - 1).toISOString())}
                  </TableCell>
                  <TableCell>{report.transactionId || "Not generated"}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(report.status)}>
                      {report.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2">
                    {report.status === "draft" ? (
                      <div className="space-x-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>Edit Attendance Report</DialogTitle>
                            </DialogHeader>
                            <AttendanceForm
                              reportId={report.id}
                              initialData={{
                                month: String(report.month),
                                year: String(report.year),
                                entries: entries
                              }}
                              onSubmit={async (data) => {
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
                                queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
                                queryClient.invalidateQueries({ queryKey: [`/api/attendance/${report.id}/entries`] });
                              }}
                              isLoading={false}
                            />
                          </DialogContent>
                        </Dialog>
                        <Dialog open={showPrintPreview && selectedReport === report.id} onOpenChange={(open) => {
                          setShowPrintPreview(open);
                          if (!open) setSelectedReport(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedReport(report.id);
                                setShowPrintPreview(true);
                              }}
                            >
                              <Printer className="h-4 w-4 mr-2" />
                              Print
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>Print Preview</DialogTitle>
                            </DialogHeader>
                            <PrintPreview
                              report={report}
                              onClose={() => {
                                setShowPrintPreview(false);
                                setSelectedReport(null);
                              }}
                            />
                          </DialogContent>
                        </Dialog>

                        <div className="space-x-2">
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
                          <Dialog open={showPdfPreview && selectedReport === report.id} onOpenChange={(open) => {
                            setShowPdfPreview(open);
                            if (!open) setSelectedReport(null);
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                onClick={() => handleFinalize(report)}
                              >
                                <FileCheck className="h-4 w-4 mr-2" />
                                Finalize
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl">
                              <DialogHeader>
                                <DialogTitle>Review PDF Before Finalizing</DialogTitle>
                              </DialogHeader>
                              {uploadedPdfUrl && (
                                <PdfPreview
                                  pdfUrl={uploadedPdfUrl}
                                  onClose={() => {
                                    setShowPdfPreview(false);
                                    setSelectedReport(null);
                                  }}
                                  onFinalize={() => {
                                    const despatchNo = prompt("Enter Despatch No:");
                                    if (despatchNo) {
                                      finalizeReport.mutate({
                                        id: report.id,
                                        data: {
                                          despatchNo,
                                          despatchDate: new Date().toISOString(),
                                        },
                                      });
                                      setShowPdfPreview(false);
                                      setSelectedReport(null);
                                    }
                                  }}
                                />
                              )}
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/admin/reports/${report.id}`)}
                        className="flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        View Details
                      </Button>
                    )}
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