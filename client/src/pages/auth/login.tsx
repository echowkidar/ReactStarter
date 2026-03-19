import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { login, getCurrentDepartment } from "@/lib/auth";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { Loader2, AlertTriangle, DownloadCloud, ChevronDown, PlayCircle } from "lucide-react";
import { NeuralNetworkStyles, NeuralNetworkOverlay } from "@/components/NeuralNetworkOverlay";
import { SplashScreen } from "@/components/SplashScreen";

// n8n chat integration
import { useEffect as useEffectOnce } from "react";

// Add n8n chat styles
const N8nChatStyles = () => (
  <>
    <link href="https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css" rel="stylesheet" />
    <style>
      {`
        .chat-window-toggle svg { display: none !important; }
        .chat-window-toggle {
          background-image: url('/logo_favicon/amuai_logo.webp') !important;
          background-size: cover !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
          overflow: visible !important;
          z-index: 50 !important;
          bottom: 40px !important;
          right: 25px !important;
          width: 80px !important;
          height: 80px !important;
        }
        .chat-header h1 { display: flex !important; align-items: center !important; width: 100% !important; }
        .chat-header h1::after {
          content: ''; display: inline-block; width: 50px; height: 50px; margin-left: auto !important;
          background-image: url('/logo_favicon/android-chrome-192x192.png');
          background-size: contain; background-repeat: no-repeat; background-position: center;
        }
      `}
    </style>
    <NeuralNetworkStyles />
  </>
);

// Add n8n chat script
const N8nChatScript = () => {
  useEffectOnce(() => {
    // Cleanup any existing chat instances from previous sessions
    document.querySelectorAll('.chat-window-toggle, .chat-window, .n8n-chat, #n8n-chat-container, .n8n-chat-root').forEach(el => el.remove());

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
      // Also cleanup dom instances when unmounting
      document.querySelectorAll('.chat-window-toggle, .chat-window, .n8n-chat, #n8n-chat-container, .n8n-chat-root').forEach(el => el.remove());
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

function PublicDownloadsDropdown() {
  const { data: downloads = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/downloads"],
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between font-normal text-slate-700 bg-white hover:bg-slate-50 border-slate-200 shadow-sm transition-all" disabled={isLoading}>
          <div className="flex items-center">
            <DownloadCloud className="w-4 h-4 mr-2 text-blue-500" />
            {isLoading ? "Loading..." : "Select to Download"}
          </div>
          <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[280px] max-h-[300px] overflow-auto shadow-xl border-slate-200">
        {downloads.length === 0 && !isLoading ? (
          <div className="p-4 text-sm text-muted-foreground text-center">No downloads available</div>
        ) : (
          downloads.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="cursor-pointer py-2.5 px-3 flex items-start group focus:bg-blue-50 focus:text-blue-700"
              onClick={() => window.open(`/api/downloads/${item.id}/access`, "_blank")}
            >
              <span className="font-medium text-sm leading-tight group-hover:underline">{item.title}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Login() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const [showSplash, setShowSplash] = useState(true);

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
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 py-8 relative">
        <N8nChatStyles />
        <N8nChatScript />
        <NeuralNetworkOverlay />

        <div className="w-full max-w-md relative z-10 flex flex-col gap-4">
          <Card className="w-full shadow-lg border-primary/10">
            <CardHeader className="text-center pt-5 pb-2">
              <div className="flex justify-center mb-2">
                <img src="/logo_favicon/android-chrome-192x192.png" alt="AMU Logo" className="h-16 w-auto drop-shadow-sm" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Department Login</h1>
              <p className="text-sm text-muted-foreground mt-0">
                Welcome to AMU Salary Section
              </p>
            </CardHeader>
            <CardContent className="pb-3">
              {lockMessage && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">{lockMessage}</span>
                </div>
              )}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" disabled={isLoading} className="bg-slate-50" />
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
                          <Input {...field} type="password" disabled={isLoading} className="bg-slate-50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Turnstile CAPTCHA */}
                  <div className="flex justify-center pt-2">
                    <div ref={turnstileRef}></div>
                  </div>
                  <Button type="submit" className="w-full font-medium shadow-sm transition-all active:scale-[0.98]" disabled={isLoading || !turnstileToken}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In to Dashboard"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex flex-col space-y-0 border-t pt-2 pb-2 bg-slate-50/50">
              <Button
                variant="link"
                onClick={() => setLocation("/forgot-password")}
                disabled={isLoading}
                className="text-xs text-muted-foreground hover:text-primary h-7 py-0"
              >
                Forgot Password?
              </Button>
              <Button
                variant="ghost"
                onClick={() => setLocation("/admin/login")}
                disabled={isLoading}
                className="text-xs text-muted-foreground hover:text-primary h-7 py-0"
              >
                Admin Login
              </Button>
            </CardFooter>
          </Card>

          {/* Helper Resources row */}
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 flex items-center gap-4">
            <div
              className="w-[160px] h-[90px] shrink-0 rounded overflow-hidden relative cursor-pointer group shadow-sm bg-slate-900"
              onClick={() => window.open('https://www.youtube.com/watch?v=s3uPEzevL5w', '_blank')}
            >
              <img
                src="https://img.youtube.com/vi/s3uPEzevL5w/mqdefault.jpg"
                alt="Tutorial Thumbnail"
                className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity"
              />
              <div className="absolute top-1 left-1.5 z-20">
                <span className="bg-red-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm tracking-wide uppercase">Tutorial</span>
              </div>
              {/* Overlay with custom Play icon */}
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors z-10 flex items-center justify-center">
                <PlayCircle className="text-white w-10 h-10 opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all drop-shadow-md" />
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 px-0.5">Useful Downloads</h4>
              <PublicDownloadsDropdown />
            </div>
          </div>
        </div>
      </div>
    </>
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