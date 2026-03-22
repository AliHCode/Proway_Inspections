import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { useAuth } from '../context/AuthContext';
import InstallAppPrompt from './InstallAppPrompt';

function ConnectivityBanner() {
    const [isOnline, setIsOnline] = useState(window.navigator.onLine);
    const [showOnlinePulse, setShowOnlinePulse] = useState(false);

    useEffect(() => {
        let onlinePulseTimer;

        const handleOffline = () => {
            setIsOnline(false);
            setShowOnlinePulse(false);
        };

        const handleOnline = () => {
            setIsOnline(true);
            setShowOnlinePulse(true);
            onlinePulseTimer = window.setTimeout(() => {
                setShowOnlinePulse(false);
            }, 4500);
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);

        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
            if (onlinePulseTimer) window.clearTimeout(onlinePulseTimer);
        };
    }, []);

    if (isOnline && !showOnlinePulse) return null;

    return (
        <div className={`connectivity-banner ${isOnline ? 'online' : 'offline'}`} role="status" aria-live="polite">
            {isOnline
                ? 'Back online. Syncing latest updates.'
                : 'You are offline. You can keep working and sync resumes automatically when connected.'}
        </div>
    );
}

export default function AppExperienceEnhancements() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    
    // Determine the user's root dashboard path
    const getDashboardPath = () => {
        if (!user) return '/';
        if (user.role === 'admin') return '/admin';
        if (user.role === 'contractor') return '/contractor';
        if (user.role === 'consultant') return '/consultant';
        return '/';
    };

    // Hardware Back Button Interceptor (Android / Native PWAs)
    useEffect(() => {
        let listenerPromise;
        try {
            listenerPromise = CapacitorApp.addListener('backButton', () => {
                // 1. Check for Active Overlays / Modals / Drawers
                // These are common classes we use for "always-on-top" elements
                const overlaySelectors = [
                    '.modal-overlay',                // Standard Auth/Detail/Chat Modals
                    '.markup-studio-overlay',        // Image Editor
                    '.filter-sidebar-overlay.open',  // Mobile Review Filters
                    '.studio-internal-drawer.open .drawer-header button' // Admin settings drawer close button
                ].join(', ');

                const activeOverlays = Array.from(document.querySelectorAll(overlaySelectors));
                
                if (activeOverlays.length > 0) {
                    // Found an open overlay! Dismiss the top-most one.
                    const topElement = activeOverlays[activeOverlays.length - 1];
                    topElement.click(); 
                    return; // Stop here, do NOT navigate away
                }

                // 2. If no overlays are open, process standard Back behavior
                const currentPath = location.pathname;
                const dashboardPath = getDashboardPath();
                
                // Is the user exactly on their root dashboard?
                const isRootDashboard = currentPath === dashboardPath || currentPath === '/';

                if (isRootDashboard) {
                    // User is on a main dashboard, force close the app
                    CapacitorApp.exitApp();
                } else {
                    // User is deeper in the app (Settings, Summary, RFI Sheet, etc.)
                    // Force them straight back to their dashboard, skipping intermediate history
                    navigate(dashboardPath, { replace: true });
                }
            });
        } catch (err) {
            // Ignore errors: This just means the app is running in a standard web browser, not a native Capacitor wrapper.
            console.log('Capacitor App plugin not available (running in standard browser).');
        }

        return () => {
            if (listenerPromise) {
                listenerPromise.then(h => h.remove()).catch(() => {});
            }
        };
    }, [location.pathname, navigate, user]);

    useEffect(() => {
        let isDown = false;
        let startX;
        let scrollLeft;
        let activeElement = null;

        const handleMouseDown = (e) => {
            const runner = e.target.closest('.rfi-table-wrapper');
            if (!runner) return;
            if (e.button !== 0) return; // Left click only

            isDown = true;
            activeElement = runner;
            activeElement.classList.add('grabbing');
            startX = e.pageX - activeElement.offsetLeft;
            scrollLeft = activeElement.scrollLeft;
        };

        const handleGlobalMouseUp = () => {
            if (activeElement) activeElement.classList.remove('grabbing');
            isDown = false;
            activeElement = null;
        };

        const handleMouseMove = (e) => {
            if (!isDown || !activeElement) return;
            e.preventDefault();
            const x = e.pageX - activeElement.offsetLeft;
            const walk = (x - startX) * 1.5; 
            activeElement.scrollLeft = scrollLeft - walk;
        };

        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mouseup', handleGlobalMouseUp);
        document.addEventListener('mouseleave', handleGlobalMouseUp);
        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
            document.removeEventListener('mouseleave', handleGlobalMouseUp);
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    useEffect(() => {
        const media = window.matchMedia('(display-mode: standalone)');

        const applyDisplayClass = () => {
            const standalone = media.matches || window.navigator.standalone === true;
            document.body.classList.toggle('app-standalone', standalone);
        };

        applyDisplayClass();

        if (media.addEventListener) {
            media.addEventListener('change', applyDisplayClass);
        } else {
            media.addListener(applyDisplayClass);
        }

        return () => {
            if (media.removeEventListener) {
                media.removeEventListener('change', applyDisplayClass);
            } else {
                media.removeListener(applyDisplayClass);
            }
        };
    }, []);

    return (
        <>
            <ConnectivityBanner />
            <InstallAppPrompt />
        </>
    );
}
