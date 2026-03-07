import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import toast from 'react-hot-toast';
import { useProject } from './ProjectContext';
import { getToday, getNextDay } from '../utils/rfiLogic';
import { RFI_STATUS } from '../utils/constants';

const RFIContext = createContext(null);

export function RFIProvider({ children }) {
    const { activeProject } = useProject();
    const [rfis, setRfis] = useState([]);
    const [loadingRfis, setLoadingRfis] = useState(true);

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
            // Convert snake_case from PG to camelCase for the frontend
            const formatted = data.map(r => ({
                id: r.id,
                serialNo: r.serial_no,
                description: r.description,
                location: r.location,
                inspectionType: r.inspection_type,
                filedBy: r.filed_by,
                filedDate: r.filed_date,
                originalFiledDate: r.original_filed_date,
                status: r.status,
                reviewedBy: r.reviewed_by,
                reviewedAt: r.reviewed_at,
                remarks: r.remarks,
                carryoverCount: r.carryover_count,
                carryoverTo: r.carryover_to,
                images: r.images || [],
                createdAt: r.created_at
            }));
            setRfis(formatted || []);
        } catch (error) {
            console.error('Error fetching RFIs:', error);
        } finally {
            setLoadingRfis(false);
        }
    }, [activeProject]);

    useEffect(() => {
        fetchAllRFIs();

        // Subscribe to real-time changes
        const subscription = supabase
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

        return () => supabase.removeChannel(subscription);
    }, [fetchAllRFIs]);

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
        project_id: activeProject?.id,
    });

    /** Create a new RFI */
    async function createRFI({ description, location, inspectionType, filedBy, filedDate, images }) {
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
        };

        try {
            const { error } = await supabase.from('rfis').insert([formatForDB(newRfiData)]);
            if (error) throw error;
            // State will update via real-time subscription
        } catch (error) {
            console.error("Error creating RFI:", error);
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
        try {
            const { error } = await supabase.from('rfis').update({
                status: RFI_STATUS.APPROVED,
                reviewed_by: reviewedBy,
                reviewed_at: new Date().toISOString(),
                remarks: null,
                carryover_to: null,
            }).eq('id', rfiId);
            if (error) throw error;
        } catch (error) {
            console.error("Error approving RFI:", error);
        }
    }

    /** Reject an RFI with remarks, and set carryover to next day */
    async function rejectRFI(rfiId, reviewedBy, remarks) {
        const today = getToday();
        const nextDay = getNextDay(today);

        const targetRfi = rfis.find(r => r.id === rfiId);
        if (!targetRfi) return;

        try {
            const { error } = await supabase.from('rfis').update({
                status: RFI_STATUS.REJECTED,
                reviewed_by: reviewedBy,
                reviewed_at: new Date().toISOString(),
                remarks: remarks,
                carryover_count: targetRfi.carryoverCount + 1,
                carryover_to: nextDay,
            }).eq('id', rfiId);
            if (error) throw error;
        } catch (error) {
            console.error("Error rejecting RFI:", error);
        }
    }

    /** Re-submit a rejected/carried-over RFI (reset to pending for current day) */
    async function resubmitRFI(rfiId, newDate) {
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
        } catch (error) {
            console.error("Error resubmitting RFI:", error);
        }
    }

    /** Delete an RFI */
    async function deleteRFI(rfiId) {
        try {
            const { error } = await supabase.from('rfis').delete().eq('id', rfiId);
            if (error) throw error;
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
                rfi.carryoverTo === targetDate
        );
        return {
            carriedOver: carriedOver.sort((a, b) => a.serialNo - b.serialNo),
            newRfis: todaysRfis.sort((a, b) => a.serialNo - b.serialNo),
            all: [...carriedOver, ...todaysRfis],
        };
    }

    /** Get all pending + rejected-carryover RFIs for consultant review (Sync from local state array) */
    function getReviewQueue(targetDate) {
        const pending = rfis.filter(
            (rfi) => rfi.status === RFI_STATUS.PENDING && rfi.filedDate <= targetDate
        );
        const carriedOver = rfis.filter(
            (rfi) =>
                rfi.status === RFI_STATUS.REJECTED &&
                rfi.carryoverTo === targetDate &&
                rfi.filedDate < targetDate
        );
        return {
            carriedOver: carriedOver.sort((a, b) => a.originalFiledDate.localeCompare(b.originalFiledDate)),
            pending: pending.sort((a, b) => a.filedDate.localeCompare(b.filedDate) || a.serialNo - b.serialNo),
            all: [...carriedOver, ...pending],
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

    return (
        <RFIContext.Provider
            value={{
                rfis,
                loadingRfis,
                uploadImages,
                createRFI,
                approveRFI,
                rejectRFI,
                resubmitRFI,
                deleteRFI,
                updateRFI,
                getRFIsForDate,
                getReviewQueue,
                getStats,
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
