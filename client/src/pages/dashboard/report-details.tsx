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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState } from "react";

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

  const isWholeMonth = (fromDate: string, toDate: string): boolean => {
    // Check if period starts from day 1
    const fromParts = fromDate.split('-');
    if (fromParts.length !== 3 || fromParts[0] !== '01') return false;
    
    // Extract month and year
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
    return parseInt(toParts[0]) === lastDay;
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
                }
                .print-content {
                  width: 100%;
                  max-width: 100%;
                  padding: 0 2mm;
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
                  page-break-inside: avoid;
                }
                .certification-section {
                  page-break-inside: avoid;
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
        printWindow.onload = function() {
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
          
          // Add transaction ID barcode to the print window
          const contentElement = printWindow.document.querySelector('.print-content');
          if (contentElement) {
            const barcodeElement = printWindow.document.createElement('div');
            barcodeElement.className = 'page-footer-barcode';
            barcodeElement.innerHTML = `*${report.transactionId || "DRAFT"}*`;
            printWindow.document.body.appendChild(barcodeElement);
            
            const transactionTextElement = printWindow.document.createElement('div');
            transactionTextElement.className = 'transaction-id-text';
            transactionTextElement.innerHTML = report.transactionId || "DRAFT";
            printWindow.document.body.appendChild(transactionTextElement);
          }
          
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            printWindow.onafterprint = function() {
              printWindow.close();
            };
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
          isWholeMonth(period.fromDate, period.toDate) 
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
          }
          .print-content { 
            visibility: visible;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0 2mm; /* Reduce side padding */
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
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download Excel
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={() => setLocation("/dashboard/attendance")}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </div>

      <div className="print-content space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoItem label="Department" value={report.department?.name} />
              <InfoItem label="Month/Year" value={formatPeriod(report.year, report.month)} />
              <InfoItem label="Transaction ID" value={report.status === "draft" ? "*****" : (report.transactionId || "-")} />
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
                <TableHead className="whitespace-nowrap">Days</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.entries
                ?.sort((a, b) => {
                  // First sort by salary register number
                  const regNoA = a.employee?.salaryRegisterNo || '';
                  const regNoB = b.employee?.salaryRegisterNo || '';
                  
                  // Compare reg numbers first
                  const regNoCompare = regNoA.localeCompare(regNoB);
                  
                  // If reg numbers are the same, then sort by employee ID
                  if (regNoCompare === 0) {
                    const idA = a.employee?.epid || '';
                    const idB = b.employee?.epid || '';
                    return idA.localeCompare(idB);
                  }
                  
                  return regNoCompare;
                })
                .flatMap((entry, entryIndex) => {
                  try {
                    const periods = typeof entry.periods === 'string' 
                      ? JSON.parse(entry.periods) 
                      : entry.periods;

                    return periods.map((period: any, periodIndex: number) => {
                      // Calculate serial number based on flattened entries array
                      const serialNumber = 
                        (report.entries
                          ? report.entries
                              .slice(0, entryIndex)
                              .reduce((count, prevEntry) => {
                                const prevPeriods = typeof prevEntry.periods === 'string'
                                  ? JSON.parse(prevEntry.periods)
                                  : prevEntry.periods || [];
                                return count + (prevPeriods?.length || 0);
                              }, 0)
                          : 0) + periodIndex + 1;

                      return (
                        <TableRow key={`${entry.id}-${periodIndex}`}>
                          <TableCell className="whitespace-nowrap">{serialNumber}</TableCell>
                          <TableCell className="whitespace-nowrap">{entry.employee?.epid}</TableCell>
                          <TableCell>{entry.employee?.name}</TableCell>
                          <TableCell>{entry.employee?.designation}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatTermExpiry(entry.employee?.termExpiry)}</TableCell>
                          <TableCell className="whitespace-nowrap">{entry.employee?.salaryRegisterNo || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {isWholeMonth(period.fromDate, period.toDate) 
                              ? "- " 
                              : `${formatShortDate(period.fromDate)} to ${formatShortDate(period.toDate)}`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{period.days}</TableCell>
                          <TableCell>{period.remarks || "-"}</TableCell>
                        </TableRow>
                      );
                    });
                  } catch (error) {
                    console.error('Error parsing periods:', error);
                    return null;
                  }
                })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-8 space-y-4 text-right certification-section">
          <p>.Certified that the above attendance report is correct.</p>
          <div className="space-y-1">
          <div style={{ height: '3em' }}></div>
            <p>{report.department?.hodTitle}</p>
            <p>{report.department?.hodName}</p>
            <p>{report.department?.name}</p>
          </div>
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