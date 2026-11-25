import { isTermedStatus } from "@shared/employeeKind";
import { useQuery } from "@tanstack/react-query";
import { FUND_REPORT_LABEL } from "@shared/sections";
import { getReportPrefix } from "@shared/reportKind";
import { groupEntriesByEmployee } from "@shared/entryPeriods";
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
import { useState, useEffect, useMemo } from "react";
import { getPayLevelOrder } from "@/lib/pay-levels";
import { apiRequest } from "@/lib/queryClient";

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

// Reporting employees: the reason of reporting (remarks entered by Admin Non Teaching)
// is shown in the Remarks column on the first period row of that employee.
const remarksWithReporting = (entry: any, period: any, periodIndex: number) => {
  const own = String(period?.remarks || "").trim();
  const rep = periodIndex === 0 ? String(entry?.reportingInfo?.remarks || "").trim() : "";
  const parts = [own, rep].filter((v, i, a) => v && a.indexOf(v) === i);
  return parts.length ? parts.join("; ") : "-";
};

// Department page: /dashboard/reports/:id
export default function ReportDetails() {
  const [, params] = useRoute("/dashboard/reports/:id");
  const [, setLocation] = useLocation();
  return <ReportDetailsView reportId={params?.id} onClose={() => setLocation("/dashboard/attendance")} />;
}

// The report view + print. Shared by the department page and the Admin page
// (client/src/pages/admin/report-details.tsx), so both print exactly the same.
export function ReportDetailsView({ reportId, onClose, extraActions }: {
  reportId?: string;
  onClose: () => void;
  /** Extra buttons shown before "Download Excel" (Admin: Main / Supplementary) */
  extraActions?: React.ReactNode;
}) {
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

  const { data: allReports } = useQuery<AttendanceReport[]>({
    queryKey: [`/api/departments/${report?.departmentId}/attendance`],
    enabled: !!report?.departmentId,
  });

  // 'Supplementary ' / 'Revised ' / '' — uses the stored Main/Supplementary kind;
  // old reports (no stored kind) keep the previous derived label.
  const reportPrefix = useMemo(() => {
    if (!report || !allReports) return '';
    return getReportPrefix(report as any, allReports as any);
  }, [report, allReports]);

  // Reporting Employees report (Admin Non Teaching) — separate report type
  const isReportingReport = (report as any)?.reportType === 'reporting';
  const isFundReportType = (report as any)?.reportType === 'fund';
  const reportTypeSuffix = isReportingReport ? ' (Reporting Employees)' : isFundReportType ? ` (${FUND_REPORT_LABEL})` : '';

  // Revolving Funds report: shown as the prescribed "Muster Roll for Daily Wagers"
  const { data: muster, isLoading: isLoadingMuster, error: musterError } = useQuery<MusterData>({
    queryKey: [`/api/attendance/${reportId}/muster`],
    enabled: !!reportId && isFundReportType,
    queryFn: async () => (await apiRequest("GET", `/api/attendance/${reportId}/muster`)).json(),
  });
  const musterTitle = "Muster Roll for Daily Wagers";
  const pageOrientation = isFundReportType ? "A4 landscape" : "portrait";

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

  // One line per employee: rows saved one-per-period are joined back together
  const employeeEntries = groupEntriesByEmployee(report.entries);

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
    return `${day}-${month}-${year}`;
  };

  const formatTermExpiry = (dateStr: string | null | undefined, employmentStatus?: string): string => {
    if (!dateStr) return "-";
    if (employmentStatus && !isTermedStatus(employmentStatus)) return "-";

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
              <title>${isFundReportType ? musterTitle : `${reportPrefix}Attendance Report${reportTypeSuffix}`}</title>
              <style>${styles}</style>
              <style media="all">
                @page { 
                  size: ${pageOrientation};
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
                  border: 1px solid #000;
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
                  border: 1px solid #000;
                  margin-bottom: 5px;
                }
                .card-header {
                  padding: 5px 8px;
                  background-color: #f9fafb;
                  border-bottom: 1px solid #000;
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
                  color: #000;
                  font-weight: bold;
                  margin-bottom: 1px;
                }
                .info-value {
                  font-size: 9pt;
                  font-weight: bold;
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
                ${MUSTER_PRINT_CSS}
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

    if (isFundReportType) {
      if (!muster) {
        alert('The Muster Roll is still loading. Please try again in a moment.');
        return;
      }
      const used = new Set<string>();
      muster.blocks.forEach((b, bi) => {
        const rows: any[][] = [
          [musterTitle],
          [`Name of the Department: ${muster.departmentName || report.department?.name || ''}`, '', '', '', `Wage Month: ${musterMonthLabel(muster)}`],
          [`Payment Head: ${b.headName || '________'}`, '', '', '', `Payment Code: ${b.paymentCode || '________'}`],
          [b.sectionLabel || ''],
          ['Transaction ID:', report.transactionId || '-', 'Status:', report.status, 'Despatch No:', report.despatchNo || '-', 'Despatch Date:', report.despatchDate ? formatDispatchDate(report.despatchDate) : '-'],
          [''],
          ['S. No.', 'Emp ID', 'Name of the Employee', 'Designation', 'Basic Rate per Day (Rs.)', 'VDA per day (Rs.)', 'Total Days Worked', 'Gross Wages (Rs.)', 'Employee Deduction', '', '', 'Net Payable Amount (Rs.)'],
          ['', '', '', '', '', '', '', '', 'EPF deduction (if applicable) Rs.', 'ESI deduction (if applicable) Rs.', 'MAS deduction (if applicable) Rs.', ''],
        ];
        const headerRow = rows.length - 2;
        b.lines.forEach(l => rows.push([
          l.sno, l.epid, l.name, l.designation || '',
          l.missingCategory ? '' : musterRate(l.basic), l.missingCategory ? '' : musterRate(l.vda),
          l.days, Math.round(l.gross || 0), Math.round(l.epf || 0), Math.round(l.esi || 0), Math.round(l.mas || 0), Math.round(l.net || 0),
        ]));
        rows.push(['', '', 'Total', '', '', '', b.totals.days, Math.round(b.totals.gross || 0), Math.round(b.totals.epf || 0), Math.round(b.totals.esi || 0), Math.round(b.totals.mas || 0), Math.round(b.totals.net || 0)]);
        rows.push(['']);
        rows.push(['Passed for payment: ______________', '', '', '', 'Entered at Page No. ______']);
        rows.push(['']);
        rows.push(['Note: Any handwritten / manual addition, correction, remark or comment on this report shall not be considered.']);
        rows.push(['Certified that the above attendance report is correct.']);
        rows.push(['']);
        rows.push([report.department?.hodName || '']);
        rows.push([report.department?.hodTitle || '']);
        rows.push([report.department?.name || '']);
        rows.push(['Signature of HOD / Stamp']);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!merges'] = [
          { s: { r: headerRow, c: 8 }, e: { r: headerRow, c: 10 } },
          ...[0, 1, 2, 3, 4, 5, 6, 7, 11].map(c => ({ s: { r: headerRow, c }, e: { r: headerRow + 1, c } })),
        ];
        ws['!cols'] = [{ wch: 6 }, { wch: 9 }, { wch: 26 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 15 }];
        const name = (b.sectionLabel || `Block ${bi + 1}`).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 28).trim() || `Block ${bi + 1}`;
        let n = name, k = 2;
        while (used.has(n.toLowerCase())) n = `${name.slice(0, 26)} ${k++}`;
        used.add(n.toLowerCase());
        XLSX.utils.book_append_sheet(wb, ws, n);
      });
      if (muster.blocks.length === 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[musterTitle], ['No employees in this report.']]), 'Muster Roll');
      }
      XLSX.writeFile(wb, `muster_roll_${report.department?.name}_${report.year}_${report.month}.xlsx`);
      return;
    }

    const headerData = [
      [`${reportPrefix}Attendance Report${reportTypeSuffix}`],
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
    employeeEntries.forEach(entry => {
      const periods = typeof entry.periods === 'string' ? JSON.parse(entry.periods) : entry.periods;
      periods.forEach((period: any, periodIdx: number) => {
        attendanceData.push([
          serialNumber++,
          entry.employee?.epid,
          (entry as any).reportingInfo ? `${entry.employee?.name} (Parent Dept: ${(entry as any).reportingInfo.parentDepartmentName})` : entry.employee?.name,
          entry.employee?.designation,
          formatTermExpiry(entry.employee?.termExpiry, entry.employee?.employmentStatus),
          entry.employee?.salaryRegisterNo || '-',
          isWholeCurrentMonth(period.fromDate, period.toDate, report.month, report.year)
            ? "- "
            : `${formatShortDate(period.fromDate)} to ${formatShortDate(period.toDate)}`,
          period.days,
          remarksWithReporting(entry, period, periodIdx)
        ]);
      });
    });

    const certificationData = [
      [''],
      ['Note: Any handwritten / manual addition, correction, remark or comment on this report shall not be considered.'],
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

    XLSX.utils.book_append_sheet(wb, ws, `${reportPrefix}Attendance Report`.trim());
    XLSX.writeFile(wb, `attendance_report_${report.department?.name}_${report.year}_${report.month}.xlsx`);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <style type="text/css" media="print">{`
        @page { 
          size: ${pageOrientation};
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
            border: 1px solid #000;
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
            border: 1px solid #000 !important;
            margin-bottom: 5px !important;
          }
          
          .print-content [class*="cardHeader"] {
            padding: 5px 8px !important;
            background-color: #f9fafb !important;
            border-bottom: 1px solid #000 !important;
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
          
          /* Bold all info labels and values in card */
          .print-content .text-sm.font-medium,
          .print-content [class*="muted"] {
            font-weight: bold !important;
            color: #000 !important;
          }
          
          /* Bold all info values (the mt-1 divs under labels) */
          .print-content .mt-1 {
            font-weight: bold !important;
            color: #000 !important;
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
          ${MUSTER_PRINT_CSS}
        }
      `}</style>

      <div className="flex justify-between items-center no-print">
        <h1 className="text-2xl font-bold">{isFundReportType ? musterTitle : `${reportPrefix}Attendance Report${reportTypeSuffix}`} Details</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {extraActions}
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
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </div>

      <div className="print-content space-y-6">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 print:flex-row print:items-center print:justify-between">
            <CardTitle>
              {isFundReportType
                ? (report.status === 'draft' ? `Draft ${musterTitle}` : musterTitle)
                : (report.status === 'draft' ? `Draft ${reportPrefix}Attendance Report${reportTypeSuffix}` : `${reportPrefix}Attendance Report${reportTypeSuffix}`)}
              {isReportingReport && (
                <div className="text-xs font-normal mt-1">Employees reporting to {report.department?.name}, awaiting posting</div>
              )}
            </CardTitle>
            {report.status === 'sent' ? (
              /* Sent status: label + value ek line mein, wider box */
              <div className="border border-black rounded flex items-center w-full sm:w-[420px] h-[40px] bg-white mr-2 shrink-0 print:w-[420px] overflow-hidden">
                <div className="flex items-center flex-1 px-3 gap-1">
                  <span className="text-[10px] font-bold text-black whitespace-nowrap">D. No.</span>
                  <span className="text-[10px] font-bold text-black whitespace-nowrap">{report.despatchNo || '—'}</span>
                </div>
                <div className="w-px h-full bg-black" />
                <div className="flex items-center flex-1 px-3 gap-1">
                  <span className="text-[10px] font-bold text-black whitespace-nowrap">D. Date</span>
                  <span className="text-[10px] font-bold text-black whitespace-nowrap">{report.despatchDate ? formatDispatchDate(report.despatchDate) : '—'}</span>
                </div>
              </div>
            ) : (
              /* Submitted / draft / other: original style — sirf labels */
              <div className="border border-black rounded px-4 py-2.5 flex items-center w-full sm:w-[340px] h-[64px] bg-white mr-2 shrink-0 print:w-[340px]">
                <span className="text-sm font-bold text-black flex-1">D. No.</span>
                <span className="text-sm font-bold text-black flex-1">D. Date</span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoItem label="Department" value={report.department?.name} />
              <InfoItem label="Month/Year" value={formatPeriod(report.year, report.month)} />
              <InfoItem
                label="Transaction ID"
                value={
                  report.status === "draft" ? "*****" :
                    report.status === "sent" ? (
                      <span className="print:text-[13pt] print:font-bold print:tracking-wider">{report.transactionId || "-"}</span>
                    ) :
                      (report.transactionId ? (
                        <>
                          <span className="print:hidden font-mono tracking-widest text-muted-foreground">***</span>
                          <span className="hidden print:inline print:text-[13pt] print:font-bold print:tracking-wider">{report.transactionId}</span>
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
              {report.despatchNo && report.status !== 'sent' && report.status !== 'submitted' && (
                <InfoItem label="Despatch No" value={report.despatchNo} />
              )}
              {report.despatchDate && report.status !== 'sent' && report.status !== 'submitted' && (
                <InfoItem
                  label="Despatch Date"
                  value={report.despatchDate ? formatDispatchDate(report.despatchDate) : '-'}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {isFundReportType ? (
          <MusterRoll
            report={report}
            muster={muster}
            isLoading={isLoadingMuster}
            error={musterError as Error | null}
            feedbackRemark={feedbackRemark}
          />
        ) : (
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
              [...employeeEntries]
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
                              <TableCell rowSpan={periodCount}>
                                {entry.employee?.name}
                                {(entry as any).reportingInfo && (
                                  <div className="text-[10px] text-muted-foreground">Parent Dept: {(entry as any).reportingInfo.parentDepartmentName}</div>
                                )}
                              </TableCell>
                              <TableCell rowSpan={periodCount}>{entry.employee?.designation}</TableCell>
                              <TableCell className="whitespace-nowrap" rowSpan={periodCount}>{formatTermExpiry(entry.employee?.termExpiry, entry.employee?.employmentStatus)}</TableCell>
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
                          <TableCell>{remarksWithReporting(entry, period, periodIndex)}</TableCell>
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
                      <p className="text-[11px] italic -mb-3 text-left">Note: Any handwritten / manual addition, correction, remark or comment on this report shall not be considered.</p>
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
              const sortedEntries = [...employeeEntries].sort((a, b) => {
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
        )}
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


// ── Muster Roll for Daily Wagers (Revolving Funds or Other Similar Funds reports) ──
interface MusterLine {
  sno: number; epid: string; name: string; designation?: string; category?: string;
  basic: number; vda: number; days: number; gross: number; epf: number; esi: number; mas: number; net: number;
  missingCategory?: boolean;
}
interface MusterBlock {
  section: string; sectionLabel: string; headName: string; paymentCode: string;
  lines: MusterLine[];
  totals: { employees: number; days: number; gross: number; epf: number; esi: number; mas: number; net: number };
}
interface MusterData {
  reportId: string | number; departmentId: string | number; departmentName: string;
  month: number; year: number; blocks: MusterBlock[];
}

const musterMonthLabel = (m: { month: number; year: number }) =>
  new Date(m.year, m.month - 1).toLocaleDateString("en-US", { year: "numeric", month: "long" });
const musterRate = (n: number | null | undefined) => Number(n || 0).toFixed(2);
const musterAmt = (n: number | null | undefined) => Math.round(Number(n || 0)).toLocaleString("en-IN");

const MUSTER_PRINT_CSS = `
  .muster-block + .muster-block { page-break-before: always; break-before: page; }
  .print-content .muster-section { font-size: 12pt !important; font-weight: 700 !important; }
  .print-content table.muster-table { table-layout: fixed; width: 100%; border-collapse: collapse; }
  .print-content table.muster-table th, .print-content table.muster-table td {
    padding: 3px 3px !important; border: 1px solid #000; font-size: 8pt;
    white-space: normal !important; overflow: visible; text-overflow: clip;
  }
  .print-content table.muster-table th { text-align: center; background-color: #f3f4f6 !important; }
  .print-content table.muster-table td.mnum { text-align: right; }
  .print-content table.muster-table .mc-sno { width: 4% !important; }
  .print-content table.muster-table .mc-id { width: 7% !important; }
  .print-content table.muster-table .mc-name { width: 17% !important; }
  .print-content table.muster-table .mc-des { width: 14% !important; }
  .print-content table.muster-table .mc-rate { width: 8% !important; }
  .print-content table.muster-table .mc-days { width: 7% !important; }
  .print-content table.muster-table .mc-amt { width: 9% !important; }
  .print-content table.muster-table .mc-ded { width: 8% !important; }
  .print-content table.muster-table .mc-net { width: 9% !important; }
`;

function MusterRoll({ report, muster, isLoading, error, feedbackRemark }: {
  report: ExtendedAttendanceReport;
  muster?: MusterData;
  isLoading: boolean;
  error: Error | null;
  feedbackRemark: string | null;
}) {
  if (isLoading) return <div className="mt-4"><Skeleton className="h-40 w-full" /></div>;
  if (error || !muster) {
    return <p className="mt-4 text-center text-sm text-red-600">Unable to load the Muster Roll{error?.message ? `: ${error.message}` : "."}</p>;
  }
  if (muster.blocks.length === 0) {
    return <p className="mt-4 text-center text-sm text-muted-foreground">No employees in this report.</p>;
  }
  const th = "border border-black px-1 py-1 text-center align-middle font-bold bg-gray-100 dark:bg-gray-800";
  const td = "border border-black px-1 py-0.5 align-top";
  return (
    <>
      {muster.blocks.map((b, bi) => (
        <div key={`${b.section}-${bi}`} className="muster-block mt-4">
          <div className="space-y-1 mb-2">
            {/* The first block sits under the report header (title, department, month) — no repeat.
                Later blocks start on a new page, so they carry the title and department again. */}
            {bi > 0 && (
              <>
                <p className="font-bold text-sm text-center">Muster Roll for Daily Wagers</p>
                <p className="text-sm font-semibold">
                  Name of the Department: {muster.departmentName || report.department?.name} &nbsp;|&nbsp; Wage Month: {musterMonthLabel(muster)}
                </p>
              </>
            )}
            <p className="text-sm font-semibold">
              Payment Head: {b.headName || "________"} &nbsp;|&nbsp; Payment Code: {b.paymentCode || "________"}
            </p>
            {b.sectionLabel && <p className="muster-section text-base font-bold">{b.sectionLabel}</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="muster-table w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th rowSpan={2} className={`${th} mc-sno`}>S. No.</th>
                  <th rowSpan={2} className={`${th} mc-id`}>Emp ID</th>
                  <th rowSpan={2} className={`${th} mc-name`}>Name of the Employee</th>
                  <th rowSpan={2} className={`${th} mc-des`}>Designation</th>
                  <th rowSpan={2} className={`${th} mc-rate`}>Basic Rate per Day (Rs.)</th>
                  <th rowSpan={2} className={`${th} mc-rate`}>VDA per day (Rs.)</th>
                  <th rowSpan={2} className={`${th} mc-days`}>Total Days Worked</th>
                  <th rowSpan={2} className={`${th} mc-amt`}>Gross Wages (Rs.)</th>
                  <th colSpan={3} className={th}>Employee Deduction</th>
                  <th rowSpan={2} className={`${th} mc-net`}>Net Payable Amount (Rs.)</th>
                </tr>
                <tr>
                  <th className={`${th} mc-ded`}>EPF deduction (if applicable) Rs.</th>
                  <th className={`${th} mc-ded`}>ESI deduction (if applicable) Rs.</th>
                  <th className={`${th} mc-ded`}>MAS deduction (if applicable) Rs.</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map(l => (
                  <tr key={`${l.epid}-${l.sno}`} style={{ pageBreakInside: "avoid" }}>
                    <td className={td}>{l.sno}</td>
                    <td className={`${td} whitespace-nowrap`}>{l.epid}</td>
                    <td className={td}>
                      {l.name}
                      {l.missingCategory && (
                        <div className="text-[10px] font-bold text-red-600 print:text-black">category not set</div>
                      )}
                    </td>
                    <td className={td}>{l.designation}</td>
                    <td className={`${td} mnum text-right`}>{l.missingCategory ? "" : musterRate(l.basic)}</td>
                    <td className={`${td} mnum text-right`}>{l.missingCategory ? "" : musterRate(l.vda)}</td>
                    <td className={`${td} mnum text-right`}>{l.days}</td>
                    <td className={`${td} mnum text-right`}>{musterAmt(l.gross)}</td>
                    <td className={`${td} mnum text-right`}>{musterAmt(l.epf)}</td>
                    <td className={`${td} mnum text-right`}>{musterAmt(l.esi)}</td>
                    <td className={`${td} mnum text-right`}>{musterAmt(l.mas)}</td>
                    <td className={`${td} mnum text-right`}>{musterAmt(l.net)}</td>
                  </tr>
                ))}
                <tr className="font-bold" style={{ pageBreakInside: "avoid" }}>
                  <td className={td} colSpan={6}>Total</td>
                  <td className={`${td} mnum text-right`}>{b.totals.days}</td>
                  <td className={`${td} mnum text-right`}>{musterAmt(b.totals.gross)}</td>
                  <td className={`${td} mnum text-right`}>{musterAmt(b.totals.epf)}</td>
                  <td className={`${td} mnum text-right`}>{musterAmt(b.totals.esi)}</td>
                  <td className={`${td} mnum text-right`}>{musterAmt(b.totals.mas)}</td>
                  <td className={`${td} mnum text-right`}>{musterAmt(b.totals.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-between text-sm" style={{ pageBreakInside: "avoid" }}>
            <p>Passed for payment: ______________________</p>
            <p>Entered at Page No. ____________</p>
          </div>

          <div className="mt-8 space-y-4 text-right certification-section" style={{ pageBreakInside: "avoid" }}>
            <p className="text-[11px] italic -mb-3 text-left">Note: Any handwritten / manual addition, correction, remark or comment on this report shall not be considered.</p>
            <p>Certified that the above attendance report is correct.</p>
            {feedbackRemark && (
              <div className="mb-2 w-full flex justify-end">
                <span className="italic font-bold text-[11px] text-black tracking-tight mt-1 pr-1 text-right" style={{ textWrap: "balance", maxWidth: "80%" } as any}>
                  {feedbackRemark.replace(/^(Positive:|Negative:)\s*/, "")}
                </span>
              </div>
            )}
            <div className="space-y-1">
              <div style={{ height: "3em" }}></div>
              <p>{report.department?.hodName}</p>
              <p>{report.department?.hodTitle}</p>
              <p>{report.department?.name}</p>
              <p className="text-[10px]">Signature of HOD / Stamp</p>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
