import { useLocation } from "wouter";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Register() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold">Department Registration</h1>
          <p className="text-sm text-muted-foreground">
            Registration information
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-amber-700">
              Department registration is no longer available directly. Please contact an administrator to register your department.
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <Button
            variant="link"
            onClick={() => setLocation("/")}
          >
            Return to login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
