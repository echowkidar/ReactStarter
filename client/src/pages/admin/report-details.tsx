import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { AttendanceReport, AttendanceEntry, Department, Employee } from "@shared/schema";
import { Download, Printer, X } from "lucide-react";

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

  const formatShortDate = (date: string | Date) => {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear().toString().slice(-2)}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Create print content
    const content = document.querySelector('.print-content')?.cloneNode(true);
    if (!content) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Attendance Report - ${formatPeriod(report.year, report.month)}</title>
          <style>
            body { 
              font-family: system-ui, -apple-system, sans-serif;
              padding: 20px;
              max-width: 1200px;
              margin: 0 auto;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f5f5f5;
            }
          </style>
        </head>
        <body>
          ${content.outerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
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

      <div className="flex justify-between items-center no-print">
        <h1 className="text-2xl font-bold">Attendance Report Details</h1>
        <div className="space-x-2">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
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
                  const periods = JSON.parse(entry.periods);
                  return periods.map((period: any, periodIndex: number) => (
                    <TableRow key={`${entry.id}-${periodIndex}`}>
                      <TableCell>{entry.employee?.employeeId}</TableCell>
                      <TableCell>{entry.employee?.name}</TableCell>
                      <TableCell>{entry.employee?.designation}</TableCell>
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