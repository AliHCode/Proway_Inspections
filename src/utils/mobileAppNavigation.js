function normalizePath(path = '/') {
    return String(path).split('?')[0].split('#')[0] || '/';
}

export function isMobileStandaloneAppNavigationContext() {
    if (typeof window === 'undefined') return false;

    const isMobile = window.matchMedia('(max-width: 1024px)').matches;
    const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

    return isMobile && isStandalone;
}

export function shouldReplaceMobileAppNavigation(currentPath, targetPath, dashboardPath) {
    if (!isMobileStandaloneAppNavigationContext()) return false;

    const currentBase = normalizePath(currentPath);
    const targetBase = normalizePath(targetPath);
    const dashboardBase = normalizePath(dashboardPath);

    if (!targetBase || currentBase === targetBase) {
        return true;
    }

    // Preserve the dashboard entry so Back from any inner page returns there.
    if (currentBase === dashboardBase && targetBase !== dashboardBase) {
        return false;
    }

    // Replace inner-page to inner-page transitions so history stays:
    // dashboard -> current page
    return true;
}

export function getMobileAppNavigationOptions(currentPath, targetPath, dashboardPath) {
    return shouldReplaceMobileAppNavigation(currentPath, targetPath, dashboardPath)
        ? { replace: true }
        : undefined;
}
