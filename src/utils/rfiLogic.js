import { RFI_STATUS } from './constants';

/**
 * Generate a unique ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Format a date to YYYY-MM-DD
 */
export function formatDate(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

/**
 * Format a date for display (e.g., "March 7, 2026")
 */
export function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function getToday() {
    return formatDate(new Date());
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
        pending: all.filter((r) => r.status === RFI_STATUS.PENDING).length,
        approved: all.filter((r) => r.status === RFI_STATUS.APPROVED).length,
        rejected: all.filter((r) => r.status === RFI_STATUS.REJECTED).length,
        infoRequested: all.filter((r) => r.status === RFI_STATUS.INFO_REQUESTED).length,
    };
}

/**
 * Get all pending RFIs for consultant review (across all dates up to targetDate)
 */
export function getPendingRFIs(allRfis, targetDate) {
    return allRfis
        .filter(
            (rfi) =>
                rfi.status === RFI_STATUS.PENDING && rfi.filedDate <= targetDate
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
    // Rejected/Info carryovers for today
    const carriedOver = allRfis.filter(
        (rfi) =>
            (rfi.status === RFI_STATUS.REJECTED || rfi.status === RFI_STATUS.INFO_REQUESTED) &&
            rfi.carryoverTo === targetDate
    );

    // Pending RFIs for today
    const pending = allRfis.filter(
        (rfi) =>
            rfi.status === RFI_STATUS.PENDING &&
            rfi.filedDate <= targetDate
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
        pending: allRfis.filter((r) => r.status === RFI_STATUS.PENDING).length,
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
