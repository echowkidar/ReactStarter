import { useEffect, useRef } from 'react';

// Generate a simple browser fingerprint
function generateFingerprint(): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let canvasHash = '';

    if (ctx) {
        // Draw text for fingerprinting
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('Browser Fingerprint', 2, 15);
        canvasHash = canvas.toDataURL().slice(-50);
    }

    // Combine multiple browser characteristics
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
        navigator.platform,
        canvasHash,
    ];

    // Create a hash from the components
    const str = components.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    return 'fp_' + Math.abs(hash).toString(36);
}

// Get or create persistent visitor ID
function getVisitorId(): string {
    const STORAGE_KEY = 'visitor_fingerprint_id';
    let visitorId = localStorage.getItem(STORAGE_KEY);

    if (!visitorId) {
        // Generate fingerprint and combine with timestamp for uniqueness
        const fingerprint = generateFingerprint();
        const timestamp = Date.now().toString(36);
        visitorId = `${fingerprint}_${timestamp}`;
        localStorage.setItem(STORAGE_KEY, visitorId);
    }

    return visitorId;
}

interface VisitorTrackingOptions {
    pageVisited?: string;
    departmentId?: number;
}

export function useVisitorTracking(options: VisitorTrackingOptions = {}) {
    const hasTracked = useRef(false);

    useEffect(() => {
        // Only track once per page load
        if (hasTracked.current) return;
        hasTracked.current = true;

        const trackVisit = async () => {
            try {
                const visitorId = getVisitorId();

                await fetch('/api/visitors/track', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        visitorId,
                        screenResolution: `${screen.width}x${screen.height}`,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        language: navigator.language,
                        pageVisited: options.pageVisited || window.location.pathname,
                        departmentId: options.departmentId || null,
                    })
                });
            } catch (error) {
                // Silently fail - tracking is not critical
            }
        };

        // Small delay to not block initial render
        setTimeout(trackVisit, 1000);
    }, [options.pageVisited, options.departmentId]);
}

export default useVisitorTracking;
