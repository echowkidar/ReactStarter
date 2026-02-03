import { useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';

const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds

// Generate or retrieve persistent session ID
function getSessionId(): string {
    let sessionId = sessionStorage.getItem('heartbeat_session_id');
    if (!sessionId) {
        sessionId = uuid();
        sessionStorage.setItem('heartbeat_session_id', sessionId);
    }
    return sessionId;
}

interface HeartbeatOptions {
    type: 'department' | 'admin';
    name: string;
    email?: string;
}

export function useHeartbeat(options: HeartbeatOptions) {
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const sessionId = getSessionId();

    const sendHeartbeat = async () => {
        try {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    type: options.type,
                    name: options.name,
                    email: options.email
                })
            });
        } catch (error) {
            // Silently fail - heartbeat is not critical
        }
    };

    const sendLogout = async () => {
        try {
            // Use Blob with sendBeacon for reliable logout on page close with proper content-type
            const data = JSON.stringify({ sessionId });
            const blob = new Blob([data], { type: 'application/json' });
            navigator.sendBeacon('/api/heartbeat/logout', blob);
        } catch (error) {
            // Fallback to fetch
            fetch('/api/heartbeat/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            }).catch(() => { });
        }
    };

    useEffect(() => {
        // Send initial heartbeat
        sendHeartbeat();

        // Set up interval
        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        // Cleanup on unmount
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            sendLogout();
        };
    }, [options.type, options.name, options.email]);

    return { sessionId, sendLogout };
}

export default useHeartbeat;
