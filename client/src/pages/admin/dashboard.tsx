import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Loading from "@/components/layout/loading";
import { FileCheck } from "lucide-react";

export default function AdminDashboard() {
  const { data: reports, isLoading } = useQuery({
    queryKey: ["/api/admin/attendance"],
  });

  if (isLoading) return <Loading />;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Attendance Reports</h1>
        <Badge variant="outline" className="text-lg">
          <FileCheck className="h-4 w-4 mr-2" />
          Salary Section
        </Badge>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Despatch No.</TableHead>
              <TableHead>Despatch Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports?.map((report: any) => (
              <TableRow key={report.id}>
                <TableCell className="font-medium">
                  {report.department?.name}
                </TableCell>
                <TableCell>
                  {new Date(report.year, report.month - 1).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                  })}
                </TableCell>
                <TableCell>{report.transactionId}</TableCell>
                <TableCell>{report.despatchNo}</TableCell>
                <TableCell>
                  {report.despatchDate ? formatDate(report.despatchDate) : "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={report.status === "submitted" ? "success" : "default"}
                  >
                    {report.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
