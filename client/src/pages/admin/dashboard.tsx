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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Loading from "@/components/layout/loading";
import { FileCheck, LogOut, Eye, Download, Search, FileDown } from "lucide-react";
import { AttendanceReport, Department } from "@shared/schema";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import * as XLSX from 'xlsx';

type ReportWithDepartment = AttendanceReport & {
  department?: Department;
};

type SortConfig = {
  key: keyof ReportWithDepartment | "";
  direction: "asc" | "desc";
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

interface ColumnOption {
  id: string;
  label: string;
  checked: boolean;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { data: reports, isLoading } = useQuery<ReportWithDepartment[]>({
    queryKey: ["/api/admin/attendance"],
  });
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "", direction: "asc" });
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [columns, setColumns] = useState<ColumnOption[]>([
    { id: "receiptNo", label: "Receipt No.", checked: true },
    { id: "receiptDate", label: "Receipt Date", checked: true },
    { id: "department", label: "Department", checked: true },
    { id: "month", label: "Month", checked: true },
    { id: "transactionId", label: "Transaction ID", checked: true },
    { id: "despatchNo", label: "Despatch No.", checked: true },
    { id: "despatchDate", label: "Despatch Date", checked: true },
    { id: "status", label: "Status", checked: true },
  ]);

  const handleExport = () => {
    if (!reports) return;

    const selectedColumns = columns.filter(col => col.checked);

    // Prepare data for export
    const data = filteredAndSortedReports.map(report => {
      const row: { [key: string]: any } = {};

      selectedColumns.forEach(col => {
        switch(col.id) {
          case "receiptNo":
            row["Receipt No."] = report.receiptNo || "-";
            break;
          case "receiptDate":
            row["Receipt Date"] = formatDate(report.receiptDate);
            break;
          case "department":
            row["Department"] = report.department?.name || "N/A";
            break;
          case "month":
            row["Month"] = new Date(report.year, report.month - 1).toLocaleDateString(
              "en-US",
              { year: "numeric", month: "long" }
            );
            break;
          case "transactionId":
            row["Transaction ID"] = report.status === "draft" ? "*****" : report.transactionId || "Not generated";
            break;
          case "despatchNo":
            row["Despatch No."] = report.despatchNo || "-";
            break;
          case "despatchDate":
            row["Despatch Date"] = formatDate(report.despatchDate);
            break;
          case "status":
            row["Status"] = report.status;
            break;
        }
      });

      return row;
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Reports");

    // Generate filename with current month/year
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const filename = `attendance_reports_${currentMonth.toLowerCase().replace(' ', '_')}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
    setShowExportDialog(false);
  };

  // Get unique months from reports
  const availableMonths = useMemo(() => {
    if (!reports) return [];
    const uniqueMonths = new Set();
    reports.forEach(report => {
      const date = new Date(report.year, report.month - 1);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      uniqueMonths.add(monthKey);
    });
    return Array.from(uniqueMonths).map(monthKey => {
      const [year, month] = (monthKey as string).split('-');
      return {
        value: monthKey as string,
        label: new Date(parseInt(year), parseInt(month)).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long'
        })
      };
    }).sort((a, b) => b.value.localeCompare(a.value)); // Sort in descending order
  }, [reports]);

  const handleSort = (key: keyof ReportWithDepartment) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const filteredAndSortedReports = useMemo(() => {
    if (!reports) return [];

    let filtered = reports.filter(report => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        report.department?.name?.toLowerCase().includes(searchLower) ||
        report.receiptNo?.toString().includes(searchLower) ||
        report.transactionId?.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === "all" || report.status === statusFilter;

      // Add month filtering
      const matchesMonth = monthFilter === "all" ||
        `${report.year}-${report.month - 1}` === monthFilter;

      return matchesSearch && matchesStatus && matchesMonth;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === "department") {
          aValue = a.department?.name || "";
          bValue = b.department?.name || "";
        }

        if (aValue === null) return 1;
        if (bValue === null) return -1;

        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortConfig.direction === "asc" ? comparison : -comparison;
      });
    }

    return filtered;
  }, [reports, searchTerm, statusFilter, monthFilter, sortConfig]);

  const handleLogout = () => {
    setLocation("/admin/login");
  };

  if (isLoading) return <Loading />;

  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
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

      <div className="flex gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by department, receipt no. or transaction ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={monthFilter}
          onValueChange={setMonthFilter}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {availableMonths.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => setShowExportDialog(true)}
          className="flex items-center gap-2"
        >
          <FileDown className="h-4 w-4" />
          Export to Excel
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort("receiptNo")}
              >
                Receipt No.
                {sortConfig.key === "receiptNo" && (
                  <span className="ml-2">
                    {sortConfig.direction === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort("receiptDate")}
              >
                Receipt Date
                {sortConfig.key === "receiptDate" && (
                  <span className="ml-2">
                    {sortConfig.direction === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort("month")}
              >
                Month
                {sortConfig.key === "month" && (
                  <span className="ml-2">
                    {sortConfig.direction === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort("department")}
              >
                Department
                {sortConfig.key === "department" && (
                  <span className="ml-2">
                    {sortConfig.direction === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </TableHead>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Despatch No.</TableHead>
              <TableHead>Despatch Date</TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort("status")}
              >
                Status
                {sortConfig.key === "status" && (
                  <span className="ml-2">
                    {sortConfig.direction === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedReports.map((report) => (
              <TableRow key={report.id}>
                <TableCell>{report.receiptNo || "-"}</TableCell>
                <TableCell>{formatDate(report.receiptDate)}</TableCell>
                <TableCell>
                  {new Date(report.year, report.month - 1).toLocaleDateString(
                    "en-US",
                    {
                      year: "numeric",
                      month: "long",
                    }
                  )}
                </TableCell>
                <TableCell className="font-medium">
                  {report.department?.name || "N/A"}
                </TableCell>
                <TableCell>
                  {report.status === "draft"
                    ? "*****"
                    : report.transactionId || "Not generated"}
                </TableCell>
                <TableCell>{report.despatchNo || "-"}</TableCell>
                <TableCell>{formatDate(report.despatchDate)}</TableCell>
                <TableCell>
                  <Badge
                    variant={report.status === "submitted" ? "default" : "secondary"}
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
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export to Excel</DialogTitle>
            <DialogDescription>
              Select the columns you want to include in the export
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {columns.map((column) => (
              <div key={column.id} className="flex items-center space-x-2">
                <Checkbox
                  id={column.id}
                  checked={column.checked}
                  onCheckedChange={(checked) => {
                    setColumns(cols =>
                      cols.map(col =>
                        col.id === column.id
                          ? { ...col, checked: checked as boolean }
                          : col
                      )
                    );
                  }}
                />
                <Label htmlFor={column.id}>{column.label}</Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport}>
              Download Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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