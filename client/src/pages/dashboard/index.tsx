import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentDepartment, checkDepartmentName } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Employee, AttendanceReport, Ticket } from "@shared/schema";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Loading from "@/components/layout/loading";
import { Users, ClipboardCheck, Ticket as TicketIcon, AlertCircle, Clock, CheckCircle, ArrowRightLeft, Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TransferRequest {
  id: number;
  employeeId: number;
  fromDepartmentId: number;
  toDepartmentId: number;
  employeeName: string;
  employeeEpid: string;
  fromDepartmentName: string;
  orderNumber: string;
  orderDate: string;
  relievingDate: string;
  remarks: string;
  hodSignature: string;
  status: string;
}

export default function Dashboard() {
  const [department, setDepartment] = useState(getCurrentDepartment());
  const [, setLocation] = useLocation();
  const [showTransferPopup, setShowTransferPopup] = useState(false);
  const [hasShownPopup, setHasShownPopup] = useState(false);
  const [processedTransferIds, setProcessedTransferIds] = useState<number[]>([]);

  // Track visitor with department ID
  useVisitorTracking({ pageVisited: '/dashboard', departmentId: department?.id });

  // Check and update department name if needed
  useEffect(() => {
    const updateDepartmentName = async () => {
      const updatedDepartment = await checkDepartmentName();
      if (updatedDepartment) {
        setDepartment(updatedDepartment);

        // Check if HOD name is default or email contains @example.com
        if (
          updatedDepartment.hodName === "Default HOD Name" ||
          updatedDepartment.email?.includes("@example.com")
        ) {
          setLocation("/dashboard/settings");
        }
      }
    };

    updateDepartmentName();
  }, [setLocation]);

  const { data: employees, isLoading: loadingEmployees } = useQuery<Employee[]>({
    queryKey: [`/api/departments/${department?.id}/employees`],
  });

  const { data: reports, isLoading: loadingReports } = useQuery<AttendanceReport[]>({
    queryKey: [`/api/departments/${department?.id}/attendance`],
  });

  // Fetch pending incoming transfer requests
  const { data: incomingTransfers = [], refetch: refetchTransfers } = useQuery<TransferRequest[]>({
    queryKey: [`/api/departments/${department?.id}/transfer-requests/incoming`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/departments/${department?.id}/transfer-requests/incoming`);
      return response.json();
    },
    enabled: !!department?.id,
  });

  // Filter out already processed transfers
  const pendingTransfers = incomingTransfers.filter(t => !processedTransferIds.includes(t.id));

  // Fetch outgoing transfer requests (to check for release requests)
  const { data: outgoingTransfers = [], refetch: refetchOutgoing } = useQuery<TransferRequest[]>({
    queryKey: [`/api/departments/${department?.id}/transfer-requests/outgoing`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/departments/${department?.id}/transfer-requests/outgoing`);
      return response.json();
    },
    enabled: !!department?.id,
  });

  // Filter for Release Requests awaiting MY approval
  const releaseRequests = outgoingTransfers.filter(t => t.status === 'release_requested');

  // Popup state for Release Requests
  const [showReleasePopup, setShowReleasePopup] = useState(false);
  const [selectedReleaseRequest, setSelectedReleaseRequest] = useState<TransferRequest | null>(null);

  // Approval Form State
  const [approvalDetails, setApprovalDetails] = useState({
    orderNumber: "",
    orderDate: new Date().toISOString().split('T')[0],
    relievingDate: new Date().toISOString().split('T')[0],
    remarks: ""
  });

  const handleApproveRelease = async () => {
    if (!selectedReleaseRequest) return;
    // Order Number validation removed as fields are removed
    // if (!approvalDetails.orderNumber) { ... }

    try {
      await apiRequest(
        "POST",
        `/api/departments/${department?.id}/transfer-requests/${selectedReleaseRequest.id}/approve-release`,
        approvalDetails
      );

      // Refresh
      refetchOutgoing();
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/employees`] });

      // Close modal if no more
      setSelectedReleaseRequest(null);
      if (releaseRequests.length <= 1) setShowReleasePopup(false);

      setApprovalDetails({
        orderNumber: "",
        orderDate: new Date().toISOString().split('T')[0],
        relievingDate: new Date().toISOString().split('T')[0],
        remarks: ""
      });

    } catch (error) {
      console.error("Failed to approve release:", error);
      alert("Failed to approve release. Please check console.");
    }
  };

  // Check unique pending transfers from release requests
  const totalActionable = pendingTransfers.length + releaseRequests.length;

  // Show popup if there are pending transfers and we haven't shown it yet
  useEffect(() => {
    if ((pendingTransfers.length > 0 || releaseRequests.length > 0) && !hasShownPopup) {
      if (pendingTransfers.length > 0) {
        setShowTransferPopup(true);
      }

      // Auto-show Release Request popup if present
      if (releaseRequests.length > 0) {
        setShowReleasePopup(true);
        // Automatically select the first one to start the flow
        setSelectedReleaseRequest(releaseRequests[0]);
      }

      setHasShownPopup(true);
    }
  }, [pendingTransfers.length, releaseRequests.length, hasShownPopup]);

  // Fetch department tickets
  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: [`/api/departments/${department?.id}/tickets`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/departments/${department?.id}/tickets`);
      return response.json();
    },
    enabled: !!department?.id,
  });

  // Calculate ticket stats
  const ticketStats = {
    open: tickets.filter(t => t.status === 'Open').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
    closed: tickets.filter(t => t.status === 'Closed').length,
    total: tickets.length,
  };

  if (loadingEmployees || loadingReports) return <Loading />;

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Active Employees
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{employees?.filter(emp => emp.isActive === "active")?.length || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Attendance Reports
                </CardTitle>
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reports?.length || 0}</div>
              </CardContent>
            </Card>

            {/* Incoming Transfer Requests Card */}
            <Card
              className={`cursor-pointer hover:shadow-md transition-shadow ${pendingTransfers.length > 0 ? 'border-orange-300 bg-orange-50' : ''}`}
              onClick={() => setShowTransferPopup(true)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Transfer Requests
                </CardTitle>
                <ArrowRightLeft className={`h-4 w-4 ${pendingTransfers.length > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${pendingTransfers.length > 0 ? 'text-orange-600' : ''}`}>
                  {pendingTransfers.length}
                </div>
                {pendingTransfers.length > 0 && (
                  <p className="text-xs text-orange-600 mt-1">Incoming Pending</p>
                )}
              </CardContent>
            </Card>

            {/* Release Requests Card (NEW) */}
            <Card
              className={`cursor-pointer hover:shadow-md transition-shadow ${releaseRequests.length > 0 ? 'border-purple-300 bg-purple-50' : ''}`}
              onClick={() => setShowReleasePopup(true)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Release Requests
                </CardTitle>
                <ArrowRightLeft className={`h-4 w-4 ${releaseRequests.length > 0 ? 'text-purple-500' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${releaseRequests.length > 0 ? 'text-purple-600' : ''}`}>
                  {releaseRequests.length}
                </div>
                {releaseRequests.length > 0 && (
                  <p className="text-xs text-purple-600 mt-1">Action Required</p>
                )}
              </CardContent>
            </Card>

            {/* Support Tickets Status Card */}
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation("/dashboard/tickets")}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Support Tickets
                </CardTitle>
                <TicketIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-3">{ticketStats.total}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-blue-500" />
                    <span className="text-muted-foreground">Open:</span>
                    <span className="font-medium">{ticketStats.open}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-yellow-500" />
                    <span className="text-muted-foreground">In Progress:</span>
                    <span className="font-medium">{ticketStats.inProgress}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-muted-foreground">Resolved:</span>
                    <span className="font-medium">{ticketStats.resolved}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-gray-400" />
                    <span className="text-muted-foreground">Closed:</span>
                    <span className="font-medium">{ticketStats.closed}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Incoming Transfer Requests Popup */}
      <Dialog open={showTransferPopup} onOpenChange={setShowTransferPopup}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500" />
              Incoming Transfer Requests
            </DialogTitle>
            <DialogDescription>
              {pendingTransfers.length > 0
                ? `You have ${pendingTransfers.length} pending transfer request(s) to review.`
                : "No pending transfer requests."}
            </DialogDescription>
          </DialogHeader>

          {pendingTransfers.length > 0 ? (
            <div className="space-y-4 mt-4">
              {pendingTransfers.map((transfer) => (
                <div key={transfer.id} className="p-4 border rounded-lg bg-slate-50">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-lg">{transfer.employeeName}</h4>
                      <p className="text-sm text-muted-foreground">EPID: {transfer.employeeEpid}</p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700">
                      Pending
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">From:</span> {transfer.fromDepartmentName}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Order No:</span> {transfer.orderNumber}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Order Date:</span> {transfer.orderDate}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Relieving Date:</span> {transfer.relievingDate}
                    </div>
                  </div>
                  <div className="mt-3 text-sm">
                    <span className="text-muted-foreground">Remarks:</span>
                    <p className="text-xs mt-1 p-2 bg-white rounded border">{transfer.remarks}</p>
                  </div>
                  <div className="mt-3 text-xs italic text-muted-foreground">
                    Signed by: {transfer.hodSignature}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={async () => {
                        try {
                          await apiRequest("POST", `/api/departments/${department?.id}/transfer-requests/${transfer.id}/accept`);
                          // Add to processed list - this removes from UI immediately
                          const newProcessedIds = [...processedTransferIds, transfer.id];
                          setProcessedTransferIds(newProcessedIds);
                          // Close popup if no more pending (current list minus newly processed)
                          const remaining = incomingTransfers.filter(t => !newProcessedIds.includes(t.id));
                          if (remaining.length === 0) {
                            setShowTransferPopup(false);
                          }
                          // Also refresh queries
                          refetchTransfers();
                          queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/employees`] });
                        } catch (error) {
                          console.error("Error accepting transfer:", error);
                        }
                      }}
                    >
                      Accept Transfer
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        const remarks = prompt("Please enter rejection reason:");
                        if (remarks) {
                          try {
                            await apiRequest("POST", `/api/departments/${department?.id}/transfer-requests/${transfer.id}/reject`, { rejectionRemarks: remarks });
                            // Add to processed list - this removes from UI immediately
                            const newProcessedIds = [...processedTransferIds, transfer.id];
                            setProcessedTransferIds(newProcessedIds);
                            // Close popup if no more pending
                            const remaining = incomingTransfers.filter(t => !newProcessedIds.includes(t.id));
                            if (remaining.length === 0) {
                              setShowTransferPopup(false);
                            }
                            // Also refresh query
                            refetchTransfers();
                          } catch (error) {
                            console.error("Error rejecting transfer:", error);
                          }
                        }
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No pending transfer requests at this time.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Release Requests Approval Popup */}
      <Dialog open={showReleasePopup} onOpenChange={setShowReleasePopup}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-purple-500" />
              Approve Release Requests
            </DialogTitle>
            <DialogDescription>
              {releaseRequests.length > 0
                ? `You have ${releaseRequests.length} requests from other departments to release an employee.`
                : "No pending release requests."}
            </DialogDescription>
          </DialogHeader>

          {releaseRequests.length > 0 ? (
            <div className="space-y-4 mt-4">
              {releaseRequests.map((req) => (
                <div key={req.id} className="p-4 border rounded-lg bg-slate-50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold text-lg">{req.employeeName}</h4>
                      <p className="text-sm text-muted-foreground">EPID: {req.employeeEpid}</p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700">
                      Transfer Requested
                    </span>
                  </div>

                  <div className="text-sm mb-3">
                    <span className="text-muted-foreground">Requested By:</span> <strong>{req.toDepartmentName}</strong> (Receiver)
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Remarks:</span>
                    <p className="text-xs mt-1 p-2 bg-white rounded border">{req.remarks}</p>
                  </div>

                  {selectedReleaseRequest?.id === req.id ? (
                    <div className="mt-4 p-4 border rounded bg-white shadow-sm">
                      <div className="space-y-4 mb-4">
                        <div className="space-y-2">
                          <Label>Remarks</Label>
                          <Textarea
                            value={approvalDetails.remarks}
                            onChange={(e) => setApprovalDetails({ ...approvalDetails, remarks: e.target.value })}
                            placeholder="Any final remarks..."
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedReleaseRequest(null)}>Cancel</Button>
                        <Button
                          size="sm"
                          onClick={handleApproveRelease}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          Confirm Release
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm" className="bg-purple-600 hover:bg-purple-700"
                        onClick={() => setSelectedReleaseRequest(req)}
                      >
                        Approve & Release
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => {
                        // Reuse rejection endpoint? Rejection endpoint works for ANY request if status matches allowed transitions.
                        // Currently rejection endpoint sets status='rejected'. 
                        // It doesn't check current status strictness beyond existence usually.
                        // But my new endpoint might be needed if logic differs.
                        // Actually, simple rejection is fine.
                        const remarks = prompt("Reject Release Request Reasons:");
                        if (remarks) {
                          apiRequest("POST", `/api/departments/${department?.id}/transfer-requests/${req.id}/reject`, { rejectionRemarks: remarks })
                            .then(() => refetchOutgoing());
                        }
                      }}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No actionable release requests.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
