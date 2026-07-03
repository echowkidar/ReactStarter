import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Users, Loader2, Plus, Trash2, Edit2, Check, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
export function GroupManager({ userInfo }: { userInfo: { type: string, id: string } }) {
  const { toast } = useToast();
  const isAdmin = userInfo.type === 'admin';
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // API base path depends on user type
  const groupApiBase = isAdmin ? `/api/admin/groups` : `/api/departments/${userInfo.id}/groups`;

  const { data: groups, isLoading: loadingGroups } = useQuery({
    queryKey: [groupApiBase],
    queryFn: async () => {
      const res = await apiRequest("GET", groupApiBase);
      return res.json();
    },
    enabled: !!userInfo.id,
  });

  const { data: deptEmployees, isLoading: loadingEmployees } = useQuery({
    queryKey: [`/api/departments/${userInfo.id}/employees`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/departments/${userInfo.id}/employees`);
      return res.json();
    },
    enabled: !isAdmin && !!userInfo.id,
  });

  // Admin global search effect
  useEffect(() => {
    if (!isAdmin || !searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      try {
        const [empRes, deptRes] = await Promise.all([
          apiRequest("GET", `/api/employees/global-search?query=${encodeURIComponent(searchTerm)}`),
          apiRequest("GET", `/api/departments?registeredOnly=true`)
        ]);
        const emps = await empRes.json();
        const depts = await deptRes.json();
        
        const matchingDepts = depts.filter((d: any) => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const results = [
          ...matchingDepts.map((d: any) => ({ ...d, entityType: 'department' })),
          ...emps.map((e: any) => ({ ...e, entityType: 'employee' }))
        ];
        setSearchResults(results.slice(0, 20)); // limit to 20
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, isAdmin]);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const payload = isAdmin ? { name, members: [] } : { name, memberIds: [] };
      const res = await apiRequest("POST", groupApiBase, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group Created" });
      setNewGroupName("");
      queryClient.invalidateQueries({ queryKey: [groupApiBase] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await apiRequest("DELETE", `${groupApiBase}/${groupId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group Deleted" });
      setEditingGroup(null);
      queryClient.invalidateQueries({ queryKey: [groupApiBase] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete group", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = isAdmin 
        ? { name: data.name, members: data.members } 
        : { name: data.name, memberIds: data.memberIds };
      const res = await apiRequest("PUT", `${groupApiBase}/${data.groupId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group Updated" });
      setEditingGroup(null);
      queryClient.invalidateQueries({ queryKey: [groupApiBase] });
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    createMutation.mutate(newGroupName.trim());
  };

  const handleSaveEdit = () => {
    if (!editingGroup) return;
    updateMutation.mutate({
      groupId: editingGroup.id,
      name: editingGroup.name,
      memberIds: editingGroup.memberIds,
      members: editingGroup.members
    });
  };

  // Helper to remove member from admin group
  const removeAdminMember = (indexToRemove: number) => {
    const updated = editingGroup.members.filter((_: any, i: number) => i !== indexToRemove);
    setEditingGroup({ ...editingGroup, members: updated });
  };

  // Helper to add member to admin group
  const addAdminMember = (entity: any) => {
    const isDuplicate = editingGroup.members.some((m: any) => m.id === entity.id && m.type === entity.entityType);
    if (isDuplicate) return;

    const newMember = {
      type: entity.entityType,
      id: entity.id,
      name: entity.name,
      designation: entity.designation || 'Department'
    };
    setEditingGroup({ ...editingGroup, members: [...editingGroup.members, newMember] });
    setSearchTerm("");
  };

  return (
    <Card className="border-0 shadow-xl shadow-purple-100/50 bg-white/80 backdrop-blur-xl mt-8">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-100 rounded-xl">
            <Users className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Manage Email Groups</CardTitle>
            <CardDescription>Create custom groups to easily email multiple recipients</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {editingGroup ? (
          <div className="space-y-4 p-4 bg-purple-50/50 border border-purple-100 rounded-lg">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg text-purple-900">Edit Group</h3>
              <Button variant="ghost" size="sm" onClick={() => setEditingGroup(null)}>Cancel</Button>
            </div>
            
            <div className="space-y-2">
              <Label>Group Name</Label>
              <Input 
                value={editingGroup.name} 
                onChange={(e) => setEditingGroup({...editingGroup, name: e.target.value})} 
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Select Members</Label>
              
              {isAdmin ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input 
                      placeholder="Search employee or department..." 
                      className="pl-9 bg-white"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchResults.length > 0 && searchTerm.length >= 2 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border shadow-lg rounded-md z-10 max-h-60 overflow-y-auto">
                        {searchResults.map((res: any, idx) => (
                          <div 
                            key={`search-${idx}`} 
                            className="p-2 hover:bg-slate-50 cursor-pointer border-b last:border-0 flex flex-col"
                            onClick={() => addAdminMember(res)}
                          >
                            <span className="font-medium text-sm text-gray-900">{res.name}</span>
                            <span className="text-xs text-gray-500">
                              {res.entityType === 'department' ? 'Department' : `${res.designation} (${res.epid})`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {editingGroup.members?.map((member: any, i: number) => (
                      <div key={`m-${i}`} className="flex items-center gap-1 bg-white border px-2 py-1 rounded-md text-sm">
                        <span>{member.name || `ID: ${member.id}`}</span>
                        <span className="text-xs text-gray-400">({member.type})</span>
                        <button onClick={() => removeAdminMember(i)} className="text-red-500 hover:text-red-700 ml-1">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {(!editingGroup.members || editingGroup.members.length === 0) && (
                      <div className="text-sm text-gray-400 py-2">No members added yet.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto bg-white border rounded-md p-2 space-y-2">
                  {loadingEmployees ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                   deptEmployees?.map((emp: any) => (
                    <div key={emp.id} className="flex items-center space-x-2 p-1 hover:bg-slate-50 rounded">
                      <Checkbox 
                        id={`emp-${emp.id}`} 
                        checked={editingGroup.memberIds?.includes(emp.id)}
                        onCheckedChange={(checked) => {
                          const newMembers = checked 
                            ? [...(editingGroup.memberIds || []), emp.id]
                            : (editingGroup.memberIds || []).filter((id: number) => id !== emp.id);
                          setEditingGroup({...editingGroup, memberIds: newMembers});
                        }}
                      />
                      <Label htmlFor={`emp-${emp.id}`} className="cursor-pointer flex-1">
                        {emp.name} <span className="text-gray-400 text-xs ml-2">{emp.designation}</span>
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleSaveEdit} className="w-full bg-purple-600 hover:bg-purple-700" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        ) : (
          <>
            <form onSubmit={handleCreate} className="flex gap-2">
              <Input 
                placeholder="New Group Name (e.g. All Staff)" 
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="bg-white/50"
              />
              <Button type="submit" disabled={createMutation.isPending || !newGroupName.trim()} className="shrink-0 bg-purple-600 hover:bg-purple-700">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Add
              </Button>
            </form>

            <div className="space-y-2">
              {loadingGroups ? (
                <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              ) : groups?.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-4">No groups created yet.</p>
              ) : (
                <div className="grid gap-2">
                  {groups?.map((group: any) => (
                    <div key={group.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                      <div>
                        <div className="font-semibold text-gray-900">{group.name}</div>
                        <div className="text-xs text-gray-500">
                          {isAdmin ? group.members?.length : group.memberIds?.length || 0} members
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => setEditingGroup(group)} className="text-purple-600 hover:text-purple-700 hover:bg-purple-50">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the group "{group.name}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => deleteMutation.mutate(group.id)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                Delete Group
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
