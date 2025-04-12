import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const resetPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function AdminResetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [isDirectAccess, setIsDirectAccess] = useState(true);

  // Extract token and email from URL params and check if this is direct access
  useEffect(() => {
    const params = new URLSearchParams(search);
    const tokenParam = params.get("token");
    const emailParam = params.get("email");

    // Check if accessing via email link (with token and email params)
    const hasValidParams = !!tokenParam && !!emailParam;
    setIsDirectAccess(!hasValidParams);

    if (tokenParam) setToken(tokenParam);
    if (emailParam) setEmail(emailParam);

    // Show warning if accessed directly
    if (!hasValidParams) {
      toast({
        variant: "destructive",
        title: "Invalid Access",
        description: "This page must be accessed through a reset link sent to your email."
      });
    }
  }, [search, toast]);

  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: z.infer<typeof resetPasswordSchema>) {
    setIsLoading(true);

    // Make sure we have token and email
    if (!token || !email) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Missing required parameters. Please use the link from your email.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/admin/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          token,
          newPassword: values.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to reset password");
      }

      setIsSuccessful(true);
      toast({
        title: "Success",
        description: "Your admin password has been reset successfully.",
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        setLocation("/admin/login");
      }, 2000);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset password",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold">Admin Password Reset</h1>
          <p className="text-sm text-muted-foreground">
            {!token || !email ? "Invalid Reset Link" : "Enter your new admin password"}
          </p>
        </CardHeader>
        <CardContent>
          {!token || !email || isDirectAccess ? (
            <div className="text-center py-4">
              <p className="text-red-500 mb-4">Invalid or missing reset link parameters</p>
              <p className="text-sm text-muted-foreground mb-4">
                This page can only be accessed through a valid reset link sent to your email.
              </p>
              <Button 
                variant="outline" 
                onClick={() => setLocation("/admin/forgot-password")}
                className="mt-2 w-full"
              >
                Go to Forgot Password
              </Button>
            </div>
          ) : isSuccessful ? (
            <div className="text-center py-4">
              <p className="mb-4">Password reset successful!</p>
              <p className="text-sm text-muted-foreground">
                You can now log in with your new password.
              </p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" disabled={isLoading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" disabled={isLoading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <Button
            variant="link"
            onClick={() => setLocation("/admin/login")}
            disabled={isLoading}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            Back to Admin Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 