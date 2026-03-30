import { RFI_STATUS } from './constants';

/**
 * Generate a unique ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Format a date to YYYY-MM-DD (Local Time)
 */
export function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format a date for display (e.g., "March 7, 2026")
 */
export function formatDateDisplay(dateStr) {
    if (!dateStr) return '—';
    // Use the T00:00:00 suffix to ensure the date is treaty as local/specified date not UTC
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

/**
 * Get today's date as YYYY-MM-DD (Local Time)
 */
export function getToday() {
    return formatDate(new Date());
}

/**
 * Get current time as a local ISO-like string (YYYY-MM-DDTHH:mm:ss.sss)
 * This avoids UTC date-shifting in GMT+ formats.
 */
export function getNowLocalISO() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, -1);
}

/**
 * Get the previous day
 */
export function getPreviousDay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return formatDate(d);
}

/**
 * Get the next day
 */
export function getNextDay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return formatDate(d);
}

/**
 * Get the RFIs for a specific date, including carryover rejected RFIs
 * Carryover logic: Any RFI that was rejected on a previous day
 * and has not been re-approved should appear at the top of the current day's list.
 */
export function getRFIsForDate(allRfis, targetDate) {
    // Get RFIs originally filed on this date
    const todaysRfis = allRfis.filter(
        (rfi) => rfi.filedDate === targetDate
    );

    // Get carried-over RFIs: rejected or info_requested before this date and not yet approved
    const carriedOver = allRfis.filter(
        (rfi) =>
            (rfi.status === RFI_STATUS.REJECTED || rfi.status === RFI_STATUS.INFO_REQUESTED) &&
            rfi.filedDate < targetDate &&
            rfi.carryoverTo === targetDate
    );

    return {
        carriedOver: carriedOver.sort((a, b) => a.serialNo - b.serialNo),
        newRfis: todaysRfis.sort((a, b) => a.serialNo - b.serialNo),
        all: [...carriedOver, ...todaysRfis].sort((a, b) => {
            // Carried over first, then by serial number
            if (a.filedDate !== targetDate && b.filedDate === targetDate) return -1;
            if (a.filedDate === targetDate && b.filedDate !== targetDate) return 1;
            return a.serialNo - b.serialNo;
        }),
    };
}

/**
 * Get stats for a specific date
 */
export function getStatsForDate(allRfis, targetDate) {
    const { all } = getRFIsForDate(allRfis, targetDate);
    return {
        total: all.length,
        pending: all.filter((r) => r.status === RFI_STATUS.PENDING || r.status === RFI_STATUS.VERIFICATION_PENDING).length,
        approved: all.filter((r) => r.status === RFI_STATUS.APPROVED).length,
        rejected: all.filter((r) => r.status === RFI_STATUS.REJECTED).length,
        infoRequested: all.filter((r) => r.status === RFI_STATUS.INFO_REQUESTED).length,
    };
}

/**
 * Get all pending RFIs for consultant review (across all dates up to targetDate)
 */
export function getPendingRFIs(allRfis, targetDate) {
    const realToday = getToday();
    return allRfis
        .filter(
            (rfi) =>
                (rfi.status === RFI_STATUS.PENDING || rfi.status === RFI_STATUS.VERIFICATION_PENDING) && 
                rfi.filedDate <= targetDate &&
                targetDate <= realToday
        )
        .sort((a, b) => {
            // Older first (carryovers surface)
            if (a.filedDate !== b.filedDate) return a.filedDate.localeCompare(b.filedDate);
            return a.serialNo - b.serialNo;
        });
}

/**
 * Get all RFIs that need consultant review: pending + rejected needing re-review
 */
export function getReviewQueue(allRfis, targetDate) {
    const realToday = getToday();
    
    // Rejected/Info carryovers for today
    const carriedOver = allRfis.filter(
        (rfi) =>
            (rfi.status === RFI_STATUS.REJECTED || rfi.status === RFI_STATUS.INFO_REQUESTED) &&
            rfi.carryoverTo === targetDate
    );

    // Pending RFIs for today (only if targetDate is the actual present day)
    const pending = allRfis.filter(
        (rfi) =>
            (rfi.status === RFI_STATUS.PENDING || rfi.status === RFI_STATUS.VERIFICATION_PENDING) &&
            rfi.filedDate <= targetDate &&
            targetDate === realToday
    );

    return {
        carriedOver,
        pending,
        all: [...carriedOver, ...pending],
    };
}

/**
 * Calculate overall stats
 */
export function getOverallStats(allRfis) {
    return {
        total: allRfis.length,
        pending: allRfis.filter((r) => r.status === RFI_STATUS.PENDING || r.status === RFI_STATUS.VERIFICATION_PENDING).length,
        approved: allRfis.filter((r) => r.status === RFI_STATUS.APPROVED).length,
        rejected: allRfis.filter((r) => r.status === RFI_STATUS.REJECTED).length,
        infoRequested: allRfis.filter((r) => r.status === RFI_STATUS.INFO_REQUESTED).length,
    };
}

/**
 * Get the next serial number for a given date
 */
export function getNextSerialNo(allRfis, date) {
    const dateRfis = allRfis.filter((rfi) => rfi.filedDate === date);
    if (dateRfis.length === 0) return 1;
    return Math.max(...dateRfis.map((r) => r.serialNo)) + 1;
}

/**
 * Get the earliest filed date from a list of RFIs
 */
export function getEarliestDate(allRfis) {
    if (!allRfis || allRfis.length === 0) return getToday();
    const dates = allRfis.map(r => r.filedDate).filter(Boolean);
    if (dates.length === 0) return getToday();
    return dates.reduce((min, d) => d < min ? d : min, dates[0]);
}
/**
 * Compress an image file using Canvas.
 * Resizes to max 1920px width/height and compresses to JPEG (quality 0.7).
 */
export async function compressImage(file, { maxWidth = 1920, maxHeight = 1920, quality = 0.7 } = {}) {
    if (!file || !file.type.startsWith('image/')) return file;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Canvas toBlob failed'));
                            return;
                        }
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

/**
 * Get a thumbnail URL using Supabase Image Transformations.
 * Format: /storage/v1/render/image/public/[bucket]/[path]?width=W&height=H&resize=contain
 */
export function getThumbnailUrl(url, { width = 200, height = 200, quality = 80 } = {}) {
    if (!url || typeof url !== 'string') return url;
    
    // Only transform Supabase Storage URLs
    if (!url.includes('supabase.co/storage/v1/object/public/')) return url;

    try {
        // Change /object/public/ to /render/image/public/
        const baseUrl = url.replace('/object/public/', '/render/image/public/');
        
        // Append transformation parameters
        const params = new URLSearchParams({
            width: width.toString(),
            height: height.toString(),
            quality: quality.toString(),
            resize: 'contain'
        });

        return `${baseUrl}?${params.toString()}`;
    } catch (e) {
        console.error("Error generating thumbnail URL:", e);
        return url;
    }
}
