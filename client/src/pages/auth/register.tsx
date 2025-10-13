import { useLocation } from "wouter";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

// n8n chat integration
// Add n8n chat styles
const N8nChatStyles = () => (
  <link href="https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css" rel="stylesheet" />
);

// Add n8n chat script
const N8nChatScript = () => {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "module";
    script.innerHTML = `
      import { createChat } from "https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js";
      createChat({ 
        webhookUrl: "https://agent.echowkidar.in/webhook/336cd62e-fd49-462a-bc21-83dae5195819/chat",
        initialMessages: [
          'Hi there! 👋',
          '<strong style="font-size: 1.2em;">I am AMU AI.</strong> How can I assist you today?'
        ],
        i18n: {
          en: {
            title: 'AMU AI',
            subtitle: "Start a chat. We're here to help you 24/7.",
            footer: '',
            getStarted: 'New Conversation',
            inputPlaceholder: 'Type your question..',
          }
        }
      });
    `;
    document.body.appendChild(script);
    
    return () => {
      document.body.removeChild(script);
    };
  }, []);
  
  return null;
};

export default function Register() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <N8nChatStyles />
      <N8nChatScript />
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
