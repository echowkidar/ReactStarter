import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { Shield, ShieldAlert, FileWarning, CheckCircle, Loader2, ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LpcVerify() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    
    setLoading(true);
    fetch(`/api/public/lpc/${id}/verify`)
      .then(res => res.json())
      .then(resData => {
        if (resData.message === "LPC record not found") {
          setError("Record not found");
        } else {
          setData(resData);
        }
      })
      .catch(err => {
        console.error("Verification error:", err);
        setError("Failed to verify document. Server error.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="h-10 w-10 text-indigo-600 animate-spin mb-4" />
        <h2 className="text-xl font-medium text-slate-700">Verifying Digital Signature...</h2>
        <p className="text-slate-500 mt-2 text-center max-w-md">
          Please wait while we check the cryptographic signature against the university's public ledger.
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border-t-4 border-red-500">
          <FileWarning className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Verification Failed</h2>
          <p className="text-slate-600 mb-6">{error || "The document could not be verified."}</p>
          <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm mb-6 text-left">
            This usually means the QR code is invalid, the document has been tampered with, or the record was removed from the server.
          </div>
          <Link href="/">
            <Button variant="outline" className="w-full">Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isVerified = data.status === 'verified';
  const isTampered = data.status === 'modified';
  
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-indigo-900 text-white p-4 shadow-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-full">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">AMU Salary Section</h1>
              <p className="text-xs text-indigo-200">Document Verification Portal</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          
          {/* Status Banner */}
          <div className={`p-6 text-center text-white ${isVerified ? 'bg-emerald-600' : isTampered ? 'bg-amber-600' : 'bg-red-600'}`}>
            {isVerified ? (
              <CheckCircle className="h-16 w-16 mx-auto mb-3" />
            ) : (
              <ShieldAlert className="h-16 w-16 mx-auto mb-3" />
            )}
            <h2 className="text-2xl font-bold mb-1">
              {isVerified ? "Document Verified" : isTampered ? "Tampered Document" : "Verification Failed"}
            </h2>
            <p className="text-white/90 text-sm max-w-md mx-auto">
              {data.message}
            </p>
          </div>

          {/* Document Details */}
          {data.data && (
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-2 mb-6 text-slate-800 border-b pb-4">
                <Shield className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-lg">Verified Document Details</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Employee Name</p>
                  <p className="font-medium text-slate-800 text-lg">{data.data.employeeTitle} {data.data.name}</p>
                </div>
                
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Employee ID (EPID)</p>
                  <p className="font-medium text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded inline-block">{data.data.epid}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Designation</p>
                  <p className="font-medium text-slate-800">{data.data.designation}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Department</p>
                  <p className="font-medium text-slate-800">{data.data.department}</p>
                </div>

                <div className="md:col-span-2 my-2 border-t border-slate-100"></div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Dispatch Number</p>
                  <p className="font-medium text-slate-800 font-mono">{data.data.dispatchNumber}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Dispatch Date</p>
                  <p className="font-medium text-slate-800">{data.data.dispatchDate ? new Date(data.data.dispatchDate).toLocaleDateString('en-IN') : 'N/A'}</p>
                </div>
              </div>

              {!isVerified && (
                <div className="mt-8 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg text-amber-800 text-sm">
                  <strong>Warning:</strong> The physical details on your printed document must EXACTLY match the details shown above. If they differ, the physical document is forged.
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="py-6 text-center text-slate-500 text-sm">
        <p>Finance & Accounts Department</p>
        <p>Aligarh Muslim University, Aligarh</p>
      </footer>
    </div>
  );
}
