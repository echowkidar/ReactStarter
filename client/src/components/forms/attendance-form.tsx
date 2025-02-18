import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { getCurrentDepartment } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus } from "lucide-react";

const attendanceSchema = z.object({
  month: z.string().min(1),
  year: z.string().min(1),
  entries: z.array(z.object({
    employeeId: z.number(),
    periods: z.array(z.object({
      fromDate: z.string(),
      toDate: z.string(),
      days: z.number().min(0).max(31),
      remarks: z.string().optional(),
    })).min(1),
  })).min(1, "At least one employee entry is required"),
});

type AttendanceFormData = z.infer<typeof attendanceSchema>;

interface AttendanceFormProps {
  onSubmit: (data: AttendanceFormData) => Promise<void>;
  isLoading?: boolean;
}

export default function AttendanceForm({ onSubmit, isLoading }: AttendanceFormProps) {
  const department = getCurrentDepartment();
  const [includedEmployees, setIncludedEmployees] = useState<Set<number>>(new Set());

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: [`/api/departments/${department?.id}/employees`],
    select: (data: any) => data || [],
  });

  const form = useForm<AttendanceFormData>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: {
      month: String(new Date().getMonth() + 1),
      year: String(new Date().getFullYear()),
      entries: [],
    },
  });

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const calculateDays = (fromDate: string, toDate: string) => {
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const addPeriod = (employeeId: number) => {
    const currentEntries = form.getValues("entries");
    const entryIndex = currentEntries.findIndex(entry => entry.employeeId === employeeId);

    if (entryIndex === -1) return;

    const today = new Date();
    const newPeriod = {
      fromDate: formatDate(today),
      toDate: formatDate(today),
      days: 1,
      remarks: "",
    };

    const updatedEntry = {
      ...currentEntries[entryIndex],
      periods: [...currentEntries[entryIndex].periods, newPeriod],
    };

    const newEntries = [...currentEntries];
    newEntries[entryIndex] = updatedEntry;

    form.setValue("entries", newEntries, { shouldValidate: true });
  };

  const toggleEmployee = (employeeId: number) => {
    setIncludedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
        const currentEntries = form.getValues("entries") || [];
        form.setValue("entries", [
          ...currentEntries,
          {
            employeeId,
            periods: [{
              fromDate: formatDate(new Date()),
              toDate: formatDate(new Date()),
              days: 1,
              remarks: "",
            }],
          },
        ]);
      }
      return next;
    });
  };

  if (loadingEmployees) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Include</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead className="w-[60%]">Attendance Periods</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee: any) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <Checkbox
                    checked={includedEmployees.has(employee.id)}
                    onCheckedChange={() => toggleEmployee(employee.id)}
                  />
                </TableCell>
                <TableCell>{employee.employeeId}</TableCell>
                <TableCell>{employee.name}</TableCell>
                <TableCell>{employee.designation}</TableCell>
                <TableCell>
                  {includedEmployees.has(employee.id) && (
                    <div className="space-y-2">
                      {form.getValues("entries")
                        .find(entry => entry.employeeId === employee.id)
                        ?.periods.map((period, index) => (
                          <div key={index} className="grid grid-cols-4 gap-2">
                            <Input
                              type="date"
                              value={period.fromDate}
                              onChange={(e) => {
                                const entries = [...form.getValues("entries")];
                                const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                entries[entryIndex].periods[index].fromDate = e.target.value;
                                entries[entryIndex].periods[index].days = calculateDays(e.target.value, period.toDate);
                                form.setValue("entries", entries);
                              }}
                            />
                            <Input
                              type="date"
                              value={period.toDate}
                              onChange={(e) => {
                                const entries = [...form.getValues("entries")];
                                const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                entries[entryIndex].periods[index].toDate = e.target.value;
                                entries[entryIndex].periods[index].days = calculateDays(period.fromDate, e.target.value);
                                form.setValue("entries", entries);
                              }}
                            />
                            <Input
                              type="number"
                              value={period.days}
                              onChange={(e) => {
                                const entries = [...form.getValues("entries")];
                                const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                entries[entryIndex].periods[index].days = parseInt(e.target.value);
                                form.setValue("entries", entries);
                              }}
                            />
                            <Input
                              type="text"
                              placeholder="Remarks"
                              value={period.remarks}
                              onChange={(e) => {
                                const entries = [...form.getValues("entries")];
                                const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                entries[entryIndex].periods[index].remarks = e.target.value;
                                form.setValue("entries", entries);
                              }}
                            />
                          </div>
                        ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addPeriod(employee.id)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Period
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex justify-end">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Report
          </Button>
        </div>
      </form>
    </Form>
  );
}