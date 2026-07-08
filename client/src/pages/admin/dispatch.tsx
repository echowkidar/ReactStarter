import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import AdminHeader from "@/components/layout/admin-header";
import {
  ArrowLeft, Send, Inbox, Users, Plus, Pencil, Trash2, Search,
  Building2, UserPlus, Eye, Loader2, CheckCircle2, Clock, X,
  Shield, Globe, Phone, Mail, FileText, BarChart3, RefreshCw
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────
interface DispatchGroup {
  id: number;
  name: string;
  description: string | null;
  isSystemGroup: boolean;
  createdAt: string;
  memberCount?: number;
}

interface GroupMember {
  id: number;
  groupId: number;
  departmentId: number;
  departmentName?: string;
  deptName?: string;
}

interface ExternalContact {
  id: number;
  name: string;
  organization: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  contactType: string;
  createdAt: string;
}

interface DispatchStats {
  totalDispatches: number;
  totalRecipients: number;
  totalRead: number;
  totalUnread: number;
  byDepartment: Array<{ name: string; sent: number; received: number }>;
}

// ─── Main Component ──────────────────────────────────────────────────
export default function AdminDispatch() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  // Group Management State
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DispatchGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DispatchGroup | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);

  // External Contact State
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<ExternalContact | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactOrg, setContactOrg] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [contactType, setContactType] = useState("government");

  // ─── Data Queries ───────────────────────────────────────────────────
  const { data: groups = [], isLoading: groupsLoading } = useQuery<DispatchGroup[]>({
    queryKey: ["/api/dispatch-groups"],
  });

  const { data: groupMembers = [] } = useQuery<GroupMember[]>({
    queryKey: [`/api/dispatch-groups/${selectedGroup?.id}/members`],
    enabled: !!selectedGroup?.id && showMembersDialog,
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<ExternalContact[]>({
    queryKey: ["/api/external-contacts"],
  });

  const { data: allDispatches = [] } = useQuery<any[]>({
    queryKey: ["/api/dispatch/all-dispatches"],
    queryFn: async () => {
      const res = await fetch("/api/dispatch/all-dispatches");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: departments = [] } = useQuery<any[]>({
    queryKey: ["/api/departments"],
    queryFn: async () => {
      const res = await fetch("/api/departments");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Member search
  useEffect(() => {
    if (memberSearch.length < 2) { setMemberSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dispatch/search-departments?q=${encodeURIComponent(memberSearch)}`);
        const data = await res.json();
        // Filter out already-added members
        const existingIds = groupMembers.map(m => m.departmentId);
        setMemberSearchResults(data.filter((d: any) => !existingIds.includes(d.id)));
      } catch { setMemberSearchResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, groupMembers]);

  // ─── Group Mutations ────────────────────────────────────────────────
  const createGroup = useMutation({
    mutationFn: async () => {
      if (!groupName.trim()) throw new Error("Group name is required");
      const body: any = { name: groupName.trim(), description: groupDesc.trim() || null };
      if (editingGroup) {
        const res = await apiRequest("PUT", `/api/dispatch-groups/${editingGroup.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/dispatch-groups", body);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: editingGroup ? "Group Updated" : "Group Created" });
      resetGroupDialog();
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch-groups"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/dispatch-groups/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch-groups"] });
    },
    onError: (err: any) => {
      toast({ title: "Cannot Delete", description: err.message, variant: "destructive" });
    },
  });

  const addMember = useMutation({
    mutationFn: async (departmentId: number) => {
      if (!selectedGroup) throw new Error("No group selected");
      const res = await apiRequest("POST", `/api/dispatch-groups/${selectedGroup.id}/members`, { departmentId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member Added" });
      queryClient.invalidateQueries({ queryKey: [`/api/dispatch-groups/${selectedGroup?.id}/members`] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch-groups"] });
      setMemberSearch("");
      setMemberSearchResults([]);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: number) => {
      const res = await apiRequest("DELETE", `/api/dispatch-groups/${selectedGroup?.id}/members/${memberId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member Removed" });
      queryClient.invalidateQueries({ queryKey: [`/api/dispatch-groups/${selectedGroup?.id}/members`] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch-groups"] });
    },
  });

  // ─── Contact Mutations ──────────────────────────────────────────────
  const saveContact = useMutation({
    mutationFn: async () => {
      if (!contactName.trim()) throw new Error("Contact name is required");
      const body = {
        name: contactName.trim(),
        organization: contactOrg.trim() || null,
        email: contactEmail.trim() || null,
        phone: contactPhone.trim() || null,
        address: contactAddress.trim() || null,
        contactType: contactType,
      };
      if (editingContact) {
        const res = await apiRequest("PUT", `/api/external-contacts/${editingContact.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/external-contacts", body);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: editingContact ? "Contact Updated" : "Contact Created" });
      resetContactDialog();
      queryClient.invalidateQueries({ queryKey: ["/api/external-contacts"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/external-contacts/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/external-contacts"] });
    },
  });

  // ─── Reset Functions ────────────────────────────────────────────────
  const resetGroupDialog = () => {
    setShowGroupDialog(false);
    setEditingGroup(null);
    setGroupName("");
    setGroupDesc("");
  };

  const resetContactDialog = () => {
    setShowContactDialog(false);
    setEditingContact(null);
    setContactName("");
    setContactOrg("");
    setContactEmail("");
    setContactPhone("");
    setContactAddress("");
    setContactType("government");
  };

  const openEditGroup = (group: DispatchGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupDesc(group.description || "");
    setShowGroupDialog(true);
  };

  const openEditContact = (contact: ExternalContact) => {
    setEditingContact(contact);
    setContactName(contact.name);
    setContactOrg(contact.organization || "");
    setContactEmail(contact.email || "");
    setContactPhone(contact.phone || "");
    setContactAddress(contact.address || "");
    setContactType(contact.contactType);
    setShowContactDialog(true);
  };

  const openMembers = (group: DispatchGroup) => {
    setSelectedGroup(group);
    setShowMembersDialog(true);
    setMemberSearch("");
  };

  // ─── Overview Stats ─────────────────────────────────────────────────
  const totalDispatches = allDispatches.length;
  const systemGroups = groups.filter(g => g.isSystemGroup);
  const customGroups = groups.filter(g => !g.isSystemGroup);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Send className="h-6 w-6 text-blue-600" />
                Dak Management
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage dispatch groups, external contacts, and monitor document flow
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Dispatch Groups
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center gap-2">
              <Globe className="h-4 w-4" /> External Contacts
            </TabsTrigger>
          </TabsList>

          {/* ─── OVERVIEW TAB ──────────────────────────────────────── */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-blue-700">{totalDispatches}</div>
                      <div className="text-xs text-blue-600">Total Dispatches</div>
                    </div>
                    <Send className="h-8 w-8 text-blue-300" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-green-700">{departments.length}</div>
                      <div className="text-xs text-green-600">Active Departments</div>
                    </div>
                    <Building2 className="h-8 w-8 text-green-300" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-purple-700">{groups.length}</div>
                      <div className="text-xs text-purple-600">Dispatch Groups</div>
                    </div>
                    <Users className="h-8 w-8 text-purple-300" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-amber-700">{contacts.length}</div>
                      <div className="text-xs text-amber-600">External Contacts</div>
                    </div>
                    <Globe className="h-8 w-8 text-amber-300" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Dispatches */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Recent Dispatches
                </CardTitle>
              </CardHeader>
              <CardContent>
                {allDispatches.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">No dispatches yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Outward #</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allDispatches.slice(0, 20).map((d: any) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {d.createdAt ? format(new Date(d.createdAt), "dd MMM yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{d.senderName}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{d.subject}</TableCell>
                          <TableCell className="text-xs">{d.documentType}</TableCell>
                          <TableCell className="text-xs font-mono">{d.outwardNumber || "—"}</TableCell>
                          <TableCell className="text-xs">{d.recipientCount || 0}</TableCell>
                          <TableCell>
                            {d.priority === "urgent" && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">URGENT</span>
                            )}
                            {d.priority === "immediate" && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">IMMEDIATE</span>
                            )}
                            {d.priority === "normal" && (
                              <span className="text-xs text-gray-400">Normal</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── GROUPS TAB ────────────────────────────────────────── */}
          <TabsContent value="groups">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                System groups are auto-generated. You can modify their members and create custom groups.
              </p>
              <Button onClick={() => { resetGroupDialog(); setShowGroupDialog(true); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4" /> New Group
              </Button>
            </div>

            {groupsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* System Groups */}
                {systemGroups.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" /> System Groups ({systemGroups.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {systemGroups.map(group => (
                        <Card key={group.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm truncate">{group.name}</span>
                                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">System</span>
                                </div>
                                {group.description && (
                                  <p className="text-xs text-gray-500 mt-1 truncate">{group.description}</p>
                                )}
                                <p className="text-xs text-gray-400 mt-1">
                                  {group.memberCount || 0} members
                                </p>
                              </div>
                              <div className="flex gap-1 ml-2">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                                  onClick={() => openMembers(group)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                                  onClick={() => openEditGroup(group)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Groups */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-500" /> Custom Groups ({customGroups.length})
                  </h3>
                  {customGroups.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-gray-400">
                        <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p>No custom groups yet. Create one to quickly dispatch to a set of departments.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {customGroups.map(group => (
                        <Card key={group.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <span className="font-semibold text-sm">{group.name}</span>
                                {group.description && (
                                  <p className="text-xs text-gray-500 mt-1 truncate">{group.description}</p>
                                )}
                                <p className="text-xs text-gray-400 mt-1">
                                  {group.memberCount || 0} members
                                </p>
                              </div>
                              <div className="flex gap-1 ml-2">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                                  onClick={() => openMembers(group)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                                  onClick={() => openEditGroup(group)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                  onClick={() => { if (confirm("Delete this group?")) deleteGroup.mutate(group.id); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ─── CONTACTS TAB ──────────────────────────────────────── */}
          <TabsContent value="contacts">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                External contacts for document receive entries (UGC, MHRD, other organizations).
              </p>
              <Button onClick={() => { resetContactDialog(); setShowContactDialog(true); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
                <UserPlus className="h-4 w-4" /> Add Contact
              </Button>
            </div>

            {contactsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : contacts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-400">
                  <Globe className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium">No External Contacts</p>
                  <p className="text-sm">Add contacts for organizations that frequently send documents.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map(contact => (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">{contact.name}</TableCell>
                          <TableCell className="text-sm text-gray-600">{contact.organization || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {contact.email ? (
                              <span className="flex items-center gap-1 text-blue-600">
                                <Mail className="h-3 w-3" /> {contact.email}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {contact.phone ? (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {contact.phone}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              contact.contactType === "government" ? "bg-blue-100 text-blue-700" :
                              contact.contactType === "university" ? "bg-purple-100 text-purple-700" :
                              contact.contactType === "individual" ? "bg-green-100 text-green-700" :
                              "bg-gray-100 text-gray-700"
                            }`}>
                              {contact.contactType}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                                onClick={() => openEditContact(contact)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500"
                                onClick={() => { if (confirm("Delete this contact?")) deleteContact.mutate(contact.id); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* GROUP CREATE/EDIT DIALOG                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showGroupDialog} onOpenChange={(v) => { if (!v) resetGroupDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {editingGroup ? "Edit Group" : "Create New Group"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Group Name *</Label>
              <Input value={groupName} onChange={e => setGroupName(e.target.value)}
                placeholder="e.g., Science Faculty Departments" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={groupDesc} onChange={e => setGroupDesc(e.target.value)}
                rows={2} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetGroupDialog}>Cancel</Button>
            <Button onClick={() => createGroup.mutate()} disabled={!groupName.trim() || createGroup.isPending}>
              {createGroup.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingGroup ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* GROUP MEMBERS DIALOG                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedGroup?.name} — Members
            </DialogTitle>
          </DialogHeader>

          {/* Add member search */}
          <div>
            <Label className="text-xs">Add Department</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search department..."
                value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
            </div>
            {memberSearchResults.length > 0 && (
              <div className="border rounded-lg mt-1 max-h-32 overflow-y-auto bg-white shadow-sm">
                {memberSearchResults.map((d: any) => (
                  <div key={d.id}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-sm"
                    onClick={() => addMember.mutate(d.id)}>
                    <span>{d.name}</span>
                    <Plus className="h-4 w-4 text-blue-500" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current Members */}
          <div className="mt-3">
            <Label className="text-xs font-medium">Current Members ({groupMembers.length})</Label>
            {groupMembers.length === 0 ? (
              <p className="text-sm text-gray-400 mt-2 text-center py-4">No members in this group</p>
            ) : (
              <div className="space-y-1 mt-2 max-h-60 overflow-y-auto">
                {groupMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">{member.departmentName || member.deptName || `Dept #${member.departmentId}`}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                      onClick={() => removeMember.mutate(member.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CONTACT CREATE/EDIT DIALOG                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showContactDialog} onOpenChange={(v) => { if (!v) resetContactDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {editingContact ? "Edit Contact" : "Add External Contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Contact / Sender Name *</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)}
                placeholder="e.g., University Grants Commission" />
            </div>
            <div>
              <Label className="text-xs">Organization</Label>
              <Input value={contactOrg} onChange={e => setContactOrg(e.target.value)}
                placeholder="e.g., Ministry of Education" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                  placeholder="email@org.in" type="email" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                  placeholder="+91..." />
              </div>
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Textarea value={contactAddress} onChange={e => setContactAddress(e.target.value)}
                rows={2} placeholder="Full address" />
            </div>
            <div>
              <Label className="text-xs">Contact Type</Label>
              <Select value={contactType} onValueChange={setContactType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="government">Government Body</SelectItem>
                  <SelectItem value="university">University / College</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="organization">Private Organization</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetContactDialog}>Cancel</Button>
            <Button onClick={() => saveContact.mutate()} disabled={!contactName.trim() || saveContact.isPending}>
              {saveContact.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingContact ? "Update" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
