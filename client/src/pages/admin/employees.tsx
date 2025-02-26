import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TableHeader, TableRow, TableHead, TableBody, TableCell, Table } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, LogOut, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Employee, Department, InsertEmployee } from "@shared/schema";

const FileUpload = ({ name, value, onChange, label }: { name: string; value: string; onChange: (file: File | null) => void; label: string }) => {
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      onChange(file);
    } else {
      setPreview(null);
      onChange(null);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex flex-col gap-2">
        <input
          type="file"
          id={name}
          name={name}
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png"
        />
        <div
          className={`
            min-h-[100px] p-4 border-2 border-dashed rounded-lg 
            ${preview ? 'border-primary/50' : 'border-gray-200'} 
            hover:border-primary/70 transition-colors cursor-pointer
            bg-white dark:bg-slate-800
          `}
          onClick={() => document.getElementById(name)?.click()}
        >
          {preview ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={preview}
                alt="Preview"
                className="max-h-[100px] object-contain"
                onError={(e) => {
                  e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'%3E%3C/path%3E%3Cpolyline points='14 2 14 8 20 8'%3E%3C/polyline%3E%3C/svg%3E";
                }}
              />
              <p className="text-sm text-muted-foreground">Click to change file</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span className="text-sm text-muted-foreground">
                Click to upload file
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function AdminEmployees() {
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState(selectedEmployee?.employmentStatus?.toLowerCase() || "permanent");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setLocation] = useLocation();

  const { data: employees = [], isLoading: isEmployeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/admin/employees']
  });

  const { data: departments = [], isLoading: isDepartmentsLoading } = useQuery<Department[]>({
    queryKey: ['/api/departments']
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/employees/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/employees'] });
      toast({
        title: "Success",
        description: "Employee deleted successfully"
      });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (selectedEmployee) {
        await apiRequest('PATCH', `/api/employees/${selectedEmployee.id}`, data);
      } else {
        await apiRequest('POST', '/api/admin/employees', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/employees'] });
      setIsDialogOpen(false);
      setSelectedEmployee(null);
      toast({
        title: "Success",
        description: `Employee ${selectedEmployee ? 'updated' : 'created'} successfully`
      });
    },
    onError: (error) => {
      console.error('Mutation error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save employee data. Please check all required fields."
      });
    }
  });

  const handleDelete = (employee: Employee) => {
    if (confirm('Are you sure you want to delete this employee?')) {
      deleteMutation.mutate(employee.id);
    }
  };

  const handleLogout = () => {
    setLocation('/admin/login');
  };

  const validateForm = (formData: FormData): boolean => {
    const requiredFields = [
      'epid', 'name', 'designation', 'employmentStatus',
      'panNumber', 'bankAccount', 'aadharCard',
      'officeMemoNo', 'joiningDate', 'joiningShift',
      'salaryRegisterNo', 'departmentId'
    ];

    for (const field of requiredFields) {
      const value = formData.get(field);
      if (!value) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: `${field.charAt(0).toUpperCase() + field.slice(1)} is required`
        });
        return false;
      }
    }

    const departmentId = parseInt(formData.get('departmentId') as string);
    if (isNaN(departmentId)) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select a department"
      });
      return false;
    }

    if ((employmentStatus === 'probation' || employmentStatus === 'temporary') && !formData.get('termExpiry')) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Term expiry date is required for probation/temporary employees"
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      const formData = new FormData(e.currentTarget);

      if (!validateForm(formData)) {
        return;
      }

      // Create a new FormData for submission
      const submitFormData = new FormData();

      // Add basic information
      submitFormData.append('epid', formData.get('epid') as string);
      submitFormData.append('name', formData.get('name') as string);
      submitFormData.append('designation', formData.get('designation') as string);
      submitFormData.append('employmentStatus', formData.get('employmentStatus') as string);

      if (employmentStatus === 'probation' || employmentStatus === 'temporary') {
        submitFormData.append('termExpiry', formData.get('termExpiry') as string);
      }

      // Add identification details
      submitFormData.append('panNumber', formData.get('panNumber') as string);
      submitFormData.append('bankAccount', formData.get('bankAccount') as string);
      submitFormData.append('aadharCard', formData.get('aadharCard') as string);

      // Add office details
      submitFormData.append('officeMemoNo', formData.get('officeMemoNo') as string);
      submitFormData.append('joiningDate', formData.get('joiningDate') as string);
      submitFormData.append('joiningShift', formData.get('joiningShift') as string);
      submitFormData.append('salaryRegisterNo', formData.get('salaryRegisterNo') as string);
      submitFormData.append('departmentId', formData.get('departmentId') as string);

      // Add files
      const fileFields = [
        'panCardDoc', 'bankAccountDoc', 'aadharCardDoc',
        'officeMemoDoc', 'joiningReportDoc', 'termExtensionDoc'
      ];

      fileFields.forEach(field => {
        const fileInput = e.currentTarget.querySelector(`input[name="${field}"]`) as HTMLInputElement;
        if (fileInput?.files?.[0]) {
          submitFormData.append(field, fileInput.files[0]);
        }
      });

      await saveMutation.mutateAsync(submitFormData);
    } catch (error) {
      console.error('Error submitting form:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save employee data. Please try again."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Employee Management</CardTitle>
          <div className="flex items-center gap-4">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-primary/90 hover:to-primary" onClick={() => {
                  setSelectedEmployee(null);
                  setEmploymentStatus("permanent");
                  setSelectedDepartmentId("");
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto px-4">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold">
                    {selectedEmployee ? 'Edit Employee' : 'Add New Employee'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-8">
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-6 text-primary">Basic Information</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <Label htmlFor="epid">EPID</Label>
                          <Input
                            id="epid"
                            name="epid"
                            defaultValue={selectedEmployee?.epid}
                            className="bg-white dark:bg-slate-800"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="name">Name</Label>
                          <Input
                            id="name"
                            name="name"
                            defaultValue={selectedEmployee?.name}
                            className="bg-white dark:bg-slate-800"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="designation">Designation</Label>
                          <Input
                            id="designation"
                            name="designation"
                            defaultValue={selectedEmployee?.designation}
                            className="bg-white dark:bg-slate-800"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="employmentStatus">Employment Status</Label>
                          <Select
                            name="employmentStatus"
                            value={employmentStatus}
                            onValueChange={setEmploymentStatus}
                          >
                            <SelectTrigger className="bg-white dark:bg-slate-800">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="permanent">Permanent</SelectItem>
                              <SelectItem value="probation">Probation</SelectItem>
                              <SelectItem value="temporary">Temporary</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(employmentStatus === "probation" || employmentStatus === "temporary") && (
                          <div>
                            <Label htmlFor="termExpiry">Term Expiry Date</Label>
                            <Input
                              id="termExpiry"
                              name="termExpiry"
                              type="date"
                              defaultValue={selectedEmployee?.termExpiry || ""}
                              className="bg-white dark:bg-slate-800"
                              required
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-6 text-primary">Identification Details</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <Label htmlFor="panNumber">PAN Number</Label>
                          <Input
                            id="panNumber"
                            name="panNumber"
                            defaultValue={selectedEmployee?.panNumber}
                            className="bg-white dark:bg-slate-800"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="bankAccount">Bank Account</Label>
                          <Input
                            id="bankAccount"
                            name="bankAccount"
                            defaultValue={selectedEmployee?.bankAccount}
                            className="bg-white dark:bg-slate-800"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="aadharCard">Aadhar Card</Label>
                          <Input
                            id="aadharCard"
                            name="aadharCard"
                            defaultValue={selectedEmployee?.aadharCard}
                            className="bg-white dark:bg-slate-800"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-6 text-primary">Office Details</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <Label htmlFor="officeMemoNo">Office Memo No.</Label>
                          <Input
                            id="officeMemoNo"
                            name="officeMemoNo"
                            defaultValue={selectedEmployee?.officeMemoNo}
                            className="bg-white dark:bg-slate-800"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="joiningDate">Joining Date</Label>
                          <Input
                            id="joiningDate"
                            name="joiningDate"
                            type="date"
                            defaultValue={selectedEmployee?.joiningDate}
                            className="bg-white dark:bg-slate-800"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="joiningShift">Joining Shift</Label>
                          <Select
                            name="joiningShift"
                            defaultValue={selectedEmployee?.joiningShift || "FN"}
                          >
                            <SelectTrigger className="bg-white dark:bg-slate-800">
                              <SelectValue placeholder="Select shift" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FN">FN</SelectItem>
                              <SelectItem value="AN">AN</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="salaryRegisterNo">Salary Register No.</Label>
                          <Input
                            id="salaryRegisterNo"
                            name="salaryRegisterNo"
                            defaultValue={selectedEmployee?.salaryRegisterNo}
                            className="bg-white dark:bg-slate-800"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="departmentId">Department</Label>
                          <Select
                            name="departmentId"
                            value={selectedDepartmentId || (selectedEmployee?.departmentId?.toString() || "")}
                            onValueChange={setSelectedDepartmentId}
                          >
                            <SelectTrigger className="bg-white dark:bg-slate-800">
                              <SelectValue placeholder={isDepartmentsLoading ? "Loading..." : "Select department"} />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map((dept) => (
                                <SelectItem key={dept.id} value={dept.id.toString()}>
                                  {dept.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-6 text-primary">Document Upload</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <FileUpload
                            name="panCardDoc"
                            label="PAN Card"
                            value={selectedEmployee?.panCardDoc || ""}
                            onChange={(file) => {
                              if (file) {
                                console.log("PAN Card uploaded:", file);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <FileUpload
                            name="bankAccountDoc"
                            label="Bank Account Proof"
                            value={selectedEmployee?.bankAccountDoc || ""}
                            onChange={(file) => {
                              if (file) {
                                console.log("Bank Account doc uploaded:", file);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <FileUpload
                            name="aadharCardDoc"
                            label="Aadhar Card"
                            value={selectedEmployee?.aadharCardDoc || ""}
                            onChange={(file) => {
                              if (file) {
                                console.log("Aadhar Card uploaded:", file);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <FileUpload
                            name="officeMemoDoc"
                            label="Office Memo"
                            value={selectedEmployee?.officeMemoDoc || ""}
                            onChange={(file) => {
                              if (file) {
                                console.log("Office Memo uploaded:", file);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <FileUpload
                            name="joiningReportDoc"
                            label="Joining Report"
                            value={selectedEmployee?.joiningReportDoc || ""}
                            onChange={(file) => {
                              if (file) {
                                console.log("Joining Report uploaded:", file);
                              }
                            }}
                          />
                        </div>
                        {(employmentStatus === "probation" || employmentStatus === "temporary") && (
                          <div>
                            <FileUpload
                              name="termExtensionDoc"
                              label="Term Extension Office Memo"
                              value={selectedEmployee?.termExtensionDoc || ""}
                              onChange={(file) => {
                                if (file) {
                                  console.log("Term Extension doc uploaded:", file);
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-primary to-primary/90 hover:to-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Employee'
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>EPID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>{employee.epid}</TableCell>
                  <TableCell>{employee.name}</TableCell>
                  <TableCell>{employee.departmentName}</TableCell>
                  <TableCell>{employee.designation}</TableCell>
                  <TableCell>{employee.employmentStatus}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedEmployee(employee);
                        setEmploymentStatus(employee.employmentStatus.toLowerCase());
                        setSelectedDepartmentId(employee.departmentId.toString());
                        setIsDialogOpen(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(employee)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}