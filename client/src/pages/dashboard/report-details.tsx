import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { AttendanceReport, AttendanceEntry, Department, Employee } from "@shared/schema";
import { Download, Printer, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { getPayLevelOrder } from "@/lib/pay-levels";

interface ExtendedAttendanceEntry extends AttendanceEntry {
  employee?: Employee;
}

interface ExtendedAttendanceReport extends Omit<AttendanceReport, 'fileUrl'> {
  department?: Department;
  entries?: ExtendedAttendanceEntry[];
  fileUrl?: string | null;
}

const PdfPreview = ({ pdfUrl }: { pdfUrl: string }) => {
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
    </div>
  );
};

export default function ReportDetails() {
  const [, params] = useRoute("/dashboard/reports/:id");
  const [, setLocation] = useLocation();
  const reportId = params?.id;
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [feedbackRemark, setFeedbackRemark] = useState<string | null>(null);

  useEffect(() => {
    if (reportId) {
      const savedRemark = localStorage.getItem(`feedback_remark_${reportId}`);
      if (savedRemark) {
        setFeedbackRemark(savedRemark);
      }
    }
  }, [reportId]);

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
    const year = parts[2].length === 2 ? parts[2] : parts[2].slice(-2);

    return `${day}-${month}-${year}`;
  };

  const formatDispatchDate = (date: string | Date) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString().slice(-2);
    return `${day}${month}${year}`;
  };

  const formatTermExpiry = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "-";

    try {
      const date = new Date(dateStr);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear().toString().slice(-2);

      return `${day}-${month}-${year}`;
    } catch (error) {
      console.error("Error formatting term expiry date:", error);
      return dateStr;
    }
  };

  // Updated function to check if it's a complete month AND matches the current report month
  const isWholeCurrentMonth = (fromDate: string, toDate: string, reportMonth: number, reportYear: number): boolean => {
    // Check if period starts from day 1
    const fromParts = fromDate.split('-');
    if (fromParts.length !== 3 || fromParts[0] !== '01') return false;

    // Extract month and year from the period
    const fromMonth = parseInt(fromParts[1]);
    const fromYear = parseInt(fromParts[2].length === 2 ? `20${fromParts[2]}` : fromParts[2]);

    // Check if period ends on the last day of month
    const toParts = toDate.split('-');
    if (toParts.length !== 3) return false;

    const toMonth = parseInt(toParts[1]);
    const toYear = parseInt(toParts[2].length === 2 ? `20${toParts[2]}` : toParts[2]);

    // Months should be same for whole month period
    if (fromMonth !== toMonth || fromYear !== toYear) return false;

    // Calculate last day of the month
    const lastDay = new Date(fromYear, fromMonth, 0).getDate();

    // Check if end date is the last day of month
    const isCompleteMonth = parseInt(toParts[0]) === lastDay;

    // NEW CONDITION: Also check if this period month matches the report month/year
    const matchesReportMonth = fromMonth === reportMonth && fromYear === reportYear;

    return isCompleteMonth && matchesReportMonth;
  };

  const handlePrint = () => {
    setTimeout(() => {
      const printContent = document.querySelector('.print-content');

      if (printContent) {
        const printWindow = window.open('', '_blank');

        if (!printWindow) {
          alert('Please allow popups for this website to use the print feature.');
          return;
        }

        // Get the current page's styling
        const styles = Array.from(document.styleSheets)
          .map(styleSheet => {
            try {
              return Array.from(styleSheet.cssRules)
                .map(rule => rule.cssText)
                .join('\n');
            } catch (e) {
              // Skip external stylesheets that might cause CORS issues
              return '';
            }
          })
          .join('\n');

        // Extract custom print styles from the current page
        const printStyleElement = document.querySelector('style[media="print"]');
        const printStyles = printStyleElement ? printStyleElement.textContent : '';

        // Write the content to the new window with proper styling
        printWindow.document.write(`
          <html>
            <head>
              <title>Attendance Report</title>
              <style>${styles}</style>
              <style media="all">
                @page { 
                  size: portrait;
                  margin: 5mm 5mm 15mm 5mm;
                }
                body {
                  margin: 0;
                  padding: 5px;
                  font-family: system-ui, -apple-system, sans-serif;
                  font-size: 9pt;
                  counter-reset: page;
                  color: #000 !important;
                }
                .print-content {
                  width: 100%;
                  max-width: 100%;
                  padding: 0 2mm;
                }
                .print-content, .print-content * {
                  color: #000 !important;
                }
                
                /* Simple page numbering that won't duplicate */
                @page {
                  @bottom-right {
                    content: counter(page) "/" counter(pages);
                    margin-bottom: 15mm;
                  }
                }
                
                /* Barcode styling */
                .page-footer-barcode {
                  position: fixed;
                  bottom: 5mm;
                  left: 0;
                  right: 0;
                  text-align: center;
                  font-family: 'Libre Barcode 39', cursive;
                  font-size: 14pt;
                  letter-spacing: 0;
                  line-height: 1;
                }
                
                /* Transaction ID text under barcode */
                .transaction-id-text {
                  position: fixed;
                  bottom: 1mm;
                  left: 0;
                  right: 0;
                  text-align: center;
                  font-size: 6pt;
                  font-family: monospace;
                }
                
                /* Table styles for compact display */
                table {
                  font-size: 8pt;
                  width: 100%;
                  border-collapse: collapse;
                  margin-bottom: 5px;
                  table-layout: fixed;
                  margin-left: 0;
                  margin-right: 0;
                  max-width: 100vw;
                }
                th, td {
                  padding: 3px 2px;
                  border: 1px solid #ddd;
                  text-align: left;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }
                th {
                  background-color: #f3f4f6;
                  font-weight: bold;
                  font-size: 8pt;
                }
                
                /* Column widths for popup print window */
                table th:nth-child(1), table td:nth-child(1) { width: 4%; } /* S.No. */
                table th:nth-child(2), table td:nth-child(2) { width: 8%; } /* Employee ID */
                table th:nth-child(3), table td:nth-child(3) { width: 18%; white-space: normal; } /* Name */
                table th:nth-child(4), table td:nth-child(4) { width: 18%; white-space: normal; } /* Designation */
                table th:nth-child(5), table td:nth-child(5) { width: 7%; } /* Term_Expiry */
                table th:nth-child(6), table td:nth-child(6) { width: 7%; } /* Salary Register */
                table th:nth-child(7), table td:nth-child(7) { width: 17%; } /* Period */
                table th:nth-child(8), table td:nth-child(8) { width: 5%; } /* Days */
                table th:nth-child(9), table td:nth-child(9) { width: 16%; white-space: normal; } /* Remarks */
                
                /* Card styling */
                .card {
                  border: 1px solid #ddd;
                  margin-bottom: 5px;
                }
                .card-header {
                  padding: 5px 8px;
                  background-color: #f9fafb;
                  border-bottom: 1px solid #ddd;
                }
                .card-content {
                  padding: 5px 8px;
                }
                .card-title {
                  font-size: 11pt;
                  font-weight: bold;
                  margin: 0;
                }
                
                /* Grid and layout */
                .grid {
                  display: grid;
                  grid-template-columns: repeat(4, 1fr);
                  gap: 5px;
                }
                .info-item {
                  margin-bottom: 5px;
                }
                .info-label {
                  font-size: 8pt;
                  color: #6b7280;
                  margin-bottom: 1px;
                }
                .info-value {
                  font-size: 9pt;
                }
                
                /* Footer section */
                .certification {
                  margin-top: 10px;
                  text-align: right;
                }
                .certification p {
                  margin: 1px 0;
                  font-size: 9pt;
                }
                
                /* Spacing utilities */
                .space-y-6 > * + * {
                  margin-top: 5px;
                }
                
                /* Whitespace control for table cells */
                .whitespace-nowrap {
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }
                
                /* Force page breaks */
                tr {
                  page-break-inside: avoid !important;
                }
                
                /* Strategy: group the entire end section inside an unbreakable block if possible,
                   but standard CSS provides page-break-inside avoid for the certification block. */
                .certification-section {
                  page-break-inside: avoid !important;
                  margin-top: 30px !important;
                }
              </style>
            </head>
            <body>
              ${printContent.outerHTML}
            </body>
          </html>
        `);

        printWindow.document.close();

        // Wait for content to load before printing
        printWindow.onload = function () {
          // Apply additional class transformations for print window
          const cards = printWindow.document.querySelectorAll('[class*="card"]');
          cards.forEach(card => {
            card.classList.add('card');
          });

          const cardHeaders = printWindow.document.querySelectorAll('[class*="cardHeader"]');
          cardHeaders.forEach(header => {
            header.classList.add('card-header');
          });

          const cardContents = printWindow.document.querySelectorAll('[class*="cardContent"]');
          cardContents.forEach(content => {
            content.classList.add('card-content');
          });

          const cardTitles = printWindow.document.querySelectorAll('[class*="cardTitle"]');
          cardTitles.forEach(title => {
            title.classList.add('card-title');
          });

          const infoItems = printWindow.document.querySelectorAll('.text-sm.font-medium');
          infoItems.forEach(item => {
            item.classList.add('info-label');
          });

          const certificationSection = printWindow.document.querySelector('.mt-8');
          if (certificationSection) {
            certificationSection.classList.add('certification');
          }

          // Add barcode font
          const linkElement = printWindow.document.createElement('link');
          linkElement.rel = 'stylesheet';
          linkElement.href = 'https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap';
          printWindow.document.head.appendChild(linkElement);

          // Add transaction ID barcode or draft watermark to the print window
          const contentElement = printWindow.document.querySelector('.print-content');
          if (contentElement) {
            if (report.status === 'draft') {
              const draftWarningElement = printWindow.document.createElement('div');
              draftWarningElement.className = 'transaction-id-text';
              draftWarningElement.style.paddingBottom = '15mm';
              draftWarningElement.style.fontSize = '12pt';
              draftWarningElement.style.fontWeight = 'bold';
              draftWarningElement.style.color = '#000';
              draftWarningElement.innerHTML = 'Do not upload/send the draft attendance report as it is for your office use only.';
              printWindow.document.body.appendChild(draftWarningElement);
            } else {
              const barcodeElement = printWindow.document.createElement('div');
              barcodeElement.className = 'page-footer-barcode';
              barcodeElement.innerHTML = `*${report.transactionId || "DRAFT"}*`;
              printWindow.document.body.appendChild(barcodeElement);

              const transactionTextElement = printWindow.document.createElement('div');
              transactionTextElement.className = 'transaction-id-text';
              transactionTextElement.innerHTML = report.transactionId || "DRAFT";
              printWindow.document.body.appendChild(transactionTextElement);
            }
          }

          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            // Close the print window after print/cancel - print() is synchronous and blocks until dialog closes
            printWindow.close();
          }, 300);
        };
      }
    }, 100);
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
      ['Despatch Date:', report.despatchDate ? formatDispatchDate(report.despatchDate) : '-'],
      ['']
    ];

    const attendanceData = [
      ['S.No.', 'Employee ID', 'Name', 'Designation', 'Term_Expiry', 'Salary Register No', 'Period', 'Days', 'Remarks']
    ];

    let serialNumber = 1;
    report.entries?.forEach(entry => {
      const periods = typeof entry.periods === 'string' ? JSON.parse(entry.periods) : entry.periods;
      periods.forEach((period: any) => {
        attendanceData.push([
          serialNumber++,
          entry.employee?.epid,
          entry.employee?.name,
          entry.employee?.designation,
          formatTermExpiry(entry.employee?.termExpiry),
          entry.employee?.salaryRegisterNo || '-',
          isWholeCurrentMonth(period.fromDate, period.toDate, report.month, report.year)
            ? "- "
            : `${formatShortDate(period.fromDate)} to ${formatShortDate(period.toDate)}`,
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
      { wch: 4 },  // S.No.
      { wch: 8 },  // Employee ID
      { wch: 18 }, // Name
      { wch: 18 }, // Designation
      { wch: 7 },  // Term_Expiry
      { wch: 7 },  // Salary Register No
      { wch: 17 }, // Period
      { wch: 5 },  // Days
      { wch: 16 }   // Remarks
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Attendance Report");
    XLSX.writeFile(wb, `attendance_report_${report.department?.name}_${report.year}_${report.month}.xlsx`);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <style type="text/css" media="print">{`
        @page { 
          size: portrait;
          margin: 5mm 5mm 15mm 5mm;
        }
        @media print {
          body { 
            visibility: hidden;
            margin: 0;
            padding: 0;
            counter-reset: page;
            color: #000 !important;
          }
          .print-content { 
            visibility: visible;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0 2mm; /* Reduce side padding */
          }
          .print-content, .print-content * {
            color: #000 !important;
          }
          .no-print {
            display: none !important;
          }
          
          /* Simple page numbering at the bottom right */
          @page {
            @bottom-right {
              content: counter(page) "/" counter(pages);
              margin-bottom: 15mm;
            }
          }
          
          /* Barcode in footer */
          .page-footer-barcode {
            position: fixed;
            bottom: 5mm;
            left: 0;
            right: 0;
            text-align: center;
            font-family: 'Libre Barcode 39', cursive;
            font-size: 14pt;
            letter-spacing: 0;
            line-height: 1;
            visibility: visible;
          }
          
          /* Transaction ID text under barcode */
          .transaction-id-text {
            position: fixed;
            bottom: 1mm;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 6pt;
            font-family: monospace;
            visibility: visible;
          }
          
          /* Make table more compact */
          .print-content table {
            font-size: 8pt;
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-left: 0;
            margin-right: 0;
            max-width: 100vw;
          }
          
          .print-content tr {
            page-break-inside: avoid;
          }
          
          .print-content th, 
          .print-content td {
            padding: 3px 2px !important;
            border: 1px solid #ddd;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          
          .print-content th {
            background-color: #f3f4f6 !important;
            color: #000 !important;
            font-weight: bold;
            font-size: 8pt !important;
          }
          
          /* Card styling for print */
          .print-content [class*="card"] {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
            margin-bottom: 5px !important;
          }
          
          .print-content [class*="cardHeader"] {
            padding: 5px 8px !important;
            background-color: #f9fafb !important;
            border-bottom: 1px solid #ddd !important;
          }
          
          .print-content [class*="cardContent"] {
            padding: 5px 8px !important;
          }
          
          /* Reduce space between items */
          .print-content [class*="grid"] {
            gap: 5px !important;
          }
          
          /* Header title */
          .print-content [class*="cardTitle"] {
            font-size: 11pt !important;
            font-weight: bold !important;
            margin: 0 !important;
          }
          
          /* Certification section */
          .print-content .mt-8 {
            margin-top: 5px !important;
            position: relative !important;
            page-break-inside: avoid;
          }
          
          /* Typography adjustments */
          .print-content p {
            margin: 1px 0 !important;
            font-size: 9pt !important;
          }
          
          /* Adjust item spacing */
          .print-content div > div {
            margin-top: 2px !important;
          }

          /* Column widths for table */
          .print-content th:nth-child(1), .print-content td:nth-child(1) { width: 4% !important; } /* S.No. */
          .print-content th:nth-child(2), .print-content td:nth-child(2) { width: 6% !important; } /* Employee ID */
          .print-content th:nth-child(3), .print-content td:nth-child(3) { width: 18% !important; white-space: normal !important; } /* Name */
          .print-content th:nth-child(4), .print-content td:nth-child(4) { width: 18% !important; white-space: normal !important; } /* Designation */
          .print-content th:nth-child(5), .print-content td:nth-child(5) { width: 7% !important; } /* Term_Expiry */
          .print-content th:nth-child(6), .print-content td:nth-child(6) { width: 7% !important; } /* Salary Register */
          .print-content th:nth-child(7), .print-content td:nth-child(7) { width: 17% !important; } /* Period */
          .print-content th:nth-child(8), .print-content td:nth-child(8) { width: 5% !important; } /* Days */
          .print-content th:nth-child(9), .print-content td:nth-child(9) { width: 18% !important; white-space: normal !important; } /* Remarks */
        }
      `}</style>

      <div className="flex justify-between items-center no-print">
        <h1 className="text-2xl font-bold">Attendance Report Details</h1>
        <div className="space-x-2">
          {report.fileUrl && (
            <Button variant="outline" onClick={() => setShowPdfPreview(true)}>
              <Download className="h-4 w-4 mr-2" />
              View PDF
            </Button>
          )}
          {report.status !== "draft" && (
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download Excel
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            {report.status === "draft" ? "Draft Report Print" : "Print"}
          </Button>
          <Button variant="outline" onClick={() => setLocation("/dashboard/attendance")}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </div>

      <div className="print-content space-y-6">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 print:flex-row print:items-center print:justify-between">
            <CardTitle>{report.status === 'draft' ? 'Draft Attendance Report' : 'Attendance Report'}</CardTitle>
            <div className="border border-black rounded px-4 py-2.5 flex items-center w-full sm:w-[340px] h-[40px] bg-white mr-2 shrink-0 print:w-[340px]">
              <span className="text-sm font-bold text-black flex-1">D. No.</span>
              <span className="text-sm font-bold text-black flex-1">D. Date</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoItem label="Department" value={report.department?.name} />
              <InfoItem label="Month/Year" value={formatPeriod(report.year, report.month)} />
              <InfoItem
                label="Transaction ID"
                value={
                  report.status === "draft" ? "*****" :
                    report.status === "sent" ? (report.transactionId || "-") :
                      (report.transactionId ? (
                        <>
                          <span className="print:hidden font-mono tracking-widest text-muted-foreground">***</span>
                          <span className="hidden print:inline">{report.transactionId}</span>
                        </>
                      ) : "-")
                }
              />
              <InfoItem
                label="Status"
                value={
                  <Badge
                    variant={report.status === "submitted" ? "outline" : "secondary"}
                    className={report.status === "submitted" ? "border-green-600 text-green-700 bg-green-50 font-bold uppercase tracking-wider px-3" : ""}
                  >
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
                  value={report.despatchDate ? formatDispatchDate(report.despatchDate) : '-'}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 overflow-x-auto">
          <Table className="w-full border-collapse">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Srl</TableHead>
                <TableHead className="whitespace-nowrap">ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead className="whitespace-nowrap">Term</TableHead>
                <TableHead className="whitespace-nowrap">Reg.No</TableHead>
                <TableHead className="whitespace-nowrap">Period</TableHead>
                <TableHead className="whitespace-nowrap text-center">Days</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            {(() => {
              const allRows: React.ReactNode[] = [];
              [...(report.entries || [])]
                .sort((a, b) => {
                  const payLevelA = a.employee?.payLevel || "L-0";
                  const payLevelB = b.employee?.payLevel || "L-0";
                  if (payLevelA !== payLevelB) {
                    return getPayLevelOrder(payLevelB) - getPayLevelOrder(payLevelA);
                  }
                  const sortOrderA = a.employee?.sortOrder || 0;
                  const sortOrderB = b.employee?.sortOrder || 0;
                  if (sortOrderA !== sortOrderB) {
                    return sortOrderA - sortOrderB;
                  }
                  const epidA = a.employee?.epid || '';
                  const epidB = b.employee?.epid || '';
                  return epidA.localeCompare(epidB);
                })
                .forEach((entry, entryIndex) => {
                  try {
                    const periods = typeof entry.periods === 'string'
                      ? JSON.parse(entry.periods)
                      : entry.periods;
                    const periodCount = periods?.length || 1;
                    const serialNumber = entryIndex + 1;

                    periods.forEach((period: any, periodIndex: number) => {
                      const isFirstPeriod = periodIndex === 0;

                      const designation = entry.employee?.designation?.toUpperCase() || "";
                      const isMultiPeriodDesignation = designation === 'GUEST TEACHER' ||
                        designation === 'GUEST FACULTY' ||
                        designation.includes('DAILY WAGE') ||
                        designation.includes('DAILY WAGER');

                      allRows.push(
                        <TableRow key={`${entry.id}-${periodIndex}`}>
                          {isFirstPeriod && (
                            <>
                              <TableCell className="whitespace-nowrap" rowSpan={periodCount}>{serialNumber}</TableCell>
                              <TableCell className="whitespace-nowrap" rowSpan={periodCount}>{entry.employee?.epid}</TableCell>
                              <TableCell rowSpan={periodCount}>{entry.employee?.name}</TableCell>
                              <TableCell rowSpan={periodCount}>{entry.employee?.designation}</TableCell>
                              <TableCell className="whitespace-nowrap" rowSpan={periodCount}>{formatTermExpiry(entry.employee?.termExpiry)}</TableCell>
                              <TableCell className="whitespace-nowrap" rowSpan={periodCount}>{entry.employee?.salaryRegisterNo || "-"}</TableCell>
                            </>
                          )}
                          <TableCell className="whitespace-normal min-w-[120px]">
                            {isWholeCurrentMonth(period.fromDate, period.toDate, report.month, report.year) && !designation.includes('GUEST')
                              ? "- "
                              : isMultiPeriodDesignation
                                ? (
                                  <div className="flex flex-col">
                                    <span>{formatShortDate(period.fromDate)} to {formatShortDate(period.toDate)}</span>
                                    {periodIndex === periodCount - 1 && designation.includes('GUEST') && (
                                      <span className="text-[10px] font-bold mt-1 leading-tight">** Original Bill must be sent to Salary Section **</span>
                                    )}
                                  </div>
                                )
                                : `${formatShortDate(period.fromDate)} to ${formatShortDate(period.toDate)}`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-center">
                            {isMultiPeriodDesignation
                              ? <div className="flex flex-col items-center justify-center -mt-1"><span className="leading-tight">{period.days}</span>{designation.includes('GUEST') && <span className="font-bold text-[9px] text-[#ea580c] leading-tight mt-0.5">Periods</span>}</div>
                              : period.days}
                          </TableCell>
                          <TableCell>{period.remarks || "-"}</TableCell>
                        </TableRow>
                      );
                    });
                  } catch (error) {
                    console.error('Error parsing periods:', error);
                  }
                });

              const signatureRow = (
                <TableRow key="signature-row" className="hover:bg-transparent" style={{ pageBreakInside: 'avoid', border: 'none' }}>
                  <TableCell colSpan={9} className="p-0" style={{ border: 'none' }}>
                    <div className="mt-8 space-y-4 text-right certification-section page-break-inside-avoid">
                      <p>Certified that the above attendance report is correct.</p>
                      {feedbackRemark && (
                        <div className="mb-2 w-full flex justify-end">
                          <span
                            className="italic font-bold text-[11px] text-black tracking-tight mt-1 pr-1 text-right text-wrap-balance"
                            style={{ textWrap: 'balance', maxWidth: '80%' }}
                          >
                            {feedbackRemark.replace(/^(Positive:|Negative:)\s*/, '')}
                          </span>
                        </div>
                      )}
                      <div className="space-y-1">
                        <div style={{ height: '3em' }}></div>
                        <p>{report.department?.hodName}</p>
                        <p>{report.department?.hodTitle}</p>
                        <p>{report.department?.name}</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );

              if (allRows.length === 0) {
                return <TableBody>{signatureRow}</TableBody>;
              }

              // Fix for multi-period rowSpans breaking across TableBody tags:
              // Determine how many rows belong to the final employee (from their period count)
              // We need the sorted entries to find the actual last entry
              const sortedEntries = [...(report.entries || [])].sort((a, b) => {
                const payLevelA = a.employee?.payLevel || "L-0";
                const payLevelB = b.employee?.payLevel || "L-0";
                if (payLevelA !== payLevelB) {
                  return getPayLevelOrder(payLevelB) - getPayLevelOrder(payLevelA);
                }
                const sortOrderA = a.employee?.sortOrder || 0;
                const sortOrderB = b.employee?.sortOrder || 0;
                if (sortOrderA !== sortOrderB) {
                  return sortOrderA - sortOrderB;
                }
                const epidA = a.employee?.epid || '';
                const epidB = b.employee?.epid || '';
                return epidA.localeCompare(epidB);
              });

              const lastEntry = sortedEntries[sortedEntries.length - 1];
              const lastEntryPeriods = typeof lastEntry?.periods === 'string'
                ? JSON.parse(lastEntry.periods)
                : lastEntry?.periods;
              const lastEntryPeriodCount = lastEntryPeriods?.length || 1;

              const cutIndex = allRows.length - lastEntryPeriodCount;
              const initialRows = allRows.slice(0, cutIndex);
              const lastRows = allRows.slice(cutIndex);

              return (
                <>
                  <TableBody>
                    {initialRows}
                  </TableBody>
                  <TableBody className="border-t-0" style={{ pageBreakInside: 'avoid' }}>
                    {lastRows}
                    {signatureRow}
                  </TableBody>
                </>
              );
            })()}
          </Table>
        </div>
      </div>

      <Dialog open={showPdfPreview} onOpenChange={setShowPdfPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>View Report PDF</DialogTitle>
            <DialogDescription>
              Review the submitted report PDF.
            </DialogDescription>
          </DialogHeader>
          {report.fileUrl && <PdfPreview pdfUrl={report.fileUrl} />}
        </DialogContent>
      </Dialog>
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
