import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';
import { useProject } from './ProjectContext';
import { useAuth } from './AuthContext';
import { RFI_STATUS } from '../utils/constants';
import {
    enqueuePendingRFI,
    listPendingRFIs,
    removePendingRFI,
    countPendingRFIs,
    enqueuePendingAction,
    listPendingActions,
    removePendingAction,
    serializeImagesForQueue,
    deserializeQueuedImages,
} from '../utils/offlineQueue';
import { pushSupportStatus, syncPushSubscriptionForUser } from '../utils/pushNotifications';
import { buildNotificationOpenPath } from '../utils/notificationLinks';

const RFIContext = createContext(null);
const NOTIFICATION_PROMPT_SEEN_KEY = 'proway_notification_prompt_seen_v1';
const RFI_CACHE_PREFIX = 'saa_rfis_cache_v1';

function rfiCacheKey(userId, projectId) {
    return `${RFI_CACHE_PREFIX}:${userId || 'anon'}:${projectId || 'none'}`;
}

function normalizeRfiRecord(rfi = {}) {
    const fallbackDate = new Date().toISOString().slice(0, 10);
    const filedDate = typeof rfi.filedDate === 'string' && rfi.filedDate
        ? rfi.filedDate
        : (typeof rfi.originalFiledDate === 'string' && rfi.originalFiledDate ? rfi.originalFiledDate : fallbackDate);

    return {
        ...rfi,
        id: rfi.id || `cached-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        serialNo: Number.isFinite(Number(rfi.serialNo)) ? Number(rfi.serialNo) : 0,
        description: rfi.description || '',
        location: rfi.location || '',
        inspectionType: rfi.inspectionType || '',
        filedDate,
        originalFiledDate: rfi.originalFiledDate || filedDate,
        status: rfi.status || RFI_STATUS.PENDING,
        images: Array.isArray(rfi.images) ? rfi.images : [],
        parentId: rfi.parent_id || rfi.parentId || rfi.customFields?.parentId || null,
        customFields: rfi.customFields && typeof rfi.customFields === 'object' ? rfi.customFields : {},
    };
}

function normalizeRfisArray(items = []) {
    if (!Array.isArray(items)) return [];
    return items
        .filter((item) => item && typeof item === 'object')
        .map((item) => normalizeRfiRecord(item));
}

function normalizeMentionKey(value = '') {
    return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function canUserEditRfiRecord(rfi, currentUser) {
    if (!rfi || !currentUser?.id) return false;
    if (currentUser.role === 'admin') return true;

    if (rfi.assignedTo) {
        return rfi.assignedTo === currentUser.id;
    }

    if (currentUser.role === 'consultant') return true;
    return rfi.filedBy === currentUser.id;
}

function canUserDiscussRfiRecord(rfi, userId) {
    if (!rfi || !userId) return false;
    if (!rfi.assignedTo) return true;
    return rfi.filedBy === userId || rfi.assignedTo === userId;
}

export function RFIProvider({ children }) {
    const { activeProject } = useProject();
    const { user } = useAuth();
    const [rfis, setRfis] = useState([]);
    const [loadingRfis, setLoadingRfis] = useState(true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [lastSyncTime, setLastSyncTime] = useState(null);

    // Monitoring network status
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);    const isSyncingOfflineRef = useRef(false);
    const notificationPromptShownRef = useRef(false);

    // Consultants list for Direct Assign
    const [consultants, setConsultants] = useState([]);
    const [contractors, setContractors] = useState([]);

    // Notifications State
    const [notifications, setNotifications] = useState([]);
    const unreadCount = notifications.filter(n => !n.is_read).length;

    const restoreRfiCache = useCallback((projectId) => {
        if (!projectId || !user?.id) return false;
        try {
            const raw = localStorage.getItem(rfiCacheKey(user.id, projectId));
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            const normalized = normalizeRfisArray(parsed.rfis);
            if (normalized.length === 0) return false;
            setRfis(normalized);
            return true;
        } catch {
            return false;
        }
    }, [user?.id]);

    const persistRfiCache = useCallback((projectId, nextRfis) => {
        if (!projectId || !user?.id) return;
        try {
            localStorage.setItem(rfiCacheKey(user.id, projectId), JSON.stringify({
                rfis: nextRfis || [],
                cachedAt: new Date().toISOString(),
            }));
        } catch {
            // Ignore storage failures.
        }
    }, [user?.id]);

    const refreshPendingSyncCount = useCallback(async () => {
        try {
            if (!activeProject?.id) {
                setPendingSyncCount(0);
                return;
            }
            const count = await countPendingRFIs(activeProject.id);
            setPendingSyncCount(count);
        } catch (error) {
            console.error('Error reading offline queue count:', error);
        }
    }, [activeProject]);

    const getNextRfiCode = useCallback(async (parentId) => {
        const prefix = activeProject?.code || 'RR007';
        if (!activeProject?.id) return `${prefix}-1`;

        if (!parentId) {
            const { data, error } = await supabase
                .from('rfis')
                .select('custom_fields')
                .eq('project_id', activeProject.id);
            if (error) throw error;

            let maxNum = 0;
            (data || []).forEach(r => {
                const code = r.custom_fields?.rfi_no;
                if (code && code.startsWith(prefix)) {
                    // Extract number from Prefix-Number or Prefix-Number-RX
                    const parts = code.split('-');
                    if (parts.length >= 2) {
                        const num = parseInt(parts[1], 10);
                        if (!isNaN(num)) maxNum = Math.max(maxNum, num);
                    }
                }
            });
            return `${prefix}-${(maxNum + 1).toString().padStart(3, '0')}`;
        } else {
            const { data: parent, error: pError } = await supabase
                .from('rfis')
                .select('custom_fields')
                .eq('id', parentId)
                .single();
            if (pError) throw pError;

            const parentCode = parent.custom_fields?.rfi_no || `${prefix}-001`;
            if (parentCode.includes('-R')) {
                const parts = parentCode.split('-R');
                const nextRev = parseInt(parts[1], 10) + 1;
                return `${parts[0]}-R${nextRev}`;
            } else {
                return `${parentCode}-R1`;
            }
        }
    }, [activeProject]);

    const getNextSerialNoForDate = useCallback(async (filedDate) => {
        const { data, error } = await supabase
            .from('rfis')
            .select('serial_no')
            .eq('project_id', activeProject?.id)
            .eq('filed_date', filedDate);

        if (error) throw error;

        const maxSerial = (data || []).reduce((max, row) => Math.max(max, row.serial_no || 0), 0);
        return maxSerial + 1;
    }, [activeProject]);

    const normalizeImagesForSubmission = useCallback(async (images = []) => {
        const files = images.filter((img) => img instanceof File);
        const urls = images.filter((img) => typeof img === 'string');

        const uploadedUrls = files.length > 0 ? await uploadImages(files) : [];
        return [...urls, ...uploadedUrls];
    }, [uploadImages]);

    const fetchAllRFIs = useCallback(async () => {
        if (!activeProject) {
            setRfis([]);
            setLoadingRfis(false);
            return;
        }

        const restored = restoreRfiCache(activeProject.id);

        if (restored) {
            setLoadingRfis(false);
            if (!navigator.onLine) return;
        }

        async function performFetch(retryCount = 0) {
            try {
                const { data, error } = await supabase
                    .from('rfis')
                    .select('*')
                    .eq('project_id', activeProject.id)
                    .order('serial_no', { ascending: false });

                if (error) throw error;

                // Build a user map for faster lookup
                const userIds = new Set();
                data.forEach(r => {
                    if (r.filed_by) userIds.add(r.filed_by);
                    if (r.reviewed_by) userIds.add(r.reviewed_by);
                    if (r.assigned_to) userIds.add(r.assigned_to);
                });

                let userMap = {};
                if (userIds.size > 0) {
                    const { data: profilesData } = await supabase
                        .from('profiles')
                        .select('id, name, company')
                        .in('id', Array.from(userIds));

                    if (profilesData) {
                        profilesData.forEach(p => {
                            userMap[p.id] = p;
                        });
                    }
                }

                const formatted = data.map((r) => ({
                    id: r.id,
                    serialNo: r.serial_no,
                    projectId: r.project_id,
                    description: r.description,
                    location: r.location,
                    inspectionType: r.inspection_type,
                    filedBy: r.filed_by,
                    filerName: userMap[r.filed_by]?.name || '—',
                    filerCompany: userMap[r.filed_by]?.company || '',
                    filedDate: r.filed_date,
                    status: r.status,
                    reviewedBy: r.reviewed_by,
                    reviewerName: userMap[r.reviewed_by]?.name || '',
                    reviewedAt: r.reviewed_at,
                    remarks: r.remarks,
                    carryoverCount: r.carryover_count,
                    carryoverTo: r.carryover_to,
                    images: r.images || [],
                    assignedTo: r.assigned_to,
                    assigneeName: userMap[r.assigned_to]?.name || '',
                    parentId: r.parent_id,
                    createdAt: r.created_at,
                    customFields: r.custom_fields || {},
                }));
                const normalized = normalizeRfisArray(formatted || []);
                setRfis(normalized);
                persistRfiCache(activeProject.id, normalized);
                setLastSyncTime(new Date());
                setIsOffline(false);
            } catch (error) {
                console.error('Error fetching RFIs:', error);

                // Retry logic for connection errors
                const isConnectionError = error.message?.includes('fetch') || error.code === 'PGRST301' || !navigator.onLine;
                if (isConnectionError && retryCount < 2) {
                    await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
                    return performFetch(retryCount + 1);
                }

                if (isConnectionError) setIsOffline(true);
                if (!restored) setRfis([]);
            } finally {
                setLoadingRfis(false);
            }
        }

        performFetch();
    }, [activeProject, persistRfiCache, restoreRfiCache]);

    const fetchNotifications = useCallback(async () => {
        if (!user) {
            setNotifications([]);
            return;
        }

        async function performFetch(retryCount = 0) {
            try {
                const { data, error } = await supabase
                    .from('notifications')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;
                setNotifications(data || []);
                setIsOffline(false);
            } catch (error) {
                console.error('Error fetching notifications:', error);
                if (!navigator.onLine || retryCount < 1) {
                    if (retryCount < 1) {
                        await new Promise(r => setTimeout(r, 1500));
                        return performFetch(retryCount + 1);
                    }
                }
            }
        }
        performFetch();
    }, [user]);

    // Fetch consultants/contractors scoped to the active project's members only
    const fetchConsultants = useCallback(async (projectId) => {
        if (!projectId) { setConsultants([]); return; }
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('profiles:user_id(id, name, company, role)')
                .eq('project_id', projectId)
                .eq('role', 'consultant');
            if (error) throw error;
            setConsultants((data || []).map(m => m.profiles).filter(Boolean));
        } catch (error) {
            console.error('Error fetching consultants:', error);
        }
    }, []);

    const fetchContractors = useCallback(async (projectId) => {
        if (!projectId) { setContractors([]); return; }
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('profiles:user_id(id, name, company, role)')
                .eq('project_id', projectId)
                .eq('role', 'contractor');
            if (error) throw error;
            setContractors((data || []).map(m => m.profiles).filter(Boolean));
        } catch (error) {
            console.error('Error fetching contractors:', error);
        }
    }, []);

    const notifyConsultantsAboutNewRFI = useCallback(async (rfiId, rfiNo, location, filedBy, assignedTo = null) => {
        if (!activeProject) return;
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('user_id')
                .eq('project_id', activeProject.id)
                .eq('role', 'consultant');

            if (error) throw error;

            const consultantIds = Array.from(new Set((data || []).map((row) => row.user_id).filter(Boolean)));
            for (const consultantId of consultantIds) {
                if (consultantId === filedBy) continue;
                if (assignedTo && consultantId === assignedTo) {
                    await createNotification(
                        consultantId,
                        `RFI Assigned: #${rfiNo}`,
                        `Location: ${location}`,
                        rfiId
                    );
                } else {
                    await createNotification(
                        consultantId,
                        `RFI Filed: #${rfiNo}`,
                        `Location: ${location}`,
                        rfiId
                    );
                }
            }
        } catch (error) {
            console.error('Error notifying consultants about new RFI:', error);
        }
    }, [activeProject]);

    // ── Native Push Notification helper ──────────────────────────────────────
    // Shows a browser/OS notification via the service worker when the user
    // has granted permission. Works for background tabs and mobile home screen.
    function showNativeNotification(title, body, rfiId = null) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try {
            navigator.serviceWorker?.ready.then((reg) => {
                reg.showNotification(title, {
                    body,
                    icon: '/favicon.png',
                    badge: '/favicon.png',
                    tag: 'proway-notification',
                    renotify: true,
                    data: { rfiId, url: '/' },
                });
            });
        } catch {
            // Fallback for browsers without SW support
            try { new Notification(title, { body, icon: '/favicon.png' }); } catch { /* ignore */ }
        }
    }

    // ── Request notification permission once when the user is logged in ───────
    useEffect(() => {
        if (!user) return;
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') return; // already granted
        if (Notification.permission === 'denied') return;  // user already refused
        if (notificationPromptShownRef.current) return;

        try {
            if (localStorage.getItem(NOTIFICATION_PROMPT_SEEN_KEY) === 'true') return;
            localStorage.setItem(NOTIFICATION_PROMPT_SEEN_KEY, 'true');
        } catch {
            // Ignore localStorage failures; still guard with ref for this session.
        }
        notificationPromptShownRef.current = true;

        // Show a friendly in-app toast to prompt the user before the browser dialog
        toast(
            (t) => (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Enable notifications for real-time updates?</span>
                    <button
                        style={{ padding: '2px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid #ccc' }}
                        onClick={() => {
                            toast.dismiss(t.id);
                            Notification.requestPermission().then((permission) => {
                                if (permission === 'granted') {
                                    syncPushSubscriptionForUser(user.id).catch((error) => {
                                        console.error('Error registering push subscription:', error);
                                    });
                                    toast.success('Notifications enabled! 🔔');
                                }
                            });
                        }}
                    >
                        Enable
                    </button>
                    <button
                        style={{ padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid #ccc' }}
                        onClick={() => toast.dismiss(t.id)}
                    >
                        Not now
                    </button>
                </span>
            ),
            { duration: 10000, icon: '🔔' }
        );
    }, [user]);

    useEffect(() => {
        if (!user) return;

        syncPushSubscriptionForUser(user.id).catch((error) => {
            console.error('Error syncing push subscription:', error);
        });
    }, [user]);

    useEffect(() => {
        fetchAllRFIs();
        fetchConsultants(activeProject?.id);
        fetchContractors(activeProject?.id);
        refreshPendingSyncCount();
        if (user) {
            fetchNotifications();
        }

        if (navigator.onLine) {
            syncPendingRFIs();
            syncPendingConsultantActions();
        }

        // Subscribe to real-time changes for RFIs — scoped to active project
        const rfiSubscription = supabase
            .channel(`rfis:proj:${activeProject?.id || 'none'}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rfis' }, payload => {
                // Ignore events that belong to a different project
                if (activeProject?.id && payload.new?.project_id && payload.new.project_id !== activeProject.id) return;
                console.log('Real-time RFI update:', payload);
                if (payload.eventType === 'INSERT') {
                    // console.log('New RFI submitted');
                } else if (payload.eventType === 'UPDATE') {
                    // console.log('RFI updated');
                }
                fetchAllRFIs(); // Simplest way to ensure data consistency
            })
            .subscribe();

        // Subscribe to real-time changes for Notifications (only for this user)
        let notifSubscription = null;
        if (user) {
            notifSubscription = supabase
                .channel(`public:notifications:user_id=eq.${user.id}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                }, payload => {
                    console.log('New notification:', payload);
                    toast(payload.new.title, { icon: '🔔' });
                    fetchNotifications();
                    // Show native browser notification when the page is not visible
                    // (covers background tabs, minimised browser, mobile home screen)
                    if (
                        (document.visibilityState === 'hidden' || !document.hasFocus()) &&
                        pushSupportStatus() !== 'supported'
                    ) {
                        showNativeNotification(
                            payload.new.title,
                            payload.new.message,
                            payload.new.rfi_id
                        );
                    }
                })
                .subscribe();
        }

        const refreshInterval = setInterval(() => {
            fetchAllRFIs();
            if (user) fetchNotifications();
            if (navigator.onLine) {
                syncPendingRFIs();
                syncPendingConsultantActions();
            }
        }, 15000);

        const handleOnline = () => {
            toast('Back online. Syncing pending work...', { icon: '🌐' });
            syncPendingRFIs();
            syncPendingConsultantActions();
        };
        window.addEventListener('online', handleOnline);

        return () => {
            clearInterval(refreshInterval);
            window.removeEventListener('online', handleOnline);
            supabase.removeChannel(rfiSubscription);
            if (notifSubscription) supabase.removeChannel(notifSubscription);
        };
    }, [
        fetchAllRFIs,
        fetchConsultants,
        fetchContractors,
        fetchNotifications,
        refreshPendingSyncCount,
        user,
    ]);

    // Format for DB insertion (camelCase -> snake_case)
    const formatForDB = (rfi) => ({
        serial_no: rfi.serialNo,
        description: rfi.description,
        location: rfi.location,
        inspection_type: rfi.inspectionType,
        filed_by: rfi.filedBy,
        filed_date: rfi.filedDate,
        original_filed_date: rfi.originalFiledDate,
        status: rfi.status,
        reviewed_by: rfi.reviewedBy,
        reviewed_at: rfi.reviewedAt,
        remarks: rfi.remarks,
        carryover_count: rfi.carryoverCount,
        carryover_to: rfi.carryoverTo,
        images: rfi.images || [],
        assigned_to: rfi.assignedTo || null,
        parent_id: rfi.parentId || null,
        project_id: activeProject?.id,
        custom_fields: {
            ...(rfi.customFields || {}),
            parentId: rfi.parentId || null,
            rfi_no: rfi.rfiNo || null
        },
    });

    /** Create a new RFI */
    async function createRFI({ description, location, inspectionType, filedBy, filedDate, images, assignedTo, parentId = null, customFields = null }) {
        if (!activeProject?.id) {
            throw new Error('No active project selected.');
        }

        const effectiveFiledDate = filedDate || new Date().toISOString().split('T')[0];
        const normalizedImagesInput = images || [];
        const effectiveFiledBy = filedBy || user?.id;

        if (!effectiveFiledBy) {
            throw new Error('User identification missing. Please ensure you are logged in.');
        }

        // Dead-zone flow: persist request in IndexedDB and optimistically show it in the UI.
        if (!navigator.onLine) {
            const queuedImages = await serializeImagesForQueue(normalizedImagesInput);

            await enqueuePendingRFI({
                projectId: activeProject.id,
                payload: {
                    description,
                    location,
                    inspectionType,
                    filedBy: effectiveFiledBy,
                    filedDate: effectiveFiledDate,
                    assignedTo: assignedTo || null,
                    images: queuedImages,
                    parentId,
                },
            });

            const localDateRfis = rfis.filter((r) => r.filedDate === effectiveFiledDate);
            const localSerial = localDateRfis.length > 0 ? Math.max(...localDateRfis.map((r) => r.serialNo || 0)) + 1 : 1;
            
            // Generate RFI code for offline
            const prefix = activeProject?.code || 'RR007';
            let offlineRfiNo = `${prefix}-001`;
            if (!parentId) {
                let maxB = 0;
                rfis.forEach(r => {
                    const c = r.customFields?.rfi_no;
                    if (c && c.startsWith(prefix)) {
                        const pts = c.split('-');
                        if (pts.length >= 2) {
                            const n = parseInt(pts[1], 10);
                            if (!isNaN(n)) maxB = Math.max(maxB, n);
                        }
                    }
                });
                offlineRfiNo = `${prefix}-${(maxB + 1).toString().padStart(3, '0')}`;
            } else {
                const par = rfis.find(r => r.id === parentId);
                const pCode = par?.customFields?.rfi_no || `${prefix}-001`;
                if (pCode.includes('-R')) {
                    const pts = pCode.split('-R');
                    offlineRfiNo = `${pts[0]}-R${parseInt(pts[1], 10) + 1}`;
                } else {
                    offlineRfiNo = `${pCode}-R1`;
                }
            }
            const assignee = consultants.find((c) => c.id === assignedTo);

            setRfis((prev) => ([
                {
                    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    serialNo: localSerial,
                    description,
                    location,
                    inspectionType,
                    filedBy,
                    filerName: user?.name || 'Offline User',
                    filerCompany: user?.company || '',
                    filedDate: effectiveFiledDate,
                    originalFiledDate: effectiveFiledDate,
                    status: RFI_STATUS.PENDING,
                    reviewedBy: null,
                    reviewerName: '',
                    reviewedAt: null,
                    remarks: 'Queued offline. Will sync when online.',
                    carryoverCount: 0,
                    carryoverTo: null,
                    images: normalizedImagesInput.filter((img) => typeof img === 'string'),
                    assignedTo: assignedTo || null,
                    assigneeName: assignee?.name || '',
                    parentId,
                    customFields: { ...customFields, rfi_no: offlineRfiNo, parentId },
                    createdAt: new Date().toISOString(),
                    pendingSync: true,
                    rfiNo: offlineRfiNo,
                },
                ...prev,
            ]));

            await refreshPendingSyncCount();
            toast('Saved offline. Auto-sync will run when connection returns.', { icon: '📡' });
            return { queued: true };
        }

        try {
            const imageUrls = await normalizeImagesForSubmission(normalizedImagesInput);
            const newRfiData = {
                // serialNo and rfiNo are now handled by DB triggers on insert
                description,
                location,
                inspectionType,
                filedBy: effectiveFiledBy,
                filedDate: effectiveFiledDate,
                originalFiledDate: effectiveFiledDate,
                status: RFI_STATUS.PENDING,
                reviewedBy: null,
                reviewedAt: null,
                remarks: null,
                carryoverCount: 0,
                carryoverTo: null,
                images: imageUrls,
                assigned_to: assignedTo || null,
                parentId,
                customFields: customFields || {},
            };

            const { data: insertedData, error } = await supabase.from('rfis').insert([formatForDB(newRfiData)]).select();
            if (error) throw error;

            if (insertedData?.[0]) {
                const data = insertedData[0];
                await logAuditEvent(data.id, 'created', { description, location });
                await notifyConsultantsAboutNewRFI(data.id, data.custom_fields?.rfi_no || data.serial_no, data.location, data.filed_by, data.assigned_to);
                showNativeNotification('RFI Submitted', `RFI #${data.custom_fields?.rfi_no || data.serial_no} submitted successfully.`, data.id);
                if (assignedTo) {
                    await logAuditEvent(insertedData[0].id, 'assigned', { assignee: assignedTo });
                }
            }

            await fetchAllRFIs();
            await refreshPendingSyncCount();
            return { queued: false };
        } catch (error) {
            console.error('Error creating RFI:', error);
            throw error;
        }
    }

    /** Assign/Re-assign an RFI to a specific consultant */
    async function assignRFI(rfiId, consultantId) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        try {
            const { error } = await supabase.from('rfis').update({
                assigned_to: consultantId || null,
            }).eq('id', rfiId);
            if (error) throw error;

            if (consultantId) {
                await createNotification(
                    consultantId,
                    `RFI Assigned: #${targetRfi.customFields?.rfi_no || targetRfi.serialNo}`,
                    `Location: ${targetRfi.location}`,
                    rfiId
                );
            }
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error assigning RFI:", error);
        }
    }

    /** Upload Images to Storage */
    async function uploadImages(files) {
        if (!files || files.length === 0) return [];

        const uploadedUrls = [];

        for (const file of files) {
            // Generate a unique filename: timestamp_random.ext
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${activeProject?.id || 'general'}/${fileName}`;

            try {
                const { data, error } = await supabase.storage
                    .from('rfi-images')
                    .upload(filePath, file);

                if (error) throw error;

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('rfi-images')
                    .getPublicUrl(filePath);

                if (urlData?.publicUrl) {
                    uploadedUrls.push(urlData.publicUrl);
                }
            } catch (error) {
                console.error("Error uploading image:", error);
            }
        }

        return uploadedUrls;
    }

    const syncPendingRFIs = useCallback(async () => {
        if (!navigator.onLine || !activeProject?.id || isSyncingOfflineRef.current) return;

        isSyncingOfflineRef.current = true;
        let syncedCount = 0;

        try {
            const queued = await listPendingRFIs(activeProject.id);
            if (queued.length === 0) {
                await refreshPendingSyncCount();
                return;
            }

            for (const item of queued) {
                try {
                    const payload = item.payload || {};
                    const reconstructedImages = deserializeQueuedImages(payload.images || []);
                    const imageUrls = await normalizeImagesForSubmission(reconstructedImages);
                    const syncedRfi = {
                        // DB trigger will assign correct serial_no and rfi_no
                        description: payload.description,
                        location: payload.location,
                        inspectionType: payload.inspectionType,
                        filedBy: payload.filedBy,
                        filedDate: payload.filedDate,
                        originalFiledDate: payload.filedDate,
                        status: RFI_STATUS.PENDING,
                        reviewedBy: null,
                        reviewedAt: null,
                        remarks: null,
                        carryoverCount: 0,
                        carryoverTo: null,
                        images: imageUrls,
                        assigned_to: payload.assignedTo || null,
                        parentId: payload.parentId || null,
                        customFields: payload.customFields || {},
                    };

                    const { data: insertedData, error } = await supabase.from('rfis').insert([formatForDB(syncedRfi)]).select();
                    if (error) throw error;

                    if (insertedData?.[0]) {
                        const data = insertedData[0];
                        await notifyConsultantsAboutNewRFI(
                            data.id,
                            data.custom_fields?.rfi_no || data.serial_no,
                            data.location,
                            data.filed_by,
                            data.assigned_to
                        );
                        if (payload.assignedTo) {
                            await logAuditEvent(data.id, 'assigned', { assignee: payload.assignedTo });
                        }
                        await logAuditEvent(data.id, 'created', {
                            description: payload.description,
                            location: payload.location,
                            source: 'offline-sync',
                        });
                    }

                    await removePendingRFI(item.id);
                    syncedCount += 1;
                } catch (itemError) {
                    console.error('Error syncing queued RFI:', itemError);
                }
            }

            await refreshPendingSyncCount();
            if (syncedCount > 0) {
                toast.success(`${syncedCount} offline RFI${syncedCount > 1 ? 's' : ''} synced.`);
                await fetchAllRFIs();
            }
        } catch (error) {
            console.error('Offline sync failed:', error);
        } finally {
            isSyncingOfflineRef.current = false;
        }
    }, [activeProject, fetchAllRFIs, getNextSerialNoForDate, getNextRfiCode, normalizeImagesForSubmission, notifyConsultantsAboutNewRFI, refreshPendingSyncCount]);

    const syncPendingConsultantActions = useCallback(async () => {
        if (!navigator.onLine || !activeProject?.id || isSyncingOfflineRef.current) return;

        try {
            const queued = await listPendingActions(activeProject.id);
            if (queued.length === 0) return;

            for (const item of queued) {
                try {
                    const payload = item.payload || {};

                    if (item.type === 'update_rfi') {
                        const dbUpdates = { ...(payload.dbUpdates || {}) };
                        const appendImagesSerialized = payload.appendImages || [];

                        if (appendImagesSerialized.length > 0) {
                            const reconstructed = deserializeQueuedImages(appendImagesSerialized);
                            const uploadedUrls = await normalizeImagesForSubmission(reconstructed);

                            const { data: existingRow } = await supabase
                                .from('rfis')
                                .select('images')
                                .eq('id', payload.rfiId)
                                .maybeSingle();

                            dbUpdates.images = [
                                ...(existingRow?.images || []),
                                ...uploadedUrls,
                            ];
                        }

                        const { error } = await supabase.from('rfis').update(dbUpdates).eq('id', payload.rfiId);
                        if (error) throw error;
                    }

                    if (item.type === 'approve_rfi') {
                        const targetRfi = rfis.find((r) => r.id === payload.rfiId);
                        const queuedAttachments = deserializeQueuedImages(payload.consultantAttachments || []);
                        const uploadedUrls = await normalizeImagesForSubmission(queuedAttachments);
                        const mergedImages = [
                            ...(targetRfi?.images || []),
                            ...uploadedUrls,
                        ];

                        const { error } = await supabase.from('rfis').update({
                            status: RFI_STATUS.APPROVED,
                            reviewed_by: payload.reviewedBy,
                            reviewed_at: new Date().toISOString(),
                            remarks: payload.remarks?.trim() ? payload.remarks.trim() : null,
                            carryover_to: null,
                            images: mergedImages,
                        }).eq('id', payload.rfiId);
                        if (error) throw error;
                    }

                    if (item.type === 'reject_rfi') {
                        const targetRfi = rfis.find((r) => r.id === payload.rfiId);
                        const queuedAttachments = deserializeQueuedImages(payload.consultantAttachments || []);
                        const uploadedUrls = await normalizeImagesForSubmission(queuedAttachments);
                        const mergedImages = [
                            ...(targetRfi?.images || []),
                            ...uploadedUrls,
                        ];

                        const { error } = await supabase.from('rfis').update({
                            status: RFI_STATUS.REJECTED,
                            reviewed_by: payload.reviewedBy,
                            reviewed_at: new Date().toISOString(),
                            remarks: payload.remarks || null,
                            images: mergedImages,
                            assigned_to: payload.assignedTo || targetRfi?.assignedTo
                        }).eq('id', payload.rfiId);
                        if (error) throw error;
                    }

                    await removePendingAction(item.id);
                } catch (itemError) {
                    console.error('Error syncing queued consultant action:', itemError);
                }
            }

            await fetchAllRFIs();
            toast.success('Offline consultant updates synced.');
        } catch (error) {
            console.error('Error syncing consultant queue:', error);
        }
    }, [activeProject, fetchAllRFIs, normalizeImagesForSubmission, rfis]);

    /** Approve an RFI */
    async function approveRFI(rfiId, reviewedBy, remarks = '', consultantAttachments = []) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        if (!canUserEditRfiRecord(targetRfi, user)) {
            toast.error('This RFI is assigned to another reviewer. You can only view it.');
            return;
        }

        if (!navigator.onLine) {
            const queuedAttachments = await serializeImagesForQueue(consultantAttachments || []);
            await enqueuePendingAction({
                projectId: activeProject?.id,
                type: 'approve_rfi',
                payload: {
                    rfiId,
                    reviewedBy,
                    remarks,
                    consultantAttachments: queuedAttachments,
                },
            });

            setRfis((prev) => prev.map((r) => (
                r.id === rfiId
                    ? {
                        ...r,
                        status: RFI_STATUS.APPROVED,
                        reviewedBy,
                        reviewedAt: new Date().toISOString(),
                        remarks: remarks?.trim() ? remarks.trim() : null,
                      }
                    : r
            )));
            toast('Saved offline. Approval will sync when online.', { icon: '📡' });
            return;
        }

        try {
            const normalizedAttachments = await normalizeImagesForSubmission(consultantAttachments || []);
            const mergedImages = [
                ...(targetRfi.images || []),
                ...normalizedAttachments,
            ];
            const { error } = await supabase.from('rfis').update({
                status: RFI_STATUS.APPROVED,
                reviewed_by: reviewedBy,
                reviewed_at: new Date().toISOString(),
                remarks: remarks?.trim() ? remarks.trim() : null,
                carryover_to: null,
                images: mergedImages,
            }).eq('id', rfiId);
            if (error) throw error;

            // Notify Contractor
            const rfiNo = targetRfi.customFields?.rfi_no || targetRfi.serialNo;
            await createNotification(
                targetRfi.filedBy,
                `RFI Approved: #${rfiNo}`,
                `Remarks: ${remarks?.trim() || 'No remarks provided.'}`,
                rfiId
            );

            const mentionMatches = (remarks || '').match(/@([a-z0-9._-]+)/gi) || [];
            const mentionKeys = new Set(mentionMatches.map((m) => m.slice(1).toLowerCase()));
            const taggedContractors = contractors.filter((c) =>
                mentionKeys.has(c.name.toLowerCase().replace(/\s+/g, ''))
            );

            for (const tagged of taggedContractors) {
                if (tagged.id !== targetRfi.filedBy) {
                    await createNotification(
                        tagged.id,
                        `RFI Approved: #${rfiNo} (TAG)`,
                        `Remarks: ${remarks.trim()}`,
                        rfiId
                    );
                }
            }

            await logAuditEvent(rfiId, 'approved', {
                remarks: remarks?.trim() || null,
                attachmentsAdded: (consultantAttachments || []).length,
            });
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error approving RFI:", error);
        }
    }

    /** Reject an RFI with remarks, and set carryover to next day */
    async function rejectRFI(rfiId, reviewedBy, remarks, consultantAttachments = [], assignedTo = null) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        if (!canUserEditRfiRecord(targetRfi, user)) {
            toast.error('This RFI is assigned to another reviewer. You can only view it.');
            return;
        }

        if (!navigator.onLine) {
            const queuedAttachments = await serializeImagesForQueue(consultantAttachments || []);
            await enqueuePendingAction({
                projectId: activeProject?.id,
                type: 'reject_rfi',
                payload: {
                    rfiId,
                    reviewedBy,
                    remarks,
                    consultantAttachments: queuedAttachments,
                    assignedTo
                },
            });

            setRfis((prev) => prev.map((r) => (
                r.id === rfiId
                    ? {
                        ...r,
                        status: RFI_STATUS.REJECTED,
                        reviewedBy,
                        reviewedAt: new Date().toISOString(),
                        remarks: remarks || null,
                        assignedTo: assignedTo || r.assignedTo
                      }
                    : r
            )));
            toast('Saved offline. Rejection will sync when online.', { icon: '📡' });
            return;
        }

        try {
            const normalizedAttachments = await normalizeImagesForSubmission(consultantAttachments || []);
            const mergedImages = [
                ...(targetRfi.images || []),
                ...normalizedAttachments,
            ];
            const { error } = await supabase.from('rfis').update({
                status: RFI_STATUS.REJECTED,
                reviewed_by: reviewedBy,
                reviewed_at: new Date().toISOString(),
                remarks: remarks,
                images: mergedImages,
                assigned_to: assignedTo || targetRfi.assignedTo
            }).eq('id', rfiId);
            if (error) throw error;

            // Notify Contractor
            const rfiNo = targetRfi.customFields?.rfi_no || targetRfi.serialNo;
            await createNotification(
                targetRfi.filedBy,
                `RFI Rejected: #${rfiNo}`,
                `Remarks: ${remarks || 'No remarks provided.'}`,
                rfiId
            );
            const mentionMatches = remarks.match(/@([a-z0-9._-]+)/gi) || [];
            const mentionKeys = new Set(mentionMatches.map((m) => m.slice(1).toLowerCase()));
            const taggedContractors = contractors.filter((c) =>
                mentionKeys.has(c.name.toLowerCase().replace(/\s+/g, ''))
            );
            for (const tagged of taggedContractors) {
                if (tagged.id !== targetRfi.filedBy) {
                    await createNotification(
                        tagged.id,
                        `RFI Rejected: #${rfiNo} (TAG)`,
                        `Remarks: ${remarks}`,
                        rfiId
                    );
                }
            }

            await logAuditEvent(rfiId, 'rejected', { remarks });
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error rejecting RFI:", error);
        }
    }

    /** Cancel an RFI with mandatory reason */
    async function cancelRFI(rfiId, reviewedBy, reason) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        if (!canUserEditRfiRecord(targetRfi, user)) {
            toast.error('This RFI is assigned to another reviewer. You can only view it.');
            return;
        }

        if (!navigator.onLine) {
            await enqueuePendingAction({
                projectId: activeProject?.id,
                type: 'update_rfi',
                payload: {
                    rfiId,
                    dbUpdates: {
                        status: RFI_STATUS.CANCELLED,
                        reviewed_by: reviewedBy,
                        reviewed_at: new Date().toISOString(),
                        remarks: reason,
                        assigned_to: targetRfi.assignedTo,
                    }
                },
            });

            setRfis((prev) => prev.map((r) => (
                r.id === rfiId
                    ? {
                        ...r,
                        status: RFI_STATUS.CANCELLED,
                        reviewedBy,
                        reviewedAt: new Date().toISOString(),
                        remarks: reason,
                      }
                    : r
            )));
            toast('Saved offline. Cancellation will sync when online.', { icon: '📡' });
            return;
        }

        try {
            const { error } = await supabase.from('rfis').update({
                status: RFI_STATUS.CANCELLED,
                reviewed_by: reviewedBy,
                reviewed_at: new Date().toISOString(),
                remarks: reason
            }).eq('id', rfiId);
            
            if (error) throw error;

            // Notify Contractor
            const rfiNo = targetRfi.customFields?.rfi_no || targetRfi.serialNo;
            await createNotification(
                targetRfi.filedBy,
                `RFI Cancelled: #${rfiNo}`,
                `Reason: ${reason}`,
                rfiId
            );

            await logAuditEvent(rfiId, 'cancelled', { reason });
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error cancelling RFI:", error);
            throw error;
        }
    }

    /** Bulk Approve RFIs */
    async function bulkApproveRFI(rfiIds, reviewedBy) {
        if (!rfiIds || rfiIds.length === 0) return;

        try {
            const { error } = await supabase
                .from('rfis')
                .update({
                    status: RFI_STATUS.APPROVED,
                    reviewed_by: reviewedBy,
                    reviewed_at: new Date().toISOString(),
                    remarks: null,
                    carryover_to: null,
                })
                .in('id', rfiIds);

            if (error) throw error;

            // Notify all contractors involved
            const targetRfis = rfis.filter(r => rfiIds.includes(r.id));
            for (const rfi of targetRfis) {
                await createNotification(
                    rfi.filedBy,
                    `RFI Approved: #${rfi.customFields?.rfi_no || rfi.serialNo}`,
                    'Remarks: Approved via bulk operation.',
                    rfi.id
                );
                await logAuditEvent(rfi.id, 'approved', { bulk: true });
            }

            await fetchAllRFIs();
            toast.success(`Successfully approved ${rfiIds.length} RFIs`);
        } catch (error) {
            console.error("Error bulk approving RFIs:", error);
            toast.error("Failed to approve some RFIs");
        }
    }

    /** Bulk Assign RFIs */
    async function bulkAssignRFI(rfiIds, consultantId) {
        if (!rfiIds || rfiIds.length === 0) return;

        try {
            const { error } = await supabase
                .from('rfis')
                .update({
                    assigned_to: consultantId || null,
                })
                .in('id', rfiIds);

            if (error) throw error;

            const consultant = consultants.find(c => c.id === consultantId);

            // Notify Consultant
            if (consultantId) {
                await createNotification(
                    consultantId,
                    "Bulk Assignment",
                    `${rfiIds.length} RFIs assigned to you for review.`,
                    null
                );
            }

            const targetRfis = rfis.filter(r => rfiIds.includes(r.id));
            for (const rfi of targetRfis) {
                await logAuditEvent(rfi.id, 'assigned', { assignee: consultantId, bulk: true });
            }

            await fetchAllRFIs();
            toast.success(`Assigned ${rfiIds.length} RFIs to ${consultant?.name || 'Unassigned'}`);
        } catch (error) {
            console.error("Error bulk assigning RFIs:", error);
            toast.error("Failed to assign some RFIs");
        }
    }

    /** Re-submit a rejected/carried-over RFI (reset to pending for current day) */
    async function resubmitRFI(rfiId, newDate) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        try {
            const { error } = await supabase.from('rfis').update({
                status: RFI_STATUS.PENDING,
                carryover_to: null,
                filed_date: newDate,
                remarks: null,
                reviewed_by: null,
                reviewed_at: null,
            }).eq('id', rfiId);
            if (error) throw error;

            // Notify Consultant (if there was a previous reviewer)
            if (targetRfi.reviewedBy) {
                await createNotification(
                    targetRfi.reviewedBy,
                    `RFI Resubmitted: #${targetRfi.customFields?.rfi_no || targetRfi.serialNo}`,
                    'Remarks: Contractor resubmitted for review.',
                    rfiId
                );
            }
            await logAuditEvent(rfiId, 'resubmitted');
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error re-submitting RFI:", error);
        }
    }

    /** -------------------------
     *   COMMENTS (PHASE 5)
     *  ------------------------- */
    async function fetchComments(rfiId) {
        try {
            const targetRfi = rfis.find((r) => r.id === rfiId);
            if (targetRfi && !canUserDiscussRfiRecord(targetRfi, user?.id)) {
                return [];
            }

            const { data, error } = await supabase
                .from('comments')
                .select(`
                    id,
                    content,
                    created_at,
                    user_id,
                    profiles (name, role, company)
                `)
                .eq('rfi_id', rfiId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            return data.map(c => ({
                id: c.id,
                content: c.content,
                createdAt: c.created_at,
                userId: c.user_id,
                userName: c.profiles?.name || 'Unknown User',
                userRole: c.profiles?.role || '',
            }));
        } catch (error) {
            console.error("Error fetching comments:", error);
            return [];
        }
    }

    async function addComment(rfiId, content, options = {}) {
        if (!user) return;

        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        if (!canUserDiscussRfiRecord(targetRfi, user.id)) {
            throw new Error('Chat is limited to the assigned consultant and filing contractor.');
        }

        try {
            const attachments = Array.isArray(options.attachments) ? options.attachments : [];
            const uploadedAttachmentUrls = attachments.length > 0 ? await uploadImages(attachments) : [];

            const attachmentTokens = uploadedAttachmentUrls.map((url) => `[img]${url}[/img]`);
            const finalContent = [content, ...attachmentTokens].filter(Boolean).join('\n').trim();

            const { error } = await supabase.from('comments').insert([{
                rfi_id: rfiId,
                user_id: user.id,
                content: finalContent
            }]);

            if (error) throw error;

            // Notify the other party
            // If the commenter is the contractor who filed it, notify the reviewer (if assigned/reviewed)
            // If the commenter is the consultant, notify the contractor
            const isFiler = user.id === targetRfi.filedBy;
            const targetUserId = isFiler ? targetRfi.reviewedBy : targetRfi.filedBy;

            const allowedRecipients = new Set();
            if (targetRfi.assignedTo) {
                [targetRfi.filedBy, targetRfi.assignedTo].forEach((uid) => {
                    if (uid && uid !== user.id) allowedRecipients.add(uid);
                });
            } else if (targetUserId && targetUserId !== user.id) {
                allowedRecipients.add(targetUserId);
            }

            const notificationRecipients = new Set(allowedRecipients);

            const mentionMatches = content.match(/@([a-z0-9._-]+)/gi) || [];
            const mentionKeys = new Set(mentionMatches.map((m) => normalizeMentionKey(m.slice(1))));
            const mentionCandidates = [...contractors, ...consultants];

            mentionCandidates.forEach((member) => {
                if (!member?.id || member.id === user.id) return;
                if (!allowedRecipients.has(member.id)) return;
                const memberKey = normalizeMentionKey(member.name || '');
                if (memberKey && mentionKeys.has(memberKey)) {
                    notificationRecipients.add(member.id);
                }
            });

            for (const recipientId of notificationRecipients) {
                const candidate = mentionCandidates.find((m) => m?.id === recipientId);
                const isMention = candidate && mentionKeys.has(normalizeMentionKey(candidate.name || ''));

                const rfiNo = targetRfi.customFields?.rfi_no || targetRfi.serialNo;
                await createNotification(
                    recipientId,
                    isMention ? `RFI Mention: #${rfiNo}` : `RFI Message: #${rfiNo}`,
                    isMention
                        ? `Message: ${user.name}: ${content.trim()}`
                        : `Message: ${user.name}: ${content.trim()}`,
                    rfiId
                );
            }

            await logAuditEvent(rfiId, 'commented', {
                content,
                attachmentsAdded: uploadedAttachmentUrls.length,
            });
        } catch (error) {
            console.error("Error adding comment:", error);
            throw error;
        }
    }

    async function updateComment(commentId, content) {
        if (!user) return;
        const trimmed = content?.trim();
        if (!trimmed) return;

        try {
            const { data: commentRow, error: commentFetchError } = await supabase
                .from('comments')
                .select('id, rfi_id, user_id')
                .eq('id', commentId)
                .maybeSingle();

            if (commentFetchError) throw commentFetchError;
            if (!commentRow?.id || commentRow.user_id !== user.id) {
                throw new Error('You can only edit your own messages.');
            }

            const targetRfi = rfis.find((r) => r.id === commentRow.rfi_id);
            if (targetRfi && !canUserDiscussRfiRecord(targetRfi, user.id)) {
                throw new Error('Chat is limited to the assigned consultant and filing contractor.');
            }

            const { error } = await supabase
                .from('comments')
                .update({ content: trimmed })
                .eq('id', commentId)
                .eq('user_id', user.id);

            if (error) throw error;
            await logAuditEvent(null, 'comment_edited', { commentId });
        } catch (error) {
            console.error('Error updating comment:', error);
            throw error;
        }
    }

    async function deleteComment(commentId) {
        if (!user) return;

        try {
            const { data: commentRow, error: commentFetchError } = await supabase
                .from('comments')
                .select('id, rfi_id, user_id')
                .eq('id', commentId)
                .maybeSingle();

            if (commentFetchError) throw commentFetchError;
            if (!commentRow?.id || commentRow.user_id !== user.id) {
                throw new Error('You can only delete your own messages.');
            }

            const targetRfi = rfis.find((r) => r.id === commentRow.rfi_id);
            if (targetRfi && !canUserDiscussRfiRecord(targetRfi, user.id)) {
                throw new Error('Chat is limited to the assigned consultant and filing contractor.');
            }

            const { data, error } = await supabase
                .from('comments')
                .delete()
                .eq('id', commentId)
                .eq('user_id', user.id)
                .select('id, rfi_id')
                .maybeSingle();

            if (error) throw error;
            if (!data?.id) {
                throw new Error('Delete was blocked by permissions. Please apply comment delete policy in Supabase.');
            }

            await logAuditEvent(data.rfi_id || null, 'comment_deleted', { commentId });
        } catch (error) {
            console.error('Error deleting comment:', error);
            throw error;
        }
    }


    /** Delete an RFI */
    async function deleteRFI(rfiId) {
        try {
            const { error } = await supabase.from('rfis').delete().eq('id', rfiId);
            if (error) throw error;
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error deleting RFI:", error);
        }
    }

    /** Update an RFI's details */
    async function updateRFI(rfiId, updates) {
        try {
            const current = rfis.find((r) => r.id === rfiId);
            if (current && !canUserEditRfiRecord(current, user)) {
                toast.error('This RFI is assigned to another user. You can view it only.');
                return;
            }

            // Need to convert keys to snake case for db
            const dbUpdates = {};
            if (updates.description !== undefined) dbUpdates.description = updates.description;
            if (updates.location !== undefined) dbUpdates.location = updates.location;
            if (updates.inspectionType !== undefined) dbUpdates.inspection_type = updates.inspectionType;
            if (updates.remarks !== undefined) dbUpdates.remarks = updates.remarks;
            if (updates.customFields !== undefined) dbUpdates.custom_fields = updates.customFields;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.reviewedBy !== undefined) dbUpdates.reviewed_by = updates.reviewedBy;
            if (updates.reviewedAt !== undefined) dbUpdates.reviewed_at = updates.reviewedAt;
            if (updates.carryoverTo !== undefined || updates.carryover_to !== undefined) {
                dbUpdates.carryover_to = updates.carryoverTo !== undefined ? updates.carryoverTo : updates.carryover_to;
            }

            const appendFiles = updates.appendFiles || [];

            if (!navigator.onLine) {
                const serializedAppend = await serializeImagesForQueue(appendFiles);
                if (updates.images !== undefined) dbUpdates.images = updates.images;

                await enqueuePendingAction({
                    projectId: activeProject?.id,
                    type: 'update_rfi',
                    payload: {
                        rfiId,
                        dbUpdates,
                        appendImages: serializedAppend,
                    },
                });

                setRfis((prev) => prev.map((r) => {
                    if (r.id !== rfiId) return r;

                    const appendedPreviewUrls = appendFiles
                        .map((file) => {
                            try {
                                return URL.createObjectURL(file);
                            } catch {
                                return null;
                            }
                        })
                        .filter(Boolean);

                    return {
                        ...r,
                        description: updates.description !== undefined ? updates.description : r.description,
                        location: updates.location !== undefined ? updates.location : r.location,
                        inspectionType: updates.inspectionType !== undefined ? updates.inspectionType : r.inspectionType,
                        remarks: updates.remarks !== undefined ? updates.remarks : r.remarks,
                        images: updates.images !== undefined
                            ? updates.images
                            : [...(r.images || []), ...appendedPreviewUrls],
                        customFields: updates.customFields !== undefined ? updates.customFields : r.customFields,
                        status: updates.status !== undefined ? updates.status : r.status,
                        reviewedBy: updates.reviewedBy !== undefined ? updates.reviewedBy : r.reviewedBy,
                        reviewedAt: updates.reviewedAt !== undefined ? updates.reviewedAt : r.reviewedAt,
                        carryoverTo: (updates.carryoverTo !== undefined) ? updates.carryoverTo : (updates.carryover_to !== undefined ? updates.carryover_to : r.carryoverTo),
                    };
                }));

                toast('Saved offline. Changes will sync when online.', { icon: '📡' });
                return;
            }

            if (appendFiles.length > 0) {
                const uploaded = await normalizeImagesForSubmission(appendFiles);
                dbUpdates.images = [
                    ...(updates.images !== undefined ? updates.images : (current?.images || [])),
                    ...uploaded,
                ];
            } else if (updates.images !== undefined) {
                dbUpdates.images = updates.images;
            }

            const { error } = await supabase.from('rfis').update(dbUpdates).eq('id', rfiId);
            if (error) throw error;

            // --- Notification Trigger Logic (if status changed to approved/conditional) ---
            const statusChanged = updates.status && updates.status !== current?.status;
            if (statusChanged && (updates.status === RFI_STATUS.APPROVED || updates.status === RFI_STATUS.CONDITIONAL_APPROVE)) {
                const rfiNo = current.customFields?.rfi_no || current.serialNo;
                const displayStatus = updates.status === RFI_STATUS.CONDITIONAL_APPROVE ? 'Cond. Approved' : 'Approved';
                
                // If resolving conditions (Conditional -> Approved), notify the original reviewer
                // Otherwise (Pending -> Approved/Conditional), notify the filer
                const targetUserId = (current.status === RFI_STATUS.CONDITIONAL_APPROVE && updates.status === RFI_STATUS.APPROVED)
                    ? current.reviewedBy 
                    : current.filedBy;

                if (targetUserId) {
                    await createNotification(
                        targetUserId,
                        `Status: ${displayStatus} (#${rfiNo})`,
                        `Remarks: ${updates.remarks?.trim() || 'Conditions resolved'}.`,
                        rfiId
                    );
                }

                // Handle Tags in remarks
                const mentionMatches = (updates.remarks || '').match(/@([a-z0-9._-]+)/gi) || [];
                const mentionKeys = new Set(mentionMatches.map((m) => m.slice(1).toLowerCase()));
                if (mentionKeys.size > 0) {
                    const taggedContractors = contractors.filter((c) =>
                        mentionKeys.has(c.name.toLowerCase().replace(/\s+/g, ''))
                    );
                    const taggedConsultants = consultants.filter((c) =>
                        mentionKeys.has(c.name.toLowerCase().replace(/\s+/g, ''))
                    );
                    const allTagged = [...taggedContractors, ...taggedConsultants];

                    for (const tagged of allTagged) {
                        if (tagged.id !== targetUserId && tagged.id !== user?.id) {
                            await createNotification(
                                tagged.id,
                                `Status: ${displayStatus} (#${rfiNo}) (TAG)`,
                                `Remarks: ${updates.remarks.trim()}`,
                                rfiId
                            );
                        }
                    }
                }
            }

            await logAuditEvent(rfiId, 'updated', { 
                updates: Object.keys(dbUpdates),
                statusChanged: statusChanged ? updates.status : null 
            });

            await fetchAllRFIs();
        } catch (error) {
            console.error("Error updating RFI:", error);
            const msg = error.message || error.details || "Unknown error";
            toast.error(`Failed to update RFI: ${msg}`);
        }
    }

    /** Get RFIs for a specific date with carryover logic (Sync from local state array) */
    function getRFIsForDate(targetDate) {
        const todaysRfis = rfis.filter((rfi) => (rfi.filedDate || '') === targetDate);
        const carriedOver = rfis.filter(
            (rfi) =>
                rfi.status === RFI_STATUS.REJECTED &&
                rfi.carryoverTo &&
                rfi.carryoverTo <= targetDate
        );

        // Sorting strategy: Priority Rejected/Carryover, then serial number
        const sortRFIs = (a, b) => {
            // Rule 1: Rejected items/Carried items first
            const aIsPriority = a.status === RFI_STATUS.REJECTED || a.status === RFI_STATUS.INFO_REQUESTED;
            const bIsPriority = b.status === RFI_STATUS.REJECTED || b.status === RFI_STATUS.INFO_REQUESTED;

            if (aIsPriority && !bIsPriority) return -1;
            if (!aIsPriority && bIsPriority) return 1;

            // Rule 2: Carryover count (Previously rejected items first)
            if (a.carryoverCount !== b.carryoverCount) {
                return b.carryoverCount - a.carryoverCount;
            }

            // Rule 3: Serial number
            return a.serialNo - b.serialNo;
        };

        const sortedTodays = [...todaysRfis].sort(sortRFIs);
        const sortedCarried = [...carriedOver].sort(sortRFIs);

        return {
            carriedOver: sortedCarried,
            newRfis: sortedTodays,
            all: [...sortedCarried, ...sortedTodays],
        };
    }

    /** Get all pending RFIs for consultant review (Sync from local state array) */
    function getReviewQueue(targetDate) {
        const pending = rfis.filter(
            (rfi) => rfi.status === RFI_STATUS.PENDING && (rfi.filedDate || '') <= targetDate
        );

        const sortQueue = (a, b) => {
            // Older content first
            if ((a.filedDate || '') !== (b.filedDate || '')) {
                return (a.filedDate || '').localeCompare(b.filedDate || '');
            }
            return (a.serialNo || 0) - (b.serialNo || 0);
        };

        const combined = [...pending].sort(sortQueue);

        return {
            carriedOver: [],
            pending: combined,
            all: combined,
        };
    }

    /** Get stats (Sync from local state array) */
    function getStats(targetDate) {
        const supersededIds = new Set(rfis.map(r => r.parentId).filter(Boolean));
        
        const { all } = getRFIsForDate(targetDate);
        const activeTodayAll = all.filter(r => !supersededIds.has(r.id));
        
        const queue = getReviewQueue(targetDate).all;
        const reviewedToday = rfis.filter(r => r.reviewedAt && r.reviewedAt.startsWith(targetDate) && !supersededIds.has(r.id));
        const activeRfis = rfis.filter(r => !supersededIds.has(r.id));

        return {
            todayTotal: activeTodayAll.length,
            todayPending: activeTodayAll.filter((r) => r.status === RFI_STATUS.PENDING).length,
            todayApproved: activeTodayAll.filter((r) => r.status === RFI_STATUS.APPROVED || r.status === RFI_STATUS.CONDITIONAL_APPROVE).length,
            todayRejected: activeTodayAll.filter((r) => r.status === RFI_STATUS.REJECTED).length,
            todayInfoRequested: activeTodayAll.filter((r) => r.status === RFI_STATUS.INFO_REQUESTED).length,
            todayCancelled: activeTodayAll.filter((r) => r.status === RFI_STATUS.CANCELLED).length,

            queueTotal: queue.length, 
            reviewedApprovedToday: reviewedToday.filter(r => r.status === RFI_STATUS.APPROVED || r.status === RFI_STATUS.CONDITIONAL_APPROVE).length,
            reviewedRejectedToday: reviewedToday.filter(r => r.status === RFI_STATUS.REJECTED).length,

            overallTotal: activeRfis.length,
            overallPending: activeRfis.filter((r) => r.status === RFI_STATUS.PENDING).length,
            overallApproved: activeRfis.filter((r) => r.status === RFI_STATUS.APPROVED || r.status === RFI_STATUS.CONDITIONAL_APPROVE).length,
            overallRejected: activeRfis.filter((r) => r.status === RFI_STATUS.REJECTED).length,
            overallInfoRequested: activeRfis.filter((r) => r.status === RFI_STATUS.INFO_REQUESTED).length,
            overallCancelled: activeRfis.filter((r) => r.status === RFI_STATUS.CANCELLED).length,
        };
    }

    // --- Notifications Actions ---
    async function markNotificationRead(notifId) {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notifId);
            if (error) throw error;
            fetchNotifications(); // Optimistic UI could be used here instead for speed
        } catch (error) {
            console.error("Error marking notification read:", error);
        }
    }

    async function markAllNotificationsRead() {
        if (!user) return;
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user.id)
                .eq('is_read', false);
            if (error) throw error;
            fetchNotifications();
        } catch (error) {
            console.error("Error marking all notifications read:", error);
        }
    }

    // --- Helper to trigger notifications (Used internally by approve/reject/comment) ---
    async function createNotification(userId, title, message, rfiId = null, options = {}) {
        try {
            // 1. Mark previous status notifications for this RFI as read for this user
            if (rfiId) {
                await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('user_id', userId)
                    .eq('rfi_id', rfiId)
                    .is('is_read', false);
            }

            // 2. Insert new notification
            const { error: notificationError } = await supabase.from('notifications').insert([{
                user_id: userId,
                title,
                message,
                rfi_id: rfiId
            }]);
            if (notificationError) throw notificationError;

            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;
            const eventKey = options.eventKey || `${userId}|${rfiId || 'none'}|${title}|${message}`;

            // Fire-and-forget: push failures must never block the in-app notification.
            // CORS/VAPID misconfigurations in the Edge Function should not surface
            // as uncaught errors for the end user.
            supabase.functions.invoke('send-push', {
                body: {
                    userId,
                    title,
                    message,
                    rfiId,
                    url: buildNotificationOpenPath(rfiId),
                    eventKey,
                },
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            }).then(({ error: pushError }) => {
                if (pushError) {
                    console.warn('Push notification failed (non-critical):', pushError?.message || pushError);
                }
            }).catch((pushErr) => {
                console.warn('Push notification request error (non-critical):', pushErr?.message || pushErr);
            });
        } catch (error) {
            console.error("Error creating notification:", error);
        }
    }

    // --- Audit Trail Logger ---
    async function logAuditEvent(rfiId, action, details = {}) {
        if (!user) return;
        try {
            await supabase.from('audit_log').insert([{
                rfi_id: rfiId,
                user_id: user.id,
                action,
                details
            }]);
        } catch (error) {
            console.error("Error logging audit event:", error);
        }
    }

    return (
        <RFIContext.Provider
            value={{
                rfis,
                loadingRfis,
                consultants,
                contractors,
                notifications,
                unreadCount,
                pendingSyncCount,
                uploadImages,
                createRFI,
                assignRFI,
                approveRFI,
                bulkApproveRFI,
                bulkAssignRFI,
                rejectRFI,
                cancelRFI,
                resubmitRFI,
                deleteRFI,
                updateRFI,
                getRFIsForDate,
                getReviewQueue,
                getStats,
                fetchComments,
                addComment,
                updateComment,
                deleteComment,
                canUserEditRfi: (rfi) => canUserEditRfiRecord(rfi, user),
                canUserDiscussRfi: (rfi) => canUserDiscussRfiRecord(rfi, user?.id),
                markNotificationRead,
                markAllNotificationsRead,
                createNotification,
                isOffline,
                lastSyncTime
            }}
        >
            {children}
        </RFIContext.Provider>
    );
}

export function useRFI() {
    const ctx = useContext(RFIContext);
    if (!ctx) throw new Error('useRFI must be used within RFIProvider');
    return ctx;
}

