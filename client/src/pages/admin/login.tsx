import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

// Turnstile Site Key
const TURNSTILE_SITE_KEY = "0x4AAAAAACZTOpxqkHGef-Qz";

const adminLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type AdminLoginForm = z.infer<typeof adminLoginSchema>;

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Load Turnstile script
  useEffect(() => {
    // Only load Turnstile if not on localhost (development testing without CAPTCHA)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      setTurnstileToken('development-bypass');
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    document.head.appendChild(script);

    script.onload = () => {
      try {
        if (window.turnstile && turnstileRef.current) {
          window.turnstile.render(turnstileRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token: string) => setTurnstileToken(token),
            "expired-callback": () => setTurnstileToken(null),
          });
        }
      } catch (error) {
        console.error('Turnstile render error:', error);
        setTurnstileToken('error-bypass');
      }
    };

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const form = useForm<AdminLoginForm>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: AdminLoginForm) => {
    setIsLoading(true);
    setLockMessage(null);
    try {
      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, turnstileToken }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        if (responseData.locked) {
          setLockMessage(`Account locked. Try again in ${responseData.remainingMinutes} minutes.`);
        }
        throw new Error(responseData.message || "Invalid credentials");
      }

      // Store admin information in localStorage
      localStorage.setItem("adminType", responseData.adminType || "super");
      localStorage.setItem("adminSessionToken", responseData.sessionToken);

      localStorage.setItem("admin", JSON.stringify({
        email: data.email,
        name: responseData.adminName || "Admin",
        role: responseData.adminType === "salary" ? "salary" : "superadmin"
      }));

      toast({
        title: "Success",
        description: "Logged in successfully",
      });
      setLocation("/admin/dashboard");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Invalid admin credentials",
        variant: "destructive",
      });
      // Reset Turnstile
      if (window.turnstile && turnstileRef.current) {
        window.turnstile.reset(turnstileRef.current);
        setTurnstileToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <img src="/logo_favicon/android-chrome-192x192.png" alt="AMU Logo" className="h-20 w-auto" />
          </div>
          <CardTitle className="text-2xl text-center">Admin Login</CardTitle>
        </CardHeader>
        <CardContent>
          {lockMessage && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{lockMessage}</span>
            </div>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="admin@example.com" {...field} />
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
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Turnstile CAPTCHA */}
              <div className="flex justify-center">
                <div ref={turnstileRef}></div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || !turnstileToken}>
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <Button
            variant="link"
            onClick={() => setLocation("/admin/forgot-password")}
            disabled={isLoading}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            Forgot Password?
          </Button>
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            disabled={isLoading}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            Switch to Department Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Add Turnstile type declaration
declare global {
  interface Window {
    turnstile: {
      render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => void;
      reset: (element: HTMLElement) => void;
    };
  }
}