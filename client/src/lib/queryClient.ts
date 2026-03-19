import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // Try to parse JSON and extract message for cleaner error display
    try {
      const json = JSON.parse(text);
      if (json.message) {
        throw new Error(json.message);
      }
    } catch (e) {
      // Not JSON or no message field — use raw text
      if (e instanceof Error && e.message !== text) throw e;
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  useJSON: boolean = true
): Promise<Response> {
  const headers: Record<string, string> = {};

  // Auto-inject admin session token if present
  const adminSessionToken = localStorage.getItem("adminSessionToken");
  if (adminSessionToken) {
    headers["x-session-token"] = adminSessionToken;
  }

  let body: BodyInit | null | undefined = undefined;

  if (data) {
    if (data instanceof FormData) {
      // Don't set headers for FormData, browser will set it automatically
      body = data;
    } else if (useJSON) {
      // JSON data
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(data);
    } else {
      // For other types of data
      body = data as BodyInit;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const headers: Record<string, string> = {};
      const adminSessionToken = localStorage.getItem("adminSessionToken");
      if (adminSessionToken) {
        headers["x-session-token"] = adminSessionToken;
      }

      const res = await fetch(queryKey[0] as string, {
        headers,
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
