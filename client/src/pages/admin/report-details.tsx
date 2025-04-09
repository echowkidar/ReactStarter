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
                  margin: 5mm;
                }
                body {
                  margin: 0;
                  padding: 5px;
                  font-family: system-ui, -apple-system, sans-serif;
                  font-size: 9pt;
                }
                .print-content {
                  width: 100%;
                  max-width: 100%;
                }
                
                /* Table styles for compact display */
                table {
                  font-size: 8pt;
                  width: 100%;
                  border-collapse: collapse;
                  margin-bottom: 5px;
                  table-layout: fixed;
                }
                th, td {
                  padding: 3px 4px;
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
                
                /* Column widths for table */
                table th:nth-child(1), table td:nth-child(1) { width: 8%; } /* Employee ID */
                table th:nth-child(2), table td:nth-child(2) { width: 15%; } /* Name */
                table th:nth-child(3), table td:nth-child(3) { width: 15%; } /* Designation */
                table th:nth-child(4), table td:nth-child(4) { width: 20%; } /* Period */
                table th:nth-child(5), table td:nth-child(5) { width: 7%; } /* Days */
                table th:nth-child(6), table td:nth-child(6) { width: 35%; } /* Remarks */
                
                /* Whitespace control for table cells */
                .whitespace-nowrap {
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
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
            size: portrait;
            margin: 5mm;
          }
          @media print {
            body { 
              visibility: hidden;
              margin: 0;
              padding: 0;
            }
            .print-content { 
              visibility: visible;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              padding: 5px;
            }
            .no-print {
              display: none !important;
            }
            
            /* Reduce spacing */
            .print-content .space-y-6 {
              margin-top: 0 !important;
              margin-bottom: 0 !important;
            }
            
            /* Make table more compact */
            .print-content table {
              font-size: 8pt;
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            
            .print-content tr {
              page-break-inside: avoid;
            }
            
            .print-content th, 
            .print-content td {
              padding: 3px 4px !important;
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
            .print-content th:nth-child(1), .print-content td:nth-child(1) { width: 8% !important; } /* Employee ID */
            .print-content th:nth-child(2), .print-content td:nth-child(2) { width: 15% !important; } /* Name */
            .print-content th:nth-child(3), .print-content td:nth-child(3) { width: 15% !important; } /* Designation */
            .print-content th:nth-child(4), .print-content td:nth-child(4) { width: 20% !important; } /* Period */
            .print-content th:nth-child(5), .print-content td:nth-child(5) { width: 7% !important; } /* Days */
            .print-content th:nth-child(6), .print-content td:nth-child(6) { width: 35% !important; } /* Remarks */
          }
        `}</style>

        <div className="print-content space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Attendance Report</CardTitle>
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
              <CardTitle></CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">ID</TableHead>
                    <TableHead className="whitespace-nowrap">Name</TableHead>
                    <TableHead className="whitespace-nowrap">Designation</TableHead>
                    <TableHead className="whitespace-nowrap">Emp Status</TableHead>
                    <TableHead className="whitespace-nowrap">Reg.No</TableHead>
                    <TableHead className="whitespace-nowrap">Period</TableHead>
                    <TableHead className="whitespace-nowrap">Days</TableHead>
                    <TableHead className="whitespace-nowrap">Remarks</TableHead>
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
                          <TableCell className="whitespace-nowrap">{entry.employee?.epid}</TableCell>
                          <TableCell className="whitespace-nowrap">{entry.employee?.name}</TableCell>
                          <TableCell className="whitespace-nowrap">{entry.employee?.designation}</TableCell>
                          <TableCell className="whitespace-nowrap">{entry.employee?.employmentStatus || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap">{entry.employee?.salaryRegisterNo || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatShortDate(period.fromDate)} to {formatShortDate(period.toDate)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{period.days}</TableCell>
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
            <div style={{ height: '3em' }}></div>
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