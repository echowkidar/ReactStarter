import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Employee } from "@shared/schema";

export default function SalaryDashboard() {
  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/departments/1/employees"],
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Salary Management</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {employees?.map((employee) => (
          <Card key={employee.id}>
            <CardHeader>
              <CardTitle>{employee.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p><span className="font-medium">Employee ID:</span> {employee.employeeId}</p>
                <p><span className="font-medium">Designation:</span> {employee.designation}</p>
                <p><span className="font-medium">Status:</span> {employee.employmentStatus}</p>
                <p><span className="font-medium">Bank Account:</span> {employee.bankAccount}</p>
                <p><span className="font-medium">Salary Register No:</span> {employee.salaryRegisterNo}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
