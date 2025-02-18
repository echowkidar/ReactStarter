import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Plus, Printer, FileCheck } from "lucide-react";
import { Loader2 } from "lucide-react";


export default function Attendance() {
  const { toast } = useToast();
  const department = getCurrentDepartment();
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

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

      await Promise.all(
        data.entries.map((entry: any) =>
          apiRequest("POST", `/api/attendance/${report.id}/entries`, {
            reportId: report.id,
            employeeId: entry.employeeId,
            days: entry.periods.reduce((total: number, period: any) => total + period.days, 0),
            fromDate: entry.periods[0]?.fromDate,
            toDate: entry.periods[entry.periods.length - 1]?.toDate,
            remarks: entry.periods.map((p: any) => p.remarks).filter(Boolean).join("; ") || ""
          })
        )
      );
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

  if (isLoading) return <Loading />;

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

  const PrintPreview = ({ report, onClose }: { report: any; onClose: () => void }) => {
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
          @page { size: auto; margin: 20mm; }
          @media print {
            body * { visibility: hidden; }
            .print-content, .print-content * { visibility: visible; }
            .print-content { position: absolute; left: 0; top: 0; }
          }
        `}</style>

        <div className="print-content w-full space-y-6">
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
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Days Present</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry: any) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.employee?.employeeId}</TableCell>
                    <TableCell>{entry.employee?.name}</TableCell>
                    <TableCell>{entry.fromDate ? formatDate(entry.fromDate) : formatDate(new Date(report.year, report.month - 1, 1))}</TableCell>
                    <TableCell>{entry.toDate ? formatDate(entry.toDate) : formatDate(new Date(report.year, report.month, 0))}</TableCell>
                    <TableCell>{entry.days}</TableCell>
                    <TableCell>{entry.remarks || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-12 space-y-4 text-right">
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
                    {report.status === "draft" && (
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
                                  apiRequest("PATCH", `/api/attendance/${report.id}/entries/${entry.id}`, {
                                    days: entry.periods.reduce((total: number, period: any) => total + period.days, 0),
                                    remarks: entry.periods.map((p: any) => p.remarks).filter(Boolean).join("; ") || ""
                                  })
                                )
                              );
                              queryClient.invalidateQueries([`/api/departments/${department?.id}/attendance`]);
                              queryClient.invalidateQueries([`/api/attendance/${report.id}/entries`]);
                            }}
                            isLoading={false}
                          />
                        </DialogContent>
                      </Dialog>
                      <>
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
                        <Button
                          size="sm"
                          onClick={() => {
                            const despatchNo = prompt("Enter Despatch No:");
                            if (despatchNo) {
                              finalizeReport.mutate({
                                id: report.id,
                                data: {
                                  despatchNo,
                                  despatchDate: new Date().toISOString(),
                                },
                              });
                            }
                          }}
                        >
                          <FileCheck className="h-4 w-4 mr-2" />
                          Finalize
                        </Button>
                      </>
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