import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getCurrentDepartment, updateDepartmentProfile } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const profileSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  hodName: z.string().min(3, "HOD Name must be at least 3 characters"),
  hodTitle: z.string().min(2, "HOD Title must be at least 2 characters")
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters")
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [department, setDepartment] = useState(getCurrentDepartment());
  const [, navigate] = useLocation();
  
  useEffect(() => {
    setDepartment(getCurrentDepartment());
  }, []);
  
  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: department?.name || "",
      email: department?.email || "",
      hodName: department?.hodName || "",
      hodTitle: department?.hodTitle || ""
    }
  });
  
  useEffect(() => {
    if (department) {
      profileForm.reset({
        name: department.name || "",
        email: department.email || "",
        hodName: department.hodName || "",
        hodTitle: department.hodTitle || ""
      });
    }
  }, [department, profileForm]);
  
  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: ""
    }
  });
  
  const onProfileSubmit = async (data: z.infer<typeof profileSchema>) => {
    if (!department?.id) return;
    
    setLoading(true);
    try {
      const updatedDepartment = await updateDepartmentProfile(String(department.id), {
        email: data.email,
        hodName: data.hodName,
        hodTitle: data.hodTitle
      });
      
      setDepartment(updatedDepartment);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully."
      });
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  const onPasswordSubmit = async (data: z.infer<typeof passwordSchema>) => {
    if (!department?.id) return;
    
    setLoading(true);
    try {
      await updateDepartmentProfile(String(department.id), {
        currentPassword: data.currentPassword,
        password: data.newPassword
      });
      
      passwordForm.reset();
      toast({
        title: "Password updated",
        description: "Your password has been updated successfully."
      });
    } catch (error) {
      console.error("Failed to update password:", error);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update password",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  if (!department) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="container mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => navigate("/dashboard")}
                  className="h-8 w-8 mr-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold">Account Settings</h1>
              </div>
            </div>

            <Alert className="bg-yellow-100 border-yellow-400 animate-pulse">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <AlertDescription className="text-yellow-800 font-bold text-lg">
                Please update your HOD Title, HOD Name, Email & Password before creating Attendance Reports.
              </AlertDescription>
            </Alert>
            
            <Tabs defaultValue="profile" className="w-full">
              <TabsList>
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="password">Password</TabsTrigger>
              </TabsList>
              
              <TabsContent value="profile">
                <Card>
                  <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>Update your department's profile information</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...profileForm}>
                      <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                        <FormField
                          control={profileForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Department Name</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Department Name" 
                                  {...field} 
                                  disabled 
                                  className="bg-gray-50"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="hodTitle"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>HOD Title</FormLabel>
                              <FormControl>
                                <Input placeholder="Head of Department Title (e.g. Chairperson)" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="hodName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>HOD Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Head of Department Name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={profileForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input placeholder="email@example.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <Button type="submit" disabled={loading}>
                          {loading ? "Updating..." : "Update Profile"}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="password">
                <Card>
                  <CardHeader>
                    <CardTitle>Change Password</CardTitle>
                    <CardDescription>Update your password</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...passwordForm}>
                      <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                        <FormField
                          control={passwordForm.control}
                          name="currentPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Current Password</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="Current Password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={passwordForm.control}
                          name="newPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>New Password</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="New Password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={passwordForm.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Confirm Password</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="Confirm Password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <Button type="submit" disabled={loading}>
                          {loading ? "Updating..." : "Change Password"}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
} 