import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pencil, Eye, Plus } from "lucide-react";
import { EditEmployeeForm } from "@/components/forms/edit-employee-form";
import { apiRequest } from "@/lib/queryClient";
import { getCurrentDepartment } from "@/lib/auth";
import type { Employee } from "@shared/schema";

export default function DepartmentEmployees() {
  const [, setLocation] = useLocation();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Get department ID from stored department info
  const departmentInfo = getCurrentDepartment();
  const departmentId = departmentInfo?.id;

  const { data: employees = [], refetch } = useQuery<Employee[]>({
    queryKey: ["/api/departments", departmentId, "employees"],
    queryFn: async () => {
      const response = await apiRequest(`/api/departments/${departmentId}/employees`);
      return response.json();
    },
    enabled: !!departmentId
  });

  const handleEditClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsEditDialogOpen(true);
  };

  const handleEditSuccess = () => {
    refetch();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Employees</h1>
        <Button onClick={() => setLocation("/department/employees/add")}>
          <Plus className="w-4 h-4 mr-2" />
          Add Employee
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="p-4 text-left">EPID</th>
              <th className="p-4 text-left">Name</th>
              <th className="p-4 text-left">Designation</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee: Employee) => (
              <tr key={employee.id} className="border-b">
                <td className="p-4">{employee.epid}</td>
                <td className="p-4">{employee.name}</td>
                <td className="p-4">{employee.designation}</td>
                <td className="p-4">{employee.employmentStatus}</td>
                <td className="p-4">
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(employee)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedEmployee(employee);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  No employees found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {selectedEmployee && (
        <EditEmployeeForm
          employee={selectedEmployee}
          isOpen={isEditDialogOpen} 
          onClose={() => {
            setIsEditDialogOpen(false);
            setSelectedEmployee(null);
          }}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}