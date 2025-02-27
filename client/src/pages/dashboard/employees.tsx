import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Loading from "@/components/layout/loading";
import EmployeeForm from "@/components/forms/employee-form";
import { Plus, Trash2, Eye } from "lucide-react";
import { Employee } from "@shared/schema";
import { format } from "date-fns";

const EmployeeDetails = ({ employee }: { employee: Employee }) => {
  return (
    <div className="space-y-4">
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
          <label className="text-sm font-medium text-muted-foreground">Aadhar Card</label>
          <p>{employee.aadharCard}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Office Memo No</label>
          <p>{employee.officeMemoNo}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Joining Date</label>
          <p>{format(new Date(employee.joiningDate), "dd MMM yyyy")}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Joining Shift</label>
          <p>{employee.joiningShift}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Salary Register No</label>
          <p>{employee.salaryRegisterNo}</p>
        </div>
        {/* Document Preview Section */}
        {employee.panCardUrl && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">PAN Card Document</label>
            <img src={employee.panCardUrl} alt="PAN Card" className="max-w-xs rounded-lg border" />
          </div>
        )}
        {employee.bankProofUrl && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Bank Proof</label>
            <img src={employee.bankProofUrl} alt="Bank Proof" className="max-w-xs rounded-lg border" />
          </div>
        )}
        {employee.aadharCardUrl && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Aadhar Card Document</label>
            <img src={employee.aadharCardUrl} alt="Aadhar Card" className="max-w-xs rounded-lg border" />
          </div>
        )}
        {employee.officeMemoUrl && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Office Memo Document</label>
            <img src={employee.officeMemoUrl} alt="Office Memo" className="max-w-xs rounded-lg border" />
          </div>
        )}
        {employee.joiningReportUrl && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Joining Report</label>
            <img src={employee.joiningReportUrl} alt="Joining Report" className="max-w-xs rounded-lg border" />
          </div>
        )}
      </div>
    </div>
  );
};

export default function Employees() {
  const { toast } = useToast();
  const department = getCurrentDepartment();
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: [`/api/departments/${department?.id}/employees`],
  });

  const addEmployee = useMutation({
    mutationFn: async (formData: FormData) => {
      // Log the received form data for debugging
      console.log("Form data received:", Object.fromEntries(formData));

      return apiRequest(
        "POST",
        `/api/departments/${department?.id}/employees`,
        formData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/employees`] });
      setIsAddingEmployee(false);
      toast({
        title: "Success",
        description: "Employee added successfully",
      });
    },
    onError: (error: any) => {
      console.error("Error adding employee:", error);
      let errorMessage = "Failed to add employee";

      try {
        if (error.message.includes(':')) {
          const errorData = JSON.parse(error.message.split(': ')[1]);
          if (errorData.message) {
            errorMessage = errorData.message;
          }
          if (errorData.details) {
            console.error("Validation errors:", errorData.details);
          }
        }
      } catch (e) {
        console.error("Error parsing error message:", e);
      }

      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/departments/${department?.id}/employees/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/employees`] });
      toast({
        title: "Success",
        description: "Employee deleted successfully",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete employee",
      });
    },
  });

  const handleFormSubmit = async (data: any) => {
    const formData = new FormData();

    // Add required fields
    const requiredFields = [
      'epid', 'name', 'designation', 'employmentStatus',
      'panNumber', 'bankAccount', 'aadharCard', 'officeMemoNo',
      'joiningDate', 'joiningShift', 'salaryRegisterNo'
    ];

    requiredFields.forEach(field => {
      if (data[field] === undefined || data[field] === '') {
        throw new Error(`${field} is required`);
      }
      formData.append(field, data[field]);
    });

    // Add optional fields
    if (data.termExpiry) {
      formData.append('termExpiry', data.termExpiry);
    }

    // Handle document uploads
    const documentFields = {
      panCardDoc: 'panCard',
      bankAccountDoc: 'bankProof',
      aadharCardDoc: 'aadharCard',
      officeMemoDoc: 'officeMemo',
      joiningReportDoc: 'joiningReport',
      termExtensionDoc: 'termExtension'
    };

    Object.entries(documentFields).forEach(([formField, serverField]) => {
      const file = data[formField]?.[0];
      if (file instanceof File) {
        formData.append(serverField, file);
      }
    });

    // Log form data for debugging
    console.log("Form data being submitted:", Object.fromEntries(formData));

    await addEmployee.mutateAsync(formData);
  };

  if (isLoading) return <Loading />;

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
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
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold">Add New Employee</DialogTitle>
              </DialogHeader>
              <EmployeeForm
                onSubmit={handleFormSubmit}
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
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Employee Details</DialogTitle>
                          </DialogHeader>
                          {selectedEmployee && <EmployeeDetails employee={selectedEmployee} />}
                        </DialogContent>
                      </Dialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this employee? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteEmployee.mutate(employee.id)}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}