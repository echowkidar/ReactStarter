import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Mail, Send, ArrowLeft, RefreshCw, Inbox, Settings, ChevronDown, ChevronUp, Paperclip, Download, Trash2, Send as SentIcon, Forward, Star } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

export default function EmailClient() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isAdmin = window.location.pathname.startsWith("/admin");
  const returnPath = isAdmin ? "/admin/dashboard" : "/dashboard";

  const userInfo = (() => {
    if (isAdmin) {
      const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
      return { type: "admin", id: adminData.email || "unknown_admin" };
    } else {
      const deptData = JSON.parse(localStorage.getItem("department") || "{}");
      return { type: "department", id: deptData.id?.toString() || "unknown_dept" };
    }
  })();

  const [activeTab, setActiveTab] = useState<'inbox' | 'sent'>('inbox');
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [isToExpanded, setIsToExpanded] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState<{to: string, subject: string, text: string, attachments: any[]}>({ to: "", subject: "", text: "", attachments: [] });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newAttachments = await Promise.all(files.map(async (file) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve({
              filename: file.name,
              content: event.target?.result as string,
            });
          };
          reader.readAsDataURL(file);
        });
      }));
      setComposeData(prev => ({ ...prev, attachments: [...prev.attachments, ...newAttachments] }));
    }
  };

  const { data: inboxResponse, isLoading: isLoadingInbox, isFetching: isFetchingInbox, refetch, isError, error } = useQuery({
    queryKey: ["/api/email/inbox", userInfo.type, userInfo.id],
    queryFn: async () => {
      const url = `/api/email/inbox?userId=${encodeURIComponent(userInfo.id)}&userType=${encodeURIComponent(userInfo.type)}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!userInfo.id,
  });

  useEffect(() => {
    if (isError && error?.message?.toLowerCase().includes("not found")) {
      setLocation(isAdmin ? "/admin/email" : "/dashboard/email");
    }
  }, [isError, error, setLocation, isAdmin]);

  const { data: sentResponse, isLoading: isLoadingSent, isFetching: isFetchingSent, refetch: refetchSent } = useQuery({
    queryKey: ["/api/email/sent", userInfo.type, userInfo.id],
    queryFn: async () => {
      const url = `/api/email/sent?userId=${encodeURIComponent(userInfo.id)}&userType=${encodeURIComponent(userInfo.type)}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!userInfo.id && activeTab === 'sent',
  });

  const { data: activeMessageResponse, isLoading: isLoadingMessage } = useQuery({
    queryKey: ["/api/email/message", userInfo.type, userInfo.id, selectedMessageId, activeTab],
    queryFn: async () => {
      const folder = activeTab === 'inbox' ? 'INBOX' : '[Gmail]/Sent Mail';
      const url = `/api/email/message/${selectedMessageId}?userId=${encodeURIComponent(userInfo.id)}&userType=${encodeURIComponent(userInfo.type)}&folder=${encodeURIComponent(folder)}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!selectedMessageId,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const folder = activeTab === 'inbox' ? 'INBOX' : '[Gmail]/Sent Mail';
      const url = `/api/email/message/${selectedMessageId}?userId=${encodeURIComponent(userInfo.id)}&userType=${encodeURIComponent(userInfo.type)}&folder=${encodeURIComponent(folder)}`;
      const res = await apiRequest("DELETE", url);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Email deleted successfully" });
      setSelectedMessageId(null);
      if (activeTab === 'inbox') refetch();
      else refetchSent();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete email", variant: "destructive" });
    }
  });

  const toggleFlagMutation = useMutation({
    mutationFn: async ({ uid, flag, value }: { uid: number, flag: 'read' | 'starred', value: boolean }) => {
      const folder = activeTab === 'inbox' ? 'INBOX' : '[Gmail]/Sent Mail';
      const url = `/api/email/message/${uid}/flag`;
      const res = await apiRequest("PATCH", url, { userId: userInfo.id, userType: userInfo.type, folder, flag, value });
      return res.json();
    },
    onSuccess: () => {
      if (activeTab === 'inbox') refetch();
      else refetchSent();
    }
  });

  const sendMutation = useMutation({
    mutationFn: async (data: typeof composeData) => {
      const payload = { userId: userInfo.id, userType: userInfo.type, ...data };
      const res = await apiRequest("POST", "/api/email/send", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Email sent successfully!" });
      setIsComposeOpen(false);
      setComposeData({ to: "", subject: "", text: "", attachments: [] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to send email.", variant: "destructive" });
    }
  });

  const messages = activeTab === 'inbox' ? (inboxResponse?.messages || []) : (sentResponse?.messages || []);

  const handleForward = () => {
    const msg = activeMessageResponse?.message;
    if (!msg) return;

    let forwardedBody = `\n\n---------- Forwarded message ---------\n`;
    forwardedBody += `From: ${msg.from?.[0]?.name ? `${msg.from[0].name} ` : ''}<${msg.from?.[0]?.address}>\n`;
    forwardedBody += `Date: ${format(new Date(msg.date), "PPP p")}\n`;
    forwardedBody += `Subject: ${msg.subject}\n`;
    
    if (msg.to && msg.to.length > 0) {
      const toStr = msg.to.map((t: any) => t.name ? `${t.name} <${t.address}>` : t.address || t).join(', ');
      forwardedBody += `To: ${toStr}\n`;
    }
    forwardedBody += `\n${msg.body || '(No readable text in original message)'}`;

    const initialAttachments = (msg.attachments || []).map((att: any) => ({
      filename: att.filename,
      content: att.content
    }));

    setComposeData({
      to: "",
      subject: `Fwd: ${msg.subject}`,
      text: forwardedBody,
      attachments: initialAttachments
    });
    setIsComposeOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
      <div className="w-full max-w-6xl flex justify-between items-center mb-6">
        <Button variant="ghost" onClick={() => setLocation(returnPath)}>
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Dashboard
        </Button>

        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setLocation(isAdmin ? "/admin/email" : "/dashboard/email")}>
            <Settings className="h-4 w-4 mr-2" />
            Email Settings
          </Button>

          <Button variant="outline" onClick={() => activeTab === 'inbox' ? refetch() : refetchSent()} disabled={isLoadingInbox || isLoadingSent || isFetchingInbox || isFetchingSent}>
            <RefreshCw className={`h-4 w-4 mr-2 ${(isLoadingInbox || isLoadingSent || isFetchingInbox || isFetchingSent) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700">
                <Send className="h-4 w-4 mr-2" />
                Compose
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>New Message</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input
                  placeholder="To (e.g. user@example.com)"
                  value={composeData.to}
                  onChange={(e) => setComposeData({ ...composeData, to: e.target.value })}
                />
                <Input
                  placeholder="Subject"
                  value={composeData.subject}
                  onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
                />
                <Textarea
                  placeholder="Type your message here."
                  className="min-h-[150px]"
                  value={composeData.text}
                  onChange={(e) => setComposeData({ ...composeData, text: e.target.value })}
                />
                <div className="flex flex-col gap-2">
                  <Input 
                    type="file" 
                    multiple 
                    onChange={handleFileChange}
                    className="cursor-pointer file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                  {composeData.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs text-gray-600 mt-1">
                      {composeData.attachments.map((att, i) => (
                        <div key={i} className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                          <Paperclip className="h-3 w-3" />
                          <span className="truncate max-w-[150px]">{att.filename}</span>
                          <button 
                            onClick={() => setComposeData(prev => ({...prev, attachments: prev.attachments.filter((_, idx) => idx !== i)}))}
                            className="text-red-500 hover:text-red-700 ml-1 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button 
                  onClick={() => sendMutation.mutate(composeData)} 
                  disabled={sendMutation.isPending || !composeData.to || !composeData.text}
                >
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Email
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="w-full max-w-6xl grid md:grid-cols-3 gap-6 h-[75vh]">
        {/* Inbox/Sent List */}
        <Card className="col-span-1 flex flex-col h-full overflow-hidden shadow-sm">
          <CardHeader className="py-0 px-0 border-b bg-white">
            <div className="flex w-full h-full">
              <button 
                onClick={() => { setActiveTab('inbox'); setSelectedMessageId(null); }}
                className={`flex-1 py-4 flex items-center justify-center font-medium transition-colors ${activeTab === 'inbox' ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'text-gray-500 hover:bg-slate-50'}`}
              >
                <Inbox className="h-4 w-4 mr-2" />
                Inbox
              </button>
              <button 
                onClick={() => { setActiveTab('sent'); setSelectedMessageId(null); }}
                className={`flex-1 py-4 flex items-center justify-center font-medium transition-colors ${activeTab === 'sent' ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'text-gray-500 hover:bg-slate-50'}`}
              >
                <SentIcon className="h-4 w-4 mr-2" />
                Sent
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto bg-white flex-1">
            {isLoadingInbox ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : messages.length === 0 ? (
              <div className="text-center p-8 text-gray-500">No emails found or not configured.</div>
            ) : (
              <div className="divide-y">
                {messages.map((msg: any) => (
                  <div 
                    key={msg.id} 
                    className={`px-3 py-2 cursor-pointer transition-colors flex gap-2 items-start ${selectedMessageId === msg.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-slate-50 border-l-4 border-transparent'} ${!msg.read ? 'bg-white' : 'bg-slate-50'}`}
                    onClick={() => { 
                      setSelectedMessageId(msg.id); 
                      setIsToExpanded(false);
                      if (!msg.read) toggleFlagMutation.mutate({ uid: msg.id, flag: 'read', value: true });
                    }}
                  >
                    <button 
                      className={`mt-0.5 shrink-0 hover:scale-110 transition-transform ${msg.starred ? 'text-yellow-400' : 'text-gray-300'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFlagMutation.mutate({ uid: msg.id, flag: 'starred', value: !msg.starred });
                      }}
                    >
                      <Star className={`h-4 w-4 ${msg.starred ? 'fill-current' : ''}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${!msg.read ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{msg.from?.[0]?.name || msg.from?.[0]?.address || 'Unknown'}</div>
                      <div className={`text-sm truncate ${!msg.read ? 'font-bold text-gray-800' : 'text-gray-600'}`}>{msg.subject || '(No Subject)'}</div>
                      <div className={`text-xs mt-1 ${!msg.read ? 'font-medium text-indigo-600' : 'text-gray-400'}`}>{format(new Date(msg.date), "MMM d, h:mm a")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message Reader */}
        <Card className="col-span-2 flex flex-col h-full overflow-hidden shadow-sm min-h-0">
          <CardContent className="p-0 flex-1 flex flex-col bg-white min-h-0">
            {!selectedMessageId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <Mail className="h-16 w-16 mb-4 opacity-20" />
                <p>Select a message to read</p>
              </div>
            ) : isLoadingMessage ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : activeMessageResponse?.message ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="p-6 border-b shrink-0">
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-2xl font-bold mr-4">{activeMessageResponse.message.subject}</h2>
                    <div className="flex gap-2 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleForward}
                        className="text-gray-600 hover:text-indigo-700 hover:bg-indigo-50"
                        title="Forward Email"
                      >
                        <Forward className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => deleteMutation.mutate()} 
                        disabled={deleteMutation.isPending}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Delete Email"
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-gray-600">
                    <div className="flex justify-between items-start">
                      <div>
                        From: <span className="font-medium text-gray-900">{activeMessageResponse.message.from?.[0]?.name || activeMessageResponse.message.from?.[0]?.address}</span>
                        <span className="text-gray-500 ml-1">&lt;{activeMessageResponse.message.from?.[0]?.address}&gt;</span>
                      </div>
                      <div className="whitespace-nowrap ml-4">{format(new Date(activeMessageResponse.message.date), "PPP p")}</div>
                    </div>
                    {activeMessageResponse.message.to && activeMessageResponse.message.to.length > 0 && (
                      <div className="flex items-start">
                        <span className="mr-2 mt-0.5 text-gray-500">To:</span>
                        <div className="flex-1 flex flex-wrap items-center gap-1.5">
                          {activeMessageResponse.message.to.slice(0, isToExpanded ? activeMessageResponse.message.to.length : 3).map((to: any, i: number) => (
                            <span key={i} className="bg-slate-100 px-2 py-0.5 rounded-md text-xs border border-slate-200 truncate max-w-[220px]">
                              {to.name ? `${to.name} <${to.address}>` : to.address || to}
                            </span>
                          ))}
                          {activeMessageResponse.message.to.length > 3 && (
                            <button 
                              onClick={() => setIsToExpanded(!isToExpanded)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline flex items-center ml-1 font-medium bg-indigo-50 px-2 py-0.5 rounded-md"
                            >
                              {isToExpanded ? <><ChevronUp className="h-3 w-3 mr-1"/> Show Less</> : <><ChevronDown className="h-3 w-3 mr-1"/> {activeMessageResponse.message.to.length - 3} More</>}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {activeMessageResponse.message.attachments && activeMessageResponse.message.attachments.length > 0 && (
                    <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
                      {activeMessageResponse.message.attachments.map((att: any, idx: number) => (
                        <a 
                          key={idx} 
                          href={att.content ? `data:${att.contentType};base64,${att.content}` : '#'}
                          download={att.filename || 'attachment'}
                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors text-sm text-gray-700 shadow-sm"
                        >
                          <Paperclip className="h-4 w-4 text-gray-400" />
                          <span className="truncate max-w-[200px] font-medium">{att.filename || 'Unnamed Attachment'}</span>
                          <span className="text-xs text-gray-400">({Math.round((att.size || 0) / 1024)} KB)</span>
                          <Download className="h-3 w-3 ml-1 text-gray-400 opacity-50 hover:opacity-100" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 relative overflow-hidden bg-white">
                  {activeMessageResponse.message.html ? (
                    <iframe 
                      title="Email Content"
                      srcDoc={activeMessageResponse.message.html}
                      className="w-full h-full border-0"
                      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                    />
                  ) : (
                    <div className="p-6 h-full overflow-y-auto whitespace-pre-wrap font-sans text-gray-800">
                      {activeMessageResponse.message.body || <span className="italic text-gray-400">Message has no readable text content.</span>}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-red-500">
                Failed to load message.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
