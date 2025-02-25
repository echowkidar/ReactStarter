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
import { Plus, Pencil, Trash2, LogOut } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Employee, Department, InsertEmployee } from "@shared/schema";

export default function AdminEmployees() {
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState(selectedEmployee?.employmentStatus || "permanent");
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
        description: "Employee deleted successfully",
      });
    },
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
      toast({
        title: "Success",
        description: `Employee ${selectedEmployee ? 'updated' : 'created'} successfully`,
      });
    },
  });

  const handleDelete = (employee: Employee) => {
    if (confirm('Are you sure you want to delete this employee?')) {
      deleteMutation.mutate(employee.id);
    }
  };

  const handleLogout = () => {
    setLocation('/admin/login');
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Record<string, any> = Object.fromEntries(formData.entries());

    // Convert departmentId to number
    data.departmentId = parseInt(data.departmentId as string, 10);

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
                <Button onClick={() => {
                  setSelectedEmployee(null);
                  setEmploymentStatus("permanent");
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {selectedEmployee ? 'Edit Employee' : 'Add New Employee'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="epid">EPID</Label>
                      <Input 
                        id="epid" 
                        name="epid" 
                        defaultValue={selectedEmployee?.epid}
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input 
                        id="name" 
                        name="name" 
                        defaultValue={selectedEmployee?.name}
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="panNumber">PAN Number</Label>
                      <Input 
                        id="panNumber" 
                        name="panNumber" 
                        defaultValue={selectedEmployee?.panNumber}
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="bankAccount">Bank Account</Label>
                      <Input 
                        id="bankAccount" 
                        name="bankAccount" 
                        defaultValue={selectedEmployee?.bankAccount}
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="aadharCard">Aadhar Card</Label>
                      <Input 
                        id="aadharCard" 
                        name="aadharCard" 
                        defaultValue={selectedEmployee?.aadharCard}
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="designation">Designation</Label>
                      <Input 
                        id="designation" 
                        name="designation" 
                        defaultValue={selectedEmployee?.designation}
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="employmentStatus">Employment Status</Label>
                      <Select 
                        name="employmentStatus"
                        defaultValue={selectedEmployee?.employmentStatus || "permanent"}
                        onValueChange={(value) => setEmploymentStatus(value)}
                      >
                        <SelectTrigger>
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
                          defaultValue={selectedEmployee?.termExpiry}
                          required 
                        />
                      </div>
                    )}
                    <div>
                      <Label htmlFor="officeMemoNo">Office Memo No.</Label>
                      <Input 
                        id="officeMemoNo" 
                        name="officeMemoNo" 
                        defaultValue={selectedEmployee?.officeMemoNo}
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
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="joiningShift">Joining Shift</Label>
                      <Select 
                        name="joiningShift"
                        defaultValue={selectedEmployee?.joiningShift || "FN"}
                      >
                        <SelectTrigger>
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
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="departmentId">Department</Label>
                      <Select 
                        name="departmentId"
                        defaultValue={selectedEmployee?.departmentId?.toString()}
                        required
                      >
                        <SelectTrigger>
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
                  <div className="flex justify-end space-x-2">
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? 'Saving...' : 'Save Employee'}
                    </Button>
                  </div>
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
                        setIsDialogOpen(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
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