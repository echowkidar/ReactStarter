import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Mail, Key, Loader2, ArrowLeft, ShieldCheck, Info } from "lucide-react";
import { useLocation } from "wouter";
import { GroupManager } from "@/components/GroupManager";

export default function EmailManagement() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  
  const isAdmin = window.location.pathname.startsWith("/admin");
  // Determine user info
  const userInfo = (() => {
    if (isAdmin) {
      const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
      return { type: "admin", id: adminData.email || "unknown_admin" };
    } else {
      const deptData = JSON.parse(localStorage.getItem("department") || "{}");
      return { type: "department", id: deptData.id?.toString() || "unknown_dept" };
    }
  })();

  const { data: currentConfig, isLoading } = useQuery({
    queryKey: ["/api/user-email", userInfo.type, userInfo.id],
    queryFn: async () => {
      const url = `/api/user-email?userId=${encodeURIComponent(userInfo.id)}&userType=${encodeURIComponent(userInfo.type)}`;
      const response = await apiRequest("GET", url);
      return response.json();
    },
    enabled: !!userInfo.id,
  });

  useEffect(() => {
    if (currentConfig && currentConfig.email) {
      setEmail(currentConfig.email);
      setAppPassword(currentConfig.appPassword);
    }
  }, [currentConfig]);

  const saveMutation = useMutation({
    mutationFn: async (data: { email: string; appPassword: string }) => {
      const payload = {
        userId: userInfo.id,
        userType: userInfo.type,
        email: data.email,
        appPassword: data.appPassword
      };
      const response = await apiRequest("POST", "/api/user-email", payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Email configuration saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user-email"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save email configuration.",
        variant: "destructive",
      });
    }
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !appPassword) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({ email, appPassword });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6 flex flex-col items-center">
      <div className="w-full max-w-4xl flex items-center mb-8">
        {(() => {
          const hasConfig = !!currentConfig?.email;
          const returnPath = isAdmin 
            ? (hasConfig ? "/admin/mailbox" : "/admin/dashboard") 
            : (hasConfig ? "/dashboard/mailbox" : "/dashboard");
          const returnLabel = hasConfig ? "Back to Mailbox" : "Back to Dashboard";
          
          return (
            <Button 
              variant="ghost" 
              className="mr-4 hover:bg-white/50 transition-colors"
              onClick={() => setLocation(returnPath)}
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              {returnLabel}
            </Button>
          );
        })()}
      </div>

      <div className="w-full max-w-4xl space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Email Settings</h1>
          <p className="text-gray-500 mt-2 text-lg">Configure your email groups and personal Gmail for app integrations.</p>
        </div>

        {/* Email Groups Management */}
        <div className="w-full">
          <GroupManager userInfo={userInfo} />
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card className="border-0 shadow-xl shadow-indigo-100/50 bg-white/80 backdrop-blur-xl">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-100 rounded-xl">
                    <ShieldCheck className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Authentication</CardTitle>
                    <CardDescription>We use App Passwords for enhanced security</CardDescription>
                  </div>
                </div>
              </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">Gmail Address</Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <Input
                      id="email"
                      type="email"
                      placeholder="e.g., yourname@gmail.com"
                      className="pl-10 h-12 bg-white/50 focus:bg-white transition-colors"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appPassword" className="text-sm font-medium text-gray-700">App Password</Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Key className="h-5 w-5 text-gray-400" />
                    </div>
                    <Input
                      id="appPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="16-character app password"
                      className="pl-10 pr-10 h-12 bg-white/50 focus:bg-white font-mono transition-colors"
                      value={appPassword}
                      onChange={(e) => setAppPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Enter the 16-character code generated by Google. Do not include spaces.
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg font-medium bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all active:scale-[0.98]"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Saving Configuration...
                    </>
                  ) : (
                    'Save Configuration'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Info Section */}
        <div className="space-y-6">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-600 to-purple-700 text-white overflow-hidden relative h-full">
            {/* Decorative background element */}
            <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Info className="h-6 w-6 text-indigo-200" />
                How to generate App Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-indigo-50 relative z-10">
              <p className="opacity-90">To use your Gmail securely, you must generate an App Password. This ensures your actual password remains safe.</p>
              
              <ol className="list-decimal list-inside space-y-3 opacity-90 ml-1">
                <li className="pl-2">Go to your <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="underline font-medium hover:text-white transition-colors">Google Account Security</a>.</li>
                <li className="pl-2">Ensure <strong>2-Step Verification</strong> is enabled.</li>
                <li className="pl-2">Search for "App Passwords" in your account settings.</li>
                <li className="pl-2">Select "Other (Custom name)", type <em>AMU Attendance App</em>, and click Generate.</li>
                <li className="pl-2">Copy the 16-character password and paste it here.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
  );
}
