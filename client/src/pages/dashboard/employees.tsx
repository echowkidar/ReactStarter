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
import { Plus, Eye, Pencil, Search, X } from "lucide-react";
import { Employee } from "@shared/schema";
import { format } from "date-fns";
import { EditEmployeeForm } from "@/components/forms/edit-employee-form";
import { Input } from "@/components/ui/input";

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
  const [searchQuery, setSearchQuery] = useState("");

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: [`/api/departments/${department?.id}/employees`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/departments/${department?.id}/employees`);
      return response.json();
    },
    enabled: !!department?.id
  });

  // Sort employees by EPID in ascending order
  const sortedEmployees = [...(employees || [])].sort((a, b) => 
    a.epid.localeCompare(b.epid, undefined, { numeric: true })
  );

  // Filter employees based on search query
  const filteredEmployees = searchQuery.trim() 
    ? sortedEmployees.filter(employee => 
        employee.epid.toLowerCase().includes(searchQuery.toLowerCase()) ||
        employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        employee.designation.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sortedEmployees;

  const addEmployee = useMutation({
    mutationFn: async (data: any) => {
      // First check if the EPID already exists
      try {
        const response = await apiRequest("GET", `/api/departments/${department?.id}/employees`);
        const existingEmployees = await response.json();
        
        const existingEpid = existingEmployees.find((emp: Employee) => emp.epid === data.epid);
        if (existingEpid) {
          throw new Error("An employee with this EPID already exists. Please use a unique EPID.");
        }
        
        const formData = new FormData();
        
        // Log the form data for debugging
        console.log("Form data before processing:", data);
        
        // Handle file uploads - improved method
        const fileFields = {
          panCardDoc: data.panCardDoc,
          bankAccountDoc: data.bankAccountDoc,
          aadharCardDoc: data.aadharCardDoc,
          officeMemoDoc: data.officeMemoDoc,
          joiningReportDoc: data.joiningReportDoc,
          termExtensionDoc: data.termExtensionDoc,
        };
        
        // Process each file field
        for (const [key, value] of Object.entries(fileFields)) {
          if (value && typeof value === 'string') {
            try {
              // If it's a data URL, convert it to a blob
              if (value.startsWith('data:')) {
                console.log(`Processing ${key} from data URL`);
                const response = await fetch(value);
                const blob = await response.blob();
                const filename = `${key}-${Date.now()}.jpg`;
                console.log(`Created blob for ${key}, size: ${blob.size}`);
                
                // Create a File object from the blob
                const file = new File([blob], filename, { type: blob.type });
                formData.append(key, file);
              }
              // If it's a blob URL, fetch the blob and create a file
              else if (value.startsWith('blob:')) {
                console.log(`Processing ${key} from blob URL: ${value}`);
                const response = await fetch(value);
                const blob = await response.blob();
                const filename = `${key}-${Date.now()}.jpg`;
                console.log(`Created blob for ${key}, size: ${blob.size}, type: ${blob.type}`);
                
                // Create a File object from the blob
                const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
                formData.append(key, file);
              }
            } catch (error) {
              console.error(`Error processing ${key}:`, error);
            }
          }
        }
        
        // Add all other form fields
        Object.entries(data).forEach(([key, value]) => {
          if (key.endsWith("Doc")) return; // Skip document fields, already handled
          if (value !== null && value !== undefined) {
            formData.append(key, String(value));
          }
        });
        
        // Log FormData entries for debugging
        console.log("FormData contents:");
        Array.from(formData.entries()).forEach(pair => {
          console.log(`${pair[0]}: ${pair[1] instanceof File ? `File: ${pair[1].name}, ${pair[1].size} bytes` : pair[1]}`);
        });
        
        // Make the API request with the FormData
        const result = await apiRequest("POST", `/api/departments/${department?.id}/employees`, formData, false);
        return result.json();
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(error.message);
        }
        throw error;
      }
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
            <Dialog open={isAddingEmployee} onOpenChange={(open) => {
              setIsAddingEmployee(open);
              if (open) {
                // Reset the error state when dialog is opened
                addEmployee.reset();
              }
            }}>
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
                {addEmployee.error instanceof Error && (
                  <div className="bg-destructive/15 p-3 rounded-md mb-4">
                    <p className="text-destructive text-sm">{addEmployee.error.message}</p>
                  </div>
                )}
                <EmployeeForm
                  onSubmit={async (data) => {
                    await addEmployee.mutateAsync(data);
                  }}
                  isLoading={addEmployee.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Search input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by any (ID, Name, or Designation...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
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
                {filteredEmployees.map((employee) => (
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
                {filteredEmployees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                      No employees found matching your search.
                    </TableCell>
                  </TableRow>
                )}
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