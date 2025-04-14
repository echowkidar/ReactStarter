import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { employmentStatuses } from "@/lib/departments";
import { Employee, InsertEmployee, insertEmployeeSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { compressImageToWebP, isImageFile } from "@/lib/image-utils";
import { FileUpload } from "@/components/ui/file-upload";

interface EditEmployeeFormProps {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditEmployeeForm({ employee, isOpen, onClose, onSuccess }: EditEmployeeFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  
  // File input references
  const panCardFileRef = useRef<HTMLInputElement>(null);
  const bankAccountFileRef = useRef<HTMLInputElement>(null);
  const aadharCardFileRef = useRef<HTMLInputElement>(null);
  const officeMemoFileRef = useRef<HTMLInputElement>(null);
  const joiningReportFileRef = useRef<HTMLInputElement>(null);
  const termExtensionFileRef = useRef<HTMLInputElement>(null);
  
  // File state tracking
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
  
  // File URL State - to handle file removal or replacement
  const [fileUrls, setFileUrls] = useState({
    panCardUrl: employee.panCardUrl || "",
    bankProofUrl: employee.bankProofUrl || "",
    aadharCardUrl: employee.aadharCardUrl || "",
    officeMemoUrl: employee.officeMemoUrl || "",
    joiningReportUrl: employee.joiningReportUrl || "",
    termExtensionUrl: employee.termExtensionUrl || ""
  });
  
  // File change handler
  const handleFileChange = async (file: File | null, fieldName: string) => {
    // Clear any previous errors for this field
    setFileErrors(prev => ({ ...prev, [fieldName]: "" }));
    
    // Update selected files state
    setSelectedFiles(prev => ({
      ...prev,
      [fieldName]: file
    }));
    
    if (!file) {
      // Clear the URL for this field
      let urlField: keyof typeof fileUrls;
      
      // Special case for bank account proof which has a different URL field name
      if (fieldName === 'bankAccountDoc') {
        urlField = 'bankProofUrl';
      } else {
        // Normal case: convert 'typeDoc' to 'typeUrl'
        urlField = `${fieldName.replace('Doc', '')}Url` as keyof typeof fileUrls;
      }
      
      setFileUrls(prev => ({
        ...prev,
        [urlField]: ""
      }));
      return;
    }
    
    // Validate that it's an image
    if (!isImageFile(file)) {
      setFileErrors(prev => ({ ...prev, [fieldName]: "Only image files are allowed" }));
      return;
    }
    
    try {
      // Compress the image to WebP format
      const result = await compressImageToWebP(file);
      
      // Log the conversion to verify WebP format
      console.log(`Converted ${file.name} to WebP: ${result.fileName}`);
      console.log(`Blob type: ${result.blob.type}`);
      
      // Set the URL in fileUrls state
      let urlField: keyof typeof fileUrls;
      
      // Special case for bank account proof which has a different URL field name
      if (fieldName === 'bankAccountDoc') {
        urlField = 'bankProofUrl';
      } else {
        // Normal case: convert 'typeDoc' to 'typeUrl'
        urlField = `${fieldName.replace('Doc', '')}Url` as keyof typeof fileUrls;
      }
      
      setFileUrls(prev => ({
        ...prev,
        [urlField]: result.url
      }));
      
    } catch (error) {
      console.error(`Error processing ${fieldName}:`, error);
      setFileErrors(prev => ({ ...prev, [fieldName]: "Failed to process image" }));
    }
  };
  
  // File removal handler
  const handleRemoveFile = async (fileType: string) => {
    console.log(`File being removed: ${fileType}`);
    
    // Get the file URL field name based on the file type
    let urlField: keyof typeof fileUrls;
    
    // Special case for bank account proof which has a different URL field name
    if (fileType === 'bankAccountDoc') {
      urlField = 'bankProofUrl';
    } else {
      // Normal case: convert 'typeDoc' to 'typeUrl'
      urlField = `${fileType.replace('Doc', '')}Url` as keyof typeof fileUrls;
    }
    
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
          aadharCard: data.aadharCard || "",
          officeMemoNo: data.officeMemoNo || "",
          joiningDate: data.joiningDate || "",
          joiningShift: data.joiningShift || "FN",
          salaryRegisterNo: data.salaryRegisterNo || "",
          departmentId: Number(data.departmentId),
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
          aadharCard: data.aadharCard || "",
          officeMemoNo: data.officeMemoNo || "",
          joiningDate: data.joiningDate || "",
          joiningShift: data.joiningShift || "FN",
          salaryRegisterNo: data.salaryRegisterNo || "",
          departmentId: Number(data.departmentId),
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
          <DialogTitle className="text-xl font-semibold">Edit Employee</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" encType="multipart/form-data">
          {/* Basic Information */}
          <div className="bg-slate-50 p-4 rounded-lg">
            <h3 className="text-md font-medium mb-4 text-slate-700 border-b pb-2">Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">EPID</label>
                <input
                  {...register("epid")}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.epid && <p className="text-red-500 text-xs mt-1">{errors.epid.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  {...register("name")}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                <input
                  {...register("designation")}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.designation && <p className="text-red-500 text-xs mt-1">{errors.designation.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employment Status</label>
                <select
                  {...register("employmentStatus")}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  {employmentStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                {errors.employmentStatus && <p className="text-red-500 text-xs mt-1">{errors.employmentStatus.message}</p>}
              </div>
            </div>
          </div>

          {/* Document upload fields */}
          <div className="bg-slate-50 p-4 rounded-lg">
            <h3 className="text-md font-medium mb-4 text-slate-700 border-b pb-2">Documents</h3>
            
            {/* Term Expiry Date and Term Extension Letter - Only for non-Permanent employees */}
            {watch("employmentStatus") !== "Permanent" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Term Expiry Date</label>
                  <input
                    type="date"
                    {...register("termExpiry")}
                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                  {errors.termExpiry && <p className="text-red-500 text-xs mt-1">{errors.termExpiry.message}</p>}
                </div>

                {(watch("employmentStatus") === "Probation" || watch("employmentStatus") === "Temporary") && (
                  <div className="border-l pl-4">
                    <FileUpload
                      label="Term Extension Letter"
                      name="termExtensionDoc"
                      value={fileUrls.termExtensionUrl}
                      onChange={(file) => handleFileChange(file, "termExtensionDoc")}
                      onRemove={() => handleRemoveFile("termExtensionDoc")}
                      disabled={isSubmitting}
                      onlyImages={true}
                      errorMessage={fileErrors.termExtensionDoc}
                    />
                  </div>
                )}
              </div>
            )}
            
            {/* Other document fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">PAN Number</label>
                <input
                  {...register("panNumber")}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.panNumber && <p className="text-red-500 text-xs mt-1">{errors.panNumber.message}</p>}
              </div>
              
              <div className="border-l pl-4">
                <FileUpload
                  label="PAN Card"
                  name="panCardDoc"
                  value={fileUrls.panCardUrl}
                  onChange={(file) => handleFileChange(file, "panCardDoc")}
                  onRemove={() => handleRemoveFile("panCardDoc")}
                  disabled={isSubmitting}
                  onlyImages={true}
                  errorMessage={fileErrors.panCardDoc}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bank Account</label>
                <input
                  {...register("bankAccount")}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.bankAccount && <p className="text-red-500 text-xs mt-1">{errors.bankAccount.message}</p>}
              </div>
              
              <div className="border-l pl-4">
                <FileUpload
                  label="Bank Account Proof"
                  name="bankAccountDoc"
                  value={fileUrls.bankProofUrl}
                  onChange={(file) => handleFileChange(file, "bankAccountDoc")}
                  onRemove={() => handleRemoveFile("bankAccountDoc")}
                  disabled={isSubmitting}
                  onlyImages={true}
                  errorMessage={fileErrors.bankAccountDoc}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Aadhar Number</label>
                <input
                  {...register("aadharCard")}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.aadharCard && <p className="text-red-500 text-xs mt-1">{errors.aadharCard.message}</p>}
              </div>
              
              <div className="border-l pl-4">
                <FileUpload
                  label="Aadhar Card"
                  name="aadharCardDoc"
                  value={fileUrls.aadharCardUrl}
                  onChange={(file) => handleFileChange(file, "aadharCardDoc")}
                  onRemove={() => handleRemoveFile("aadharCardDoc")}
                  disabled={isSubmitting}
                  onlyImages={true}
                  errorMessage={fileErrors.aadharCardDoc}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Office Memo No</label>
                <input
                  {...register("officeMemoNo")}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.officeMemoNo && <p className="text-red-500 text-xs mt-1">{errors.officeMemoNo.message}</p>}
              </div>

              <div className="border-l pl-4">
                <FileUpload
                  label="Office Memo"
                  name="officeMemoDoc"
                  value={fileUrls.officeMemoUrl}
                  onChange={(file) => handleFileChange(file, "officeMemoDoc")}
                  onRemove={() => handleRemoveFile("officeMemoDoc")}
                  disabled={isSubmitting}
                  onlyImages={true}
                  errorMessage={fileErrors.officeMemoDoc}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Joining Date</label>
                <input
                  type="date"
                  {...register("joiningDate")}
                  className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.joiningDate && <p className="text-red-500 text-xs mt-1">{errors.joiningDate.message}</p>}
              </div>

              <div className="border-l pl-4">
                <FileUpload
                  label="Joining Report"
                  name="joiningReportDoc"
                  value={fileUrls.joiningReportUrl}
                  onChange={(file) => handleFileChange(file, "joiningReportDoc")}
                  onRemove={() => handleRemoveFile("joiningReportDoc")}
                  disabled={isSubmitting}
                  onlyImages={true}
                  errorMessage={fileErrors.joiningReportDoc}
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="w-32 px-4 py-2"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="w-32 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}