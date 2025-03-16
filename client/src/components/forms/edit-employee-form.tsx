import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { employmentStatuses, bankNames } from "@/lib/departments";
import { Employee, InsertEmployee, insertEmployeeSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { z } from "zod";

interface EditEmployeeFormProps {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditEmployeeForm({ employee, isOpen, onClose, onSuccess }: EditEmployeeFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // रीफ़्स फाइल इनपुट्स के लिए
  const panCardFileRef = useRef<HTMLInputElement>(null);
  const bankAccountFileRef = useRef<HTMLInputElement>(null);
  const aadharCardFileRef = useRef<HTMLInputElement>(null);
  const officeMemoFileRef = useRef<HTMLInputElement>(null);
  const joiningReportFileRef = useRef<HTMLInputElement>(null);
  const termExtensionFileRef = useRef<HTMLInputElement>(null);
  
  // फाइल URL स्टेट - फाइलों को हटाने या रखने के लिए
  const [fileUrls, setFileUrls] = useState({
    panCardUrl: employee.panCardUrl || "",
    bankProofUrl: employee.bankProofUrl || "",
    aadharCardUrl: employee.aadharCardUrl || "",
    officeMemoUrl: employee.officeMemoUrl || "",
    joiningReportUrl: employee.joiningReportUrl || "",
    termExtensionUrl: employee.termExtensionUrl || ""
  });
  
  // फाइल स्टेट ट्रैकिंग
  const [selectedFiles, setSelectedFiles] = useState<{
    panCardDoc: File | null,
    bankAccountDoc: File | null,
    aadharCardDoc: File | null,
    officeMemoDoc: File | null,
    joiningReportDoc: File | null,
    termExtensionDoc: File | null
  }>({
    panCardDoc: null,
    bankAccountDoc: null,
    aadharCardDoc: null,
    officeMemoDoc: null,
    joiningReportDoc: null,
    termExtensionDoc: null
  });
  
  // File change handler
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = event.target.files?.[0] || null;
    console.log(`File selected: ${fieldName} - ${file ? file.name : 'No file'}`);
    
    setSelectedFiles(prev => ({
      ...prev,
      [fieldName]: file
    }));
  };
  
  // File removal handler
  const handleRemoveFile = async (fileType: string) => {
    console.log(`File being removed: ${fileType}`);
    
    // Get the file URL field name
    const urlField = `${fileType.replace('Doc', '')}Url` as keyof typeof fileUrls;
    const currentFileUrl = fileUrls[urlField];
    
    // Directly check if in admin or department mode
    const isAdmin = window.location.pathname.includes('/admin');
    console.log("File deletion:", isAdmin ? "Admin mode" : "Department mode");
    
    // If file URL exists, also remove from server
    if (currentFileUrl) {
      try {
        console.log(`Attempting to remove file from server: ${currentFileUrl}`);
        
        // Add the complete endpoint URL here
        const apiUrl = `/api/upload`;
        console.log(`API endpoint: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fileUrl: currentFileUrl })
        });
        
        // Log server response
        console.log(`Status code: ${response.status}`);
        console.log(`Status text: ${response.statusText}`);
        
        // If response is not OK, log the error response text
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Server error response:', errorText);
          throw new Error(`Server response: ${response.status} ${response.statusText}. ${errorText}`);
        }
        
        // When response is OK, parse JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const result = await response.json();
          console.log('File removed successfully:', result);
          toast({
            title: "Success",
            description: "File removed successfully",
          });
        } else {
          console.log('File removed, but no JSON response');
          toast({
            title: "Success",
            description: "File removed successfully",
          });
        }
      } catch (error) {
        console.error('Error removing file:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: `Error removing file: ${error instanceof Error ? error.message : String(error)}`,
        });
        
        // Clear file URL in form despite the error
        console.log('File URL being cleared in form');
      }
    }
    
    // Clear file URL in form
    setFileUrls(prev => ({
      ...prev,
      [urlField]: ""
    }));
    
    // Reset file input
    switch(fileType) {
      case 'panCardDoc':
        if (panCardFileRef.current) panCardFileRef.current.value = '';
        break;
      case 'bankAccountDoc':
        if (bankAccountFileRef.current) bankAccountFileRef.current.value = '';
        break;
      case 'aadharCardDoc':
        if (aadharCardFileRef.current) aadharCardFileRef.current.value = '';
        break;
      case 'officeMemoDoc':
        if (officeMemoFileRef.current) officeMemoFileRef.current.value = '';
        break;
      case 'joiningReportDoc':
        if (joiningReportFileRef.current) joiningReportFileRef.current.value = '';
        break;
      case 'termExtensionDoc':
        if (termExtensionFileRef.current) termExtensionFileRef.current.value = '';
        break;
    }
    
    // Remove selected file
    setSelectedFiles(prev => ({
      ...prev,
      [fileType]: null
    }));
  };

  // Create a modified schema that makes URL fields optional
  const editEmployeeSchema = insertEmployeeSchema.extend({
    panCardUrl: z.string().optional(),
    bankProofUrl: z.string().optional(),
    aadharCardUrl: z.string().optional(), 
    officeMemoUrl: z.string().optional(),
    joiningReportUrl: z.string().optional(),
    termExtensionUrl: z.string().optional(),
    bankName: z.string().optional(),
  });

  const form = useForm<InsertEmployee & {
    panCardDoc?: FileList;
    bankAccountDoc?: FileList;
    aadharCardDoc?: FileList;
    officeMemoDoc?: FileList;
    joiningReportDoc?: FileList;
    termExtensionDoc?: FileList;
    panCardUrl?: string;
    bankProofUrl?: string;
    aadharCardUrl?: string;
    officeMemoUrl?: string;
    joiningReportUrl?: string;
    termExtensionUrl?: string;
    bankName?: string;
  }>({
    resolver: zodResolver(editEmployeeSchema),
    defaultValues: {
      epid: employee.epid,
      name: employee.name,
      designation: employee.designation,
      employmentStatus: employee.employmentStatus,
      termExpiry: employee.termExpiry || "",
      panNumber: employee.panNumber || "",
      bankAccount: employee.bankAccount || "",
      bankName: employee.bankName || "State Bank",
      aadharCard: employee.aadharCard || "",
      officeMemoNo: employee.officeMemoNo || "",
      joiningDate: employee.joiningDate || "",
      joiningShift: employee.joiningShift || "FN",
      salaryRegisterNo: employee.salaryRegisterNo || "",
      departmentId: employee.departmentId,
      // Add URL fields to defaultValues
      panCardUrl: employee.panCardUrl || "",
      bankProofUrl: employee.bankProofUrl || "",
      aadharCardUrl: employee.aadharCardUrl || "",
      officeMemoUrl: employee.officeMemoUrl || "",
      joiningReportUrl: employee.joiningReportUrl || "",
      termExtensionUrl: employee.termExtensionUrl || "",
    }
  });

  const { register, handleSubmit, watch, formState: { errors } } = form;
  
  // Watch employment status to conditionally show term expiry field
  const employmentStatus = watch("employmentStatus");
  const showTermExpiry = employmentStatus === "Probation" || employmentStatus === "Temporary";

  // Only for debugging
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.error("Form errors:", errors);
    }
  }, [errors]);

  const onSubmit = async (data: any) => {
    try {
      console.log("Form submission started with data:", data);
      setIsSubmitting(true);
      
      // Get department info for department-specific API
      const departmentInfo = JSON.parse(localStorage.getItem("department") || "{}");
      const departmentId = departmentInfo.id || employee.departmentId;
      
      // Determine if we're in admin or department context
      const isAdmin = window.location.pathname.includes('/admin');
      console.log("Context:", isAdmin ? "Admin" : "Department", "Department ID:", departmentId);
      
      // अब रेफरेंस और स्टेट से फाइल्स का उपयोग करें
      const files = selectedFiles;
      
      // Log file details for debugging
      console.log("Selected files:", Object.fromEntries(
        Object.entries(files).map(([key, file]) => [
          key, 
          file ? {name: file.name, type: file.type, size: file.size} : null
        ])
      ));
      
      console.log("File URLs to preserve or clear:", fileUrls);
      
      const hasFiles = !!(
        files.panCardDoc || 
        files.bankAccountDoc || 
        files.aadharCardDoc || 
        files.officeMemoDoc || 
        files.joiningReportDoc ||
        files.termExtensionDoc
      );
      
      console.log("Has files:", hasFiles);
      
      // If we have files, we need to handle them specially
      if (hasFiles) {
        console.log("Processing files for upload...");
        
        // This is how Admin side does it - first upload each file, then update employee
        // We'll do the same for Department side
        
        // First, upload each file and get the URLs
        let panCardUrlPromise = null;
        let bankProofUrlPromise = null;
        let aadharCardUrlPromise = null;
        let officeMemoUrlPromise = null;
        let joiningReportUrlPromise = null;
        let termExtensionUrlPromise = null;
        
        if (files.panCardDoc) {
          console.log("Uploading PAN Card:", files.panCardDoc.name);
          const panCardFormData = new FormData();
          panCardFormData.append('file', files.panCardDoc);
          panCardUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: panCardFormData
          }).then(res => {
            console.log("PAN Card upload response status:", res.status);
            return res.json();
          }).then(result => {
            console.log("PAN Card upload result:", result);
            return result.fileUrl;
          });
        }
        
        if (files.bankAccountDoc) {
          console.log("Uploading Bank Account proof:", files.bankAccountDoc.name);
          const bankFormData = new FormData();
          bankFormData.append('file', files.bankAccountDoc);
          bankProofUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: bankFormData
          }).then(res => {
            console.log("Bank proof upload response status:", res.status);
            return res.json();
          }).then(result => {
            console.log("Bank proof upload result:", result);
            return result.fileUrl;
          });
        }
        
        if (files.aadharCardDoc) {
          console.log("Uploading Aadhar Card:", files.aadharCardDoc.name);
          const aadharFormData = new FormData();
          aadharFormData.append('file', files.aadharCardDoc);
          aadharCardUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: aadharFormData
          }).then(res => {
            console.log("Aadhar Card upload response status:", res.status);
            return res.json();
          }).then(result => {
            console.log("Aadhar Card upload result:", result);
            return result.fileUrl;
          });
        }
        
        if (files.officeMemoDoc) {
          console.log("Uploading Office Memo:", files.officeMemoDoc.name);
          const memoFormData = new FormData();
          memoFormData.append('file', files.officeMemoDoc);
          officeMemoUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: memoFormData
          }).then(res => {
            console.log("Office Memo upload response status:", res.status);
            return res.json();
          }).then(result => {
            console.log("Office Memo upload result:", result);
            return result.fileUrl;
          });
        }
        
        if (files.joiningReportDoc) {
          console.log("Uploading Joining Report:", files.joiningReportDoc.name);
          const reportFormData = new FormData();
          reportFormData.append('file', files.joiningReportDoc);
          joiningReportUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: reportFormData
          }).then(res => {
            console.log("Joining Report upload response status:", res.status);
            return res.json();
          }).then(result => {
            console.log("Joining Report upload result:", result);
            return result.fileUrl;
          });
        }
        
        if (files.termExtensionDoc) {
          console.log("Uploading Term Extension Office Memo:", files.termExtensionDoc.name);
          const termExtensionFormData = new FormData();
          termExtensionFormData.append('file', files.termExtensionDoc);
          termExtensionUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: termExtensionFormData
          }).then(res => {
            console.log("Term Extension Office Memo upload response status:", res.status);
            return res.json();
          }).then(result => {
            console.log("Term Extension Office Memo upload result:", result);
            return result.fileUrl;
          });
        }
        
        // Wait for all uploads to complete
        const results = await Promise.all([
          panCardUrlPromise || Promise.resolve(employee.panCardUrl || ""),
          bankProofUrlPromise || Promise.resolve(employee.bankProofUrl || ""),
          aadharCardUrlPromise || Promise.resolve(employee.aadharCardUrl || ""),
          officeMemoUrlPromise || Promise.resolve(employee.officeMemoUrl || ""),
          joiningReportUrlPromise || Promise.resolve(employee.joiningReportUrl || ""),
          termExtensionUrlPromise || Promise.resolve(employee.termExtensionUrl || "")
        ]);
        
        console.log("File uploads complete. Results:", results);
        
        // Now prepare the update data with the file URLs
        const updateData = {
          epid: data.epid,
          name: data.name,
          designation: data.designation,
          employmentStatus: data.employmentStatus,
          termExpiry: data.termExpiry || null,
          panNumber: data.panNumber || "",
          bankAccount: data.bankAccount || "",
          bankName: data.bankName || "State Bank",
          aadharCard: data.aadharCard || "",
          officeMemoNo: data.officeMemoNo || "",
          joiningDate: data.joiningDate || "",
          joiningShift: data.joiningShift || "FN",
          salaryRegisterNo: data.salaryRegisterNo || "",
          departmentId: employee.departmentId,
          panCardUrl: results[0] || fileUrls.panCardUrl,
          bankProofUrl: results[1] || fileUrls.bankProofUrl,
          aadharCardUrl: results[2] || fileUrls.aadharCardUrl,
          officeMemoUrl: results[3] || fileUrls.officeMemoUrl,
          joiningReportUrl: results[4] || fileUrls.joiningReportUrl,
          termExtensionUrl: results[5] || fileUrls.termExtensionUrl
        };
        
        // Select the appropriate endpoint
        const apiEndpoint = isAdmin 
          ? `/api/employees/${employee.id}`
          : `/api/departments/${departmentId}/employees/${employee.id}`;
        
        console.log(`Making JSON PATCH request to ${apiEndpoint} with data:`, updateData);
        
        // Update the employee with the file URLs
        const response = await fetch(apiEndpoint, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error: ${response.status} - ${errorText}`);
        }
        
        const updatedEmployee = await response.json();
        console.log("Employee updated successfully with files:", updatedEmployee);
      } else {
        // No files - just update the employee data
        const updateData = {
          epid: data.epid,
          name: data.name,
          designation: data.designation,
          employmentStatus: data.employmentStatus,
          termExpiry: data.termExpiry || null,
          panNumber: data.panNumber || "",
          bankAccount: data.bankAccount || "",
          bankName: data.bankName || "State Bank",
          aadharCard: data.aadharCard || "",
          officeMemoNo: data.officeMemoNo || "",
          joiningDate: data.joiningDate || "",
          joiningShift: data.joiningShift || "FN",
          salaryRegisterNo: data.salaryRegisterNo || "",
          departmentId: employee.departmentId,
          // फाइल URL स्टेट से URL लें (जिससे हटाई गई फाइलें भी रिफ्लेक्ट होंगी)
          panCardUrl: fileUrls.panCardUrl,
          bankProofUrl: fileUrls.bankProofUrl,
          aadharCardUrl: fileUrls.aadharCardUrl,
          officeMemoUrl: fileUrls.officeMemoUrl,
          joiningReportUrl: fileUrls.joiningReportUrl,
          termExtensionUrl: fileUrls.termExtensionUrl
        };
        
        // Select the appropriate endpoint
        const apiEndpoint = isAdmin 
          ? `/api/employees/${employee.id}`
          : `/api/departments/${departmentId}/employees/${employee.id}`;
        
        console.log(`Making JSON PATCH request to ${apiEndpoint} with data:`, updateData);
        
        const response = await fetch(apiEndpoint, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error: ${response.status} - ${errorText}`);
        }
        
        const updatedEmployee = await response.json();
        console.log("Employee updated successfully:", updatedEmployee);
      }
      
      toast({
        title: "Success",
        description: "Employee updated successfully",
      });

      if (onSuccess) {
        console.log("Calling onSuccess callback");
        onSuccess();
      }
      
      console.log("Closing dialog");
      onClose();
    } catch (error) {
      console.error("Error updating employee:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update employee: " + (error instanceof Error ? error.message : String(error)),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" encType="multipart/form-data">
          <div className="grid grid-cols-2 gap-4">
            {/* Basic Information */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">EPID</label>
              <input
                {...register("epid")}
                className="w-full p-2 border rounded-md"
              />
              {errors.epid && <p className="text-red-500 text-xs">{errors.epid.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Name</label>
              <input
                {...register("name")}
                className="w-full p-2 border rounded-md"
              />
              {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Designation</label>
              <input
                {...register("designation")}
                className="w-full p-2 border rounded-md"
              />
              {errors.designation && <p className="text-red-500 text-xs">{errors.designation.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Employment Status</label>
              <select
                {...register("employmentStatus")}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select status</option>
                {employmentStatuses.map(status => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              {errors.employmentStatus && <p className="text-red-500 text-xs">{errors.employmentStatus.message}</p>}
            </div>

            {/* Document upload fields */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">PAN Card</label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="w-full p-2 border rounded-md"
                ref={panCardFileRef}
                onChange={(e) => handleFileChange(e, 'panCardDoc')}
              />
              {fileUrls.panCardUrl && (
                <div className="flex items-center mt-1 space-x-2">
                  <a href={fileUrls.panCardUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                    View existing document
                  </a>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveFile('panCardDoc')}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Bank Account Proof</label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="w-full p-2 border rounded-md"
                ref={bankAccountFileRef}
                onChange={(e) => handleFileChange(e, 'bankAccountDoc')}
              />
              {fileUrls.bankProofUrl && (
                <div className="flex items-center mt-1 space-x-2">
                  <a href={fileUrls.bankProofUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                    View existing document
                  </a>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveFile('bankAccountDoc')}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Adhar Number</label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="w-full p-2 border rounded-md"
                ref={aadharCardFileRef}
                onChange={(e) => handleFileChange(e, 'aadharCardDoc')}
              />
              {fileUrls.aadharCardUrl && (
                <div className="flex items-center mt-1 space-x-2">
                  <a href={fileUrls.aadharCardUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                    View existing document
                  </a>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveFile('aadharCardDoc')}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Office Memo</label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="w-full p-2 border rounded-md"
                ref={officeMemoFileRef}
                onChange={(e) => handleFileChange(e, 'officeMemoDoc')}
              />
              {fileUrls.officeMemoUrl && (
                <div className="flex items-center mt-1 space-x-2">
                  <a href={fileUrls.officeMemoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                    View existing document
                  </a>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveFile('officeMemoDoc')}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Joining Report</label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="w-full p-2 border rounded-md"
                ref={joiningReportFileRef}
                onChange={(e) => handleFileChange(e, 'joiningReportDoc')}
              />
              {fileUrls.joiningReportUrl && (
                <div className="flex items-center mt-1 space-x-2">
                  <a href={fileUrls.joiningReportUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                    View existing document
                  </a>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveFile('joiningReportDoc')}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Term Extension Office Memo - Only for Probation or Temporary */}
            {(watch("employmentStatus") === "Probation" || watch("employmentStatus") === "Temporary") && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">Term Extension Office Memo</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="w-full p-2 border rounded-md"
                  ref={termExtensionFileRef}
                  onChange={(e) => handleFileChange(e, 'termExtensionDoc')}
                />
                {fileUrls.termExtensionUrl && (
                  <div className="flex items-center mt-1 space-x-2">
                    <a href={fileUrls.termExtensionUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                      View existing document
                    </a>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveFile('termExtensionDoc')}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Other fields */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">PAN Number</label>
              <input
                {...register("panNumber")}
                className="w-full p-2 border rounded-md"
              />
              {errors.panNumber && <p className="text-red-500 text-xs">{errors.panNumber.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Bank Account</label>
              <input
                {...register("bankAccount")}
                className="w-full p-2 border rounded-md"
              />
              {errors.bankAccount && <p className="text-red-500 text-xs">{errors.bankAccount.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Bank Name</label>
              <select
                {...register("bankName")}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select bank</option>
                {bankNames.map(bank => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
              {errors.bankName && <p className="text-red-500 text-xs">{errors.bankName.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Adhar Number</label>
              <input
                {...register("aadharCard")}
                className="w-full p-2 border rounded-md"
              />
              {errors.aadharCard && <p className="text-red-500 text-xs">{errors.aadharCard.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Office Memo No</label>
              <input
                {...register("officeMemoNo")}
                className="w-full p-2 border rounded-md"
              />
              {errors.officeMemoNo && <p className="text-red-500 text-xs">{errors.officeMemoNo.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Joining Date</label>
              <input
                type="date"
                {...register("joiningDate")}
                className="w-full p-2 border rounded-md"
              />
              {errors.joiningDate && <p className="text-red-500 text-xs">{errors.joiningDate.message}</p>}
            </div>

            {/* Term Expiry Field - Only displayed for Probation or Temporary */}
            {showTermExpiry && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">Term Expiry Date</label>
                <input
                  type="date"
                  {...register("termExpiry")}
                  className="w-full p-2 border rounded-md"
                />
                {errors.termExpiry && <p className="text-red-500 text-xs">{errors.termExpiry.message}</p>}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium">Salary Register No</label>
              <input
                {...register("salaryRegisterNo")}
                className="w-full p-2 border rounded-md"
              />
              {errors.salaryRegisterNo && <p className="text-red-500 text-xs">{errors.salaryRegisterNo.message}</p>}
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <button 
              type="button" 
              className="px-4 py-2 border rounded-md bg-white hover:bg-gray-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Employee"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}