import { useQuery } from "@tanstack/react-query";
import { DownloadCloud, ArrowRight, FileText, Globe } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";


type UsefulDownload = {
    id: number;
    title: string;
    description: string | null;
    fileUrl: string | null;
    externalLink: string | null;
    thumbnailUrl: string | null;
    createdAt: string;
};

export default function Downloads() {
    const { data: downloads = [], isLoading } = useQuery<UsefulDownload[]>({
        queryKey: ["/api/downloads"],
    });

    return (
        <DashboardLayout>
            <div className="p-6">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                        <DownloadCloud className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Useful Downloads</h1>
                        <p className="text-muted-foreground mt-1">
                            Access important forms, documents, and resources provided by the administration.
                        </p>
                    </div>
                </div>

                {isLoading ? (
                    <div>Loading resources...</div>
                ) : downloads.length === 0 ? (
                    <div className="text-center py-16 px-4 bg-slate-50 border border-dashed rounded-xl">
                        <DownloadCloud className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                        <h3 className="text-lg font-medium text-slate-700">No downloads available</h3>
                        <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
                            There are currently no resources available. Check back later when the administration uploads new files.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {downloads.map((item) => (
                            <Card key={item.id} className="overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                                {item.thumbnailUrl ? (
                                    <div className="aspect-video w-full overflow-hidden bg-slate-100 border-b relative">
                                        <img
                                            src={item.thumbnailUrl}
                                            alt={item.title}
                                            className="w-full h-full object-cover transition-transform hover:scale-105 duration-300"
                                        />
                                        <div className="absolute top-2 right-2 flex px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold tracking-wider rounded-full uppercase">
                                            {item.fileUrl ? "File" : "Link"}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="aspect-video w-full bg-white border-b relative overflow-hidden group-hover:bg-slate-50 transition-colors">
                                        {(() => {
                                            const url = (item.fileUrl || item.externalLink || "").toLowerCase();
                                            const isImage = url.match(/\.(jpg|jpeg|png|webp|gif)$/i);
                                            const isOfficeFile = url.match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/i);

                                            if (isImage) {
                                                return <img src={item.fileUrl || item.externalLink || ""} alt="File Preview" className="h-full w-full object-cover" />;
                                            } else if (isOfficeFile) {
                                                return (
                                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400">
                                                        <FileText className="w-12 h-12 mb-2 text-slate-300" />
                                                        <span className="text-xs font-medium uppercase tracking-wider">Document File</span>
                                                    </div>
                                                );
                                            } else {
                                                return (
                                                    <div className="w-full h-full relative overflow-hidden bg-slate-50 flex items-start justify-center">
                                                        {/* Fallback background icon in case iframe is blank */}
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 z-0">
                                                            <FileText className="w-12 h-12 mb-2" />
                                                            <span className="text-[10px] font-medium uppercase tracking-wider">Preview Unavailable</span>
                                                        </div>
                                                        <object
                                                            data={`/api/downloads/${item.id}/access#toolbar=0&navpanes=0&scrollbar=0&view=FitH,top`}
                                                            className="absolute top-0 left-0 border-0 pointer-events-none origin-top-left z-10 bg-transparent"
                                                            style={{ width: '150%', height: '150%', transform: 'scale(0.666)' }}
                                                            title={item.title}
                                                        >
                                                            {/* Fallback for when object cannot render */}
                                                            <div className="absolute inset-0 bg-slate-50 flex items-center justify-center text-slate-400 z-10">
                                                                <FileText className="w-12 h-12 mb-2" />
                                                            </div>
                                                        </object>
                                                        {/* Overlay to catch all clicks and prevent interacting with the iframe */}
                                                        <div className="absolute inset-0 bg-transparent z-20" />
                                                    </div>
                                                );
                                            }
                                        })()}
                                    </div>
                                )}

                                <CardContent className="flex-1 p-5">
                                    <h3 className="font-semibold text-lg line-clamp-2 leading-tight">{item.title}</h3>
                                </CardContent>

                                <CardFooter className="p-5 pt-0 mt-auto border-t bg-slate-50/50 flex flex-col gap-2">
                                    <div className="w-full mt-4">
                                        <Button
                                            className="w-full group hover:shadow-md transition-shadow"
                                            onClick={() => window.open(`/api/downloads/${item.id}/access`, "_blank")}
                                        >
                                            <DownloadCloud className="mr-2 h-4 w-4" /> Download File
                                        </Button>
                                    </div>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
