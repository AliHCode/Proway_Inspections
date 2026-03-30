import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';
import { useProject } from './ProjectContext';
import { useAuth } from './AuthContext';
import { RFI_STATUS } from '../utils/constants';
import { getNowLocalISO, getToday, getEarliestDate, compressImage } from '../utils/rfiLogic';
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
    setRfiCache,
    getRfiCache,
} from '../utils/offlineQueue';
import { pushSupportStatus, syncPushSubscriptionForUser } from '../utils/pushNotifications';
import { buildNotificationOpenPath } from '../utils/notificationLinks';

const RFIContext = createContext(null);
const NOTIFICATION_PROMPT_SEEN_KEY = 'proway_notification_prompt_seen_v1';
const DISMISSED_NOTIFICATIONS_KEY = 'proway_dismissed_notifications_v1';
const RFI_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours


function normalizeRfiRecord(rfi = {}) {
    const fallbackDate = new Date().toISOString().slice(0, 10);
    const filedDate = rfi.filed_date || rfi.filedDate || rfi.original_filed_date || rfi.originalFiledDate || fallbackDate;
    const reviewedAt = rfi.reviewed_at || rfi.reviewedAt || null;

    return {
        ...rfi,
        id: rfi.id || `cached-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        serialNo: Number.isFinite(Number(rfi.serialNo)) ? Number(rfi.serialNo) : 0,
        description: rfi.description || rfi.customFields?.description || '',
        location: rfi.location || rfi.customFields?.location || '',
        inspectionType: rfi.inspectionType || rfi.inspection_type || rfi.customFields?.inspection_type || rfi.customFields?.inspectionType || '',
        filedDate,
        originalFiledDate: rfi.original_filed_date || rfi.originalFiledDate || filedDate,
        reviewedAt,
        reviewedBy: rfi.reviewed_by || rfi.reviewedBy || null,
        assignedTo: rfi.assigned_to || rfi.assignedTo || null,
        assigneeName: rfi.assignee_name || rfi.assigneeName || null,
        status: rfi.status || RFI_STATUS.PENDING,
        images: Array.isArray(rfi.images) ? rfi.images : [],
        parentId: rfi.parent_id || rfi.parentId || rfi.customFields?.parentId || null,
        createdAt: rfi.created_at || rfi.createdAt || fallbackDate,
        customFields: rfi.custom_fields && typeof rfi.custom_fields === 'object' ? rfi.custom_fields : (rfi.customFields && typeof rfi.customFields === 'object' ? rfi.customFields : {}),
        internalReviews: Array.isArray(rfi.internalReviews) ? rfi.internalReviews : [],
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

/**
 * Converts a raw DB row (snake_case) to the app's camelCase RFI format.
 * Accepts the Supabase JOIN nested objects (r.filer, r.reviewer, r.assignee)
 * OR a flat userMap keyed by UUID — whichever is available.
 */
function formatDbRow(r, userMap = {}) {
    const filer    = r.filer    || userMap[r.filed_by]    || {};
    const reviewer = r.reviewer || userMap[r.reviewed_by] || {};
    const assignee = r.assignee || userMap[r.assigned_to] || {};
    return {
        id:                r.id,
        serialNo:          r.serial_no,
        projectId:         r.project_id,
        description:       r.description,
        location:          r.location,
        inspectionType:    r.inspection_type,
        filedBy:           r.filed_by,
        filerName:         filer.name        || '—',
        filerCompany:      filer.company     || '',
        filerAvatarUrl:    filer.avatar_url  || null,
        filedDate:         r.filed_date,
        status:            r.status,
        reviewedBy:        r.reviewed_by,
        reviewerName:      reviewer.name       || '',
        reviewerAvatarUrl: reviewer.avatar_url || null,
        reviewedAt:        r.reviewed_at,
        remarks:           r.remarks,
        carryoverCount:    r.carryover_count,
        carryoverTo:       r.carryover_to,
        images:            r.images || [],
        assignedTo:        r.assigned_to,
        assigneeName:      assignee.name       || '',
        assigneeAvatarUrl: assignee.avatar_url || null,
        parentId:          r.parent_id,
        createdAt:         r.created_at,
        customFields:      r.custom_fields || {},
        internalReviews:   r.rfi_reviews || [],
    };
}

function canUserEditRfiRecord(rfi, currentUser, activeProject, activeProjectMembership) {
    if (!rfi || !currentUser?.id) return false;
    if (currentUser.role === 'admin') return true;

    // A consultant can edit if:
    // 1. They are explicitly assigned.
    // 2. It's already been reviewed (to allow correction).
    // 3. It's unassigned.
    // 4. Project is under Open Assignment mode.
    if (currentUser.role === 'consultant') {
        if (activeProject?.assignment_mode === 'open') return true;
        if (rfi.status !== RFI_STATUS.PENDING) return true;
        if (!rfi.assignedTo) return true;
        return rfi.assignedTo === currentUser.id;
    }

    if (currentUser.role === 'contractor' && activeProjectMembership?.can_file_rfis === false) {
        return false;
    }

    // Contractor / Filer Permission: Allow editing if they filed it AND it's not yet acted upon (Pending/Info Requested)
    const isFiler = rfi.filedBy === currentUser.id;
    const isUnderReview = rfi.status === RFI_STATUS.PENDING || rfi.status === RFI_STATUS.INFO_REQUESTED;
    if (isFiler && isUnderReview) return true;

    // Fallback: If assigned to current user
    if (rfi.assignedTo) {
        return rfi.assignedTo === currentUser.id;
    }

    return isFiler;
}

function canUserViewRfiDiscussionRecord(rfi, user, activeProjectMembership) {
    if (!rfi || !user?.id) return false;
    if (user.role === 'admin') return true;

    if (user.role === 'consultant') return true;
    if (user.role === 'contractor') return Boolean(activeProjectMembership);
    return false;
}

function canUserDiscussRfiRecord(rfi, user, activeProject, activeProjectMembership) {
    if (!canUserViewRfiDiscussionRecord(rfi, user, activeProjectMembership)) return false;
    if (user.role === 'admin') return true;

    // Consultants can discuss if open assignment or if assigned/reviewed/internal reviews...
    if (user.role === 'consultant') {
        if (activeProject?.assignment_mode === 'open') return true;
        if (!rfi.assignedTo || rfi.assignedTo === user.id || rfi.reviewedBy === user.id) return true;
        if (rfi.internalReviews?.some(rev => rev.reviewer_id === user.id)) return true;
        return false;
    }

    return activeProjectMembership?.can_discuss_rfis !== false;
}

export function RFIProvider({ children }) {
    const { activeProject, projects, activeProjectMembership, contractorPermissions } = useProject();
    const { user } = useAuth();
    const [rfis, setRfis] = useState([]);
    const [loadingRfis, setLoadingRfis] = useState(true);
    const [loadingAction, setLoadingAction] = useState(false);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [minDate, setMinDate] = useState(getToday());

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
    const [dismissedIds, setDismissedIds] = useState(() => {
        try {
            const saved = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [notifications, setNotifications] = useState([]);
    const fetchingRfisRef = useRef(null);
    const fetchingNotifsRef = useRef(null);
    const fetchingConsultantsRef = useRef(null);
    const fetchingContractorsRef = useRef(null);
    const lastRfiFetchRef = useRef(0);
    // Shared profile cache for Realtime event handlers (avoids extra DB queries)
    const userMapRef = useRef({});
    // Tracks whether the Realtime WebSocket is currently connected
    const realtimeConnectedRef = useRef(false);

    
    // Derived filtered notifications
    const visibleNotifications = notifications.filter(n => !dismissedIds.includes(n.id));
    const unreadCount = visibleNotifications.filter(n => !n.is_read).length;

    const restoreRfiCache = useCallback(async (projectId) => {
        if (!projectId || !user?.id) return false;
        try {
            const cached = await getRfiCache(user.id, projectId);
            if (!cached || !cached.rfis) return false;

            // Reject stale cache — force a fresh DB fetch after 12 hours
            if (cached.cachedAt) {
                const age = Date.now() - new Date(cached.cachedAt).getTime();
                if (age > RFI_CACHE_MAX_AGE_MS) {
                    console.warn('RFI cache expired (>12 h) — forcing fresh fetch');
                    return false;
                }
            }

            const normalized = normalizeRfisArray(cached.rfis);
            if (normalized.length === 0) return false;
            setRfis(normalized);
            return true;
        } catch (error) {
            console.warn('Error restoring RFI cache from IndexedDB:', error);
            return false;
        }
    }, [user?.id]);

    const persistRfiCache = useCallback(async (projectId, nextRfis) => {
        if (!projectId || !user?.id) return;
        try {
            await setRfiCache(user.id, projectId, nextRfis || []);
        } catch (error) {
            console.warn('Error persisting RFI cache to IndexedDB:', error);
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
            return `${prefix}-${maxNum + 1}`;
        } else {
            const { data: parent, error: pError } = await supabase
                .from('rfis')
                .select('custom_fields')
                .eq('id', parentId)
                .single();
            if (pError) throw pError;

            const parentCode = parent.custom_fields?.rfi_no || `${prefix}-1`;
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
        if (!activeProject?.id) {
            setRfis([]);
            setLoadingRfis(false);
            return;
        }

        // Throttle rapid successive calls (e.g. from multiple rapid DB changes)
        const now = Date.now();
        if (now - lastRfiFetchRef.current < 2000) return;
        
        if (fetchingRfisRef.current === activeProject.id) return;
        fetchingRfisRef.current = activeProject.id;
        lastRfiFetchRef.current = now;

        const restored = await restoreRfiCache(activeProject.id);

        if (restored) {
            setLoadingRfis(false);
            if (!navigator.onLine) return;
        }

        async function performFetch(retryCount = 0) {
            try {
                // Single query with profile JOINs — eliminates the second DB round-trip
                const { data, error } = await supabase
                    .from('rfis')
                    .select(`
                        *,
                        filer:filed_by(id, name, company, avatar_url),
                        reviewer:reviewed_by(id, name, avatar_url),
                        assignee:assigned_to(id, name, avatar_url),
                        rfi_reviews(*, reviewer:reviewer_id(name, avatar_url))
                    `)
                    .eq('project_id', activeProject.id)
                    .order('serial_no', { ascending: false });

                if (error) throw error;

                // Populate the shared profile cache so Realtime handlers
                // can resolve names without any extra DB query.
                data.forEach(r => {
                    if (r.filer)    userMapRef.current[r.filed_by]    = r.filer;
                    if (r.reviewer) userMapRef.current[r.reviewed_by] = r.reviewer;
                    if (r.assignee) userMapRef.current[r.assigned_to] = r.assignee;
                });

                const formatted = data.map(r => formatDbRow(r, userMapRef.current));
                const normalized = normalizeRfisArray(formatted || []);
                setRfis(normalized);
                setMinDate(getEarliestDate(normalized));
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
                if (fetchingRfisRef.current === activeProject.id) {
                    fetchingRfisRef.current = null;
                }
                setLoadingRfis(false);
            }
        }

        performFetch();
    }, [activeProject, persistRfiCache, restoreRfiCache]);

    const fetchNotifications = useCallback(async () => {
        if (!user?.id) {
            setNotifications([]);
            return;
        }
        if (fetchingNotifsRef.current === user.id) return;
        fetchingNotifsRef.current = user.id;

        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*, rfi:rfi_id(project_id)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            
            // Filter notifications to only show those where the user is a member of the project.
            // This prevents "ghost" notifications from projects the user was removed from.
            const userProjectIds = (projects || []).map(p => p.id);
            const filteredData = (data || []).filter(n => {
                // If there's no RFI associated (shouldn't happen), keep it as a fallback
                if (!n.rfi?.project_id) return true;
                return userProjectIds.includes(n.rfi.project_id);
            });

            setNotifications(filteredData);
            setIsOffline(false);
        } catch (error) {
            console.error('Error fetching notifications:', error);
            if (navigator.onLine) {
                try {
                    await new Promise(r => setTimeout(r, 1500));
                    const { data: retryData, error: retryError } = await supabase
                        .from('notifications')
                        .select('*, rfi:rfi_id(project_id)')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(50);
                    
                    if (!retryError) {
                        const userProjectIds = (projects || []).map(p => p.id);
                        const filteredRetry = (retryData || []).filter(n => {
                            if (!n.rfi?.project_id) return true;
                            return userProjectIds.includes(n.rfi.project_id);
                        });
                        setNotifications(filteredRetry);
                    }
                } catch (retryErr) {
                    console.error('Retry error:', retryErr);
                }
            }
        } finally {
            if (fetchingNotifsRef.current === user.id) {
                fetchingNotifsRef.current = null;
            }
        }
    }, [user, projects]);

    // Fetch consultants/contractors scoped to the active project's members only
    const fetchConsultants = useCallback(async (projectId) => {
        if (!projectId) { setConsultants([]); return; }
        if (fetchingConsultantsRef.current === projectId) return;
        fetchingConsultantsRef.current = projectId;
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('profiles:user_id(id, name, company, role, avatar_url)')
                .eq('project_id', projectId)
                .eq('role', 'consultant');
            if (error) throw error;
            setConsultants((data || []).map(m => m.profiles).filter(Boolean));
        } catch (error) {
            console.error('Error fetching consultants:', error);
        } finally {
            if (fetchingConsultantsRef.current === projectId) {
                fetchingConsultantsRef.current = null;
            }
        }
    }, []);

    const fetchContractors = useCallback(async (projectId) => {
        if (!projectId) { setContractors([]); return; }
        if (fetchingContractorsRef.current === projectId) return;
        fetchingContractorsRef.current = projectId;
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('profiles:user_id(id, name, company, role, avatar_url)')
                .eq('project_id', projectId)
                .eq('role', 'contractor');
            if (error) throw error;
            setContractors((data || []).map(m => m.profiles).filter(Boolean));
        } catch (error) {
            console.error('Error fetching contractors:', error);
        } finally {
            if (fetchingContractorsRef.current === projectId) {
                fetchingContractorsRef.current = null;
            }
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


    useEffect(() => {
        if (!user) return;

        // Only sync push subscription if we have a valid Supabase session.
        // The user state may have been restored from cache before the session
        // is fully validated — firing push sync with a dead token causes 401s.
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user?.id === user.id) {
                syncPushSubscriptionForUser(user.id).catch((error) => {
                    console.error('Error syncing push subscription:', error);
                });
            }
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

        // Subscribe to Realtime RFI changes — server-side filter so ONLY
        // events for this project are delivered over the WebSocket.
        // On each event we surgically patch local state instead of
        // re-fetching the entire table.
        const rfiSubscription = supabase
            .channel(`rfis:proj:${activeProject?.id || 'none'}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'rfis',
                filter: `project_id=eq.${activeProject?.id}`,
            }, async (payload) => {
                const { eventType, new: newRow, old: oldRow } = payload;

                // ── DELETE: remove the row from state ────────────────
                if (eventType === 'DELETE') {
                    setRfis(prev => prev.filter(r => r.id !== oldRow?.id));
                    return;
                }

                if (!newRow?.id) return;

                // ── Resolve any user profiles we don't have cached yet ─
                // Usually 0 extra queries — userMapRef is warm from the
                // last full fetch.
                const neededIds = [newRow.filed_by, newRow.reviewed_by, newRow.assigned_to]
                    .filter(id => id && !userMapRef.current[id]);

                if (neededIds.length > 0) {
                    const { data: profilesData } = await supabase
                        .from('profiles')
                        .select('id, name, company, avatar_url')
                        .in('id', neededIds);
                    if (profilesData) {
                        profilesData.forEach(p => { userMapRef.current[p.id] = p; });
                    }
                }

                const normalized = normalizeRfiRecord(formatDbRow(newRow, userMapRef.current));

                // ── UPDATE: replace matching entry in state ──────────
                if (eventType === 'UPDATE') {
                    setRfis(prev => prev.map(r => r.id === normalized.id ? normalized : r));
                    return;
                }

                // ── INSERT: prepend, replacing any optimistic placeholder ─
                setRfis(prev => {
                    const exists = prev.some(r => r.id === normalized.id);
                    if (exists) return prev.map(r => r.id === normalized.id ? normalized : r);
                    // Remove any offline placeholder and prepend real record
                    const withoutPlaceholder = prev.filter(
                        r => !(r.pendingSync && r.customFields?.rfi_no === normalized.customFields?.rfi_no)
                    );
                    return [normalized, ...withoutPlaceholder];
                });
            })
            .subscribe((status) => {
                realtimeConnectedRef.current = (status === 'SUBSCRIBED');
            });

        // Notifications — still uses fetchNotifications on INSERT
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
                    if (import.meta.env.DEV) console.log('New notification:', payload);
                    toast(payload.new.title, { icon: '🔔' });
                    fetchNotifications();
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

        // Polling is now a safety-net only:
        // - If Realtime is connected → skip RFI refetch (Realtime handles it surgically)
        // - If Realtime is down → fall back to a full refetch every 5 min
        const refreshInterval = setInterval(() => {
            if (!realtimeConnectedRef.current) {
                fetchAllRFIs(); // Realtime disconnected — catch up
            }
            if (user) fetchNotifications();
            if (navigator.onLine) {
                syncPendingRFIs();
                syncPendingConsultantActions();
            }
        }, 5 * 60 * 1000); // 5 minutes (was 60 seconds)

        const handleOnline = () => {
            toast('Back online. Syncing pending work...', { icon: '🌐' });
            fetchAllRFIs(); // Catch up on changes missed while offline
            syncPendingRFIs();
            syncPendingConsultantActions();
        };
        window.addEventListener('online', handleOnline);

        // When the user switches back to this tab or reopens the PWA from the
        // background, do a fresh fetch so stale cached data is replaced immediately.
        // This covers: switching back from another app on mobile, long idle tabs,
        // and PWA resume from home screen.
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchAllRFIs();
                if (user) fetchNotifications();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);


        return () => {
            clearInterval(refreshInterval);
            window.removeEventListener('online', handleOnline);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
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

        if (user?.role === 'contractor' && contractorPermissions.canFileRfis === false) {
            throw new Error('You have view-only access for this project. Ask the lead contractor to enable RFI filing.');
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
                    description: description || customFields?.description || '',
                    location: location || customFields?.location || '',
                    inspectionType: inspectionType || customFields?.inspection_type || customFields?.inspectionType || '',
                    filedBy: effectiveFiledBy,
                    filedDate: effectiveFiledDate,
                    assignedTo: assignedTo || null,
                    images: queuedImages,
                    parentId,
                    customFields
                },
            });

            const localDateRfis = rfis.filter((r) => r.filedDate === effectiveFiledDate);
            const localSerial = localDateRfis.length > 0 ? Math.max(...localDateRfis.map((r) => r.serialNo || 0)) + 1 : 1;
            
            // Generate RFI code for offline
            const prefix = activeProject?.code || 'RR007';
            let offlineRfiNo = `${prefix}-1`;
            if (!parentId) {
                let maxB = 0;
                rfis.forEach(r => {
                    const c = r.customFields?.rfi_no;
                    if (c && c.startsWith(prefix)) {
                        const pts = c.split('-');
                        if (pts.length >= 2) {
                            // Take the LAST part as the sequence number
                            const lastPart = pts[pts.length - 1];
                            const n = parseInt(lastPart, 10);
                            if (!isNaN(n)) maxB = Math.max(maxB, n);
                        }
                    }
                });
                offlineRfiNo = `${prefix}-${maxB + 1}`;
            } else {
                const par = rfis.find(r => r.id === parentId);
                const pCode = par?.customFields?.rfi_no || `${prefix}-1`;
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
                description: description || customFields?.description || '',
                location: location || customFields?.location || '',
                inspectionType: inspectionType || customFields?.inspection_type || customFields?.inspectionType || '',
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
                assignedTo: assignedTo || null,
                parentId,
                customFields: customFields || {},
            };

            const { data: insertedData, error } = await supabase.from('rfis').insert([formatForDB(newRfiData)]).select();
            if (error) throw error;

            if (insertedData?.[0]) {
                const data = insertedData[0];

                // Populate the user map so the normalized record has correct names
                if (user) userMapRef.current[user.id] = { id: user.id, name: user.name, company: user.company, avatar_url: user.avatar_url };

                // Surgically merge the new RFI into state instead of doing a
                // full fetchAllRFIs(). This avoids the "blink" where the
                // Realtime INSERT adds the row, then fetchAllRFIs replaces the
                // entire array a moment later causing a re-render flash.
                const normalized = normalizeRfiRecord(formatDbRow(data, userMapRef.current));
                setRfis(prev => {
                    const exists = prev.some(r => r.id === normalized.id);
                    if (exists) return prev.map(r => r.id === normalized.id ? normalized : r);
                    return [normalized, ...prev];
                });

                await logAuditEvent(data.id, 'created', { description, location });
                await notifyConsultantsAboutNewRFI(data.id, data.custom_fields?.rfi_no || data.serial_no, data.location, data.filed_by, data.assigned_to);
                showNativeNotification('RFI Submitted', `RFI #${data.custom_fields?.rfi_no || data.serial_no} submitted successfully.`, data.id);
                if (assignedTo) {
                    await logAuditEvent(data.id, 'assigned', { assignee: assignedTo });
                }
            }

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

    /** Claim an RFI (Claim mode) — consultant takes ownership */
    async function claimRFI(rfiId, consultantId) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        // Prevent double-claiming
        if (targetRfi.assignedTo && targetRfi.assignedTo !== consultantId) {
            toast.error('This RFI has already been claimed by another consultant.');
            return;
        }

        try {
            const { error } = await supabase.from('rfis').update({
                assigned_to: consultantId,
            }).eq('id', rfiId);
            if (error) throw error;

            // Optimistic local update
            setRfis(prev => prev.map(r => r.id === rfiId ? {
                ...r,
                assignedTo: consultantId,
                assigneeName: user?.name || 'You',
            } : r));

            toast.success(`Claimed RFI #${targetRfi.customFields?.rfi_no || targetRfi.serialNo}`);
        } catch (error) {
            console.error("Error claiming RFI:", error);
            toast.error('Failed to claim RFI.');
        }
    }

    /** Upload Images to Storage with Auto-Compression */
    async function uploadImages(files) {
        if (!files || files.length === 0) return [];

        const uploadedUrls = [];

        for (const file of files) {
            try {
                // Apply client-side compression before upload
                const compressedFile = await compressImage(file, { maxWidth: 1920, quality: 0.75 });

                // Generate a unique filename: timestamp_random.jpg (we convert to jpeg in compressImage)
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                const filePath = `${activeProject?.id || 'general'}/${fileName}`;

                const { data, error } = await supabase.storage
                    .from('rfi-images')
                    .upload(filePath, compressedFile);

                if (error) throw error;

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('rfi-images')
                    .getPublicUrl(filePath);

                if (urlData?.publicUrl) {
                    uploadedUrls.push(urlData.publicUrl);
                }
            } catch (error) {
                console.error("Error compressing or uploading image:", error);
                
                // Fallback: If compression fails for some weird reason, try uploading original
                try {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Date.now()}_original_${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const filePath = `${activeProject?.id || 'general'}/${fileName}`;
                    
                    const { error: uploadOrigError } = await supabase.storage
                        .from('rfi-images')
                        .upload(filePath, file);
                    
                    if (uploadOrigError) throw uploadOrigError;
                    
                    const { data: urlData } = supabase.storage.from('rfi-images').getPublicUrl(filePath);
                    if (urlData?.publicUrl) uploadedUrls.push(urlData.publicUrl);
                } catch (origErr) {
                    console.error("Original upload fallback failed too:", origErr);
                }
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
                            status: payload.status || RFI_STATUS.APPROVED,
                            reviewed_by: payload.reviewedBy,
                            reviewed_at: getNowLocalISO(),
                            remarks: payload.remarks?.trim() ? payload.remarks.trim() : null,
                            carryover_to: null,
                            images: mergedImages,
                            // assigned_to: payload.assignedTo || targetRfi?.assignedTo // REMOVED: Don't overwrite consultant assignee
                        }).eq('id', payload.rfiId);
                        if (error) throw error;

                        if (targetRfi) {
                            await notifyContractorAboutStatusChange(targetRfi, payload.status || RFI_STATUS.APPROVED, payload.remarks, payload.assignedTo);
                        }
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
                            reviewed_at: getNowLocalISO(),
                            remarks: payload.remarks || null,
                            images: mergedImages,
                            // assigned_to: payload.assignedTo || targetRfi?.assignedTo // REMOVED: Don't overwrite consultant assignee
                        }).eq('id', payload.rfiId);
                        if (error) throw error;

                        if (targetRfi) {
                            await notifyContractorAboutStatusChange(targetRfi, RFI_STATUS.REJECTED, payload.remarks, payload.assignedTo);
                        }
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

    /** Internal Helper: Log a review in rfi_reviews table */
    async function logInternalReview(rfiId, statusRecommendation, remarks, images = []) {
        if (!user?.id) return null;
        try {
            const { data, error } = await supabase.from('rfi_reviews').insert([{
                rfi_id: rfiId,
                reviewer_id: user.id,
                status_recommendation: statusRecommendation,
                remarks: remarks,
                images: images
            }]).select('*, reviewer:reviewer_id(name, avatar_url)').single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error logging internal review:', error);
            return null;
        }
    }

    /** Submit an Internal Consultant Review */
    async function submitInternalReview(rfiId, statusRecommendation, remarks, images = []) {
        if (!user?.id || !activeProject?.id) throw new Error("Missing auth/project context");

        setLoadingAction(true);
        try {
            const data = await logInternalReview(rfiId, statusRecommendation, remarks, images);
            if (!data) throw new Error("Failed to log review");

            const targetRfi = rfis.find(r => r.id === rfiId);
            if (targetRfi) {
                // Progressive Notification: Notify the contractor that a review has been added
                const rfiNo = targetRfi.customFields?.rfi_no || targetRfi.serialNo || '—';
                let displayRec = statusRecommendation === 'conditional_approve' ? 'Conditionally Approved' : statusRecommendation.toUpperCase();
                
                // We reuse createNotification for the filer
                if (targetRfi.filedBy && targetRfi.filedBy !== user.id) {
                    await createNotification(
                        targetRfi.filedBy,
                        `New Review Added: #${rfiNo}`,
                        `${user.name} has submitted a review: ${displayRec}. View current progress in the Review tab.`,
                        rfiId
                    );
                }
            }

            setRfis(prev => prev.map(r => {
                if (r.id === rfiId) {
                    return { ...r, internalReviews: [...(r.internalReviews || []), data] };
                }
                return r;
            }));

            toast.success("Feedback submitted successfully.");
            return true;
        } catch (error) {
            console.error('Error submitting internal review:', error);
            toast.error("Failed to submit feedback.");
            return false;
        } finally {
            setLoadingAction(false);
        }
    }

    /** Approve an RFI */
    async function approveRFI(rfiId, reviewedBy, remarks = '', consultantAttachments = [], assignedTo = null, isFinal = true, mode = 'full') {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        if (!canUserEditRfiRecord(targetRfi, user, activeProject, activeProjectMembership)) {
            toast.error('This RFI is assigned to another reviewer. You can only view it.');
            return;
        }

        const newStatus = mode === 'conditional' ? RFI_STATUS.CONDITIONAL_APPROVE : RFI_STATUS.APPROVED;

        // --- NEW COLLABORATIVE LOGIC ---
        if (!isFinal) {
            let imageUrls = [];
            if (consultantAttachments.length > 0) {
                try {
                    imageUrls = await normalizeImagesForSubmission(consultantAttachments);
                } catch (e) { console.error("Error uploading reco photos:", e); }
            }
            
            const success = await submitInternalReview(rfiId, mode === 'conditional' ? 'conditional_approve' : 'approved', remarks, imageUrls);
            if (success) {
                // We no longer append intermediate images to the main RFI record.
                // They stay in the rfi_reviews table for specific attribution.
                await fetchAllRFIs(); 
            }
            return;
        }
        // -------------------------------

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
                    assignedTo
                },
            });

            setRfis((prev) => prev.map((r) => (
                r.id === rfiId
                    ? {
                        ...r,
                        status: newStatus,
                        reviewedBy,
                        reviewedAt: getNowLocalISO(),
                        remarks: remarks?.trim() ? remarks.trim() : null,
                        assignedTo: assignedTo || r.assignedTo
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
                status: newStatus,
                reviewed_by: reviewedBy,
                reviewed_at: getNowLocalISO(),
                remarks: remarks?.trim() ? remarks.trim() : null,
                carryover_to: null,
                images: mergedImages,
            }).eq('id', rfiId);
            if (error) throw error;

            await notifyContractorAboutStatusChange(targetRfi, newStatus, remarks, assignedTo);

            await logAuditEvent(rfiId, mode === 'conditional' ? 'conditional_approve' : 'approved', {
                remarks: remarks?.trim() || null,
                attachmentsAdded: (consultantAttachments || []).length,
                isFinal: true
            });
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error approving RFI:", error);
        }
    }

    /** Reject an RFI with remarks */
    async function rejectRFI(rfiId, reviewedBy, remarks, consultantAttachments = [], assignedTo = null, isFinal = true) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        if (!canUserEditRfiRecord(targetRfi, user, activeProject, activeProjectMembership)) {
            toast.error('This RFI is assigned to another reviewer. You can only view it.');
            return;
        }

        // --- NEW COLLABORATIVE LOGIC ---
        if (!isFinal) {
            let imageUrls = [];
            if (consultantAttachments.length > 0) {
                try {
                    imageUrls = await normalizeImagesForSubmission(consultantAttachments);
                } catch (e) { console.error("Error uploading reco photos:", e); }
            }
            const success = await submitInternalReview(rfiId, 'rejected', remarks, imageUrls);
            if (success) await fetchAllRFIs();
            return;
        }
        // -------------------------------

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
                        reviewedAt: getNowLocalISO(),
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
                reviewed_at: getNowLocalISO(),
                remarks: remarks,
                images: mergedImages,
                // assigned_to: assignedTo || targetRfi.assignedTo // REMOVED: Don't overwrite consultant assignee
            }).eq('id', rfiId);
            if (error) throw error;

            await notifyContractorAboutStatusChange(targetRfi, RFI_STATUS.REJECTED, remarks, assignedTo);
            await logAuditEvent(rfiId, 'rejected', { remarks });
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error rejecting RFI:", error);
        }
    }

    /** Cancel an RFI with mandatory reason */
    async function cancelRFI(rfiId, reviewedBy, reason, assignedTo = null, isFinal = true) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        if (!canUserEditRfiRecord(targetRfi, user, activeProject, activeProjectMembership)) {
            toast.error('This RFI is assigned to another reviewer. You can only view it.');
            return;
        }

        // --- NEW COLLABORATIVE LOGIC ---
        if (!isFinal) {
            return await submitInternalReview(rfiId, 'cancelled', reason);
        }
        // -------------------------------

        if (!navigator.onLine) {
            await enqueuePendingAction({
                projectId: activeProject?.id,
                type: 'update_rfi',
                payload: {
                    rfiId,
                    dbUpdates: {
                        status: RFI_STATUS.CANCELLED,
                        reviewed_by: reviewedBy,
                        reviewed_at: getNowLocalISO(),
                        remarks: reason,
                        assigned_to: assignedTo || targetRfi.assignedTo,
                    }
                },
            });

            setRfis((prev) => prev.map((r) => (
                r.id === rfiId
                    ? {
                        ...r,
                        status: RFI_STATUS.CANCELLED,
                        reviewedBy,
                        reviewedAt: getNowLocalISO(),
                        remarks: reason,
                        assignedTo: assignedTo || r.assignedTo
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
                reviewed_at: getNowLocalISO(),
                remarks: reason,
                // assigned_to: assignedTo || targetRfi.assignedTo // REMOVED: Don't overwrite consultant assignee
            }).eq('id', rfiId);
            
            if (error) throw error;

            await notifyContractorAboutStatusChange(targetRfi, RFI_STATUS.CANCELLED, reason, assignedTo);
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
                    reviewed_at: getNowLocalISO(),
                    remarks: null,
                    carryover_to: null,
                })
                .in('id', rfiIds);

            if (error) throw error;

            // Notify all contractors involved
            const targetRfis = rfis.filter(r => rfiIds.includes(r.id));
            for (const rfi of targetRfis) {
                await notifyContractorAboutStatusChange(rfi, RFI_STATUS.APPROVED, 'Approved via bulk operation.');
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
            if (targetRfi && !canUserViewRfiDiscussionRecord(targetRfi, user, activeProjectMembership)) {
                return [];
            }

            const { data, error } = await supabase
                .from('comments')
                .select(`
                    id,
                    content,
                    created_at,
                    user_id,
                    profiles (name, role, company, avatar_url)
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
                userAvatarUrl: c.profiles?.avatar_url || null,
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

        if (!canUserDiscussRfiRecord(targetRfi, user, activeProject, activeProjectMembership)) {
            throw new Error('You have view-only discussion access on this project.');
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
            if (targetRfi && !canUserDiscussRfiRecord(targetRfi, user, activeProject, activeProjectMembership)) {
                throw new Error('You have view-only discussion access on this project.');
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
            if (targetRfi && !canUserDiscussRfiRecord(targetRfi, user, activeProject, activeProjectMembership)) {
                throw new Error('You have view-only discussion access on this project.');
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
            if (current && !canUserEditRfiRecord(current, user, activeProject, activeProjectMembership)) {
                toast.error('You do not have edit rights for this RFI in the current project.');
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
            if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
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
                        assignedTo: updates.assignedTo !== undefined ? updates.assignedTo : r.assignedTo,
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

            // --- Notification Trigger Logic (if status changed) ---
            const statusChangedForNotification = updates.status && updates.status !== current?.status;
            if (statusChangedForNotification) {
                await notifyContractorAboutStatusChange(current, updates.status, updates.remarks || '');
            }

            await logAuditEvent(rfiId, 'updated', { 
                updates: Object.keys(dbUpdates),
                statusChanged: statusChangedForNotification ? updates.status : null 
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
        const realToday = getToday();
        const pending = rfis.filter(
            (rfi) => 
                rfi.status === RFI_STATUS.PENDING && 
                (rfi.filedDate || '') <= targetDate &&
                targetDate <= realToday
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
            todayApproved: activeTodayAll.filter((r) => r.status === RFI_STATUS.APPROVED).length,
            todayConditionallyApproved: activeTodayAll.filter((r) => r.status === RFI_STATUS.CONDITIONAL_APPROVE).length,
            todayRejected: activeTodayAll.filter((r) => r.status === RFI_STATUS.REJECTED).length,
            todayInfoRequested: activeTodayAll.filter((r) => r.status === RFI_STATUS.INFO_REQUESTED).length,
            todayCancelled: activeTodayAll.filter((r) => r.status === RFI_STATUS.CANCELLED).length,

            queueTotal: queue.length, 
            reviewedApprovedToday: reviewedToday.filter(r => r.status === RFI_STATUS.APPROVED).length,
            reviewedConditionallyApprovedToday: reviewedToday.filter(r => r.status === RFI_STATUS.CONDITIONAL_APPROVE).length,
            reviewedRejectedToday: reviewedToday.filter(r => r.status === RFI_STATUS.REJECTED).length,

            overallTotal: activeRfis.length,
            overallPending: activeRfis.filter((r) => r.status === RFI_STATUS.PENDING).length,
            overallApproved: activeRfis.filter((r) => r.status === RFI_STATUS.APPROVED).length,
            overallConditionallyApproved: activeRfis.filter((r) => r.status === RFI_STATUS.CONDITIONAL_APPROVE).length,
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
            setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
            await fetchNotifications();
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
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            await fetchNotifications();
        } catch (error) {
            console.error("Error marking all notifications read:", error);
        }
    }

    async function deleteNotification(notifId) {
        // Individual "Soft Delete" due to RLS backend block
        const nextDismissed = [...new Set([...dismissedIds, notifId])];
        setDismissedIds(nextDismissed);
        localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(nextDismissed));
        toast.success("Notification cleared");
    }

    async function deleteAllNotifications() {
        if (visibleNotifications.length === 0) return;
        
        // Final "Global Clear" workaround: Blacklist all current IDs
        const newIds = visibleNotifications.map(n => n.id);
        const nextDismissed = [...new Set([...dismissedIds, ...newIds])].slice(-200); // Keep last 200 for perf
        
        setDismissedIds(nextDismissed);
        localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(nextDismissed));
        toast.success("All notifications cleared from this device");
        
        // We still attempt a background mark-as-read so the badge counts on other devices are lower
        supabase.from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false)
            .then(() => { /* silent success */ });
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

    /**
     * Centralized helper to notify the contractor (and tagged users) about a status change.
     */
    async function notifyContractorAboutStatusChange(rfi, newStatus, remarks = '', notifyTo = null) {
        if (!rfi || !newStatus) return;

        const rfiNo = rfi.customFields?.rfi_no || rfi.serialNo || '—';
        let displayStatus = 'Updated';

        switch (newStatus) {
            case RFI_STATUS.APPROVED: displayStatus = 'Approved'; break;
            case RFI_STATUS.REJECTED: displayStatus = 'Rejected'; break;
            case RFI_STATUS.CONDITIONAL_APPROVE: displayStatus = 'Conditionally Approved'; break;
            case RFI_STATUS.INFO_REQUESTED: displayStatus = 'Revision Required'; break;
            case RFI_STATUS.CANCELLED: displayStatus = 'Cancelled'; break;
        }

        // 1. Calculate Target Users based on the notification rule
        const targetUserIds = new Set();
        const notificationRule = activeProject?.contractor_notification_rule || 'all';

        if (notificationRule === 'all') {
            // Send to ALL contractors on this project
            contractors.forEach(c => targetUserIds.add(c.id));
        } else {
            // 'filer_only' — restrict to filer
            if (rfi.filedBy) targetUserIds.add(rfi.filedBy);
        }

        // Extremely critical: Never let the person pushing the button notify themselves
        if (targetUserIds.has(user?.id)) targetUserIds.delete(user?.id);

        for (const targetUserId of targetUserIds) {
            await createNotification(
                targetUserId,
                `RFI ${displayStatus}: #${rfiNo}`,
                `Remarks: ${remarks?.trim() || 'No additional remarks.'}`,
                rfi.id
            );
        }

        // 2. Handle Tags/Mentions
        const mentionMatches = (remarks || '').match(/@([a-z0-9._-]+)/gi) || [];
        const mentionKeys = new Set(mentionMatches.map((m) => m.slice(1).toLowerCase()));

        if (mentionKeys.size > 0) {
            const allMembers = [...contractors, ...consultants];
            const taggedMembers = allMembers.filter((m) =>
                mentionKeys.has(m.name.toLowerCase().replace(/\s+/g, ''))
            );

            for (const tagged of taggedMembers) {
                // Don't notify the filer twice, and don't notify the person taking the action (current user)
                if (tagged.id !== targetUserId && tagged.id !== user?.id) {
                    await createNotification(
                        tagged.id,
                        `RFI ${displayStatus}: #${rfiNo} (TAG)`,
                        `Remarks: ${remarks.trim()}`,
                        rfi.id
                    );
                }
            }
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
                activeProject,
                loadingRfis,
                loadingAction,
                pendingSyncCount,
                lastSyncTime,
                isOffline,
                consultants,
                contractors,
                minDate,
                notifications: visibleNotifications,
                unreadCount,
                uploadImages,
                createRFI,
                assignRFI,
                claimRFI,
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
                submitInternalReview,
                canUserEditRfi: (rfi) => canUserEditRfiRecord(rfi, user, activeProject, activeProjectMembership),
                canUserViewDiscussion: (rfi) => canUserViewRfiDiscussionRecord(rfi, user, activeProjectMembership),
                canUserDiscussRfi: (rfi) => canUserDiscussRfiRecord(rfi, user, activeProject, activeProjectMembership),
                markNotificationRead,
                markAllNotificationsRead,
                deleteNotification,
                deleteAllNotifications,
                createNotification
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

