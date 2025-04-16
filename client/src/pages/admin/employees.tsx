import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TableHeader, TableRow, TableHead, TableBody, TableCell, Table } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, LogOut, X, Upload, ArrowLeft, ChevronLeft, ChevronRight, Search, Filter, FileDown } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Employee, Department, InsertEmployee } from "@shared/schema";
import { employmentStatuses } from "@/lib/departments";
import AdminHeader from "@/components/layout/admin-header";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { MultiSelect, Option } from "@/components/ui/multi-select";

interface FileUpload {
  file: File | null;
  preview: string;
}

interface UploadState {
  panCard?: FileUpload;
  bankProof?: FileUpload;
  aadharCard?: FileUpload;
  officeMemo?: FileUpload;
  joiningReport?: FileUpload;
  termExtension?: FileUpload;
}

export default function AdminEmployees() {
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState(selectedEmployee?.employmentStatus || "Permanent");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [uploads, setUploads] = useState<UploadState>({});
  const [, setLocation] = useLocation();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [dealingAssistantFilter, setDealingAssistantFilter] = useState<string[]>([]);
  const [regNoFilter, setRegNoFilter] = useState<string[]>([]);

  // Function to find the correct department ID from the departments list
  const findMatchingDepartment = (employee: Employee, departments: Department[]) => {
    // First try direct ID match
    const directMatch = departments.find(d => d.id === employee.departmentId);
    if (directMatch) {
      return directMatch.id.toString();
    }
    
    // If no direct match, try matching by name (if departmentName is available)
    if (employee.departmentName) {
      const nameMatch = departments.find(d => 
        d.name.toLowerCase() === employee.departmentName?.toLowerCase()
      );
      if (nameMatch) {
        return nameMatch.id.toString();
      }
    }
    
    // Return the original ID as string if no match found
    return employee.departmentId?.toString() || "";
  };

  const { data: employees = [], isLoading: isEmployeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/admin/employees'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/employees");
      return response.json();
    }
  });

  const { data: departments = [], isLoading: isDepartmentsLoading } = useQuery<Department[]>({ 
    queryKey: ['/api/departments'], 
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/departments");
        if (!response.ok) {
          console.error("Failed to fetch departments:", response.status, response.statusText);
          throw new Error("Failed to fetch departments");
        }
        const data = await response.json();
        console.log("Successfully fetched departments:", data);
        return data;
      } catch (error) {
        console.error("Error in department fetch:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Get unique dealing assistants for filter
  const uniqueDealingAssistants = useMemo(() => {
    const assistants = employees
      .map(emp => emp.salary_asstt)
      .filter((value): value is string => !!value); // Filter out null/undefined/empty values
    
    return Array.from(new Set(assistants)).sort();
  }, [employees]);

  // Calculate filtered departments and dealing assistants based on current filters
  const { filteredDepartments, filteredDealingAssistants, filteredRegNos } = useMemo(() => {
    // Start with a filtered set of employees based on search term
    let result = [...employees];
    
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      result = result.filter(
        emp => 
          emp.epid?.toLowerCase().includes(lowerSearchTerm) ||
          emp.name?.toLowerCase().includes(lowerSearchTerm) ||
          emp.departmentName?.toLowerCase().includes(lowerSearchTerm) ||
          emp.designation?.toLowerCase().includes(lowerSearchTerm)
      );
    }
    
    // Apply department filter when calculating available dealing assistants and reg nos
    let departmentFilteredEmployees = result;
    if (departmentFilter.length > 0) {
      departmentFilteredEmployees = result.filter(
        emp => departmentFilter.includes(emp.departmentId?.toString() || "")
      );
    }
    
    // Apply dealing assistant filter when calculating available departments and reg nos
    let dealingAssistantFilteredEmployees = result;
    if (dealingAssistantFilter.length > 0) {
      dealingAssistantFilteredEmployees = result.filter(
        emp => dealingAssistantFilter.includes(emp.salary_asstt || "")
      );
    }
    
    // Apply reg no filter when calculating available departments and dealing assistants
    let regNoFilteredEmployees = result;
    if (regNoFilter.length > 0) {
      regNoFilteredEmployees = result.filter(
        emp => regNoFilter.includes(emp.salaryRegisterNo || "")
      );
    }
    
    // Get unique departments from filtered employees
    const availableDepartments = new Set<string>();
    const combinedFiltered = dealingAssistantFilter.length > 0 ? dealingAssistantFilteredEmployees : 
                             regNoFilter.length > 0 ? regNoFilteredEmployees : result;
    combinedFiltered.forEach(emp => {
      if (emp.departmentId) {
        availableDepartments.add(emp.departmentId.toString());
      }
    });
    
    // Get unique dealing assistants from filtered employees
    const filteredForAssistants = departmentFilter.length > 0 ? departmentFilteredEmployees : 
                                 regNoFilter.length > 0 ? regNoFilteredEmployees : result;
    const assistants = filteredForAssistants
      .map(emp => emp.salary_asstt)
      .filter((value): value is string => !!value);
    const availableDealingAssistants = Array.from(new Set(assistants)).sort();
    
    // Get unique reg nos from filtered employees
    const filteredForRegNos = departmentFilter.length > 0 ? departmentFilteredEmployees : 
                             dealingAssistantFilter.length > 0 ? dealingAssistantFilteredEmployees : result;
    const regNos = filteredForRegNos
      .map(emp => emp.salaryRegisterNo)
      .filter((value): value is string => !!value);
    const availableRegNos = Array.from(new Set(regNos)).sort();
    
    return {
      filteredDepartments: departments.filter(dept => 
        (dealingAssistantFilter.length === 0 && regNoFilter.length === 0) || 
        availableDepartments.has(dept.id.toString())
      ),
      filteredDealingAssistants: availableDealingAssistants,
      filteredRegNos: availableRegNos
    };
  }, [employees, searchTerm, departmentFilter, dealingAssistantFilter, regNoFilter, departments]);

  // Filter and paginate employees
  const filteredEmployees = useMemo(() => {
    let result = [...employees];
    
    // Apply search filter
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      result = result.filter(
        emp => 
          emp.epid?.toLowerCase().includes(lowerSearchTerm) ||
          emp.name?.toLowerCase().includes(lowerSearchTerm) ||
          emp.departmentName?.toLowerCase().includes(lowerSearchTerm) ||
          emp.designation?.toLowerCase().includes(lowerSearchTerm)
      );
    }
    
    // Apply department filter
    if (departmentFilter.length > 0) {
      result = result.filter(emp => departmentFilter.includes(emp.departmentId?.toString() || ""));
    }
    
    // Apply dealing assistant filter
    if (dealingAssistantFilter.length > 0) {
      result = result.filter(emp => dealingAssistantFilter.includes(emp.salary_asstt || ""));
    }
    
    // Apply reg no filter
    if (regNoFilter.length > 0) {
      result = result.filter(emp => regNoFilter.includes(emp.salaryRegisterNo || ""));
    }
    
    return result;
  }, [employees, searchTerm, departmentFilter, dealingAssistantFilter, regNoFilter]);
  
  // Paginate filtered results
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(startIndex, startIndex + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);
  
  // Calculate total pages
  const totalPages = Math.ceil(filteredEmployees.length / pageSize);

  useEffect(() => {
    if (selectedEmployee && departments.length > 0) {
      const initialDeptId = selectedEmployee.departmentId?.toString() || "";
      if (departments.some(dept => dept.id.toString() === initialDeptId)) {
        setSelectedDepartmentId(initialDeptId);
        console.log(`Initial department set for employee ${selectedEmployee.id}: ${initialDeptId}`);
      } else {
        console.warn(`Employee's department ID (${initialDeptId}) not found in registered departments list. Resetting selection.`);
        setSelectedDepartmentId("");
      }
    } else if (!selectedEmployee) {
      setSelectedDepartmentId("");
    }
  }, [selectedEmployee, departments]);

  useEffect(() => {
    if (selectedEmployee) {
      const existingUploads: UploadState = {};

      if (selectedEmployee.panCardUrl) {
        existingUploads.panCard = { file: null, preview: selectedEmployee.panCardUrl };
      }
      if (selectedEmployee.bankProofUrl) {
        existingUploads.bankProof = { file: null, preview: selectedEmployee.bankProofUrl };
      }
      if (selectedEmployee.aadharCardUrl) {
        existingUploads.aadharCard = { file: null, preview: selectedEmployee.aadharCardUrl };
      }
      if (selectedEmployee.officeMemoUrl) {
        existingUploads.officeMemo = { file: null, preview: selectedEmployee.officeMemoUrl };
      }
      if (selectedEmployee.joiningReportUrl) {
        existingUploads.joiningReport = { file: null, preview: selectedEmployee.joiningReportUrl };
      }
      if (selectedEmployee.termExtensionUrl) {
        existingUploads.termExtension = { file: null, preview: selectedEmployee.termExtensionUrl };
      }

      setUploads(existingUploads);
      
      // Debug the department ID
      console.log("Selected employee department ID:", selectedEmployee.departmentId);
      console.log("Department IDs in dropdown:", departments.map(d => d.id));
      console.log("Department ID match exists:", departments.some(d => d.id === selectedEmployee.departmentId));
    } else {
      setUploads({});
    }
  }, [selectedEmployee, departments]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, type: keyof UploadState) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploads(prev => ({
        ...prev,
        [type]: {
          file,
          preview: reader.result as string
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = async (type: keyof UploadState) => {
    const upload = uploads[type];
    
    // If URL exists (meaning the file was uploaded previously), remove it from server
    if (upload?.preview && !upload.preview.startsWith('data:')) {
      try {
        console.log(`Attempting to remove file from server: ${upload.preview}`);
        
        const apiUrl = `/api/upload`;
        console.log(`API endpoint: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ fileUrl: upload.preview }),
        });
        
        // Log server response
        console.log(`Server response status: ${response.status}`);
        console.log(`Server response status text: ${response.statusText}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Server error response:', errorText);
          throw new Error(`Server response: ${response.status} ${response.statusText}. ${errorText}`);
        }
        
        // Check response type
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
          description: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // UI से फाइल रिमूव करें
    setUploads(prev => {
      const newUploads = { ...prev };
      delete newUploads[type];
      return newUploads;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<InsertEmployee>) => {
      // Ensure department ID is present
      const departmentId = selectedDepartmentId ? parseInt(selectedDepartmentId, 10) : NaN;
      
      if (isNaN(departmentId)) {
        throw new Error("Please select a department");
      }
      
      // Create a FormData instance for file uploads
      const formData = new FormData();
      
      // Explicitly add department ID from state
      formData.append('departmentId', departmentId.toString());
      
      // Add files from uploads to FormData
      for (const [key, upload] of Object.entries(uploads)) {
        if (upload?.file) {
          // Use the appropriate field name for the server endpoint
          const fieldName = key === 'panCard' ? 'panCardDoc' :
                           key === 'bankProof' ? 'bankAccountDoc' :
                           key === 'aadharCard' ? 'aadharCardDoc' :
                           key === 'officeMemo' ? 'officeMemoDoc' :
                           key === 'joiningReport' ? 'joiningReportDoc' :
                           key === 'termExtension' ? 'termExtensionDoc' : key;
          
          formData.append(fieldName, upload.file);
        }
      }
      
      // Add other employee data to FormData
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && key !== 'departmentId') { // Skip departmentId as we already added it
          formData.append(key, String(value));
        }
      });
      
      // Use existing URLs if files weren't changed
      for (const [key, upload] of Object.entries(uploads)) {
        if (!upload?.file && upload?.preview && !upload.preview.startsWith('data:')) {
          const urlKey = key + 'Url';
          formData.append(urlKey, upload.preview);
        }
      }

      console.log("Submitting form with departmentId:", departmentId);

      if (selectedEmployee) {
        await apiRequest('PATCH', `/api/employees/${selectedEmployee.id}`, formData, false);
      } else {
        await apiRequest('POST', '/api/admin/employees', formData, false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/employees'] });
      setIsDialogOpen(false);
      setSelectedEmployee(null);
      setUploads({});
      toast({
        title: "Success",
        description: `Employee ${selectedEmployee ? 'updated' : 'created'} successfully`
      });
    },
    onError: (error) => {
      console.error("Error in saveMutation:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save employee data"
      });
    }
  });

  const handleDelete = (employee: Employee) => {
    if (confirm('Are you sure you want to delete this employee?')) {
      deleteMutation.mutate(employee.id);
    }
  };

  const handleLogout = () => {
    setLocation('/admin/login');
  };

  const handleBackToDashboard = () => {
    setLocation('/admin/dashboard');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Create data object from form entries, excluding file inputs
    const data: Record<string, any> = {};
    const formDataEntries: [string, FormDataEntryValue][] = Array.from(formData.entries());
    for (const [key, value] of formDataEntries) {
      if (!['panCard', 'bankProof', 'aadharCard', 'officeMemo', 'joiningReport', 'termExtension'].includes(key)) {
        data[key] = value;
      }
    }
    
    // Explicitly get the aadharCard value and ensure it's included
    const aadharInputValue = (document.getElementById('aadharCard') as HTMLInputElement)?.value || '';
    data.aadharCard = aadharInputValue;
    
    // Log the form data for debugging
    console.log("Form data being submitted:", data);
    console.log("Department ID being submitted:", selectedDepartmentId);
    
    // Use the selectedDepartmentId from state instead of form data
    const departmentId = selectedDepartmentId ? parseInt(selectedDepartmentId, 10) : NaN;
    data.departmentId = departmentId;
    
    if (isNaN(departmentId)) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a department"
      });
      return;
    }
    
    // Create a new FormData for the API request
    const apiFormData = new FormData();
    
    // Add all form fields to the API FormData
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        apiFormData.append(key, String(value));
      }
    });
    
    // Add files from uploads to FormData with proper field names
    for (const [key, upload] of Object.entries(uploads)) {
      if (upload?.file) {
        // Map UI field names to API field names
        const fieldName = key === 'panCard' ? 'panCardDoc' :
                         key === 'bankProof' ? 'bankAccountDoc' :
                         key === 'aadharCard' ? 'aadharCardDoc' :
                         key === 'officeMemo' ? 'officeMemoDoc' :
                         key === 'joiningReport' ? 'joiningReportDoc' :
                         key === 'termExtension' ? 'termExtensionDoc' : key;
        
        apiFormData.append(fieldName, upload.file);
      } else if (upload?.preview && !upload.preview.startsWith('data:')) {
        // Preserve existing URLs for files that weren't changed
        const urlKey = key + 'Url';
        apiFormData.append(urlKey, upload.preview);
      }
    }
    
    console.log("Form data being submitted with files", {
      departmentId: data.departmentId,
      selectedDepartmentId
    });
    
    try {
      if (selectedEmployee) {
        await apiRequest('PATCH', `/api/employees/${selectedEmployee.id}`, apiFormData, false);
      } else {
        await apiRequest('POST', '/api/admin/employees', apiFormData, false);
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/admin/employees'] });
      setIsDialogOpen(false);
      setSelectedEmployee(null);
      setUploads({});
      toast({
        title: "Success",
        description: `Employee ${selectedEmployee ? 'updated' : 'created'} successfully`
      });
    } catch (error) {
      console.error("Error saving employee:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save employee data. Please check the form and try again."
      });
    }
  };

  const renderUploadPreview = (type: keyof UploadState, label: string) => {
    const upload = uploads[type];
    const isPDF = upload?.preview?.toLowerCase().endsWith('.pdf');

    return (
      <div className="space-y-2">
        <Label htmlFor={type}>{label}</Label>
        <div className="flex items-center gap-4">
          <div className="relative w-32 h-32 border rounded-lg overflow-hidden bg-slate-50">
            {upload ? (
              <>
                {isPDF ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100">
                    <a 
                      href={upload.preview} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center text-primary hover:text-primary/80"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                      </svg>
                      <span className="text-xs">View PDF</span>
                    </a>
                  </div>
                ) : (
                  <img
                    src={upload.preview}
                    alt={`${label} preview`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
                      target.style.padding = '2rem';
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveFile(type)}
                  className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-sm hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Upload className="w-8 h-8 text-slate-400" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <Input
              id={type}
              name={type}
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => handleFileSelect(e, type)}
              className="bg-white dark:bg-slate-800"
            />
          </div>
        </div>
      </div>
    );
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/employees/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/employees'] });
      toast({
        title: "Success",
        description: "Employee deleted successfully"
      });
    }
  });

  // Function to handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleDownloadExcel = () => {
    try {
      // Create a workbook
      const wb = XLSX.utils.book_new();
      
      // Format employee data for Excel
      const employeeData = filteredEmployees.map(emp => ({
        'EPID': emp.epid || '',
        'Name': emp.name || '',
        'Department': emp.departmentName || '',
        'Designation': emp.designation || '',
        'Dealing Assistant': emp.salary_asstt || '',
        'Reg.No.': emp.salaryRegisterNo || '',
        'Status': emp.employmentStatus || '',
        'Joining Date': emp.joiningDate || '',
        'Office Memo No': emp.officeMemoNo || '',
        'Bank Account': emp.bankAccount || '',
        'PAN Number': emp.panNumber || '',
        'Aadhar Number': emp.aadharCard || ''
      }));
      
      // Convert to worksheet
      const ws = XLSX.utils.json_to_sheet(employeeData);
      
      // Set column widths
      const colWidths = [
        { wch: 10 }, // EPID
        { wch: 25 }, // Name
        { wch: 30 }, // Department 
        { wch: 25 }, // Designation
        { wch: 25 }, // Dealing Assistant
        { wch: 15 }, // Reg.No.
        { wch: 15 }, // Status
        { wch: 15 }, // Joining Date
        { wch: 20 }, // Office Memo No
        { wch: 20 }, // Bank Account
        { wch: 15 }, // PAN Number
        { wch: 15 }  // Aadhar Number
      ];
      ws['!cols'] = colWidths;
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, "Employees");
      
      // Generate Excel file and download
      XLSX.writeFile(wb, "employees.xlsx");
      
      toast({
        title: "Success",
        description: `Downloaded ${filteredEmployees.length} employee records`
      });
    } catch (error) {
      console.error("Error generating Excel:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate Excel file"
      });
    }
  };

  // Ensure filter values remain valid when options change
  useEffect(() => {
    // Check if selected department is still in filtered options
    if (departmentFilter.length > 0) {
      const validDepartmentIds = filteredDepartments.map(dept => dept.id.toString());
      const invalidDepartments = departmentFilter.filter(id => !validDepartmentIds.includes(id));
      if (invalidDepartments.length > 0) {
        setDepartmentFilter(departmentFilter.filter(id => !invalidDepartments.includes(id)));
      }
    }
    
    // Check if selected dealing assistant is still in filtered options
    if (dealingAssistantFilter.length > 0) {
      const invalidAssistants = dealingAssistantFilter.filter(
        assistant => !filteredDealingAssistants.includes(assistant)
      );
      if (invalidAssistants.length > 0) {
        setDealingAssistantFilter(dealingAssistantFilter.filter(
          assistant => !invalidAssistants.includes(assistant)
        ));
      }
    }
    
    // Check if selected reg no is still in filtered options
    if (regNoFilter.length > 0) {
      const invalidRegNos = regNoFilter.filter(
        regNo => !filteredRegNos.includes(regNo)
      );
      if (invalidRegNos.length > 0) {
        setRegNoFilter(regNoFilter.filter(
          regNo => !invalidRegNos.includes(regNo)
        ));
      }
    }
  }, [filteredDepartments, filteredDealingAssistants, filteredRegNos, departmentFilter, dealingAssistantFilter, regNoFilter]);

  return (
    <div className="container mx-auto py-8 min-h-screen flex flex-col">
      <AdminHeader />
      <div className="flex-1">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Employee Management</CardTitle>
            <div className="flex items-center gap-4">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="bg-gradient-to-r from-primary to-primary/90 hover:to-primary"
                    onClick={() => {
                      setSelectedEmployee(null);
                      setEmploymentStatus("Permanent");
                      setSelectedDepartmentId("");
                      setUploads({});
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto px-4">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-semibold">
                      {selectedEmployee ? 'Edit Employee' : 'Add New Employee'}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-8">
                      <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold mb-6 text-primary">Basic Information</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div>
                            <Label htmlFor="epid">EPID</Label>
                            <Input
                              id="epid"
                              name="epid"
                              defaultValue={selectedEmployee?.epid}
                              className="bg-white dark:bg-slate-800"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="name">Name</Label>
                            <Input
                              id="name"
                              name="name"
                              defaultValue={selectedEmployee?.name}
                              className="bg-white dark:bg-slate-800"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="designation">Designation</Label>
                            <Input
                              id="designation"
                              name="designation"
                              defaultValue={selectedEmployee?.designation}
                              className="bg-white dark:bg-slate-800"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="employmentStatus">Employment Status</Label>
                            <Select
                              name="employmentStatus"
                              value={employmentStatus}
                              onValueChange={setEmploymentStatus}
                            >
                              <SelectTrigger className="bg-white dark:bg-slate-800">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Permanent">Permanent</SelectItem>
                                <SelectItem value="Probation">Probation</SelectItem>
                                <SelectItem value="Temporary">Temporary</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {(employmentStatus === "Probation" || employmentStatus === "Temporary") && (
                            <div>
                              <Label htmlFor="termExpiry">Term Expiry Date</Label>
                              <Input
                                id="termExpiry"
                                name="termExpiry"
                                type="date"
                                defaultValue={selectedEmployee?.termExpiry || ""}
                                className="bg-white dark:bg-slate-800"
                                required
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold mb-6 text-primary">Identification Details</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div>
                            <Label htmlFor="panNumber">PAN Number</Label>
                            <Input
                              id="panNumber"
                              name="panNumber"
                              defaultValue={selectedEmployee?.panNumber}
                              className="bg-white dark:bg-slate-800"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="bankAccount">Bank Account</Label>
                            <Input
                              id="bankAccount"
                              name="bankAccount"
                              defaultValue={selectedEmployee?.bankAccount}
                              className="bg-white dark:bg-slate-800"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="aadharCard">Adhar Number</Label>
                            <Input
                              id="aadharCard"
                              name="aadharCard"
                              defaultValue={selectedEmployee?.aadharCard || ""}
                              className="bg-white dark:bg-slate-800"
                              required
                              onChange={(e) => console.log("Aadhar input changed:", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold mb-6 text-primary">Office Details</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div>
                            <Label htmlFor="officeMemoNo">Office Memo No.</Label>
                            <Input
                              id="officeMemoNo"
                              name="officeMemoNo"
                              defaultValue={selectedEmployee?.officeMemoNo}
                              className="bg-white dark:bg-slate-800"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="joiningDate">Joining Date</Label>
                            <Input
                              id="joiningDate"
                              name="joiningDate"
                              type="date"
                              defaultValue={selectedEmployee?.joiningDate}
                              className="bg-white dark:bg-slate-800"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="joiningShift">Joining Shift</Label>
                            <Select
                              name="joiningShift"
                              defaultValue={selectedEmployee?.joiningShift || "FN"}
                            >
                              <SelectTrigger className="bg-white dark:bg-slate-800">
                                <SelectValue placeholder="Select shift" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="FN">FN</SelectItem>
                                <SelectItem value="AN">AN</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="salaryRegisterNo">Salary Register No.</Label>
                            <Input
                              id="salaryRegisterNo"
                              name="salaryRegisterNo"
                              defaultValue={selectedEmployee?.salaryRegisterNo}
                              className="bg-white dark:bg-slate-800"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="salary_asstt">Salary Assistant</Label>
                            <Input
                              id="salary_asstt"
                              name="salary_asstt"
                              defaultValue={selectedEmployee?.salary_asstt || ""}
                              className="bg-white dark:bg-slate-800"
                            />
                          </div>
                          <div>
                            <Label htmlFor="departmentId">Department</Label>
                            <Select
                              name="departmentId"
                              value={selectedDepartmentId}
                              onValueChange={(value) => {
                                console.log("Department selected:", value);
                                setSelectedDepartmentId(value);
                              }}
                              required
                            >
                              <SelectTrigger className="bg-white dark:bg-slate-800">
                                <SelectValue placeholder={isDepartmentsLoading ? "Loading departments..." : "Select department"} />
                              </SelectTrigger>
                              <SelectContent className="max-h-[200px]">
                                {isDepartmentsLoading ? (
                                  <div className="flex items-center justify-center p-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900" />
                                    <span className="ml-2">Loading departments...</span>
                                  </div>
                                ) : departments && departments.length > 0 ? (
                                  departments.map((dept) => (
                                    <SelectItem key={dept.id} value={dept.id.toString()}>
                                      {dept.name}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <SelectItem value="" disabled>
                                    No departments available
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            {isDepartmentsLoading ? (
                              <p className="text-blue-500 text-xs mt-1">Loading departments...</p>
                            ) : departments.length === 0 ? (
                              <p className="text-orange-500 text-xs mt-1">No departments available. Please add departments first.</p>
                            ) : !selectedDepartmentId ? (
                              <p className="text-red-500 text-xs mt-1">Department is required</p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold mb-6 text-primary">Document Upload</h3>
                        <div className="grid grid-cols-1 gap-6">
                          {renderUploadPreview('panCard', 'PAN Card')}
                          {renderUploadPreview('bankProof', 'Bank Account Proof')}
                          {renderUploadPreview('aadharCard', 'Adhar Number')}
                          {renderUploadPreview('officeMemo', 'Office Memo')}
                          {renderUploadPreview('joiningReport', 'Joining Report')}
                          {(employmentStatus === "Probation" || employmentStatus === "Temporary") && 
                            renderUploadPreview('termExtension', 'Term Extension Office Memo')
                          }
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-primary to-primary/90 hover:to-primary"
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending ? 'Saving...' : 'Save Employee'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                onClick={handleBackToDashboard}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Button>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadExcel}
                className="flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                Download Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search and filter bar */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by EPID, name, department or designation..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1); // Reset to first page on search
                  }}
                  className="pl-8"
                />
              </div>
              <div className="w-full md:w-64">
                <MultiSelect
                  options={filteredDepartments.map(dept => ({
                    label: dept.name,
                    value: dept.id.toString()
                  }))}
                  selected={departmentFilter}
                  onChange={(values) => {
                    setDepartmentFilter(values);
                    setCurrentPage(1); // Reset to first page on filter change
                  }}
                  placeholder="Filter by department"
                  className="min-w-[180px]"
                />
              </div>
              <div className="w-full md:w-64">
                <MultiSelect
                  options={filteredDealingAssistants.map(assistant => ({
                    label: assistant,
                    value: assistant
                  }))}
                  selected={dealingAssistantFilter}
                  onChange={(values) => {
                    setDealingAssistantFilter(values);
                    setCurrentPage(1); // Reset to first page on filter change
                  }}
                  placeholder="Filter by dealing assistant"
                  className="min-w-[180px]"
                />
              </div>
              <div className="w-full md:w-64">
                <MultiSelect
                  options={filteredRegNos.map(regNo => ({
                    label: regNo,
                    value: regNo
                  }))}
                  selected={regNoFilter}
                  onChange={(values) => {
                    setRegNoFilter(values);
                    setCurrentPage(1); // Reset to first page on filter change
                  }}
                  placeholder="Filter by Reg.No."
                  className="min-w-[180px]"
                />
              </div>
            </div>
            
            {/* Top pagination */}
            {!isEmployeesLoading && filteredEmployees.length > 0 && (
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredEmployees.length)} of {filteredEmployees.length} employees
                </div>
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-sm">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {isEmployeesLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchTerm || departmentFilter.length > 0 || dealingAssistantFilter.length > 0 || regNoFilter.length > 0
                  ? "No employees found matching your search criteria." 
                  : "No employees found. Add your first employee using the button above."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>EPID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Dealing Assistant</TableHead>
                    <TableHead>Reg.No.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Term Expiry Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>{employee.epid}</TableCell>
                      <TableCell>{employee.name}</TableCell>
                      <TableCell>{employee.departmentName}</TableCell>
                      <TableCell>{employee.designation}</TableCell>
                      <TableCell>{employee.salary_asstt || "-"}</TableCell>
                      <TableCell>{employee.salaryRegisterNo || "-"}</TableCell>
                      <TableCell>{employee.employmentStatus}</TableCell>
                      <TableCell>
                        {(employee.employmentStatus === "Probation" ||
                          employee.employmentStatus === "Temporary") &&
                          employee.termExpiry ? (
                            format(new Date(employee.termExpiry), "dd MMM yyyy")
                          ) : (
                            "-"
                          )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            console.log("Selected employee for edit:", employee);
                            // Output the employee properties for debugging
                            console.log("Employee properties:", Object.keys(employee));
                            console.log("Employee aadharCard:", employee.aadharCard);
                            console.log("Employee departmentId:", employee.departmentId);
                            console.log("Employee departmentName:", employee.departmentName);
                            
                            setSelectedEmployee(employee);
                            setEmploymentStatus(employee.employmentStatus);
                            
                            // The department ID will be set by the useEffect when departments are available
                            setIsDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(employee)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            
            {/* Bottom pagination */}
            {!isEmployeesLoading && filteredEmployees.length > 0 && (
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredEmployees.length)} of {filteredEmployees.length} employees
                </div>
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-sm">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}