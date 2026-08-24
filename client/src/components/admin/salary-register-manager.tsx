import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SalaryRegister {
  id: number;
  value: string;
  label: string;
  departmentId: number | null;
}

export function SalaryRegisterManager() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SalaryRegister | null>(null);

  // Form states
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  const { data: registers = [], isLoading } = useQuery<SalaryRegister[]>({
    queryKey: ["/api/salary-registers"],
  });

  const filteredRegisters = registers.filter(register => 
    register.value.toLowerCase().includes(searchTerm.toLowerCase()) || 
    register.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (register.departmentId && register.departmentId.toString().includes(searchTerm))
  );

  const resetForm = () => {
    setValue("");
    setLabel("");
    setDepartmentId("");
    setEditingItem(null);
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/admin/salary-registers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-registers"] });
      toast({ title: "Success", description: "Salary register added successfully" });
      setIsAddOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PATCH", `/api/admin/salary-registers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-registers"] });
      toast({ title: "Success", description: "Salary register updated successfully" });
      setIsEditOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/salary-registers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-registers"] });
      toast({ title: "Success", description: "Salary register deleted successfully" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ 
      value, 
      label,
      departmentId: departmentId ? parseInt(departmentId) : null
    });
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      data: { 
        value, 
        label,
        departmentId: departmentId ? parseInt(departmentId) : null
      },
    });
  };

  const openEdit = (item: SalaryRegister) => {
    setEditingItem(item);
    setValue(item.value);
    setLabel(item.label);
    setDepartmentId(item.departmentId ? item.departmentId.toString() : "");
    setIsEditOpen(true);
  };

  return (
    <Card className="mt-6 max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Salary Registers</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Manage salary registers and their department associations.
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" /> Add Register
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Salary Register</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>Value (e.g. ADM106)</Label>
                <Input
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Label (e.g. ADM106 - DEAN ...)</Label>
                <Input
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Department ID (Optional, for linking)</Label>
                <Input
                  type="number"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Register
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Input
            placeholder="Search registers by number, name, or department ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border rounded-md max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Value</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Dept ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRegisters.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.value}</TableCell>
                    <TableCell>{item.label}</TableCell>
                    <TableCell>{item.departmentId || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this register?")) {
                            deleteMutation.mutate(item.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRegisters.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No salary registers found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Salary Register</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Department ID (Optional)</Label>
                <Input
                  type="number"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={updateMutation.isPending} className="w-full">
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
