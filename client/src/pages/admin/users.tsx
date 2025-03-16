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

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import AdminHeader from "@/components/layout/admin-header";
import Loading from "@/components/layout/loading";

// User type
interface User {
  id: number;
  email: string;
  name: string;
  role: "superadmin" | "salary" | "department";
  departmentId?: number | null;
  departmentName?: string | null;
}

// Department type
interface Department {
  id: number;
  name: string;
  hodTitle: string;
  hodName: string;
  email: string;
  isRegistered?: boolean;
}

// Form schema for creating/editing users
const userFormSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).optional()
    .or(z.literal('')) // Allow empty string for editing
    .transform(val => val === '' ? undefined : val), // Convert empty string to undefined
  role: z.enum(["superadmin", "salary", "department"]),
  departmentId: z.number().optional().nullable(),
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

  // Fetch departments for department selection
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
    queryFn: async () => {
      const response = await fetch("/api/departments?showAll=true&showRegistered=true");
      if (!response.ok) {
        throw new Error("Failed to fetch departments");
      }
      return response.json();
    }
  });

  // Fetch users
  const { data: users, isLoading } = useQuery<User[]>({
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
      form.reset({
        name: user.name,
        email: user.email,
        password: "", // Don't fill password for editing
        role: user.role,
        departmentId: user.departmentId || null,
      });
    } else {
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

      // Type safety check for department ID
      if (data.role === "department") {
        // Ensure departmentId is a valid number
        const deptId = Number(data.departmentId);
        if (isNaN(deptId)) {
          console.error("Department ID is not a valid number:", data.departmentId);
          toast({
            title: "त्रुटि",
            description: "अमान्य विभाग ID (Invalid department ID)",
            variant: "destructive",
          });
          return;
        }

        // Verify department exists in our list
        const selectedDept = departments.find(d => d.id === deptId);
        if (!selectedDept) {
          console.warn(`Selected department ID ${deptId} not found in departments list. Available departments:`, 
            departments.map(d => ({ id: d.id, name: d.name }))
          );
          
          // Double-check if there's a close match (type conversion issue)
          const stringMatch = departments.find(d => String(d.id) === String(deptId));
          if (stringMatch) {
            console.log("Found matching department using string comparison:", stringMatch);
            // Continue with the matched department's ID instead
            data.departmentId = stringMatch.id;
          } else {
            toast({
              title: "त्रुटि",
              description: "चयनित विभाग नहीं मिला। कृपया दूसरा विभाग चुनें। (Selected department not found. Please select another department.)",
              variant: "destructive",
            });
            return;
          }
        } else {
          console.log("Found matching department:", selectedDept);
          // Ensure we're using the correct ID type
          data.departmentId = selectedDept.id;
        }
      }

      let response;
      
      if (selectedUser) {
        // Update existing user
        console.log(`PUT /api/admin/users/${selectedUser.id}`, data);
        response = await fetch(`/api/admin/users/${selectedUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } else {
        // Create new user
        console.log("POST /api/admin/users", data);
        response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      }

      // Try to get response as JSON
      let responseData;
      try {
        responseData = await response.json();
        console.log("API response:", response.status, responseData);
      } catch (e) {
        console.error("Failed to parse response as JSON:", e);
        responseData = null;
      }
      
      if (!response.ok) {
        // Get a generic error message from the response
        const errorMessage = responseData?.message || (selectedUser ? "Failed to update user" : "Failed to create user");
        
        toast({
          variant: "destructive",
          title: "Error",
          description: errorMessage
        });
        
        return;
      }

      toast({
        title: "सफलता",
        description: selectedUser ? "उपयोगकर्ता अपडेट किया गया" : "नया उपयोगकर्ता बनाया गया",
      });

      // Refresh user list
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setIsUserDialogOpen(false);
    } catch (error) {
      console.error("Form submission error:", error);
      toast({
        title: "त्रुटि",
        description: `${selectedUser ? "अपडेट" : "निर्माण"} असफल: ${error instanceof Error ? error.message : "अज्ञात त्रुटि"}`,
        variant: "destructive",
      });
    }
  };

  // Handle user deletion
  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      console.log("Deleting user:", selectedUser);
      
      // Set loading state if needed
      // setIsLoading(true);
      
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "DELETE",
      });

      // Try to get JSON response
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

      // Close the dialog
      setIsDeleteDialogOpen(false);
      
      // Show success message
      toast({
        title: "सफलता",
        description: "उपयोगकर्ता हटा दिया गया",
      });

      // Force refresh the user list
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      
      // Wait a moment before refetching to ensure server has updated
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
    } finally {
      // Clear loading state if needed
      // setIsLoading(false);
    }
  };

  const handleLogout = () => {
    // Clear admin data from localStorage
    localStorage.removeItem("adminType");
    localStorage.removeItem("admin");
    setLocation("/admin/login");
  };

  if (isLoading) return <Loading />;

  // Filter users by search term
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
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{selectedUser ? "Edit User" : "Create New User"}</DialogTitle>
              <DialogDescription>
                {selectedUser
                  ? "Edit user information"
                  : "Fill in the details to add a new user"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="superadmin">Super Admin</SelectItem>
                          <SelectItem value="salary">Salary Admin</SelectItem>
                          <SelectItem value="department">Department Admin</SelectItem>
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
                          onValueChange={(value) => {
                            console.log("Department selected value:", value, "type:", typeof value);
                            
                            // Explicitly try number conversion and log the result
                            const numValue = Number(value);
                            console.log("After Number() conversion:", numValue, "type:", typeof numValue, "isNaN:", isNaN(numValue));
                            
                            // Only use departmentId if it's a valid number
                            if (!isNaN(numValue)) {
                              console.log("Setting departmentId to:", numValue);
                              field.onChange(numValue);
                            } else {
                              console.error("Failed to convert department ID to number:", value);
                              toast({
                                title: "Error",
                                description: "Invalid department selection",
                                variant: "destructive"
                              });
                            }
                          }}
                          defaultValue={field.value?.toString()}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a department" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {departments && departments.length > 0 ? 
                              departments
                                // Show all departments
                                .map((department: Department) => (
                                <SelectItem 
                                  key={department.id} 
                                  value={department.id.toString()}
                                >
                                  <span>
                                    {department.name}
                                  </span>
                                </SelectItem>
                              )) : (
                              <div className="p-2 text-center text-sm text-muted-foreground">
                                No departments available
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <DialogFooter>
                  <Button type="submit">
                    {selectedUser ? "Update" : "Create User"}
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