export function buildNotificationOpenPath(rfiId = null) {
    const params = new URLSearchParams();
    if (rfiId) {
        params.set('rfi', rfiId);
        params.set('source', 'notification');
    }
    const query = params.toString();
    return query ? `/notification-open?${query}` : '/notification-open';
}

export function getNotificationDestinationForRole(role, search = '') {
    const normalizedSearch = search || '';

    if (role === 'contractor') return `/contractor/rfi-sheet${normalizedSearch}`;
    if (role === 'consultant') return `/consultant/review${normalizedSearch}`;
    if (role === 'admin') return `/admin/registered-devices${normalizedSearch}`;
    return '/';
}
