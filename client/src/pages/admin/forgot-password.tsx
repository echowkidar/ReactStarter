import { useState } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export default function AdminForgotPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(values: z.infer<typeof forgotPasswordSchema>) {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/admin/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to process request");
      }

      setIsSubmitted(true);
      toast({
        title: "Success",
        description: "Password reset instructions have been sent to your email.",
      });

      // Save preview URL if available (development only)
      if (data.emailPreviewUrl && data.isEthereal) {
        setPreviewUrl(data.emailPreviewUrl);
        
        toast({
          title: "Ethereal Test Email",
          description: "A test email has been generated. Check the preview link below.",
        });
      } else if (!data.isEthereal) {
        toast({
          title: "Email Sent",
          description: "A real email has been sent to your inbox.",
        });
      }

      // Store reset token in state for access in the JSX
      if (data.resetToken) {
        setResetToken(data.resetToken);
        
        toast({
          variant: "default",
          title: "Development Mode",
          description: `Reset Token: ${data.resetToken}`,
        });
        
        // Display the reset URL but don't auto-redirect
        console.log('Reset URL (use this link to reset password):', data.resetUrl);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send reset request",
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
            Enter your admin email to reset your password
          </p>
        </CardHeader>
        <CardContent>
          {isSubmitted ? (
            <div className="text-center py-4">
              <p className="mb-4">Password reset instructions sent!</p>
              <p className="text-sm text-muted-foreground mb-4">
                {previewUrl 
                  ? "This is a test email. Click the link below to preview it." 
                  : "Please check your email inbox for instructions on how to reset your password."}
              </p>
              
              {/* Add development mode instructions for real emails */}
              {!previewUrl && resetToken && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
                  <strong>Development Mode:</strong> Check the browser console for the reset URL (F12 → Console)
                </p>
              )}
              
              {previewUrl && (
                <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-md">
                  <p className="text-sm font-semibold mb-2">Ethereal Test Email</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    View the email in Ethereal (testing service):
                  </p>
                  <a 
                    href={previewUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-primary hover:underline"
                  >
                    <span>Open Email Preview</span>
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admin Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" disabled={isLoading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Reset Link"
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