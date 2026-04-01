import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { useAuth } from '../context/AuthContext';
import InstallAppPrompt from './InstallAppPrompt';
import NotificationPrompt from './NotificationPrompt';

const APP_BACK_OVERLAY_SELECTORS = [
    '.modal-overlay',
    '.markup-studio-overlay',
    '.filter-sidebar-overlay.open',
    '.action-sheet-overlay.open',
    '.dm-modal-overlay',
    '.notif-overlay-v2',
    '.rfi-archive-preview-backdrop',
    '.rfi-archive-bulk-overlay',
    '.studio-internal-drawer.open .drawer-header button',
].join(', ');

function isElementVisible(element) {
    if (!element || typeof window === 'undefined') return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function getNumericZIndex(element) {
    if (!element || typeof window === 'undefined') return 0;
    const zIndex = window.getComputedStyle(element).zIndex;
    const parsed = Number.parseInt(zIndex, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function isStandaloneDisplayMode() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isMobileViewport() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 1024px)').matches;
}

function dismissTopOverlayOrMenu() {
    const mobileMenuButton = document.querySelector('.header-menu-btn.mobile-only');
    if (document.querySelector('.header-dropdown.premium-menu') && mobileMenuButton) {
        mobileMenuButton.click();
        return true;
    }

    const projectButton = document.querySelector('.header-project-selector-pill');
    if (document.querySelector('.header-project-dropdown') && projectButton) {
        projectButton.click();
        return true;
    }

    const notificationButton = document.querySelector('.notification-trigger');
    if (document.querySelector('.notification-dropdown') && notificationButton) {
        notificationButton.click();
        return true;
    }

    const activeOverlays = Array.from(document.querySelectorAll(APP_BACK_OVERLAY_SELECTORS))
        .filter(isElementVisible)
        .sort((a, b) => getNumericZIndex(b) - getNumericZIndex(a));

    if (activeOverlays.length === 0) return false;

    activeOverlays[0].click();
    return true;
}

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
    const lastPathRef = useRef(location.pathname);
    
    // Determine the user's root dashboard path
    const getDashboardPath = () => {
        if (!user) return '/';
        if (user.role === 'admin') return '/admin';
        if (user.role === 'contractor') return '/contractor';
        if (user.role === 'consultant') return '/consultant';
        return '/';
    };

    useEffect(() => {
        lastPathRef.current = location.pathname;
    }, [location.pathname]);

    const handleMobileAppBack = (source = 'browser') => {
        const dashboardPath = getDashboardPath();
        const previousPath = lastPathRef.current;

        if (dismissTopOverlayOrMenu()) {
            return true;
        }

        const wasOnDashboard = previousPath === dashboardPath || previousPath === '/';

        if (!wasOnDashboard) {
            navigate(dashboardPath, { replace: true });
            return true;
        }

        if (source === 'capacitor') {
            CapacitorApp.exitApp();
            return true;
        }

        // iOS/standalone PWAs cannot be force-closed reliably, but we can
        // keep the user at the dashboard instead of replaying browser history.
        try {
            window.close();
        } catch {
            // Ignore unsupported close attempts.
        }
        navigate(dashboardPath, { replace: true });
        return true;
    };

    // Hardware Back Button Interceptor (Android / Native PWAs)
    useEffect(() => {
        let listenerPromise;
        try {
            listenerPromise = CapacitorApp.addListener('backButton', () => {
                handleMobileAppBack('capacitor');
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
    }, [navigate, user]);

    useEffect(() => {
        if (!user || !isMobileViewport() || !isStandaloneDisplayMode()) return undefined;

        const handlePopState = () => {
            handleMobileAppBack('browser');
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [navigate, user, location.pathname]);

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
            <NotificationPrompt />
        </>
    );
}
