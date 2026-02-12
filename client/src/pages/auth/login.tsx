import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { login, getCurrentDepartment } from "@/lib/auth";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { Loader2, AlertTriangle } from "lucide-react";

// n8n chat integration
import { useEffect as useEffectOnce } from "react";

// Add n8n chat styles
const N8nChatStyles = () => (
  <link href="https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css" rel="stylesheet" />
);

// Add n8n chat script
const N8nChatScript = () => {
  useEffectOnce(() => {
    const script = document.createElement("script");
    script.type = "module";
    script.innerHTML = `
      import { createChat } from "https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js";
      createChat({ 
        webhookUrl: window.location.origin + '/api/chat-webhook',
        initialMessages: [
          'Hi there! ',
          'I am AMU AI. How can I assist you today?'
        ],
        i18n: {
          en: {
            title: 'AMU AI',
            subtitle: "Start a chat. We're here to help you 24/7.",
            footer: '',
            getStarted: 'New Conversation',
            inputPlaceholder: 'Type your question..',
          }
        }
      });
    `;
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return null;
};

// Turnstile Site Key
const TURNSTILE_SITE_KEY = "0x4AAAAAACZTOpxqkHGef-Qz";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export default function Login() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Track visitor
  useVisitorTracking({ pageVisited: '/login' });

  // Check if already logged in and redirect to dashboard
  useEffect(() => {
    const department = getCurrentDepartment();
    if (department) {
      setLocation("/dashboard");
    }
  }, [setLocation]);

  // Load Turnstile script
  useEffect(() => {
    // Only load Turnstile if not on localhost (development testing without CAPTCHA)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      // For development, auto-set a fake token to allow testing
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
        // Allow login even if Turnstile fails
        setTurnstileToken('error-bypass');
      }
    };

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setIsLoading(true);
    setLockMessage(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, turnstileToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.locked) {
          setLockMessage(`Account locked. Try again in ${data.remainingMinutes} minutes.`);
        }
        throw new Error(data.message || "Invalid credentials");
      }

      // Store department info
      localStorage.setItem("department", JSON.stringify(data.department));
      setLocation("/dashboard");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Invalid credentials. Please try again.",
      });
      // Reset Turnstile
      if (window.turnstile && turnstileRef.current) {
        window.turnstile.reset(turnstileRef.current);
        setTurnstileToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <N8nChatStyles />
      <N8nChatScript />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo_favicon/android-chrome-192x192.png" alt="AMU Logo" className="h-20 w-auto" />
          </div>
          <h1 className="text-2xl font-bold">Department Login</h1>
          <p className="text-sm text-muted-foreground">
            Welcome to AMU Salary Section
          </p>
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
                      <Input {...field} type="email" disabled={isLoading} />
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
                      <Input {...field} type="password" disabled={isLoading} />
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
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <Button
            variant="link"
            onClick={() => setLocation("/forgot-password")}
            disabled={isLoading}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            Forgot Password?
          </Button>
          <Button
            variant="ghost"
            onClick={() => setLocation("/admin/login")}
            disabled={isLoading}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            Admin Login
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