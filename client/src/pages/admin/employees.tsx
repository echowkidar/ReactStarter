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
import { Plus, Pencil, Trash2, LogOut, Upload } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Employee, Department, InsertEmployee } from "@shared/schema";

export default function AdminEmployees() {
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState(selectedEmployee?.employmentStatus?.toLowerCase() || "permanent");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [documents, setDocuments] = useState({
    panCard: "",
    bankAccountProof: "",
    aadharCard: "",
    officeMemo: "",
    joiningReport: ""
  });
  const [isUploading, setIsUploading] = useState(false);
  const [, setLocation] = useLocation();

  // Fetch all employees
  const { data: employees = [], isLoading: isEmployeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/admin/employees']
  });

  // Fetch departments for dropdown
  const { data: departments = [], isLoading: isDepartmentsLoading } = useQuery<Department[]>({
    queryKey: ['/api/departments']
  });

  // Delete employee mutation
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

  // Create/Update employee mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<InsertEmployee>) => {
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
      setDocuments({
        panCard: "",
        bankAccountProof: "",
        aadharCard: "",
        officeMemo: "",
        joiningReport: ""
      });
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

  const handleFileUpload = async (type: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setDocuments(prev => ({
        ...prev,
        [type]: data.fileUrl
      }));
      toast({
        title: "Success",
        description: `${type.replace(/([A-Z])/g, ' $1').trim()} uploaded successfully`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload document",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Record<string, any> = Object.fromEntries(formData.entries());

    // Convert departmentId to number
    data.departmentId = parseInt(data.departmentId as string, 10);

    // Add document URLs
    Object.entries(documents).forEach(([key, value]) => {
      if (value) {
        data[key] = value;
      }
    });

    saveMutation.mutate(data as InsertEmployee);
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
                  setDocuments({
                    panCard: "",
                    bankAccountProof: "",
                    aadharCard: "",
                    officeMemo: "",
                    joiningReport: ""
                  });
                }}>
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
                    {/* Basic Information Section */}
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

                    {/* Identification Details Section */}
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

                    {/* Office Details Section */}
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

                        {/* Document Upload Section */}
                        <div className="col-span-2">
                          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                            <h3 className="text-lg font-semibold mb-6 text-primary">Document Upload</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                              <div>
                                <Label htmlFor="panCard">PAN Card</Label>
                                <div className="flex items-center gap-2 mt-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => document.getElementById('panCard')?.click()}
                                    disabled={isUploading}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload PAN Card
                                  </Button>
                                  <Input
                                    id="panCard"
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => handleFileUpload('panCard', e)}
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    name="panCard"
                                  />
                                  {documents.panCard && (
                                    <div className="text-sm text-green-600">✓</div>
                                  )}
                                </div>
                              </div>

                              <div>
                                <Label htmlFor="bankAccountProof">Bank Account Proof</Label>
                                <div className="flex items-center gap-2 mt-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => document.getElementById('bankAccountProof')?.click()}
                                    disabled={isUploading}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Bank Account Proof
                                  </Button>
                                  <Input
                                    id="bankAccountProof"
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => handleFileUpload('bankAccountProof', e)}
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    name="bankAccountProof"
                                  />
                                  {documents.bankAccountProof && (
                                    <div className="text-sm text-green-600">✓</div>
                                  )}
                                </div>
                              </div>

                              <div>
                                <Label htmlFor="aadharCard">Aadhar Card</Label>
                                <div className="flex items-center gap-2 mt-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => document.getElementById('aadharCard')?.click()}
                                    disabled={isUploading}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Aadhar Card
                                  </Button>
                                  <Input
                                    id="aadharCard"
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => handleFileUpload('aadharCard', e)}
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    name="aadharCard"
                                  />
                                  {documents.aadharCard && (
                                    <div className="text-sm text-green-600">✓</div>
                                  )}
                                </div>
                              </div>

                              <div>
                                <Label htmlFor="officeMemo">Office Memo</Label>
                                <div className="flex items-center gap-2 mt-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => document.getElementById('officeMemo')?.click()}
                                    disabled={isUploading}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Office Memo
                                  </Button>
                                  <Input
                                    id="officeMemo"
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => handleFileUpload('officeMemo', e)}
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    name="officeMemo"
                                  />
                                  {documents.officeMemo && (
                                    <div className="text-sm text-green-600">✓</div>
                                  )}
                                </div>
                              </div>

                              <div>
                                <Label htmlFor="joiningReport">Joining Report</Label>
                                <div className="flex items-center gap-2 mt-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => document.getElementById('joiningReport')?.click()}
                                    disabled={isUploading}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Joining Report
                                  </Button>
                                  <Input
                                    id="joiningReport"
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => handleFileUpload('joiningReport', e)}
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    name="joiningReport"
                                  />
                                  {documents.joiningReport && (
                                    <div className="text-sm text-green-600">✓</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-primary to-primary/90 hover:to-primary" 
                    disabled={saveMutation.isPending || isUploading}
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
                <TableHead>Document</TableHead>
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
                  <TableCell>
                    {employee.documentUrl && (
                      <a 
                        href={employee.documentUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        <Upload className="w-4 h-4" />
                        View
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedEmployee(employee);
                        setEmploymentStatus(employee.employmentStatus.toLowerCase());
                        setSelectedDepartmentId(employee.departmentId.toString());
                        setDocuments({
                          panCard: employee.panCard || "",
                          bankAccountProof: employee.bankAccountProof || "",
                          aadharCard: employee.aadharCard || "",
                          officeMemo: employee.officeMemo || "",
                          joiningReport: employee.joiningReport || ""
                        });
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