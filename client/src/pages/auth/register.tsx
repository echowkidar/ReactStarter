import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { register } from "@/lib/auth";
import { departmentTitles, fetchDepartmentsForRegistration, DepartmentRegistrationInfo } from "@/lib/departments";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, X } from "lucide-react";

const registerSchema = z.object({
  name: z.string().min(1),
  hodTitle: z.enum(departmentTitles),
  hodName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

// Debounce function to delay search execution
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentRegistrationInfo[]>([]);
  const [filteredResults, setFilteredResults] = useState<DepartmentRegistrationInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Set minimum characters required before search begins
  const MIN_SEARCH_CHARS = 2;
  
  // Apply debounce to search term to avoid excessive filtering
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Load departments from API
  useEffect(() => {
    const loadDepartments = async () => {
      setIsLoadingDepartments(true);
      try {
        console.log("Fetching available departments for registration page");
        const departments = await fetchDepartmentsForRegistration();
        console.log(`Fetched ${departments.length} departments`);
        setAvailableDepartments(departments);
        setFilteredResults(departments);
      } catch (error) {
        console.error("Failed to load departments:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load departments list.",
        });
        setAvailableDepartments([]);
        setFilteredResults([]);
      } finally {
        setIsLoadingDepartments(false);
      }
    };
    
    loadDepartments();
  }, [toast]);
  
  // Search function updates
  const performSearch = useCallback(() => {
    setIsSearching(true);
    
    if (debouncedSearchTerm.length >= MIN_SEARCH_CHARS) {
      const results = availableDepartments.filter(dept => 
        dept.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) // Search by dept.name
      );
      setFilteredResults(results);
    } else {
      setFilteredResults(availableDepartments);
    }
    
    setIsSearching(false);
  }, [debouncedSearchTerm, availableDepartments]);
  
  // Update filtered results when search term or available departments change
  useEffect(() => {
    performSearch();
  }, [debouncedSearchTerm, availableDepartments, performSearch]);
  
  // Clear search field
  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      hodTitle: "Chairperson",
      hodName: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof registerSchema>) {
    setIsLoading(true);
    try {
      // Find the full DepartmentRegistrationInfo object matching the selected name
      const selectedDepartment = availableDepartments.find(dept => dept.name === values.name);

      if (!selectedDepartment) {
        throw new Error("Selected department details not found.");
      }

      // Pass the necessary details to the register function
      await register({
        name: selectedDepartment.name, 
        id: selectedDepartment.id.toString(), // Convert ID to string
        hodTitle: values.hodTitle,
        hodName: values.hodName,
        email: values.email,
        password: values.password,
      });
      setLocation("/dashboard");
    } catch (error) {
      console.error("Registration failed:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to register department: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold">Department Registration</h1>
          <p className="text-sm text-muted-foreground">
            Create a new department account
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Search box for departments */}
              <div className="relative mb-4">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type at least 2 characters to search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-8"
                />
                {searchTerm && (
                  <button 
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {isSearching && (
                  <div className="absolute right-2 top-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {debouncedSearchTerm.length > 0 && debouncedSearchTerm.length < MIN_SEARCH_CHARS && (
                  <p className="text-xs text-muted-foreground mt-1 ml-2">
                    Please enter at least {MIN_SEARCH_CHARS} characters to search
                  </p>
                )}
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department Name</FormLabel>
                    <Select
                      disabled={isLoading || isLoadingDepartments}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          {isLoadingDepartments ? (
                            <div className="flex items-center">
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              <span>Loading departments...</span>
                            </div>
                          ) : (
                            <SelectValue placeholder="Select department" />
                          )}
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredResults.length > 0 ? (
                          filteredResults.map((dept) => (
                            <SelectItem key={dept.id} value={dept.name}>
                              {dept.name}
                              {/* Optionally show code: ({dept.code}) */} 
                            </SelectItem>
                          ))
                        ) : searchTerm.length >= MIN_SEARCH_CHARS ? (
                          <SelectItem value="no-results" disabled>
                            No matching departments found
                          </SelectItem>
                        ) : availableDepartments.length > 0 ? (
                          availableDepartments.map((dept) => (
                            <SelectItem key={dept.id} value={dept.name}>
                              {dept.name}
                              {/* Optionally show code: ({dept.code}) */} 
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-departments" disabled>
                            No departments available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="hodTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HOD Title</FormLabel>
                    <Select
                      disabled={isLoading}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select title" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departmentTitles.map((title) => (
                          <SelectItem key={title} value={title}>
                            {title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hodName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HOD Name</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registering...
                  </>
                ) : (
                  "Register"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button
            variant="link"
            onClick={() => setLocation("/")}
            disabled={isLoading}
          >
            Already have an account? Sign in
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
