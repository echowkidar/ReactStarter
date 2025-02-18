import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Loading from "@/components/layout/loading";
import AttendanceForm from "@/components/forms/attendance-form";
import { Plus, Printer, FileCheck, Eye, Upload } from "lucide-react";
import { Loader2 } from "lucide-react";
import * as XLSX from 'xlsx';
import { AttendanceReport } from "@shared/schema";

export default function Attendance() {
  const { toast } = useToast();
  const department = getCurrentDepartment();
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  const { data: reports = [], isLoading } = useQuery<AttendanceReport[]>({
    queryKey: [`/api/departments/${department?.id}/attendance`],
  });

  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: [`/api/attendance/${selectedReport}/entries`],
    enabled: !!selectedReport,
    select: (data: any) => Array.isArray(data) ? data : []
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

      for (const entry of data.entries) {
        if (!entry.periods || entry.periods.length === 0) continue;

        const periods = entry.periods.map((period: any) => ({
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

  if (isLoading || loadingEntries) return <Loading />;

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Skip header row and empty rows
        const rows = jsonData.slice(1).filter((row: any) => row.length > 0);

        if (rows.length === 0) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "No data found in the Excel file",
          });
          return;
        }

        // Process rows and create attendance report
        const attendanceData = {
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          entries: rows.map((row: any) => ({
            employeeId: row[0],
            periods: [{
              fromDate: row[3] || new Date().toISOString().split('T')[0],
              toDate: row[4] || new Date().toISOString().split('T')[0],
              days: row[5] || 0,
              remarks: row[6] || ""
            }]
          }))
        };

        await createReport.mutateAsync(attendanceData);

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to process Excel file",
      });
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <main className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Attendance Reports</h1>
          <div className="space-x-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Excel
            </Button>
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
              {reports.map((report) => (
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