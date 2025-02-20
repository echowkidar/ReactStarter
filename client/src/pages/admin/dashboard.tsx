import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Loading from "@/components/layout/loading";
import { FileCheck, LogOut, Eye, Download } from "lucide-react";
import { AttendanceReport, Department } from "@shared/schema";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type ReportWithDepartment = AttendanceReport & {
  department?: Department;
};

const PdfPreview = ({ pdfUrl }: { pdfUrl: string }) => {
  return (
    <div className="space-y-6">
      <div className="w-full h-[600px] border rounded-lg overflow-hidden">
        <object data={pdfUrl} type="application/pdf" className="w-full h-full">
          <p>
            Unable to display PDF.{" "}
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              Click here to download
            </a>
          </p>
        </object>
      </div>
    </div>
  );
};

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { data: reports, isLoading } = useQuery<ReportWithDepartment[]>({
    queryKey: ["/api/admin/attendance"],
  });
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const handleLogout = () => {
    setLocation("/admin/login");
  };

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
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Attendance Reports</h1>
          <Badge variant="outline" className="text-lg">
            <FileCheck className="h-4 w-4 mr-2" />
            Salary Section
          </Badge>
        </div>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="flex items-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Despatch No.</TableHead>
              <TableHead>Despatch Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports?.map((report) => (
              <TableRow key={report.id}>
                <TableCell className="font-medium">
                  {report.department?.name || "N/A"}
                </TableCell>
                <TableCell>
                  {new Date(report.year, report.month - 1).toLocaleDateString(
                    "en-US",
                    {
                      year: "numeric",
                      month: "long",
                    },
                  )}
                </TableCell>
                <TableCell>
                  {report.status === "draft"
                    ? "*****"
                    : report.transactionId || "Not generated"}
                </TableCell>
                <TableCell>{report.despatchNo || "-"}</TableCell>
                <TableCell>
                  {report.despatchDate ? formatDate(report.despatchDate) : "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      report.status === "submitted" ? "default" : "secondary"
                    }
                  >
                    {report.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {report.fileUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedReport(report.id);
                          setShowPdfPreview(true);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        View PDF
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/admin/reports/${report.id}`)}
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={showPdfPreview} onOpenChange={setShowPdfPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>View Report PDF</DialogTitle>
            <DialogDescription>
              Review the submitted report PDF.
            </DialogDescription>
          </DialogHeader>
          {selectedReport &&
            reports?.find((r) => r.id === selectedReport)?.fileUrl && (
              <PdfPreview
                pdfUrl={reports.find((r) => r.id === selectedReport)!.fileUrl!}
              />
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
