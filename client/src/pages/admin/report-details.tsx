import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { AttendanceReport, AttendanceEntry, Department, Employee } from "@shared/schema";
import { Download, Printer, X } from "lucide-react";
import Loading from "@/components/layout/loading";
import AdminHeader from "@/components/layout/admin-header";

interface ExtendedAttendanceEntry extends AttendanceEntry {
  employee?: Employee;
}

interface ExtendedAttendanceReport extends AttendanceReport {
  department?: Department;
  entries?: ExtendedAttendanceEntry[];
}

export default function ReportDetails() {
  const [, params] = useRoute("/admin/reports/:id");
  const [, setLocation] = useLocation();
  const reportId = params?.id;

  const { data: report, isLoading: isLoadingReport } = useQuery<ExtendedAttendanceReport>({
    queryKey: [`/api/admin/attendance/${reportId}`],
    enabled: !!reportId,
  });

  if (isLoadingReport) {
    return <LoadingSkeleton />;
  }

  if (!report) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">Report not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const wb = XLSX.utils.book_new();

    const headerData = [
      ['Attendance Report'],
      [''],
      ['Department:', report.department?.name],
      ['Month/Year:', formatPeriod(report.year, report.month)],
      ['Transaction ID:', report.transactionId || '-'],
      ['Status:', report.status],
      ['Despatch No:', report.despatchNo || '-'],
      ['Despatch Date:', report.despatchDate ? format(new Date(report.despatchDate), "dd MMM yyyy") : '-'],
      ['']
    ];

    const attendanceData = [
      ['Employee ID', 'Name', 'Designation', 'Period', 'Days', 'Remarks']
    ];

    report.entries?.forEach(entry => {
      const periods = JSON.parse(entry.periods);
      periods.forEach((period: any) => {
        attendanceData.push([
          entry.employee?.epid,
          entry.employee?.name,
          entry.employee?.designation,
          `${formatShortDate(period.fromDate)} to ${formatShortDate(period.toDate)}`,
          period.days,
          period.remarks || '-'
        ]);
      });
    });

    const certificationData = [
      [''],
      ['Certified that the above attendance report is correct.'],
      [''],
      [report.department?.hodTitle || ''],
      [report.department?.hodName || ''],
      [report.department?.name || '']
    ];

    const wsData = [...headerData, ...attendanceData, ...certificationData];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = [
      { wch: 15 }, 
      { wch: 20 }, 
      { wch: 20 }, 
      { wch: 25 }, 
      { wch: 10 }, 
      { wch: 30 }  
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Attendance Report");

    const fileName = `attendance_report_${report.department?.name}_${report.year}_${report.month}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AdminHeader />
      <div className="p-6 flex-1">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Attendance Report Details</h1>
          <div className="space-x-2">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download Excel
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" onClick={() => setLocation("/admin/dashboard")}>
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </div>
        </div>

        <style type="text/css" media="print">{`
          @page { 
            size: auto;
            margin: 10mm 15mm;
          }
          @media print {
            body { 
              visibility: hidden;
            }
            .print-content { 
              visibility: visible;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
            .no-print {
              display: none;
            }
          }
        `}</style>

        <div className="print-content space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Attendance Report Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoItem label="Department" value={report.department?.name} />
                <InfoItem label="Month/Year" value={formatPeriod(report.year, report.month)} />
                <InfoItem label="Transaction ID" value={report.transactionId || '-'} />
                <InfoItem 
                  label="Status" 
                  value={
                    <Badge variant={report.status === "submitted" ? "default" : "secondary"}>
                      {report.status}
                    </Badge>
                  } 
                />
                {report.despatchNo && (
                  <InfoItem label="Despatch No" value={report.despatchNo} />
                )}
                {report.despatchDate && (
                  <InfoItem 
                    label="Despatch Date" 
                    value={format(new Date(report.despatchDate), "dd MMM yyyy")} 
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attendance Entries</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.entries?.map((entry) => {
                    try {
                      const periods = typeof entry.periods === 'string' 
                        ? JSON.parse(entry.periods) 
                        : entry.periods;

                      return periods.map((period: any, periodIndex: number) => (
                        <TableRow key={`${entry.id}-${periodIndex}`}>
                          <TableCell>{entry.employee?.epid}</TableCell>
                          <TableCell>{entry.employee?.name}</TableCell>
                          <TableCell>{entry.employee?.designation}</TableCell>
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
            </CardContent>
          </Card>

          <div className="mt-8 space-y-4 text-right">
            <p>Certified that the above attendance report is correct.</p>
            <div className="space-y-1">
              <p>{report.department?.hodTitle}</p>
              <p>{report.department?.hodName}</p>
              <p>{report.department?.name}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-[200px]" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-[100px] mb-2" />
                <Skeleton className="h-6 w-[150px]" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-[200px]" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}