import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { AttendanceReport, AttendanceEntry, Department, Employee } from "@shared/schema";

interface ExtendedAttendanceEntry extends AttendanceEntry {
  employee?: Employee;
}

interface ExtendedAttendanceReport extends AttendanceReport {
  department?: Department;
  entries?: ExtendedAttendanceEntry[];
}

export default function ReportDetails() {
  const [, params] = useRoute("/admin/reports/:id");
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

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Attendance Report Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem label="Department" value={report.department?.name} />
            <InfoItem label="Month/Year" value={`${report.month}/${report.year}`} />
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
                      {period.fromDate} - {period.toDate}
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