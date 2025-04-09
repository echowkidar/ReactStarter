import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search as SearchIcon, Plus, Pencil, Trash2, Users, LogOut } from "lucide-react";
import { Loader2 } from "lucide-react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import AdminHeader from "@/components/layout/admin-header";
import Loading from "@/components/layout/loading";
import { DepartmentRegistrationInfo } from "@/lib/departments";

// User type
interface User {
  id: number;
  email: string;
  name: string;
  role: "superadmin" | "salary" | "department";
  departmentId?: number | null;
  departmentName?: string | null;
}

// Form schema for creating/editing users
const userFormSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).optional()
    .or(z.literal('')) // Allow empty string for editing
    .transform(val => val === '' ? undefined : val), // Convert empty string to undefined
  role: z.enum(["superadmin", "salary", "department"]),
  departmentId: z.number({ coerce: true }).optional().nullable(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

export default function AdminUsers() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredDepartments, setFilteredDepartments] = useState<DepartmentRegistrationInfo[]>([]);

  // Fetch departments for department selection
  const { data: departments = [], isLoading: isLoadingDepartments } = useQuery<DepartmentRegistrationInfo[]>({
    queryKey: ["/api/departments?showAll=true"],
    queryFn: async () => {
      const response = await fetch("/api/departments?showAll=true");
      if (!response.ok) {
        throw new Error("Failed to fetch departments");
      }
      const data = await response.json();
      data.sort((a: DepartmentRegistrationInfo, b: DepartmentRegistrationInfo) => a.name.localeCompare(b.name));
      return data;
    },
  });

  // Fetch users
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  useEffect(() => {
    // Check if user is admin
    const adminType = localStorage.getItem("adminType");
    setIsAdmin(adminType === "super");
    
    if (adminType !== "super") {
      // Redirect to dashboard if not super admin
      setLocation("/admin/dashboard");
      toast({
        title: "अनुमति नहीं है",
        description: "आप इस पेज को देखने के लिए अधिकृत नहीं हैं",
        variant: "destructive",
      });
    }
  }, []);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "department",
      departmentId: null,
    },
  });

  // Open dialog for creating/editing user
  const openUserDialog = (user?: User) => {
    if (user) {
      setSelectedUser(user);
      
      let targetDepartmentId: number | null = null;
      // If editing a department user, find the corresponding ID from the department_names list
      if (user.role === 'department' && user.departmentName) {
        // Find the department in the fetched list that matches the user's department name
        const matchingDept = departments.find(deptInfo => deptInfo.name === user.departmentName);
        if (matchingDept) {
          targetDepartmentId = matchingDept.id; // Use the ID from department_names (fetched list)
          console.log(`Editing user ${user.name}, found matching department: ID ${targetDepartmentId}, Name: ${matchingDept.name}`);
        } else {
           console.warn(`Could not find matching department ID for user ${user.name} with department name "${user.departmentName}". Check consistency.`);
           // Keep targetDepartmentId as null, dropdown will show placeholder
        }
      }
      
      form.reset({
        name: user.name,
        email: user.email,
        password: "", // Don't fill password for editing
        role: user.role,
        departmentId: targetDepartmentId, // Set the ID found from the departments list
      });
    } else {
      // Reset for creating a new user
      setSelectedUser(null);
      form.reset({
        name: "",
        email: "",
        password: "",
        role: "department",
        departmentId: null,
      });
    }
    setIsUserDialogOpen(true);
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  // Handle user form submission
  const onSubmit = async (data: UserFormValues) => {
    try {
      console.log("Submitting user form with data:", data);

      if (data.role === "department") {
        if (!data.departmentId) {
           toast({ title: "Error", description: "Please select a department for this user.", variant: "destructive" });
           return;
        }
        const deptId = data.departmentId;
        const selectedDept = departments.find(d => d.id === deptId);
        if (!selectedDept) {
           console.error(`Selected department ID ${deptId} not found in departments list.`);
           toast({ title: "Error", description: "Selected department not found. Please refresh and try again.", variant: "destructive" });
           return;
        }
        console.log("Validated selected department:", selectedDept);
      }
      
      if (data.role !== "department") {
         data.departmentId = null;
      }

      let response;
      const apiUrl = selectedUser ? `/api/admin/users/${selectedUser.id}` : "/api/admin/users";
      const method = selectedUser ? "PUT" : "POST";

      console.log(`${method} ${apiUrl}`, data);
      response = await fetch(apiUrl, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      let responseData;
      try {
        responseData = await response.json();
        console.log("API response:", response.status, responseData);
      } catch (e) {
        console.error("Failed to parse response as JSON:", e);
        responseData = { message: response.statusText }; 
      }
      
      if (!response.ok) {
        const errorMessage = responseData?.message || (selectedUser ? "Failed to update user" : "Failed to create user");
        toast({ variant: "destructive", title: "Error", description: errorMessage });
      } else {
        toast({ title: "Success", description: selectedUser ? "User updated successfully" : "User created successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        setIsUserDialogOpen(false);
      }

    } catch (error) {
      console.error("Error submitting user form:", error);
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
    }
  };

  // Handle user deletion
  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      console.log("Deleting user:", selectedUser);
      
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "DELETE",
      });

      let responseData;
      try {
        responseData = await response.json();
      } catch (e) {
        responseData = null;
      }
      
      console.log("Delete response:", responseData);
      
      if (!response.ok) {
        throw new Error(responseData?.message || responseData?.details || "Failed to delete user");
      }

      setIsDeleteDialogOpen(false);
      
      toast({
        title: "सफलता",
        description: "उपयोगकर्ता हटा दिया गया",
      });

      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      
      setTimeout(async () => {
        await queryClient.refetchQueries({ queryKey: ["/api/admin/users"] });
      }, 500);
      
    } catch (error) {
      console.error("Delete user error:", error);
      toast({
        title: "त्रुटि",
        description: `डिलीट असफल: ${error instanceof Error ? error.message : "अज्ञात त्रुटि"}`,
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    // Clear admin data from localStorage
    localStorage.removeItem("adminType");
    localStorage.removeItem("admin");
    setLocation("/admin/login");
  };

  // Update filteredDepartments when departments data loads or searchTerm changes
  useEffect(() => {
    if (departments) { 
       if (searchTerm === "") {
         setFilteredDepartments(departments);
       } else {
         setFilteredDepartments(
           departments.filter(dept => 
             dept.name && dept.name.toLowerCase().includes(searchTerm.toLowerCase())
           )
         );
       }
    }
  }, [searchTerm, departments]);

  if (isLoadingUsers) {
    return <Loading />;
  }

  const filteredUsers = users?.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.departmentName && user.departmentName.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "superadmin":
        return <Badge className="bg-rose-100 text-rose-700">Super Admin</Badge>;
      case "salary":
        return <Badge className="bg-emerald-100 text-emerald-700">Salary Admin</Badge>;
      case "department":
        return <Badge className="bg-blue-100 text-blue-700">Department Admin</Badge>;
      default:
        return <Badge>{role}</Badge>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AdminHeader />
      <div className="p-6 flex-1">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">User Management</h1>
            <Badge variant="outline" className="text-lg">
              <Users className="h-4 w-4 mr-2" />
              Admin Section
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setLocation("/admin/dashboard")}
              className="flex items-center gap-2"
            >
              Back to Dashboard
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>User Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between mb-4">
                <div className="relative w-full max-w-sm">
                  <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email or department..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button onClick={() => openUserDialog()} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  New User
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{getRoleBadge(user.role)}</TableCell>
                          <TableCell>{user.departmentName || "-"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openUserDialog(user)}
                                className="flex items-center gap-1"
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openDeleteDialog(user)}
                                className="flex items-center gap-1 text-destructive"
                                disabled={user.email === "admin@amu.ac.in"} // Prevent deleting super admin
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create/Edit User Dialog */}
        <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{selectedUser ? "Edit User" : "Create New User"}</DialogTitle>
              <DialogDescription>
                {selectedUser ? "Update the user details." : "Enter details for the new user."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="User's name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="user@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{selectedUser ? "New Password (Optional)" : "Password"}</FormLabel>
                      <FormControl>
                        <Input 
                          type="password"
                          placeholder={selectedUser ? "Leave empty if unchanged" : "Enter password"} 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="department">Department</SelectItem>
                          <SelectItem value="salary">Salary</SelectItem>
                          <SelectItem value="superadmin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("role") === "department" && (
                  <FormField
                    control={form.control}
                    name="departmentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value ? Number(value) : null)}
                          value={field.value?.toString() ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              {isLoadingDepartments ? (
                                 <span className="flex items-center text-muted-foreground">
                                   <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...
                                 </span>
                               ) : ( 
                                 <SelectValue placeholder="Select department" />
                               )}
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-[300px]">
                            {isLoadingDepartments ? (
                               <SelectItem value="loading" disabled>Loading...</SelectItem>
                             ) : departments.length > 0 ? (
                               departments.map((dept) => (
                                 <SelectItem key={dept.id} value={dept.id.toString()}>
                                   {dept.name}
                                 </SelectItem>
                               ))
                             ) : (
                               <SelectItem value="no-dept" disabled>No departments found</SelectItem>
                             )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsUserDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {selectedUser ? "Save Changes" : "Create User"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this user? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {selectedUser && (
                <div className="space-y-1">
                  <p><strong>Name:</strong> {selectedUser.name}</p>
                  <p><strong>Email:</strong> {selectedUser.email}</p>
                  <p><strong>Role:</strong> {selectedUser.role}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteUser}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 