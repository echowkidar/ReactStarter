
import { ReactNode } from "react";
import Sidebar from "./sidebar";
import Header from "./header";

export function DashboardLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-screen bg-slate-50">
            <Sidebar className="w-64 hidden lg:flex border-r bg-white" />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300">
                    {children}
                </main>
            </div>
        </div>
    );
}
