import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { employmentStatuses } from "@/lib/departments";
import { PAY_LEVELS } from "@/lib/pay-levels";
import { Employee, InsertEmployee, insertEmployeeSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRightLeft, AlertCircle } from "lucide-react";
import { z } from "zod";
import { compressImageToWebP, isImageFile } from "@/lib/image-utils";
import { FileUpload } from "@/components/ui/file-upload";
import { SearchableSelect, ComboboxOption } from "@/components/ui/searchable-select";
import { DisableReasonModal, DisableReason, DISABLE_REASONS } from "@/components/ui/disable-reason-modal";
import { TransferModal } from "@/components/ui/transfer-modal";
import { getCurrentDepartment } from "@/lib/auth";

// Import master data for designations and salary assistants
import designationsData from "@/lib/designations.json";
import salaryAssistantsData from "@/lib/salary-assistants.json";

// Prepare options for searchable selects
const designationOptions: ComboboxOption[] = designationsData.map((d: string) => ({ value: d, label: d }));
const salaryAssistantOptions: ComboboxOption[] = salaryAssistantsData as ComboboxOption[];

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
  const [selectedDesignation, setSelectedDesignation] = useState(employee.designation || "");
  const [selectedSalaryAsstt, setSelectedSalaryAsstt] = useState(employee.salary_asstt || "");

  // Fetch field visibility settings
  const { data: fieldSettings } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/settings"],
  });
  const showPan = fieldSettings?.show_pan_field !== "false";
  const showBank = fieldSettings?.show_bank_field !== "false";
  const showAadhar = fieldSettings?.show_aadhar_field !== "false";

  // Disable modal state
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableReason, setDisableReason] = useState<DisableReason | "">(employee.disableReason as DisableReason || "");
  const [disableWefDate, setDisableWefDate] = useState(employee.disableWefDate || "");

  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const department = getCurrentDepartment();

  // Check if employee is in current month's attendance report
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();


  const isAdmin = window.location.pathname.includes('/admin');

  const { data: reportedEmployees = [] } = useQuery<number[]>({
    queryKey: [`/api/departments/${employee.departmentId}/attendance/reported-employees`, currentMonth, currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/departments/${employee.departmentId}/attendance/reported-employees?month=${currentMonth}&year=${currentYear}`);
      if (!res.ok) {
        console.error("Failed to fetch reported employees for form");
        return [];
      }
      return res.json();
    },
    enabled: !!employee.departmentId
  });

  const isReported = reportedEmployees.some(id => Number(id) === employee.id);
  const isDayPast25 = now.getDate() > 25;

  const isRestricted = isReported && (!isAdmin || !isDayPast25);

  console.log("DEBUG EditForm Restriction:", {
    employeeId: employee.id,
    departmentId: employee.departmentId,
    currentMonth,
    currentYear,
    reportedEmployees,
    isReported,
    isDayPast25,
    isAdmin,
    pathname: window.location.pathname,
    isRestricted
  });

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

  // Transfer Rejection State
  const [rejectedRequest, setRejectedRequest] = useState<{
    rejectionRemarks: string;
    rejectedBy: string;
    toDepartmentName: string;
    processedAt: string;
  } | null>(null);

  // Fetch latest rejection info
  useEffect(() => {
    const fetchRejection = async () => {
      try {
        const response = await fetch(`/api/employees/${employee.id}/latest-rejected-transfer`, {
          headers: {
            'x-session-token': localStorage.getItem('adminSessionToken') || ''
          }
        });
        if (response.ok) {
          const data = await response.json();
          setRejectedRequest(data);
        }
      } catch (error) {
        console.error("Failed to fetch rejection info", error);
      }
    };
    fetchRejection();
  }, [employee.id]);

  // Moved logic down after watch definition
  const handleFileChange = async (file: File | null, fieldName: string) => {
    // Clear any previous errors for this field
    setFileErrors(prev => ({ ...prev, [fieldName]: "" }));

    if (!file) {
      // Clear the file and URL for this field
      setSelectedFiles(prev => ({
        ...prev,
        [fieldName]: null
      }));

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

      // Create a File object from the compressed blob for upload
      const compressedFile = new File([result.blob], result.fileName, { type: 'image/webp' });

      // Log the conversion to verify WebP format

      // Store the COMPRESSED file for upload
      setSelectedFiles(prev => ({
        ...prev,
        [fieldName]: compressedFile
      }));

      // Set the URL in fileUrls state for preview
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

    // If file URL exists and is a SERVER URL (not base64 data URL), also remove from server
    // Base64 URLs start with "data:" and are not yet uploaded to server
    if (currentFileUrl && !currentFileUrl.startsWith('data:')) {
      try {


        // Add the complete endpoint URL here
        const apiUrl = `/api/upload`;

        const response = await fetch(apiUrl, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ imageUrl: currentFileUrl })
        });


        // Log server response

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
          toast({
            title: "Success",
            description: "File removed successfully",
          });
        } else {
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
      }
    }

    // Clear file URL in form
    setFileUrls(prev => ({
      ...prev,
      [urlField]: ""
    }));

    // Reset file input
    switch (fileType) {
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
      payLevel: employee.payLevel || "L-0",
      termExpiry: employee.termExpiry || "",
      panNumber: employee.panNumber || "",
      bankAccount: employee.bankAccount || "",
      aadharCard: employee.aadharCard || "",
      officeMemoNo: employee.officeMemoNo || "",
      joiningDate: employee.joiningDate || "",
      joiningShift: employee.joiningShift || "FN",
      salaryRegisterNo: employee.salaryRegisterNo || "",
      salary_asstt: employee.salary_asstt || "",
      departmentId: employee.departmentId,

      isActive: employee.isActive || "active",
      remarks: employee.remarks || "",
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

  // DUPLICATE EPID CHECK (Moved here)
  const [duplicateEmployee, setDuplicateEmployee] = useState<{ name: string; departmentName: string } | null>(null);
  const watchedEpid = watch("epid");

  useEffect(() => {
    const checkEpid = async () => {
      // If empty or same as current employee (editing self), clear warning
      if (!watchedEpid || watchedEpid.trim() === "" || (watchedEpid === employee.epid)) {
        setDuplicateEmployee(null);
        return;
      }

      try {
        const res = await fetch(`/api/employees/check-epid?epid=${encodeURIComponent(watchedEpid)}`);
        const data = await res.json();
        if (data.exists) {
          setDuplicateEmployee(data.employee);
        } else {
          setDuplicateEmployee(null);
        }
      } catch (error) {
        console.error("Failed to check EPID:", error);
      }
    };

    const timer = setTimeout(checkEpid, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [watchedEpid, employee.epid]);

  // Only for debugging
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.error("Form errors:", errors);
    }
  }, [errors]);

  const onSubmit = async (data: any) => {
    try {
      setIsSubmitting(true);

      // Get department info for department-specific API
      const departmentInfo = JSON.parse(localStorage.getItem("department") || "{}");
      const departmentId = departmentInfo.id || employee.departmentId;

      // Determine if we're in admin or department context
      const isAdmin = window.location.pathname.includes('/admin');

      // अब रेफरेंस और स्टेट से फाइल्स का उपयोग करें
      const files = selectedFiles;

      // Log file details for debugging


      const hasFiles = !!(
        files.panCardDoc ||
        files.bankAccountDoc ||
        files.aadharCardDoc ||
        files.officeMemoDoc ||
        files.joiningReportDoc ||
        files.termExtensionDoc
      );


      // If we have files, we need to handle them specially
      if (hasFiles) {

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
          const panCardFormData = new FormData();
          panCardFormData.append('file', files.panCardDoc);
          panCardUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: panCardFormData
          }).then(res => {
            return res.json();
          }).then(result => {
            return result.imageUrl;
          });
        }

        if (files.bankAccountDoc) {
          const bankFormData = new FormData();
          bankFormData.append('file', files.bankAccountDoc);
          bankProofUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: bankFormData
          }).then(res => {
            return res.json();
          }).then(result => {
            return result.imageUrl;
          });
        }

        if (files.aadharCardDoc) {
          const aadharFormData = new FormData();
          aadharFormData.append('file', files.aadharCardDoc);
          aadharCardUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: aadharFormData
          }).then(res => {
            return res.json();
          }).then(result => {
            return result.imageUrl;
          });
        }

        if (files.officeMemoDoc) {
          const memoFormData = new FormData();
          memoFormData.append('file', files.officeMemoDoc);
          officeMemoUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: memoFormData
          }).then(res => {
            return res.json();
          }).then(result => {
            return result.imageUrl;
          });
        }

        if (files.joiningReportDoc) {
          const reportFormData = new FormData();
          reportFormData.append('file', files.joiningReportDoc);
          joiningReportUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: reportFormData
          }).then(res => {
            return res.json();
          }).then(result => {
            return result.imageUrl;
          });
        }

        if (files.termExtensionDoc) {
          const termExtensionFormData = new FormData();
          termExtensionFormData.append('file', files.termExtensionDoc);
          termExtensionUrlPromise = fetch('/api/upload', {
            method: 'POST',
            body: termExtensionFormData
          }).then(res => {
            return res.json();
          }).then(result => {
            return result.imageUrl;
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


        // Now prepare the update data with the file URLs
        const updateData = {
          epid: data.epid,
          name: data.name,
          designation: data.designation,
          employmentStatus: data.employmentStatus,
          payLevel: data.payLevel,
          termExpiry: data.termExpiry || null,
          panNumber: data.panNumber || "",
          bankAccount: data.bankAccount || "",
          aadharCard: data.aadharCard || "",
          officeMemoNo: data.officeMemoNo || "",
          joiningDate: data.joiningDate || "",
          joiningShift: data.joiningShift || "FN",
          salaryRegisterNo: data.salaryRegisterNo || "",
          salary_asstt: selectedSalaryAsstt || "",
          departmentId: Number(data.departmentId),
          isActive: data.isActive || "active",
          remarks: data.remarks || "",
          // Disable reason fields (only if disabling)
          ...(data.isActive === "disabled" && {
            disableReason: disableReason,
            disableWefDate: disableWefDate,
          }),

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


        // Update the employee with the file URLs
        const response = await fetch(apiEndpoint, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(isAdmin && { 'x-session-token': localStorage.getItem('adminSessionToken') || '' })
          },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const updatedEmployee = await response.json();
      } else {
        // No files - just update the employee data
        const updateData = {
          epid: data.epid,
          name: data.name,
          designation: data.designation,
          employmentStatus: data.employmentStatus,
          payLevel: data.payLevel,
          termExpiry: data.termExpiry || null,
          panNumber: data.panNumber || "",
          bankAccount: data.bankAccount || "",
          aadharCard: data.aadharCard || "",
          officeMemoNo: data.officeMemoNo || "",
          joiningDate: data.joiningDate || "",
          joiningShift: data.joiningShift || "FN",
          salaryRegisterNo: data.salaryRegisterNo || "",
          salary_asstt: selectedSalaryAsstt || "",
          departmentId: Number(data.departmentId),
          isActive: data.isActive || "active",
          remarks: data.remarks || "",
          // Disable reason fields (only if disabling)
          ...(data.isActive === "disabled" && {
            disableReason: disableReason,
            disableWefDate: disableWefDate,
          }),

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


        const response = await fetch(apiEndpoint, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(isAdmin && { 'x-session-token': localStorage.getItem('adminSessionToken') || '' })
          },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const updatedEmployee = await response.json();
      }

      toast({
        title: "Success",
        description: "Employee updated successfully",
      });

      if (onSuccess) {
        onSuccess();
      }

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
    <>
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
                  <Label htmlFor="epid">EPID {employee.epid && <span className="text-xs text-muted-foreground ml-2">(Cannot be changed)</span>}</Label>
                  <Input
                    id="epid"
                    {...register("epid")}
                    maxLength={5}
                    placeholder="5-digit numeric ID"
                    disabled={!!employee.epid} // Lock if editing existing employee with EPID
                    className={`w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all ${!!employee.epid ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                    onChange={(e) => {
                      // Only allow numeric input
                      const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                      e.target.value = value;
                      // Manually trigger react-hook-form change
                      register("epid").onChange({ target: { value, name: "epid" } } as any);
                    }}
                  />
                  {errors.epid && <p className="text-red-500 text-xs mt-1">{errors.epid.message}</p>}

                  {duplicateEmployee && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                      <div className="font-semibold flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Employee Already Exists
                      </div>
                      <div className="mt-2 text-xs space-y-1 pl-6">
                        <p>Name: <span className="font-medium">{duplicateEmployee.name}</span></p>
                        <p>Department: <span className="font-medium">{duplicateEmployee.departmentName}</span></p>
                        <div className="pt-2 text-amber-700">
                          To add this employee to your department:
                          <ol className="list-decimal ml-4 mt-1 space-y-1">
                            <li>Close this form.</li>
                            <li>Go to <strong>Global Search</strong>.</li>
                            <li>Search by EPID: <strong>{watchedEpid}</strong>.</li>
                            <li>Click <strong>Request Release / Transfer</strong>.</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  )}
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
                  <SearchableSelect
                    options={designationOptions}
                    value={selectedDesignation}
                    onValueChange={(value) => {
                      setSelectedDesignation(value);
                      form.setValue("designation", value);
                    }}
                    placeholder="Select designation..."
                    searchPlaceholder="Search designation..."
                    emptyMessage="No designation found."
                    className="bg-white"
                    disabled={isSubmitting}
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

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pay Level</label>
                  <select
                    {...register("payLevel")}
                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  >
                    {PAY_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  {errors.payLevel && <p className="text-red-500 text-xs mt-1">{errors.payLevel.message}</p>}
                </div>


                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <div className="flex items-center space-x-3 mt-2">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        checked={watch("isActive") === "active"}
                        onChange={() => {
                          form.setValue("isActive", "active");
                          // Clear disable fields when reactivating
                          setDisableReason("");
                          setDisableWefDate("");
                        }}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 mr-2 ${watch("isActive") === "active"
                        ? "bg-green-500 border-green-500"
                        : "border-gray-300"
                        }`}>
                        {watch("isActive") === "active" && (
                          <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-green-600">Active</span>
                    </label>
                    <label className={`flex items-center ${isRestricted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                      onClick={(e) => {
                        if (isRestricted) {
                          e.preventDefault();
                          toast({
                            variant: "destructive",
                            title: "Cannot Disable Employee",
                            description: isAdmin
                              ? "Admins can only disable reported employees after the 25th of the month."
                              : "This employee is included in the current month's attendance report."
                          });
                        }
                      }}
                    >
                      <input
                        type="radio"
                        checked={watch("isActive") === "disabled"}
                        onChange={() => {
                          if (isRestricted) return;
                          // Open the disable reason modal instead of directly setting disabled
                          if (employee.isActive !== "disabled") {
                            setShowDisableModal(true);
                          }
                        }}
                        className="sr-only"
                        disabled={isRestricted}
                      />
                      <div className={`w-4 h-4 rounded-full border-2 mr-2 ${watch("isActive") === "disabled"
                        ? "bg-red-500 border-red-500"
                        : "border-gray-300"
                        }`}>
                        {watch("isActive") === "disabled" && (
                          <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-red-600">Disabled</span>
                    </label>
                  </div>
                  {/* Show disable reason if already disabled */}
                  {watch("isActive") === "disabled" && disableReason && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Reason: {DISABLE_REASONS.find(r => r.value === disableReason)?.label || disableReason}
                      {disableWefDate && ` (WEF ${disableWefDate})`}
                    </p>
                  )}
                  {errors.isActive && <p className="text-red-500 text-xs mt-1">{errors.isActive.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Salary Assistant</label>
                  <SearchableSelect
                    options={salaryAssistantOptions}
                    value={selectedSalaryAsstt}
                    onValueChange={(value) => {
                      setSelectedSalaryAsstt(value);
                      form.setValue("salary_asstt" as any, value);
                    }}
                    placeholder="Select salary assistant..."
                    searchPlaceholder="Search salary assistant..."
                    emptyMessage="No salary assistant found."
                    className="bg-white"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Remarks Field */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                  <textarea
                    {...register("remarks" as any)}
                    rows={2}
                    placeholder="Add any notes or remarks about this employee..."
                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Transfer Button - Only show for active employees without pending transfer (department side only) */}
                {department && watch("isActive") === "active" && !employee.transferStatus && (
                  <div className="col-span-1 sm:col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowTransferModal(true)}
                      className="w-full border-blue-500 text-blue-600 hover:bg-blue-50"
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Transfer to Another Department
                    </Button>
                  </div>
                )}

                {/* Show pending transfer status */}
                {employee.transferStatus === "pending" && (
                  <div className="col-span-1 sm:col-span-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800 flex items-center gap-2">
                      ⏳ This employee has a pending transfer request.
                    </p>
                  </div>
                )}

                {/* Show rejection remarks if exists */}
                {rejectedRequest && !employee.transferStatus && (
                  <div className="col-span-1 sm:col-span-2 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm font-semibold text-red-800 mb-1">
                      Last Transfer Request Rejected by {rejectedRequest.toDepartmentName}
                    </p>
                    <p className="text-sm text-red-700 whitespace-pre-wrap">
                      {rejectedRequest.rejectionRemarks}
                    </p>
                    <p className="text-xs text-red-500 mt-2">
                      Rejected on: {new Date(rejectedRequest.processedAt!).toLocaleDateString()}
                    </p>
                  </div>
                )}
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
                {showPan && (
                  <>
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
                  </>
                )}

                {showBank && (
                  <>
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
                  </>
                )}

                {showAadhar && (
                  <>
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
                  </>
                )}

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

      {/* Disable Reason Modal */}
      <DisableReasonModal
        isOpen={showDisableModal}
        onClose={() => setShowDisableModal(false)}
        onConfirm={(reason, wefDate) => {
          setDisableReason(reason);
          setDisableWefDate(wefDate);
          form.setValue("isActive", "disabled");
          setShowDisableModal(false);
        }}
        employeeName={employee.name}
      />

      {/* Transfer Modal */}
      <TransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSuccess={() => {
          setShowTransferModal(false);
          onSuccess?.();
        }}
        employeeId={employee.id}
        employeeName={employee.name}
        currentDepartmentId={employee.departmentId}
        currentDepartmentName={department?.name || "Unknown"}
        hodName={department?.hodName || ""}
      />
    </>
  );
}