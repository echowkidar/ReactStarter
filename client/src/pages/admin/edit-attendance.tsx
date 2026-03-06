import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AttendanceForm from "@/components/forms/attendance-form";
import AdminHeader from "@/components/layout/admin-header";
import Loading from "@/components/layout/loading";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function AdminEditAttendance() {
    const [, setLocation] = useLocation();
    const [match, params] = useRoute("/admin/reports/:id/edit");
    const reportId = params?.id ? parseInt(params.id) : null;
    const { toast } = useToast();

    useEffect(() => {
        const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
        if (!adminData.role || adminData.role === 'salary') {
            toast({
                variant: "destructive",
                title: "Access Denied",
                description: "Only Super Admins can edit attendance reports."
            });
            setLocation("/admin/attendance-reports");
        }
    }, [setLocation, toast]);

    const { data: report, isLoading: loadingReport } = useQuery({
        queryKey: [`/api/admin/attendance/${reportId}`],
        enabled: !!reportId
    }) as any;

    const { data: entries, isLoading: loadingEntries } = useQuery({
        queryKey: [`/api/attendance/${reportId}/entries`],
        enabled: !!reportId
    }) as any;

    const initialData = useMemo(() => {
        if (!report || !entries) return undefined;

        try {
            const formattedEntries = entries.map((entry: any) => ({
                employeeId: entry.employeeId,
                periods: typeof entry.periods === 'string' ? JSON.parse(entry.periods) : entry.periods
            }));

            return {
                month: String(report.month),
                year: String(report.year),
                entries: formattedEntries
            };
        } catch (error) {
            console.error("Error parsing entries:", error);
            return undefined;
        }
    }, [report, entries]);

    const updateMutation = useMutation({
        mutationFn: async (data: any) => {
            // 1. Clear existing entries
            await apiRequest("DELETE", `/api/attendance/${reportId}/entries`);

            // 2. Create new entries
            // We need to process each employee entry sequentially or in parallel
            const entryPromises = data.entries.map((entry: any) =>
                apiRequest("POST", `/api/attendance/${reportId}/entries`, {
                    employeeId: entry.employeeId,
                    periods: entry.periods
                })
            );

            await Promise.all(entryPromises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/admin/attendance/${reportId}`] });
            queryClient.invalidateQueries({ queryKey: [`/api/attendance/${reportId}/entries`] });
            toast({
                title: "Report Updated",
                description: "Attendance report has been successfully updated."
            });
            setLocation("/admin/attendance-reports");
        },
        onError: (error) => {
            console.error("Update error:", error);
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: "Failed to update attendance report."
            });
        }
    });

    if (loadingReport || loadingEntries) {
        return <Loading />;
    }

    if (!report) {
        return <div>Report not found</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <AdminHeader />

            <main className="container mx-auto px-4 py-8">
                <div className="mb-6">
                    <Button
                        variant="ghost"
                        onClick={() => setLocation("/admin/attendance-reports")}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Reports
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Edit Attendance Report</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {initialData && (
                            <AttendanceForm
                                initialData={initialData}
                                departmentId={report.departmentId}
                                reportId={String(reportId)}
                                onSubmit={async (data) => {
                                    try {
                                        await updateMutation.mutateAsync(data);
                                    } catch (e) {
                                        // Start handled by mutation
                                    }
                                }}
                                isLoading={updateMutation.isPending}
                            />
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
