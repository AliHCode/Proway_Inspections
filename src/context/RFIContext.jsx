import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';
import { useProject } from './ProjectContext';
import { useAuth } from './AuthContext';
import { getToday, getNextDay } from '../utils/rfiLogic';
import { RFI_STATUS } from '../utils/constants';

const RFIContext = createContext(null);

export function RFIProvider({ children }) {
    const { activeProject } = useProject();
    const { user } = useAuth();
    const [rfis, setRfis] = useState([]);
    const [loadingRfis, setLoadingRfis] = useState(true);

    // Consultants list for Direct Assign
    const [consultants, setConsultants] = useState([]);
    const [contractors, setContractors] = useState([]);

    // Notifications State
    const [notifications, setNotifications] = useState([]);
    const unreadCount = notifications.filter(n => !n.is_read).length;

    const fetchAllRFIs = useCallback(async () => {
        if (!activeProject) {
            setRfis([]);
            setLoadingRfis(false);
            return;
        }

        setLoadingRfis(true);
        try {
            const { data, error } = await supabase
                .from('rfis')
                .select('*')
                .eq('project_id', activeProject.id);

            if (error) throw error;

            // Collect all unique user IDs to fetch their profiles
            const userIds = new Set();
            data.forEach(r => {
                if (r.filed_by) userIds.add(r.filed_by);
                if (r.reviewed_by) userIds.add(r.reviewed_by);
                if (r.assigned_to) userIds.add(r.assigned_to);
            });

            // Fetch names for these users
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

            // Convert snake_case from PG to camelCase for the frontend
            const formatted = data.map(r => ({
                id: r.id,
                serialNo: r.serial_no,
                description: r.description,
                location: r.location,
                inspectionType: r.inspection_type,
                filedBy: r.filed_by,
                filerName: userMap[r.filed_by]?.name || 'Unknown',
                filerCompany: userMap[r.filed_by]?.company || '',
                filedDate: r.filed_date,
                originalFiledDate: r.original_filed_date,
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
                createdAt: r.created_at
            }));
            setRfis(formatted || []);
        } catch (error) {
            console.error('Error fetching RFIs:', error);
        } finally {
            setLoadingRfis(false);
        }
    }, [activeProject]);

    const fetchNotifications = useCallback(async () => {
        if (!user) {
            setNotifications([]);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50); // Keep it recent

            if (error) throw error;
            setNotifications(data || []);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }, [user]);

    // Fetch consultants for Direct Assign dropdown
    const fetchConsultants = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, name, company, role')
                .eq('role', 'consultant')
                .order('name');

            if (error) throw error;
            setConsultants(data || []);
        } catch (error) {
            console.error('Error fetching consultants:', error);
        }
    }, []);

    const fetchContractors = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, name, company, role')
                .eq('role', 'contractor')
                .order('name');

            if (error) throw error;
            setContractors(data || []);
        } catch (error) {
            console.error('Error fetching contractors:', error);
        }
    }, []);

    useEffect(() => {
        fetchAllRFIs();
        fetchConsultants();
        fetchContractors();
        if (user) {
            fetchNotifications();
        }

        // Subscribe to real-time changes for RFIs
        const rfiSubscription = supabase
            .channel('public:rfis')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rfis' }, payload => {
                console.log('Real-time RFI update:', payload);
                if (payload.eventType === 'INSERT') {
                    toast.success('New RFI submitted on this project!');
                } else if (payload.eventType === 'UPDATE') {
                    toast('An RFI was updated', { icon: '🔄' });
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
                })
                .subscribe();
        }

        const refreshInterval = setInterval(() => {
            fetchAllRFIs();
            if (user) fetchNotifications();
        }, 15000);

        return () => {
            clearInterval(refreshInterval);
            supabase.removeChannel(rfiSubscription);
            if (notifSubscription) supabase.removeChannel(notifSubscription);
        };
    }, [fetchAllRFIs, fetchConsultants, fetchContractors, fetchNotifications, user]);

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
        project_id: activeProject?.id,
    });

    /** Create a new RFI */
    async function createRFI({ description, location, inspectionType, filedBy, filedDate, images, assignedTo }) {
        if (!activeProject?.id) {
            throw new Error('No active project selected.');
        }

        const dateRfis = rfis.filter((r) => r.filedDate === filedDate);
        const serialNo = dateRfis.length > 0 ? Math.max(...dateRfis.map((r) => r.serialNo)) + 1 : 1;

        const newRfiData = {
            serialNo,
            description,
            location,
            inspectionType,
            filedBy,
            filedDate,
            originalFiledDate: filedDate,
            status: RFI_STATUS.PENDING,
            reviewedBy: null,
            reviewedAt: null,
            remarks: null,
            carryoverCount: 0,
            carryoverTo: null,
            images: images || [],
            assignedTo: assignedTo || null,
        };

        try {
            const { data: insertedData, error } = await supabase.from('rfis').insert([formatForDB(newRfiData)]).select();
            if (error) throw error;

            // Audit log
            if (insertedData?.[0]) {
                await logAuditEvent(insertedData[0].id, 'created', { description, location });
            }

            // Notify the assigned consultant
            if (assignedTo && insertedData?.[0]) {
                await createNotification(
                    assignedTo,
                    "RFI Assigned to You 📌",
                    `A new RFI (#${serialNo}) at ${location} has been assigned to you.`,
                    insertedData[0].id
                );
                await logAuditEvent(insertedData[0].id, 'assigned', { assignee: assignedTo });
            }
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error creating RFI:", error);
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
                    "RFI Assigned to You 📌",
                    `RFI #${targetRfi.serialNo} at ${targetRfi.location} has been assigned to you for review.`,
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

    /** Approve an RFI */
    async function approveRFI(rfiId, reviewedBy) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        try {
            const { error } = await supabase.from('rfis').update({
                status: RFI_STATUS.APPROVED,
                reviewed_by: reviewedBy,
                reviewed_at: new Date().toISOString(),
                remarks: null,
                carryover_to: null,
            }).eq('id', rfiId);
            if (error) throw error;

            // Notify Contractor
            await createNotification(
                targetRfi.filedBy,
                "RFI Approved ✅",
                `Your RFI #${targetRfi.serialNo} for ${targetRfi.location} was approved.`,
                rfiId
            );
            await logAuditEvent(rfiId, 'approved');
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error approving RFI:", error);
        }
    }

    /** Reject an RFI with remarks, and set carryover to next day */
    async function rejectRFI(rfiId, reviewedBy, remarks, consultantAttachments = []) {
        const today = getToday();
        const nextDay = getNextDay(today);

        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        try {
            const mergedImages = [
                ...(targetRfi.images || []),
                ...(consultantAttachments || []),
            ];
            const { error } = await supabase.from('rfis').update({
                status: RFI_STATUS.REJECTED,
                reviewed_by: reviewedBy,
                reviewed_at: new Date().toISOString(),
                remarks: remarks,
                images: mergedImages,
            }).eq('id', rfiId);
            if (error) throw error;

            // Notify Contractor
            await createNotification(
                targetRfi.filedBy,
                "RFI Rejected ❌",
                `Your RFI #${targetRfi.serialNo} was rejected. Remarks: ${remarks}`,
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
                        "Tagged in Rejection Remarks",
                        `You were tagged on RFI #${targetRfi.serialNo}: ${remarks}`,
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

    /** Request Info on an RFI (Kicks back to contractor without formal rejection) */
    async function requestInfo(rfiId, reviewedBy, remarks) {
        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        try {
            const { error } = await supabase.from('rfis').update({
                status: RFI_STATUS.INFO_REQUESTED,
                reviewed_by: reviewedBy,
                reviewed_at: new Date().toISOString(),
                remarks: remarks,
            }).eq('id', rfiId);
            if (error) throw error;

            // Notify Contractor
            await createNotification(
                targetRfi.filedBy,
                "Info Requested ⚠️",
                `Consultant requested info on RFI #${targetRfi.serialNo}: ${remarks}`,
                rfiId
            );
            await logAuditEvent(rfiId, 'info_requested', { remarks });
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error requesting info on RFI:", error);
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
                    "RFI Resubmitted 🔄",
                    `Contractor resubmitted RFI #${targetRfi.serialNo} for review.`,
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

    async function addComment(rfiId, content) {
        if (!user) return;

        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        try {
            const { error } = await supabase.from('comments').insert([{
                rfi_id: rfiId,
                user_id: user.id,
                content: content
            }]);

            if (error) throw error;

            // Notify the other party
            // If the commenter is the contractor who filed it, notify the reviewer (if assigned/reviewed)
            // If the commenter is the consultant, notify the contractor
            const isFiler = user.id === targetRfi.filedBy;
            const targetUserId = isFiler ? targetRfi.reviewedBy : targetRfi.filedBy;

            if (targetUserId && targetUserId !== user.id) {
                await createNotification(
                    targetUserId,
                    "New Message 💬",
                    `New message on RFI #${targetRfi.serialNo} from ${user.name}`,
                    rfiId
                );
            }

            await logAuditEvent(rfiId, 'commented', { content });
        } catch (error) {
            console.error("Error adding comment:", error);
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
            // Need to convert keys to snake case for db
            const dbUpdates = {};
            if (updates.description !== undefined) dbUpdates.description = updates.description;
            if (updates.location !== undefined) dbUpdates.location = updates.location;
            if (updates.inspectionType !== undefined) dbUpdates.inspection_type = updates.inspectionType;
            if (updates.images !== undefined) dbUpdates.images = updates.images;

            const { error } = await supabase.from('rfis').update(dbUpdates).eq('id', rfiId);
            if (error) throw error;
            await fetchAllRFIs();
        } catch (error) {
            console.error("Error updating RFI:", error);
        }
    }

    /** Get RFIs for a specific date with carryover logic (Sync from local state array) */
    function getRFIsForDate(targetDate) {
        const todaysRfis = rfis.filter((rfi) => rfi.filedDate === targetDate);
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
            (rfi) => rfi.status === RFI_STATUS.PENDING && rfi.filedDate <= targetDate
        );

        const sortQueue = (a, b) => {
            // Older content first
            if (a.filedDate !== b.filedDate) {
                return a.filedDate.localeCompare(b.filedDate);
            }
            return a.serialNo - b.serialNo;
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
        const { all } = getRFIsForDate(targetDate);
        const queue = getReviewQueue(targetDate).all;
        const reviewedToday = rfis.filter(r => r.reviewedAt && r.reviewedAt.startsWith(targetDate));

        return {
            todayTotal: all.length,
            todayPending: all.filter((r) => r.status === RFI_STATUS.PENDING).length,
            todayApproved: all.filter((r) => r.status === RFI_STATUS.APPROVED).length,
            todayRejected: all.filter((r) => r.status === RFI_STATUS.REJECTED).length,

            queueTotal: queue.length,
            reviewedApprovedToday: reviewedToday.filter(r => r.status === RFI_STATUS.APPROVED).length,
            reviewedRejectedToday: reviewedToday.filter(r => r.status === RFI_STATUS.REJECTED).length,

            overallTotal: rfis.length,
            overallPending: rfis.filter((r) => r.status === RFI_STATUS.PENDING).length,
            overallApproved: rfis.filter((r) => r.status === RFI_STATUS.APPROVED).length,
            overallRejected: rfis.filter((r) => r.status === RFI_STATUS.REJECTED).length,
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
    async function createNotification(userId, title, message, rfiId = null) {
        try {
            await supabase.from('notifications').insert([{
                user_id: userId,
                title,
                message,
                rfi_id: rfiId
            }]);
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
                uploadImages,
                createRFI,
                assignRFI,
                approveRFI,
                rejectRFI,
                requestInfo,
                resubmitRFI,
                deleteRFI,
                updateRFI,
                getRFIsForDate,
                getReviewQueue,
                getStats,
                fetchComments,
                addComment,
                markNotificationRead,
                markAllNotificationsRead,
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

