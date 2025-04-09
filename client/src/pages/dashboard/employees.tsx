import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Loading from "@/components/layout/loading";
import EmployeeForm from "@/components/forms/employee-form";
import { Plus, Eye, Pencil } from "lucide-react";
import { Employee } from "@shared/schema";
import { format } from "date-fns";
import { EditEmployeeForm } from "@/components/forms/edit-employee-form";

const EmployeeDetails = ({ employee }: { employee: Employee }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">EPID</label>
          <p>{employee.epid}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Name</label>
          <p>{employee.name}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Designation</label>
          <p>{employee.designation}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Employment Status</label>
          <p>{employee.employmentStatus}</p>
        </div>
        {(employee.employmentStatus === "Probation" || employee.employmentStatus === "Temporary") && employee.termExpiry && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Term Expiry</label>
            <p>{format(new Date(employee.termExpiry), "dd MMM yyyy")}</p>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-muted-foreground">PAN Number</label>
          <p>{employee.panNumber}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Bank Account</label>
          <p>{employee.bankAccount}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Bank Name</label>
          <p>{employee.bankName || "Not specified"}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Adhar Number</label>
          <p>{employee.aadharCard}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Office Memo No</label>
          <p>{employee.officeMemoNo}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Joining Date</label>
          <p>{employee.joiningDate ? format(new Date(employee.joiningDate), "dd MMM yyyy") : "-"}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Joining Shift</label>
          <p>{employee.joiningShift}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Salary Register No</label>
          <p>{employee.salaryRegisterNo}</p>
        </div>
      </div>

      {/* Documents Section */}
      <div>
        <h3 className="text-lg font-medium mb-4">Documents</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">PAN Card</label>
            {employee.panCardUrl ? (
              <p>
                <a 
                  href={employee.panCardUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:underline"
                >
                  View Document
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground">Not available</p>
            )}
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Bank Account Proof</label>
            {employee.bankProofUrl ? (
              <p>
                <a 
                  href={employee.bankProofUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:underline"
                >
                  View Document
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground">Not available</p>
            )}
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Adhar Number</label>
            {employee.aadharCardUrl ? (
              <p>
                <a 
                  href={employee.aadharCardUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:underline"
                >
                  View Document
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground">Not available</p>
            )}
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Office Memo</label>
            {employee.officeMemoUrl ? (
              <p>
                <a 
                  href={employee.officeMemoUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:underline"
                >
                  View Document
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground">Not available</p>
            )}
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Joining Report</label>
            {employee.joiningReportUrl ? (
              <p>
                <a 
                  href={employee.joiningReportUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:underline"
                >
                  View Document
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground">Not available</p>
            )}
          </div>

          {/* Term Extension Office Memo - Only for Probation or Temporary employees */}
          {(employee.employmentStatus === "Probation" || employee.employmentStatus === "Temporary") && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Term Extension Office Memo</label>
              {employee.termExtensionUrl ? (
                <p>
                  <a 
                    href={employee.termExtensionUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-600 hover:underline"
                  >
                    View Document
                  </a>
                </p>
              ) : (
                <p className="text-muted-foreground">Not available</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function Employees() {
  const { toast } = useToast();
  const department = getCurrentDepartment();
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: [`/api/departments/${department?.id}/employees`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/departments/${department?.id}/employees`);
      return response.json();
    },
    enabled: !!department?.id
  });

  const addEmployee = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();
      
      const fileFields = {
        panCardDoc: data.panCardDoc,
        bankAccountDoc: data.bankAccountDoc,
        aadharCardDoc: data.aadharCardDoc,
        officeMemoDoc: data.officeMemoDoc,
        joiningReportDoc: data.joiningReportDoc,
        termExtensionDoc: data.termExtensionDoc,
      };
      
      for (const [key, value] of Object.entries(fileFields)) {
        if (value && typeof value === 'string' && value.startsWith('blob:')) {
          try {
            const response = await fetch(value);
            const blob = await response.blob();
            const file = new File([blob], `${key}.jpg`, { type: 'image/jpeg' });
            formData.append(key, file);
          } catch (error) {
            console.error(`Error processing ${key}:`, error);
          }
        }
      }
      
      Object.entries(data).forEach(([key, value]) => {
        if (key.endsWith("Doc")) return;
        if (value !== null && value !== undefined) {
          formData.append(key, String(value));
        }
      });
      
      await apiRequest("POST", `/api/departments/${department?.id}/employees`, formData, false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/employees`] });
      setIsAddingEmployee(false);
      toast({
        title: "Success",
        description: "Employee added successfully",
      });
    },
    onError: (error) => {
      console.error("Error adding employee:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add employee",
      });
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Employees</h1>
            <Dialog open={isAddingEmployee} onOpenChange={setIsAddingEmployee}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-primary/90 hover:to-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold">Add New Employee</DialogTitle>
                </DialogHeader>
                <EmployeeForm
                  onSubmit={async (data) => {
                    await addEmployee.mutateAsync(data);
                  }}
                  isLoading={addEmployee.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>EPID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Term Expiry</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.epid}</TableCell>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.designation}</TableCell>
                    <TableCell>{employee.employmentStatus}</TableCell>
                    <TableCell>
                      {(employee.employmentStatus === "Probation" ||
                        employee.employmentStatus === "Temporary") &&
                        employee.termExpiry ? (
                          format(new Date(employee.termExpiry), "dd MMM yyyy")
                        ) : (
                          "-"
                        )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setSelectedEmployee(employee)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Employee Details</DialogTitle>
                            </DialogHeader>
                            {selectedEmployee && <EmployeeDetails employee={selectedEmployee} />}
                          </DialogContent>
                        </Dialog>

                        {/* Edit Button */}
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Edit Employee Dialog */}
          {selectedEmployee && (
            <EditEmployeeForm
              employee={selectedEmployee}
              isOpen={isEditDialogOpen}
              onClose={() => {
                setIsEditDialogOpen(false);
                setSelectedEmployee(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/employees`] });
                setIsEditDialogOpen(false);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}