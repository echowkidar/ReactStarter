// In-app notifications (bell) for department users and staff logins.
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type Item = { id: number; event: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

export default function NotificationBell() {
  const [, setLocation] = useLocation();
  const key = ["/api/notifications"];
  const { data } = useQuery<{ unread: number; items: Item[] }>({ queryKey: key, refetchInterval: 60000 });
  const markRead = useMutation({
    mutationFn: async (ids?: number[]) => (await apiRequest("POST", "/api/notifications/read", { ids })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const unread = data?.unread || 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="relative p-1.5 rounded-md hover:bg-gray-100" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Bell className="h-5 w-5 text-gray-600" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markRead.mutate(undefined)}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(data?.items || []).length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">No notifications</p>
          ) : (
            data!.items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-gray-50 ${n.read ? "" : "bg-blue-50/60"}`}
                onClick={() => {
                  if (!n.read) markRead.mutate([n.id]);
                  if (n.link) setLocation(n.link);
                }}
              >
                <div className="text-sm font-medium flex items-start gap-1.5">
                  {!n.read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-600 flex-shrink-0" />}
                  <span>{n.title}</span>
                </div>
                <div className="text-xs text-gray-600 line-clamp-2">{n.body}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
