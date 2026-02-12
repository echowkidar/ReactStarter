
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { logout } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

// 10 minutes in milliseconds
const INACTIVITY_TIMEOUT = 10 * 60 * 1000;

export function useAutoLogout() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const resetTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        timerRef.current = setTimeout(() => {
            // Perform logout
            logout(false); // Don't redirect immediately within logout function to allow toast

            toast({
                title: "Session Expired",
                description: "You have been logged out due to inactivity.",
                variant: "destructive",
            });

            // Redirect to login
            setLocation("/");
        }, INACTIVITY_TIMEOUT);
    };

    useEffect(() => {
        // Events to track user activity
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

        // Initial timer set
        resetTimer();

        // Event listener to reset timer on activity
        const handleActivity = () => {
            resetTimer();
        };

        // Add event listeners
        events.forEach(event => {
            window.addEventListener(event, handleActivity);
        });

        // Cleanup
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            events.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
        };
    }, [setLocation, toast]); // Dependency array ensures effect runs correctly
}
