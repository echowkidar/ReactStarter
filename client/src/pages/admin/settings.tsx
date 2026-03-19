import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CreditCard, Building2, Fingerprint } from "lucide-react";
import AdminHeader from "@/components/layout/admin-header";
import Loading from "@/components/layout/loading";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UsefulDownloadsManager } from "@/components/admin/useful-downloads-manager";

type Settings = Record<string, string>;

export default function AdminSettings() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const { data: settings, isLoading } = useQuery<Settings>({
        queryKey: ["/api/admin/settings"],
    });

    const updateSetting = useMutation({
        mutationFn: async ({ key, value }: { key: string; value: string }) => {
            await apiRequest("PATCH", "/api/admin/settings", { key, value });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
            toast({ title: "Setting updated", description: "Changes saved successfully." });
        },
        onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Failed to update setting." });
        },
    });

    if (isLoading) return <Loading />;

    const isEnabled = (key: string) => settings?.[key] === "true";

    const toggleSetting = (key: string) => {
        const newValue = isEnabled(key) ? "false" : "true";
        updateSetting.mutate({ key, value: newValue });
    };

    const fieldConfig = [
        {
            key: "show_pan_field",
            label: "PAN Number",
            description: "Show PAN Number field and PAN Card document upload in employee forms",
            icon: CreditCard,
            color: "text-blue-600",
        },
        {
            key: "show_bank_field",
            label: "Bank Account",
            description: "Show Bank Account field and Bank Account Proof document upload in employee forms",
            icon: Building2,
            color: "text-green-600",
        },
        {
            key: "show_aadhar_field",
            label: "Aadhar Number",
            description: "Show Aadhar Number field and Aadhar Card document upload in employee forms",
            icon: Fingerprint,
            color: "text-purple-600",
        },
    ];

    return (
        <div className="min-h-screen flex flex-col">
            <AdminHeader />
            <div className="p-6 flex-1">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">Settings</h1>
                    <Button variant="outline" onClick={() => window.history.back()}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                </div>

                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-lg">Employee Form Field Visibility</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Control which identification fields are visible in employee forms across both admin and department dashboards.
                            Hidden fields will not appear in Add or Edit Employee forms and will not require validation.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {fieldConfig.map((field) => {
                            const Icon = field.icon;
                            return (
                                <div
                                    key={field.key}
                                    className="flex items-center justify-between p-4 border rounded-lg"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-full bg-slate-100 ${field.color}`}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <Label className="text-base font-medium">{field.label}</Label>
                                            <p className="text-sm text-muted-foreground">{field.description}</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={isEnabled(field.key)}
                                        onCheckedChange={() => toggleSetting(field.key)}
                                        disabled={updateSetting.isPending}
                                    />
                                </div>
                            );
                        })}

                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                            <strong>Note:</strong> Changes take effect immediately on all employee forms.
                            When a field is hidden, any existing data for that field will be preserved in the database.
                        </div>
                    </CardContent>
                </Card>

                <UsefulDownloadsManager />
            </div>
        </div>
    );
}
