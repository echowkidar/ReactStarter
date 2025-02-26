import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TableHeader, TableRow, TableHead, TableBody, TableCell, Table } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, LogOut, X, Upload } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Employee, Department, InsertEmployee } from "@shared/schema";

interface FileUpload {
  file: File | null;
  preview: string;
}

interface UploadState {
  panCard?: FileUpload;
  bankProof?: FileUpload;
  aadharCard?: FileUpload;
  officeMemo?: FileUpload;
  joiningReport?: FileUpload;
}

export default function AdminEmployees() {
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState(selectedEmployee?.employmentStatus?.toLowerCase() || "permanent");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [uploads, setUploads] = useState<UploadState>({});
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (selectedEmployee) {
      const existingUploads: UploadState = {};

      if (selectedEmployee.panCardUrl) {
        existingUploads.panCard = { file: null, preview: selectedEmployee.panCardUrl };
      }
      if (selectedEmployee.bankProofUrl) {
        existingUploads.bankProof = { file: null, preview: selectedEmployee.bankProofUrl };
      }
      if (selectedEmployee.aadharCardUrl) {
        existingUploads.aadharCard = { file: null, preview: selectedEmployee.aadharCardUrl };
      }
      if (selectedEmployee.officeMemoUrl) {
        existingUploads.officeMemo = { file: null, preview: selectedEmployee.officeMemoUrl };
      }
      if (selectedEmployee.joiningReportUrl) {
        existingUploads.joiningReport = { file: null, preview: selectedEmployee.joiningReportUrl };
      }

      setUploads(existingUploads);
    } else {
      setUploads({});
    }
  }, [selectedEmployee]);


  const { data: employees = [], isLoading: isEmployeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/admin/employees']
  });

  const { data: departments = [], isLoading: isDepartmentsLoading } = useQuery<Department[]>({
    queryKey: ['/api/departments']
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, type: keyof UploadState) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploads(prev => ({
        ...prev,
        [type]: {
          file,
          preview: reader.result as string
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = (type: keyof UploadState) => {
    setUploads(prev => {
      const newUploads = { ...prev };
      delete newUploads[type];
      return newUploads;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<InsertEmployee>) => {
      const fileUrls: Record<string, string> = {};

      for (const [key, upload] of Object.entries(uploads)) {
        if (upload?.file) {
          const result = await uploadMutation.mutateAsync(upload.file);
          fileUrls[key + 'Url'] = result.fileUrl;
        } else if (upload?.preview) {
          fileUrls[key + 'Url'] = upload.preview;
        }
      }

      const employeeData = {
        ...data,
        ...fileUrls
      };

      if (selectedEmployee) {
        await apiRequest('PATCH', `/api/employees/${selectedEmployee.id}`, employeeData);
      } else {
        await apiRequest('POST', '/api/admin/employees', employeeData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/employees'] });
      setIsDialogOpen(false);
      setSelectedEmployee(null);
      setUploads({});
      toast({
        title: "Success",
        description: `Employee ${selectedEmployee ? 'updated' : 'created'} successfully`
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data: Record<string, any> = {};
    for (const [key, value] of formData.entries()) {
      if (!['panCard', 'bankProof', 'aadharCard', 'officeMemo', 'joiningReport'].includes(key)) {
        data[key] = value;
      }
    }

    data.departmentId = parseInt(data.departmentId as string, 10);

    saveMutation.mutate(data as InsertEmployee);
  };

  const renderUploadPreview = (type: keyof UploadState, label: string) => {
    const upload = uploads[type];

    return (
      <div className="space-y-2">
        <Label htmlFor={type}>{label}</Label>
        <div className="flex items-center gap-4">
          <div className="relative w-32 h-32 border rounded-lg overflow-hidden bg-slate-50">
            {upload ? (
              <>
                <img
                  src={upload.preview}
                  alt={`${label} preview`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveFile(type)}
                  className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-sm hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Upload className="w-8 h-8 text-slate-400" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <Input
              id={type}
              name={type}
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => handleFileSelect(e, type)}
              className="bg-white dark:bg-slate-800"
            />
          </div>
        </div>
      </div>
    );
  };

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


  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Employee Management</CardTitle>
          <div className="flex items-center gap-4">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="bg-gradient-to-r from-primary to-primary/90 hover:to-primary"
                  onClick={() => {
                    setSelectedEmployee(null);
                    setEmploymentStatus("permanent");
                    setSelectedDepartmentId("");
                    setUploads({});
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
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
                      <div className="grid grid-cols-1 gap-6">
                        {renderUploadPreview('panCard', 'PAN Card')}
                        {renderUploadPreview('bankProof', 'Bank Account Proof')}
                        {renderUploadPreview('aadharCard', 'Aadhar Card')}
                        {renderUploadPreview('officeMemo', 'Office Memo')}
                        {renderUploadPreview('joiningReport', 'Joining Report')}
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-primary to-primary/90 hover:to-primary"
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save Employee'}
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