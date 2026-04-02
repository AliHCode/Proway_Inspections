import { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { useProject } from '../context/ProjectContext';
import { getToday, formatDateDisplay, getNowLocalISO, getThumbnailUrl } from '../utils/rfiLogic';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import StatusBadge from '../components/StatusBadge';
import ApproveModal from '../components/ApproveModal';
import RejectModal from '../components/RejectModal';
import RFIDetailModal from '../components/RFIDetailModal';
import FieldMarkupStudio from '../components/FieldMarkupStudio';
import UserAvatar from '../components/UserAvatar';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { CheckCircle, XCircle, Ban, X, FileDown, Table, ClipboardList, Filter, Maximize2, Minimize2, RotateCcw, User, UserPlus, Hand, ArrowLeft, Camera, Upload, Send, Edit3, RefreshCw } from 'lucide-react';

export default function ReviewQueue() {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const { user } = useAuth();
    const { approveRFI, updateRFI, rejectRFI, cancelRFI, claimRFI, getReviewQueue, rfis, contractors, canUserEditRfi, canUserDiscussRfi, minDate } = useRFI();
    const { activeProject, orderedTableColumns, columnWidthMap, getTableColumnStyle, loadingFields, fieldsResolvedProjectId, projectFields, assignmentMode, showFilerInfo, showEscalatedBadge } = useProject();
    const activeProjectName = activeProject?.name || 'ProWay Project';
    const [currentDate, setCurrentDate] = useState(getToday());
    const [approveTarget, setApproveTarget] = useState(null);
    const [approveMode, setApproveMode] = useState('full');
    const [rejectTarget, setRejectTarget] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [detailTarget, setDetailTarget] = useState(null);
    const [actionSheetTarget, setActionSheetTarget] = useState(null);
    const [actionSheetStep, setActionSheetStep] = useState('menu'); // menu, approve, reject, cancel, details
    const [sheetRemarks, setSheetRemarks] = useState('');
    const [sheetFiles, setSheetFiles] = useState([]);
    const [sheetAssignedTo, setSheetAssignedTo] = useState('');
    const [sheetMarkupIndex, setSheetMarkupIndex] = useState(null);
    const [sheetError, setSheetError] = useState('');
    const [sheetSubmitting, setSheetSubmitting] = useState(false);
    const [filterOptions, setFilterOptions] = useState({
        status: 'all', // all, to_review, approved, conditional, rejected
        showOnlyMe: false
    });
    const [sheetIsFinal, setSheetIsFinal] = useState(true); // Default to Final if multi-review disabled
    const [actionMessage, setActionMessage] = useState('');
    const [selectedImages, setSelectedImages] = useState(null);
    const [scrollTrigger, setScrollTrigger] = useState(0);
    const [selectedRfiIds, setSelectedRfiIds] = useState([]);
    const [focusedRfiId, setFocusedRfiId] = useState(null);
    const [readyTableProjectId, setReadyTableProjectId] = useState(null);
    const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
    const [selectedFilterColumn, setSelectedFilterColumn] = useState('');
    const [columnFilterValues, setColumnFilterValues] = useState({});
    const [filterValueSearch, setFilterValueSearch] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);
    const pageRef = useRef(null);
    const sheetFileRef = useRef(null);

    const queue = getReviewQueue(currentDate);

    // Also get approved/rejected for today for reference
    const todayApprovedTotal = rfis.filter(
        (r) => (r.status === 'approved' || r.status === 'conditional_approve') && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );
    const todayApproved = rfis.filter(
        (r) => r.status === 'approved' && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );
    const todayConditional = rfis.filter(
        (r) => r.status === 'conditional_approve' && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );
    const todayRejected = rfis.filter(
        (r) => r.status === 'rejected' && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );

    const getStatusMatch = (rfi, status) => {
        if (status === 'all') return true;
        if (status === 'to_review') return rfi.status === 'pending' || rfi.status === 'verification_pending';
        if (status === 'approved') return rfi.status === 'approved';
        if (status === 'conditional') return rfi.status === 'conditional_approve';
        if (status === 'rejected') return rfi.status === 'rejected';
        return true;
    };

    const baseItems = useMemo(() => {
        const allSet = new Map();
        const realToday = getToday();
        
        // 1. Items reviewed/finalized on this specific date (Snapshot History)
        rfis.filter(r => r.reviewedAt?.startsWith(currentDate))
            .forEach(r => allSet.set(r.id, r));
            
        // 2. If viewing 'Today', include all active items in the queue (Carryovers + New)
        if (currentDate === realToday) {
            // These are items from 'today's' active work queue
            queue.all.forEach(r => allSet.set(r.id, r));
            
            // Failsafe: Include items filed today that are pending
            rfis.filter(r => r.filedDate?.startsWith(currentDate) && 
                       (r.status === 'pending' || r.status === 'verification_pending'))
                .forEach(r => allSet.set(r.id, r));
        }
            
        return Array.from(allSet.values());
    }, [rfis, currentDate, queue.all]);

    const FILTER_EXCLUDED_COLUMNS = new Set(['serial', 'actions', 'attachments']);
    const visibleColumns = useMemo(() => {
        let cols = orderedTableColumns;
        
        if (assignmentMode !== 'direct') {
            cols = cols.filter(col => col.field_key !== 'assigned_to');
        }
        
        if (user?.role === 'consultant') {
            return cols.filter(col => col.field_key !== 'remarks' && col.field_key !== 'attachments' && col.field_key !== 'inspection_type');
        }
        return cols;
    }, [orderedTableColumns, user?.role, assignmentMode]);

    const filterableColumns = useMemo(
        () => visibleColumns.filter((col) => !FILTER_EXCLUDED_COLUMNS.has(col.field_key)),
        [visibleColumns]
    );

    const getColumnRawValue = (rfi, fieldKey) => {
        if (fieldKey === 'status') return rfi.status;
        if (fieldKey === 'remarks') return rfi.remarks;
        // Check top-level first (legacy) then customFields
        return rfi[fieldKey] || rfi.customFields?.[fieldKey];
    };

    const normalizeFilterValue = (value) => {
        if (value === null || value === undefined) return '—';
        const text = String(value).trim();
        return text || '—';
    };

    const columnLabelMap = useMemo(() => {
        const map = {};
        filterableColumns.forEach((col) => {
            map[col.field_key] = col.field_name;
        });
        return map;
    }, [filterableColumns]);

    const activeFilterEntries = useMemo(
        () => Object.entries(columnFilterValues).filter(([, values]) => Array.isArray(values) && values.length > 0),
        [columnFilterValues]
    );

    const filteredItems = useMemo(() => {
        const filtered = baseItems.filter((rfi) => {
            // 1. Status Filter
            if (!getStatusMatch(rfi, filterOptions.status)) return false;

            // 2. Assignment Filter
            if (filterOptions.showOnlyMe) {
                if (assignmentMode === 'open') {
                    // In open mode, "My Queue" = RFIs I have acted on
                    if (rfi.reviewedBy !== user.id) return false;
                } else {
                    const isAssignedToMe = rfi.assignedTo === user.id;
                    const wasReviewedByMe = rfi.reviewedBy === user.id;
                    if (!isAssignedToMe && !wasReviewedByMe) return false;
                }
            }

            // 3. Column (Advanced) Filters
            return activeFilterEntries.every(([fieldKey, selectedValues]) => {
                const rfiValue = normalizeFilterValue(getColumnRawValue(rfi, fieldKey));
                return selectedValues.includes(rfiValue);
            });
        });

        // 4. SORTING: Prioritize older RFIs (carryovers) first, then sort sequentially by RFI number
        return filtered.sort((a, b) => {
            const aDate = a.originalFiledDate || a.filedDate || '';
            const bDate = b.originalFiledDate || b.filedDate || '';

            // Older dates (carryovers) come first
            if (aDate !== bDate) return aDate.localeCompare(bDate);

            // Within the same day, sort by serial number to maintain strict sequence
            const aSerial = parseInt(a.serialNo) || 0;
            const bSerial = parseInt(b.serialNo) || 0;
            return aSerial - bSerial;
        });
    }, [baseItems, filterOptions, user, activeFilterEntries, currentDate]);

    const statusCounts = useMemo(() => {
        // Calculate counts based on current scope (showOnlyMe) and column filters
        // but NOT the status filter itself (to show potential results in current scope)
        const scopedItems = baseItems.filter((rfi) => {
            if (filterOptions.showOnlyMe) {
                if (assignmentMode === 'open') {
                    if (rfi.reviewedBy !== user.id) return false;
                } else {
                    const isAssignedToMe = rfi.assignedTo === user.id;
                    const wasReviewedByMe = rfi.reviewedBy === user.id;
                    if (!isAssignedToMe && !wasReviewedByMe) return false;
                }
            }
            return activeFilterEntries.every(([fieldKey, selectedValues]) => {
                const rfiValue = normalizeFilterValue(getColumnRawValue(rfi, fieldKey));
                return selectedValues.includes(rfiValue);
            });
        });

        return {
            total: scopedItems.length,
            all_today: baseItems.length,
            my_queue: baseItems.filter(r => r.assignedTo === user.id || r.reviewedBy === user.id).length,
            pending: scopedItems.filter(r => r.status === 'pending' || r.status === 'verification_pending').length,
            approved: scopedItems.filter(r => r.status === 'approved').length,
            conditional: scopedItems.filter(r => r.status === 'conditional_approve').length,
            rejected: scopedItems.filter(r => r.status === 'rejected').length
        };
    }, [baseItems, filterOptions.showOnlyMe, user.id, activeFilterEntries]);

    const availableValuesForSelectedColumn = useMemo(() => {
        if (!selectedFilterColumn) return [];

        const values = new Set(
            baseItems.map((rfi) => normalizeFilterValue(getColumnRawValue(rfi, selectedFilterColumn)))
        );

        const normalizedSearch = filterValueSearch.trim().toLowerCase();
        return Array.from(values)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            .filter((value) => !normalizedSearch || value.toLowerCase().includes(normalizedSearch));
    }, [baseItems, selectedFilterColumn, filterValueSearch]);

    const selectedValuesForColumn = columnFilterValues[selectedFilterColumn] || [];

    const tableLayoutReady = Boolean(
        activeProject?.id
        && fieldsResolvedProjectId === activeProject.id
        && !loadingFields
        && orderedTableColumns.length > 0
    );

    useEffect(() => {
        const projectId = activeProject?.id || null;
        if (!projectId) {
            setReadyTableProjectId(null);
            return;
        }

        if (readyTableProjectId && readyTableProjectId !== projectId) {
            setReadyTableProjectId(null);
        }

        if (tableLayoutReady && readyTableProjectId !== projectId) {
            setReadyTableProjectId(projectId);
        }
    }, [activeProject?.id, tableLayoutReady, readyTableProjectId]);

    useEffect(() => {
        const validKeys = new Set(filterableColumns.map((col) => col.field_key));
        setColumnFilterValues((prev) => {
            const next = {};
            Object.entries(prev).forEach(([key, values]) => {
                if (validKeys.has(key) && Array.isArray(values) && values.length > 0) {
                    next[key] = values;
                }
            });

            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            if (prevKeys.length === nextKeys.length) {
                const unchanged = prevKeys.every((key) => {
                    const prevVals = prev[key] || [];
                    const nextVals = next[key] || [];
                    return prevVals.length === nextVals.length
                        && prevVals.every((val, idx) => val === nextVals[idx]);
                });
                if (unchanged) return prev;
            }
            return next;
        });

        if (!selectedFilterColumn || !validKeys.has(selectedFilterColumn)) {
            setSelectedFilterColumn(filterableColumns[0]?.field_key || '');
        }
    }, [filterableColumns, selectedFilterColumn]);

    useEffect(() => {
        const visibleIds = new Set(filteredItems.map((rfi) => rfi.id));
        setSelectedRfiIds((prev) => {
            const next = prev.filter((id) => visibleIds.has(id));
            if (next.length === prev.length && next.every((id, idx) => id === prev[idx])) {
                return prev;
            }
            return next;
        });
    }, [filteredItems]);

    useEffect(() => {
        if (filterPopoverOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        const closeOnEscape = (event) => {
            if (event.key === 'Escape') {
                setFilterPopoverOpen(false);
            }
        };

        if (filterPopoverOpen) {
            document.addEventListener('keydown', closeOnEscape);
        }

        return () => {
            document.removeEventListener('keydown', closeOnEscape);
            document.body.style.overflow = '';
        };
    }, [filterPopoverOpen]);

    useEffect(() => {
        setFilterPopoverOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!actionSheetTarget) {
            setSheetSubmitting(false);
        }
    }, [actionSheetTarget]);

    const shouldShowTable = Boolean(activeProject?.id && readyTableProjectId === activeProject.id);

    // Fullscreen / Landscape Logic (V60)
    useEffect(() => {
        const handleFsChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    const toggleFullscreen = async () => {
        if (!pageRef.current) return;

        if (!isFullscreen) {
            try {
                if (pageRef.current.requestFullscreen) {
                    await pageRef.current.requestFullscreen();
                    if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
                        await window.screen.orientation.lock('landscape').catch(err => {
                            console.log("Orientation lock failed (harmless):", err);
                        });
                    }
                }
            } catch (err) {
                console.error("Fullscreen error:", err);
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    async function handleApprove(rfiId, remarks, files = [], status = 'approved', assignedTo) {
        const updatePayload = {
            status,
            reviewedBy: user.id,
            reviewedAt: getNowLocalISO(),
            assignedTo,
            carryoverTo: null,
            remarks: remarks?.trim() || ''
        };
        
        // updateRFI now handles status, notifications and audit internally
        await updateRFI(rfiId, { ...updatePayload, appendFiles: files });

        setActionMessage(status === 'conditional_approve' ? '⚠️ Inspection Conditionally Approved' : '✅ Inspection Approved');
        setTimeout(() => setActionMessage(''), 2000);
    }

    async function handleReject(rfiId, remarks, files = [], assignedTo) {
        await rejectRFI(rfiId, user.id, remarks, files, assignedTo);
        setActionMessage('❌ Inspection Rejected & Assigned');
        setTimeout(() => setActionMessage(''), 3000);
    }

    async function handleCancel(rfiId, reason, assignedTo) {
        await cancelRFI(rfiId, user.id, reason, assignedTo);
        setCancelTarget(null);
        setActionMessage('🚫 RFI Cancelled (Terminal State)');
        setTimeout(() => setActionMessage(''), 3000);
    }

    const { bulkApproveRFI } = useRFI();

    function toggleSelect(id) {
        setSelectedRfiIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }

    function handleSelectAll() {
        if (selectedRfiIds.length === filteredItems.length) {
            setSelectedRfiIds([]);
        } else {
            setSelectedRfiIds(filteredItems.map(r => r.id));
        }
    }

    async function handleBulkApprove() {
        if (window.confirm(`Approve ${selectedRfiIds.length} selected RFIs?`)) {
            await bulkApproveRFI(selectedRfiIds, user.id);
            setSelectedRfiIds([]);
        }
    }

    useEffect(() => {
        // If the timeline date changes, close any previously opened discussion modal.
        setDetailTarget(null);
    }, [currentDate]);

    useEffect(() => {
          // Handle Deep Linking from Shared URL or Notification
        const rfiId = searchParams.get('rfi');
        if (!rfiId || rfis.length === 0) return;

        const targetRfi = rfis.find((r) => r.id === rfiId);
        if (!targetRfi) return;

        // Map status for additive filtering system
        const targetStatus =
            targetRfi.status === 'conditional_approve'
                ? 'conditional'
                : targetRfi.status === 'approved'
                    ? 'approved'
                    : targetRfi.status === 'rejected'
                        ? 'rejected'
                        : 'to_review';

        const targetShowOnlyMe = targetRfi.assignedTo === user.id;

        // Ensure filter and date match the target RFI
        if (filterOptions.status !== targetStatus || filterOptions.showOnlyMe !== targetShowOnlyMe) {
            setFilterOptions({ status: targetStatus, showOnlyMe: targetShowOnlyMe });
            return;
        }

        const targetDate = targetRfi.reviewedAt?.slice(0, 10) || targetRfi.carryoverTo || targetRfi.originalFiledDate || targetRfi.filedDate;

        if (targetDate && currentDate !== targetDate) {
            setCurrentDate(targetDate);
            return;
        }

        setDetailTarget(targetRfi);
        setFocusedRfiId(targetRfi.id);
        setScrollTrigger((prev) => prev + 1);

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('rfi');
        nextParams.delete('source');
        setSearchParams(nextParams, { replace: true });

        const scrollTimer = window.setTimeout(() => {
            const row = document.querySelector(`[data-rfi-id="${targetRfi.id}"]`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 180);
        const clearTimer = window.setTimeout(() => setFocusedRfiId(null), 4500);

        return () => {
            window.clearTimeout(scrollTimer);
            window.clearTimeout(clearTimer);
        };
    }, [searchParams, setSearchParams, rfis, user, currentDate, filterOptions]);

    // Background Scroll Locking
    useEffect(() => {
        const isModalOpen = !!(detailTarget || approveTarget || rejectTarget || cancelTarget || selectedImages);
        if (isModalOpen) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => document.body.classList.remove('no-scroll');
    }, [detailTarget, approveTarget, rejectTarget, selectedImages]);

    useEffect(() => {
        return () => {
            document.body.classList.remove('no-scroll');
        };
    }, []);

    function scrollToPageBottom() {
        const scrollNow = () => {
            const pageHeight = Math.max(
                document.body?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0,
                document.body?.offsetHeight || 0,
                document.documentElement?.offsetHeight || 0
            );
            window.scrollTo({ top: pageHeight, behavior: 'smooth' });
        };

        // Multiple attempts to ensure scroll reaches true bottom after modal renders
        scrollNow();
        requestAnimationFrame(() => setTimeout(scrollNow, 100));
        setTimeout(scrollNow, 300);
        setTimeout(scrollNow, 600);
    }

    function renderReviewActionCell(rfi) {
        const isAssignee = rfi.assignedTo === user.id;
        const isReviewer = rfi.reviewedBy === user.id;
        const isNotAssigned = !rfi.assignedTo && !rfi.reviewedBy;

        // ─── CLAIM MODE: show Claim button if unclaimed ───
        if (assignmentMode === 'claim') {
            if (rfi.status === 'pending' && !rfi.assignedTo) {
                return (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                            className="btn btn-sm btn-claim"
                            onClick={() => claimRFI(rfi.id, user.id)}
                            title="Claim this RFI for review"
                        >
                            <Hand size={14} /> Claim
                        </button>
                    </div>
                );
            }
            // If claimed by someone else, show locked name badge for consultants
            if (rfi.assignedTo && rfi.assignedTo !== user.id && rfi.reviewedBy !== user.id) {
                if (user?.role === 'consultant') {
                    const claimerName = rfi.assigneeName || rfi.reviewerName || 'Consultant';
                    return (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <span className="badge-ghost-locked">
                                🔒 {claimerName}
                            </span>
                        </div>
                    );
                }
                return null;
            }
        }

        // ─── OPEN MODE: any consultant can act on any pending RFI ───
        if (assignmentMode === 'open') {
            // No assignment restrictions — all consultants see action buttons
        } else if (assignmentMode === 'direct') {
            // DIRECT MODE: original security — only assigned/reviewer/unassigned
            if (!isAssignee && !isReviewer && !isNotAssigned) {
                return null;
            }
        }

        // If not pending/verifying, we usually don't show the quick-action button
        const isActionable = rfi.status === 'pending' || rfi.status === 'verification_pending' || rfi.status === 'info_requested';

        if (!isActionable) {
            return (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                        onClick={() => {
                            setDetailTarget(rfi);
                            setScrollTrigger(prev => prev + 1);
                        }}
                        className="btn-review-mini"
                        title="View Details"
                    >
                        <ClipboardList size={16} /> Details
                    </button>
                </div>
            );
        }

        return (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                    className="btn-review-main"
                    onClick={() => {
                        setSheetRemarks('');
                        setSheetFiles([]);
                        setSheetAssignedTo(rfi.filedBy || '');
                        setSheetError('');
                        setSheetIsFinal(activeProject?.multi_review_enabled ? false : true); // Default to recommendation if multi-review on
                        setActionSheetStep('menu');
                        setActionSheetTarget(rfi);
                    }}
                >
                    <Hand size={16} /> Review
                </button>
            </div>
        );
    }

    function isEscalated(rfi) {
        if (rfi.status !== 'pending' && rfi.status !== 'info_requested') return false;
        // Conditional approvals are acted upon, so they shouldn't show as escalated
        if (rfi.status === 'conditional_approve') return false; 

        const filingDate = new Date(rfi.originalFiledDate || rfi.filedDate);
        const now = new Date();
        const diffDays = (now - filingDate) / (1000 * 60 * 60 * 24);
        return diffDays >= 2;
    }

    function renderReviewOrderedCell(rfi, col, isCarryover, index) {
        if (col.field_key === 'serial') {
            const escalated = showEscalatedBadge && isEscalated(rfi);
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {showFilerInfo && <UserAvatar name={rfi.filerName} avatarUrl={rfi.filerAvatarUrl} size={32} />}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600 }}>#{index + 1}</span>
                            {escalated && (
                                <span style={{
                                    backgroundColor: 'var(--clr-danger-bg)', color: 'var(--clr-danger)', fontSize: '0.65rem',
                                    fontWeight: 700, padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--clr-danger-border)'
                                }}>
                                    ESCALATED
                                </span>
                            )}
                        </div>
                        {showFilerInfo && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>
                                {rfi.filerName}
                            </div>
                        )}
                    </div>
                    {isCarryover && (
                        <div className="carryover-count" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                            ×{rfi.carryoverCount} Carryover
                        </div>
                    )}
                </div>
            );
        }

        if (col.field_key === 'description' || col.field_key === 'location' || col.field_key === 'inspection_type') {
            return rfi[col.field_key] || rfi.inspectionType || rfi.customFields?.[col.field_key] || '—';
        }
        if (col.field_key === 'status') return <StatusBadge status={rfi.status} />;
        if (col.field_key === 'remarks') return rfi.remarks || '';

        if (col.field_key === 'attachments') {
            if (rfi.images && rfi.images.length > 0) {
                return (
                    <div
                        className="image-preview-grid consultant-grid"
                        onClick={() => setSelectedImages(rfi.images)}
                        title="Click to view full size"
                    >
                        {rfi.images.slice(0, 3).map((url, idx) => (
                            <img key={idx} src={getThumbnailUrl(url, { width: 100, height: 100 })} alt="attachment" className="thumbnail" />
                        ))}
                        {rfi.images.length > 3 && (
                            <div className="thumbnail-more">
                                +{rfi.images.length - 3}
                            </div>
                        )}
                    </div>
                );
            }
            return '';
        }

        if (col.field_key === 'actions') return renderReviewActionCell(rfi);
        return rfi.customFields?.[col.field_key] || '—';
    }

    const toggleColumnFilterValue = (fieldKey, value) => {
        setColumnFilterValues((prev) => {
            const existing = prev[fieldKey] || [];
            const nextValues = existing.includes(value)
                ? existing.filter((v) => v !== value)
                : [...existing, value];

            if (nextValues.length === 0) {
                const { [fieldKey]: _removed, ...rest } = prev;
                return rest;
            }
            return { ...prev, [fieldKey]: nextValues };
        });
    };

    const clearSelectedColumnFilters = () => {
        if (!selectedFilterColumn) return;
        setColumnFilterValues((prev) => {
            const { [selectedFilterColumn]: _removed, ...rest } = prev;
            return rest;
        });
    };

    const clearAllColumnFilters = () => {
        setColumnFilterValues({});
        setFilterValueSearch('');
    };

    const resetAllFilters = (e) => {
        if (e) e.stopPropagation();
        setFilterOptions({ status: 'all', showOnlyMe: false });
        setColumnFilterValues({});
        setFilterValueSearch('');
    };

    const isAnyFilterActive = activeFilterEntries.length > 0 || filterOptions.status !== 'all' || filterOptions.showOnlyMe;

    async function handleExportPdf() {
        if (!filteredItems.length) return;
        setExportingPdf(true);
        try {
            await exportToPDF(filteredItems, `ProWay_Inspections_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template);
        } catch (error) {
            console.error('Review queue PDF export failed:', error);
        } finally {
            setExportingPdf(false);
        }
    }

    async function handleExportExcel() {
        if (!filteredItems.length) return;
        setExportingExcel(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 0));
            await exportToExcel(filteredItems, `ProWay_Inspections_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template);
        } catch (error) {
            console.error('Review queue Excel export failed:', error);
        } finally {
            setExportingExcel(false);
        }
    }

    return (
        <div className={`page-wrapper ${isFullscreen ? 'is-fullscreen-page' : ''}`} ref={pageRef}>
            <Header />
            <main className="review-page">
                <div className="sheet-header">
                    <div className="sheet-tabs-container">{user?.role !== 'consultant' && (
                        <div className="sheet-tab active">
                            <h2>Review Queue</h2>
                        </div>
                    )}</div>
                    <div className="review-header-controls">
                        <div className="export-actions review-export-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            {(() => {
                                const exportBusy = exportingPdf || exportingExcel;
                                return (
                                    <>
                            <button
                                className={`btn btn-sm btn-progress-static ${exportingPdf ? 'is-loading' : ''}`}
                                style={{ backgroundColor: 'var(--clr-bg-elevated)', color: 'var(--clr-text-main)', border: '1px solid var(--clr-border)', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                onClick={handleExportPdf}
                                disabled={exportBusy || filteredItems.length === 0}
                                title="Export to PDF"
                                aria-label="Export to PDF"
                            >
                                <span className="btn-progress-icon">
                                    {exportingPdf ? <RefreshCw size={16} className="spin-slow" /> : <FileDown size={17} />}
                                </span>
                                <span className="btn-progress-label">
                                    <span className="btn-progress-visible">{exportingPdf ? '...' : 'PDF'}</span>
                                    <span className="btn-progress-measure" aria-hidden="true">PDF</span>
                                </span>
                            </button>
                            <button
                                className={`btn btn-sm btn-progress-static ${exportingExcel ? 'is-loading' : ''}`}
                                style={{ backgroundColor: 'var(--clr-bg-elevated)', color: 'var(--clr-text-main)', border: '1px solid var(--clr-border)', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                onClick={handleExportExcel}
                                disabled={exportBusy || filteredItems.length === 0}
                                title="Export to Excel"
                                aria-label="Export to Excel"
                            >
                                <span className="btn-progress-icon">
                                    {exportingExcel ? <RefreshCw size={16} className="spin-slow" /> : <Table size={17} />}
                                </span>
                                <span className="btn-progress-label">
                                    <span className="btn-progress-visible">{exportingExcel ? '...' : 'Excel'}</span>
                                    <span className="btn-progress-measure" aria-hidden="true">Excel</span>
                                </span>
                            </button>
                                    </>
                                );
                            })()}
                            <div className="review-filter-wrap" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <button
                                    className="fullscreen-btn"
                                    onClick={toggleFullscreen}
                                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Landscape View"}
                                >
                                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                                </button>
                                <div className="review-filter-trigger-group">
                                    <button
                                        type="button"
                                        className={`btn btn-sm review-filter-btn ${isAnyFilterActive ? 'active' : ''}`}
                                        onClick={() => setFilterPopoverOpen((prev) => !prev)}
                                        title="Filter table"
                                    >
                                        <Filter size={16} /> Filters
                                        {isAnyFilterActive && (
                                            <span className="review-filter-count-badge">
                                                {activeFilterEntries.length + (filterOptions.status !== 'all' ? 1 : 0) + (filterOptions.showOnlyMe ? 1 : 0)}
                                            </span>
                                        )}
                                    </button>
                                    {isAnyFilterActive && (
                                        <button 
                                            className="filter-clear-trigger" 
                                            onClick={resetAllFilters}
                                            title="Clear All Filters"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} minDate={minDate} />
                    </div>
                </div>

                {activeFilterEntries.length > 0 && (
                    <div className="review-active-filters">
                        {activeFilterEntries.map(([fieldKey, values]) => (
                            <span key={fieldKey} className="review-filter-chip">
                                {columnLabelMap[fieldKey] || fieldKey}: {values.join(', ')}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setColumnFilterValues((prev) => {
                                            const { [fieldKey]: _removed, ...rest } = prev;
                                            return rest;
                                        });
                                    }}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                        <button type="button" className="btn btn-sm btn-ghost" onClick={clearAllColumnFilters}>Clear All</button>
                    </div>
                )}

                {actionMessage && (
                    <div className={`submit-message ${actionMessage.includes('✅') ? 'success' : 'warning'}`}>
                        {actionMessage}
                    </div>
                )}

                {/* Review Table (Excel-like format) */}
                {!shouldShowTable ? (
                    <div className="sheet-section">
                        <div style={{ padding: '1.2rem 1.3rem', display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--clr-text-secondary)' }}>
                            <div className="loading-spinner" style={{ width: '16px', height: '16px' }}></div>
                            <span>Loading review table layout...</span>
                        </div>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="empty-state">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                            <CheckCircle size={24} color="var(--clr-success)" /> All Caught Up!
                        </h3>
                        <p>{filterOptions.status === 'all' ? 'No RFIs found for this date.' : 'No items match your selected filters.'}</p>
                    </div>
                ) : (
                    <div className="sheet-section">
                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        <th className="col-serial" style={{ width: '40px' }}>
                                            {(filterOptions.status === 'to_review' || filterOptions.status === 'all') && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRfiIds.length > 0 && selectedRfiIds.length === filteredItems.length}
                                                    onChange={handleSelectAll}
                                                />
                                            )}
                                        </th>
                                        {visibleColumns.map((col) => (
                                            <th key={col.id || col.field_key} style={getTableColumnStyle(col.field_key)}>{col.field_name}</th>
                                        ))}
                                        {assignmentMode === 'direct' && <th className="col-assign">Assigned To</th>}
                                        <th className="col-status">SUBMISSION DATE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.map((rfi, index) => {
                                        const isCarryover = rfi.status === 'rejected' && rfi.carryoverTo === currentDate;
                                        return (
                                            <tr
                                                key={rfi.id}
                                                data-rfi-id={rfi.id}
                                                className={`${isCarryover ? 'carryover-row ' : ''}${focusedRfiId === rfi.id ? 'notification-focus-row' : ''}`.trim()}
                                            >
                                                <td className="col-serial">
                                                    {(filterOptions.status === 'to_review' || filterOptions.status === 'all') && (
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRfiIds.includes(rfi.id)}
                                                            onChange={() => toggleSelect(rfi.id)}
                                                        />
                                                    )}
                                                </td>
                                                {visibleColumns.map((col) => (
                                                    <td
                                                        key={`${rfi.id}_${col.field_key}`}
                                                        data-label={col.field_name}
                                                        style={getTableColumnStyle(col.field_key)}
                                                    >
                                                        {renderReviewOrderedCell(rfi, col, isCarryover, index)}
                                                    </td>
                                                ))}
                                                {assignmentMode === 'direct' && (
                                                    <td className="col-assign" data-label="Assigned To">
                                                        {(() => {
                                                            const consultantName = rfi.reviewerName || rfi.assigneeName;
                                                            const isMe = rfi.reviewedBy === user.id || (rfi.status === 'pending' && rfi.assignedTo === user.id);
                                                            
                                                            // Direct mode
                                                            if (!consultantName) return <span className="text-muted">— Auto —</span>;
                                                            return (
                                                                <span className={`assign-badge ${isMe ? 'is-me' : ''}`}>
                                                                    {isMe ? <><UserPlus size={14} className="badge-icon" /> You</> : consultantName}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                )}
                                                <td className="col-status" data-label="Submission Date">{formatDateDisplay(rfi.originalFiledDate)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* Filter Sidebar Drawer (V100 - Premium Redesign) */}
            <div 
                className={`filter-sidebar-overlay ${filterPopoverOpen ? 'open' : ''}`}
                onClick={() => setFilterPopoverOpen(false)}
            />
            <div className={`rfp-filter-drawer review-filter-sidebar ${filterPopoverOpen ? 'open' : ''}`}>
                <div className="rfp-filter-header">
                    <h3 className="rfp-filter-title">Filters</h3>
                    <button type="button" className="rfp-close-btn" onClick={() => setFilterPopoverOpen(false)}>
                        <X size={20} />
                    </button>
                </div>

                <div className="rfp-filter-body">
                    {/* Professional Scope Toggle */}
                    <div className="rfp-filter-section">
                        <label className="rfp-section-label">Target Scope</label>
                        <div className="rfp-segmented-control">
                            <button
                                className={`rfp-segment-btn ${!filterOptions.showOnlyMe ? 'active' : ''}`}
                                onClick={() => setFilterOptions(prev => ({ ...prev, showOnlyMe: false }))}
                            >
                                All Activity <span className="count-pill">{statusCounts.all_today}</span>
                            </button>
                            <button
                                className={`rfp-segment-btn ${filterOptions.showOnlyMe ? 'active' : ''}`}
                                onClick={() => setFilterOptions(prev => ({ ...prev, showOnlyMe: true }))}
                            >
                                <User size={14} /> My Queue <span className="count-pill">{statusCounts.my_queue}</span>
                            </button>
                        </div>
                    </div>

                    {/* Refined Status List */}
                    <div className="rfp-filter-section">
                        <label className="rfp-section-label">Filter by Status</label>
                        <div className="rfp-status-list">
                            <button
                                className={`rfp-status-btn ${filterOptions.status === 'all' ? 'active' : ''}`}
                                onClick={() => setFilterOptions(prev => ({ ...prev, status: 'all' }))}
                            >
                                <div className="status-info">
                                    <ClipboardList size={16} color="#64748b" /> <span>All Statuses</span>
                                </div>
                                <span className="status-count">{statusCounts.total}</span>
                            </button>

                            <button
                                className={`rfp-status-btn ${filterOptions.status === 'to_review' ? 'active' : ''}`}
                                onClick={() => setFilterOptions(prev => ({ ...prev, status: prev.status === 'to_review' ? 'all' : 'to_review' }))}
                            >
                                <div className="status-info">
                                    <span className="dot pending"></span> <span>Pending Review</span>
                                </div>
                                <span className="status-count">{statusCounts.pending}</span>
                            </button>

                            <button
                                className={`rfp-status-btn ${filterOptions.status === 'approved' ? 'active' : ''}`}
                                onClick={() => setFilterOptions(prev => ({ ...prev, status: prev.status === 'approved' ? 'all' : 'approved' }))}
                            >
                                <div className="status-info">
                                    <span className="dot approved"></span> <span>Approved</span>
                                </div>
                                <span className="status-count">{statusCounts.approved}</span>
                            </button>

                            <button
                                className={`rfp-status-btn ${filterOptions.status === 'conditional' ? 'active' : ''}`}
                                onClick={() => setFilterOptions(prev => ({ ...prev, status: prev.status === 'conditional' ? 'all' : 'conditional' }))}
                            >
                                <div className="status-info">
                                    <span className="dot warning"></span> <span>Cond. Approved</span>
                                </div>
                                <span className="status-count">{statusCounts.conditional}</span>
                            </button>

                            <button
                                className={`rfp-status-btn ${filterOptions.status === 'rejected' ? 'active' : ''}`}
                                onClick={() => setFilterOptions(prev => ({ ...prev, status: prev.status === 'rejected' ? 'all' : 'rejected' }))}
                            >
                                <div className="status-info">
                                    <span className="dot rejected"></span> <span>Rejected</span>
                                </div>
                                <span className="status-count">{statusCounts.rejected}</span>
                            </button>
                        </div>
                    </div>

                    {/* Column Filters */}
                    <div className="rfp-filter-section" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem' }}>
                        <label className="rfp-section-label">Column Specific Filters</label>
                        <select
                            className="rfp-select"
                            style={{ width: '100%', marginBottom: '1rem' }}
                            value={selectedFilterColumn}
                            onChange={(e) => {
                                setSelectedFilterColumn(e.target.value);
                                setFilterValueSearch('');
                            }}
                        >
                            {filterableColumns.map((col) => (
                                <option key={col.field_key} value={col.field_key}>{col.field_name}</option>
                            ))}
                        </select>

                        <div className="rfp-search-wrap" style={{ marginBottom: '1rem' }}>
                            <input
                                type="text"
                                className="rfp-search-input"
                                placeholder={`Search ${columnLabelMap[selectedFilterColumn]}...`}
                                value={filterValueSearch}
                                onChange={(e) => setFilterValueSearch(e.target.value)}
                            />
                        </div>

                        <div className="rfp-values-list" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                            {availableValuesForSelectedColumn.length === 0 ? (
                                <div className="rfp-empty">No values found</div>
                            ) : availableValuesForSelectedColumn.map((value) => (
                                <label key={`${selectedFilterColumn}_${value}`} className="rfp-value-item" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.5rem', cursor: 'pointer', borderRadius: '8px' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedValuesForColumn.includes(value)}
                                        onChange={() => toggleColumnFilterValue(selectedFilterColumn, value)}
                                    />
                                    <span style={{ fontSize: '0.82rem', color: '#4b5563' }}>{value}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer removed per user request (Reset moved to main trigger) */}
            </div>

            {isFullscreen && (
                <div className="landscape-hint">
                    <RotateCcw size={16} /> <span>Rotate device for landscape view</span>
                </div>
            )}

            {/* Detail & Comments Modal */}
            {detailTarget && (
                <RFIDetailModal
                    key={detailTarget.id}
                    rfi={detailTarget}
                    projectFields={projectFields}
                    orderedColumns={orderedTableColumns}
                    onClose={() => setDetailTarget(null)}
                    externalScrollTrigger={scrollTrigger}
                    // Decision Action Overrides
                    onApprove={() => { setApproveMode('full'); setActionSheetStep('approve'); setActionSheetTarget(detailTarget); setDetailTarget(null); }}
                    onConditional={() => { setApproveMode('conditional'); setActionSheetStep('approve'); setActionSheetTarget(detailTarget); setDetailTarget(null); }}
                    onReject={() => { setActionSheetStep('reject'); setActionSheetTarget(detailTarget); setDetailTarget(null); }}
                    onCancel={() => { setActionSheetStep('cancel'); setActionSheetTarget(detailTarget); setDetailTarget(null); }}
                    onEditDecision={(r) => {
                        setSheetRemarks('');
                        setSheetFiles([]);
                        setSheetError('');
                        setActionSheetStep('menu');
                        setActionSheetTarget(r);
                        setDetailTarget(null);
                    }}
                />
            )}

            {/* Inline Widgets removed - now integrated into bottom sheet */}

            {/* Lightbox for Images */}
            {selectedImages && (
                <div className="modal-overlay" onClick={() => setSelectedImages(null)}>
                    <div className="modal lightbox" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Attachments ({selectedImages.length})</h3>
                            <button className="btn-close" onClick={() => setSelectedImages(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="lightbox-content">
                            {selectedImages.map((url, idx) => (
                                <div key={idx} className="lightbox-image-wrapper">
                                    <img src={url} alt={`Attachment ${idx + 1}`} className="lightbox-image" />
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost lightbox-download">
                                        Open Full Size
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Action Bar */}
            {selectedRfiIds.length > 0 && (
                <div className="batch-action-bar">
                    <div className="batch-action-selected">
                        <span className="selected-count">{selectedRfiIds.length} Selected</span>
                        <button className="btn btn-sm btn-ghost clear-btn" onClick={() => setSelectedRfiIds([])}>Clear</button>
                    </div>
                    <div className="batch-divider"></div>
                    <div className="batch-action-ops">
                        <button className="btn btn-primary approve-btn" onClick={handleBulkApprove}>
                            <CheckCircle size={18} /> Bulk Approve
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom Action Sheet (RFI Decision Center) */}
            <div 
                className={`action-sheet-overlay ${actionSheetTarget ? 'open' : ''}`}
                onClick={() => { if (!sheetSubmitting) setActionSheetTarget(null); }}
            />
            {actionSheetTarget && (
                <div className={`action-sheet-panel ${actionSheetStep !== 'menu' ? 'expanded' : ''}`}>
                    <div className="sheet-handle"></div>
                    
                    <div className="action-sheet-header">
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: actionSheetStep === 'menu' ? '4px' : '15px' }}>
                            {actionSheetStep !== 'menu' && (
                                <button className="sheet-back-btn" onClick={() => setActionSheetStep('menu')} disabled={sheetSubmitting}>
                                    <ArrowLeft size={20} />
                                </button>
                            )}
                            <div style={{ flex: 1, textAlign: actionSheetStep === 'menu' ? 'center' : 'left' }}>
                                <h3 className="action-sheet-title">
                                    {actionSheetStep === 'menu' ? 
                                        (actionSheetTarget.status === 'pending' ? `Review RFI #${actionSheetTarget.customFields?.rfi_no || actionSheetTarget.serialNo}` : 'Change Decision') : 
                                     actionSheetStep === 'approve' ? (approveMode === 'conditional' ? 'Conditionally Approve' : 'Approve RFI') :
                                     actionSheetStep === 'reject' ? 'Reject RFI' : 
                                     actionSheetStep === 'cancel' ? 'Cancel RFI' : 'Review Details'}
                                </h3>
                                {actionSheetStep === 'menu' && (
                                    <div className="sheet-header-meta">
                                        <p className="action-sheet-subtitle">{actionSheetTarget.location}</p>
                                        {actionSheetTarget.status !== 'pending' && (
                                            <div className="sheet-current-status-tag">
                                                <span>Current:</span>
                                                <StatusBadge status={actionSheetTarget.status} />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="action-sheet-body">
                        {actionSheetStep === 'menu' && actionSheetTarget.internalReviews?.length > 0 && (
                            <div className="sheet-history-section">
                                <h4 className="sheet-section-title">Team Feedback ({actionSheetTarget.internalReviews.length})</h4>
                                <div className="sheet-history-list">
                                    {actionSheetTarget.internalReviews.map((rev, idx) => (
                                        <div key={rev.id || idx} className="sheet-history-item">
                                            <div className="bubble-avatar">
                                                <UserAvatar name={rev.reviewer?.name} avatarUrl={rev.reviewer?.avatar_url} size={32} />
                                            </div>
                                            <div className="history-meta">
                                                <div className="history-header">
                                                    <span className="history-name">{rev.reviewer?.name || 'Consultant'}</span>
                                                    <div className={`compact-status-badge ${rev.status_recommendation}`}>
                                                        {rev.status_recommendation === 'conditional_approve' ? 'Cond. Approved' : rev.status_recommendation.toUpperCase()}
                                                    </div>
                                                </div>
                                                <div className="history-remarks">{rev.remarks}</div>
                                                
                                                {rev.images && rev.images.length > 0 && (
                                                    <div className="bubble-attachments" style={{ marginTop: '8px' }}>
                                                        <div className="rfi-attachments-grid small">
                                                            {rev.images.map((img, idx) => (
                                                                <a key={idx} href={img} target="_blank" rel="noopener noreferrer" className="rfi-attachment-thumb" style={{ width: '50px', height: '50px' }}>
                                                                    <img src={img} alt="Markup" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {actionSheetStep === 'menu' ? (
                            <div className="action-sheet-grid">
                                {actionSheetTarget.status !== 'approved' && (
                                    <button className="sheet-btn sheet-btn-approve" onClick={() => { setApproveMode('full'); setActionSheetStep('approve'); }}>
                                        <CheckCircle size={24} /> Approve
                                    </button>
                                )}
                                {actionSheetTarget.status !== 'conditional_approve' && (
                                    <button className="sheet-btn sheet-btn-cond" onClick={() => { setApproveMode('conditional'); setActionSheetStep('approve'); }}>
                                        <CheckCircle size={24} /> <span style={{fontSize: '0.7rem'}}>COND. APPROVE</span>
                                    </button>
                                )}
                                {actionSheetTarget.status !== 'rejected' && (
                                    <button 
                                        className="sheet-btn sheet-btn-reject" 
                                        onClick={() => setActionSheetStep('reject')}
                                        disabled={activeProject?.multi_review_enabled && actionSheetTarget.internalReviews?.some(r => r.status_recommendation === 'approved')}
                                        style={{ opacity: (activeProject?.multi_review_enabled && actionSheetTarget.internalReviews?.some(r => r.status_recommendation === 'approved')) ? 0.4 : 1, cursor: (activeProject?.multi_review_enabled && actionSheetTarget.internalReviews?.some(r => r.status_recommendation === 'approved')) ? 'not-allowed' : undefined }}
                                        title={(activeProject?.multi_review_enabled && actionSheetTarget.internalReviews?.some(r => r.status_recommendation === 'approved')) ? "Cannot reject because a consultant has internally approved this RFI." : ""}
                                    >
                                        <XCircle size={24} /> Reject
                                    </button>
                                )}
                                {actionSheetTarget.status !== 'cancelled' && (
                                    <button 
                                        className="sheet-btn sheet-btn-cancel" 
                                        onClick={() => setActionSheetStep('cancel')}
                                        disabled={activeProject?.multi_review_enabled && actionSheetTarget.internalReviews?.some(r => r.status_recommendation === 'approved')}
                                        style={{ opacity: (activeProject?.multi_review_enabled && actionSheetTarget.internalReviews?.some(r => r.status_recommendation === 'approved')) ? 0.4 : 1, cursor: (activeProject?.multi_review_enabled && actionSheetTarget.internalReviews?.some(r => r.status_recommendation === 'approved')) ? 'not-allowed' : undefined }}
                                        title={(activeProject?.multi_review_enabled && actionSheetTarget.internalReviews?.some(r => r.status_recommendation === 'approved')) ? "Cannot cancel because a consultant has internally approved this RFI." : ""}
                                    >
                                        <Ban size={24} /> Cancel
                                    </button>
                                )}
                                {actionSheetTarget.status === 'pending' && (
                                    <button className="sheet-btn sheet-btn-details full-width" onClick={() => { setDetailTarget(actionSheetTarget); setActionSheetTarget(null); }}>
                                        <ClipboardList size={20} /> View Full Details & Review History
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="action-sheet-form-container">
                                {/* Form Fields ported from Modals */}


                                <div className="sheet-form-field">
                                    <label className="sheet-form-label">
                                        {actionSheetStep === 'approve' ? (approveMode === 'conditional' ? 'Conditions (Required)' : 'Remarks (Optional)') :
                                         actionSheetStep === 'reject' ? 'Corrective Actions (Required)' : 'Cancellation Reason (Required)'}
                                    </label>
                                    <textarea 
                                        className="sheet-form-textarea"
                                        value={sheetRemarks}
                                        onChange={e => { setSheetRemarks(e.target.value); setSheetError(''); }}
                                        placeholder="Add notes, conditions or corrective actions..."
                                        rows={3}
                                    />
                                </div>

                                {/* File Preview / Add */}
                                <div className="sheet-form-field">
                                    <label className="sheet-form-label" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                        Evidence Photos (Optional)
                                        <button className="sheet-add-photo" onClick={() => sheetFileRef.current?.click()}>
                                            <Camera size={14} /> Add
                                        </button>
                                    </label>
                                    <input type="file" ref={sheetFileRef} multiple accept="image/*,application/pdf" style={{display:'none'}} 
                                        onChange={e => { setSheetFiles(prev => [...prev, ...Array.from(e.target.files)]); e.target.value=''; }} />
                                    
                                    {sheetFiles.length > 0 && (
                                        <div className="sheet-file-strip">
                                            {sheetFiles.map((file, idx) => (
                                                <div key={idx} className="sheet-file-item">
                                                    <div className="sheet-file-thumb">
                                                        <img src={typeof file === 'string' ? file : URL.createObjectURL(file)} alt="Evidence" />
                                                    </div>
                                                    <div className="sheet-file-actions-row">
                                                        <button onClick={() => setSheetMarkupIndex(idx)} title="Edit / Markup"><Edit3 size={14} /></button>
                                                        <button onClick={() => setSheetFiles(prev => prev.filter((_,i) => i !== idx))} title="Remove"><X size={14} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {sheetError && <div className="sheet-form-error">{sheetError}</div>}

                                {activeProject?.multi_review_enabled && (
                                    <div className="sheet-finalize-card">
                                        <label className="sheet-finalize-label">
                                            <input 
                                                type="checkbox" 
                                                checked={sheetIsFinal} 
                                                onChange={e => setSheetIsFinal(e.target.checked)} 
                                            />
                                            <div className="finalize-text">
                                                <span className="finalize-title">Finalize Official Verdict</span>
                                                <span className="finalize-desc">Checked will notify contractor and update global status. Unchecked saves as internal recommendation.</span>
                                            </div>
                                        </label>
                                    </div>
                                )}

                                <div className="action-sheet-footer">
                                    <button 
                                        className={`sheet-submit-btn ${actionSheetStep}`}
                                        disabled={sheetSubmitting}
                                        onClick={async () => {
                                            if (sheetSubmitting) return;
                                            const isConditional = actionSheetStep === 'approve' && approveMode === 'conditional';
                                            const isReject = actionSheetStep === 'reject';
                                            const isCancel = actionSheetStep === 'cancel';

                                            if ((isConditional || isReject || isCancel) && !sheetRemarks.trim()) {
                                                setSheetError('Please provide remarks/reason.');
                                                return;
                                            }

                                            setSheetSubmitting(true);
                                            try {
                                                if (actionSheetStep === 'approve') {
                                                    await approveRFI(actionSheetTarget.id, user.id, sheetRemarks.trim(), sheetFiles, null, sheetIsFinal, approveMode);
                                                } else if (isReject) {
                                                    await rejectRFI(actionSheetTarget.id, user.id, sheetRemarks.trim(), sheetFiles, null, sheetIsFinal);
                                                } else if (isCancel) {
                                                    await cancelRFI(actionSheetTarget.id, user.id, sheetRemarks.trim(), null, sheetIsFinal);
                                                }
                                                setActionSheetTarget(null);
                                            } finally {
                                                setSheetSubmitting(false);
                                            }
                                        }}
                                    >
                                        {sheetSubmitting ? <RefreshCw size={16} className="spin-slow" /> : <Send size={16} />} {sheetSubmitting ? 'Submitting...' : `Confirm ${actionSheetStep === 'approve' ? 'Approval' : actionSheetStep === 'reject' ? 'Rejection' : 'Cancellation'}`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Global FieldMarkupStudio for Action Sheet */}
            {sheetMarkupIndex !== null && sheetFiles[sheetMarkupIndex] && (
                <FieldMarkupStudio 
                    image={sheetFiles[sheetMarkupIndex]} 
                    onClose={() => setSheetMarkupIndex(null)}
                    onSave={annotatedFile => {
                        setSheetFiles(prev => prev.map((f, i) => i === sheetMarkupIndex ? annotatedFile : f));
                        setSheetMarkupIndex(null);
                    }}
                />
            )}
            <style>
                {`
                @keyframes slideUp {
                    to { transform: translate(-50%, 0); opacity: 1; }
                }

                /* Mobile Fixes */
                .btn, .review-filter-btn, .mini-stat, .rq-all-btn, .rj-all-btn, .rj-card {
                    -webkit-tap-highlight-color: transparent;
                    outline: none !important;
                }
                .btn:focus, .review-filter-btn:focus {
                    outline: none !important;
                }

                .rq-all-btn {
                    background: 'var(--clr-bg-elevated)';
                    color: 'var(--clr-text-main)';
                    border: 1px solid var(--clr-border);
                    border-radius: 0.6rem;
                    font-weight: 600;
                    font-size: 0.85rem;
                    padding: 0.4rem 0.75rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    line-height: 1.5;
                    white-space: nowrap;
                }
                .rq-all-btn.active {
                    background: var(--clr-brand-primary, #6366f1);
                    color: #fff;
                    border-color: var(--clr-brand-primary, #6366f1);
                }

                @media (max-width: 768px) {
                    .review-header-controls {
                        flex-direction: column;
                        align-items: stretch !important;
                    }
                    .review-export-actions {
                        flex-wrap: wrap;
                        justify-content: flex-start;
                        width: 100%;
                    }
                    .review-filter-wrap {
                        display: flex;
                        gap: 0.5rem;
                    }
                    .rq-all-btn {
                        text-align: center;
                    }
                    .review-filter-btn {
                        justify-content: center;
                    }
                    .date-navigator {
                        width: 100%;
                        justify-content: space-between;
                    }
                }

                .batch-action-bar {
                    position: fixed;
                    bottom: 2rem;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #0f172a;
                    color: white;
                    padding: 0.75rem 1.5rem;
                    border-radius: 999px;
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1);
                    z-index: 1000;
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    width: max-content;
                    max-width: 95vw;
                }

                .batch-action-selected {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .batch-divider {
                    width: 1px;
                    height: 1.5rem;
                    background: rgba(255,255,255,0.2);
                }

                .selected-count {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: white;
                    white-space: nowrap;
                }

                .clear-btn {
                    color: rgba(255,255,255,0.6);
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .batch-action-ops {
                    display: flex;
                    align-items: center;
                }

                .approve-btn {
                    background-color: var(--clr-success) !important;
                    border-color: var(--clr-success) !important;
                    color: white !important;
                    font-weight: 600 !important;
                    border-radius: 999px !important;
                    padding: 0.5rem 1.5rem !important;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    transition: all 0.2s;
                }

                .approve-btn:hover {
                    box-shadow: 0 0 15px rgba(5, 150, 105, 0.4);
                    transform: translateY(-1px);
                }

                @media (max-width: 600px) {
                    .batch-action-bar {
                        bottom: 1.5rem;
                        padding: 0.75rem 1.25rem;
                        gap: 1rem;
                        border-radius: 1rem;
                    }
                    .selected-count {
                        font-size: 0.85rem;
                    }
                    .approve-btn {
                        padding: 0.5rem 1rem !important;
                        font-size: 0.8rem !important;
                    }
                }

                /* Action Sheet Styles */
                .action-sheet-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.4);
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    z-index: 2000;
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .action-sheet-overlay.open {
                    opacity: 1;
                    visibility: visible;
                }
                .action-sheet-panel {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: #fff;
                    border-top-left-radius: 24px;
                    border-top-right-radius: 24px;
                    padding: 24px 20px calc(24px + env(safe-area-inset-bottom, 0px));
                    z-index: 2001;
                    transform: translateY(100%);
                    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    box-shadow: 0 -10px 40px rgba(0,0,0,0.15);
                    max-width: 600px;
                    margin: 0 auto;
                }
                .action-sheet-overlay.open + .action-sheet-panel {
                    transform: translateY(0);
                }
                .action-sheet-header {
                    margin-bottom: 24px;
                    text-align: center;
                }
                .sheet-handle {
                    width: 40px;
                    height: 5px;
                    background: #e2e8f0;
                    border-radius: 5px;
                    margin: -10px auto 15px;
                }
                .action-sheet-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #0f172a;
                    margin-bottom: 4px;
                }
                .action-sheet-subtitle {
                    font-size: 0.85rem;
                    color: #64748b;
                    margin-bottom: 8px;
                }
                .sheet-header-meta {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                }
                .sheet-current-status-tag {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 12px;
                    background: #f1f5f9;
                    border-radius: 20px;
                    border: 1px solid #e2e8f0;
                    margin-top: 4px;
                }
                .sheet-current-status-tag span {
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #64748b;
                    letter-spacing: 0.05em;
                }
                .sheet-current-status-tag .badge {
                    transform: scale(0.85);
                    margin: 0 -8px;
                }
                .edit-decision-prominent-container {
                    margin-top: 2rem;
                    padding-top: 1.5rem;
                    border-top: 1px dashed #e2e8f0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.75rem;
                    width: 100%;
                }
                .btn-edit-decision-prominent {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    background: #f8fafc;
                    border: 2px solid #e2e8f0;
                    color: #475569;
                    padding: 0.75rem 2rem;
                    border-radius: 12px;
                    font-size: 1rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    width: auto;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                }
                .btn-edit-decision-prominent:hover {
                    background: #f1f5f9;
                    border-color: #cbd5e1;
                    color: #0f172a;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                }
                .btn-edit-decision-prominent:active {
                    transform: translateY(0);
                }
                .edit-decision-hint {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    font-style: italic;
                    text-align: center;
                    max-width: 300px;
                }
                .action-sheet-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }
                .sheet-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 18px 12px;
                    border-radius: 16px;
                    border: 1px solid transparent;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    -webkit-tap-highlight-color: transparent;
                }
                .sheet-btn.full-width {
                    grid-column: span 2;
                    flex-direction: row;
                    padding: 14px;
                }
                .sheet-btn-approve { background: #ecfdf5; color: #059669; border-color: #d1fae5; }
                .sheet-btn-approve:active { background: #d1fae5; transform: scale(0.97); }
                
                .sheet-btn-cond { background: #fffbeb; color: #d97706; border-color: #fef3c7; }
                .sheet-btn-cond:active { background: #fef3c7; transform: scale(0.97); }
                
                .sheet-btn-reject { background: #fef2f2; color: #dc2626; border-color: #fee2e2; }
                .sheet-btn-reject:active { background: #fee2e2; transform: scale(0.97); }
                
                .sheet-btn-cancel { background: #f8fafc; color: #475569; border-color: #e2e8f0; }
                .sheet-btn-cancel:active { background: #f1f5f9; transform: scale(0.97); }
                
                .sheet-btn-details { background: #eff6ff; color: #2563eb; border-color: #dbeafe; }
                .sheet-btn-details:active { background: #dbeafe; transform: scale(0.97); }

                /* Action Sheet Multi-Step Form Styling */
                .action-sheet-panel.expanded {
                    max-height: 85vh;
                    overflow-y: auto;
                }
                .sheet-back-btn {
                    background: none;
                    border: none;
                    color: #64748b;
                    padding: 8px;
                    margin-left: -8px;
                    margin-right: 8px;
                    cursor: pointer;
                    border-radius: 50%;
                    transition: background 0.2s;
                }
                .sheet-back-btn:hover { background: #f1f5f9; }
                
                .action-sheet-form-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                    padding-bottom: 20px;
                }
                .sheet-form-field { display: flex; flex-direction: column; gap: 0.5rem; }
                .sheet-form-label { font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
                .sheet-form-select {
                    width: 100%;
                    padding: 12px;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    font-size: 0.9rem;
                    background: #f8fafc;
                }
                .sheet-form-textarea {
                    width: 100%;
                    padding: 12px;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    font-size: 0.9rem;
                    font-family: inherit;
                    resize: none;
                }
                .sheet-add-photo {
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    padding: 4px 10px;
                    border-radius: 8px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #475569;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .sheet-file-strip { 
                    display: flex; 
                    gap: 10px; 
                    overflow-x: auto; 
                    padding: 4px 0; 
                    scrollbar-width: none; 
                }
                .sheet-file-item {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .sheet-file-thumb {
                    width: 70px;
                    height: 70px;
                    border-radius: 12px;
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .sheet-file-thumb img { width: 100%; height: 100%; object-fit: cover; }
                .sheet-file-actions-row {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                }
                .sheet-file-actions-row button {
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    width: 28px;
                    height: 28px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #475569;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .sheet-file-actions-row button:hover {
                    background: #e2e8f0;
                    color: #0f172a;
                }
                .sheet-file-actions-row button:last-child:hover {
                    background: #fee2e2;
                    color: #ef4444;
                    border-color: #fca5a5;
                }

                .sheet-submit-btn {
                    width: 100%;
                    padding: 16px;
                    border-radius: 14px;
                    border: none;
                    font-weight: 700;
                    font-size: 1rem;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .sheet-submit-btn.approve { background: #059669; box-shadow: 0 4px 12px rgba(5,150,105,0.2); }
                .sheet-submit-btn.reject { background: #dc2626; box-shadow: 0 4px 12px rgba(220,38,38,0.2); }
                .sheet-submit-btn.cancel { background: #475569; box-shadow: 0 4px 12px rgba(71,85,105,0.2); }
                .sheet-submit-btn:active { transform: scale(0.98); }
                
                .sheet-form-error { font-size: 0.8rem; color: #dc2626; font-weight: 500; text-align: center; }

                .btn-review-main {
                    background: #f8fafc;
                    border: 1px solid #cbd5e1;
                    color: #475569;
                    font-weight: 600;
                    padding: 6px 16px;
                    border-radius: 12px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.85rem;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .btn-review-main:hover {
                    background: #fff;
                    border-color: #64748b;
                    color: #0f172a;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                    transform: translateY(-1px);
                }
                .btn-review-mini {
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    color: #64748b;
                    padding: 4px 12px;
                    border-radius: 10px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-review-mini:hover {
                    background: #e2e8f0;
                    color: #334155;
                }

                .btn-claim {
                    background: #eff6ff !important;
                    border: 1px solid #3b82f6 !important;
                    color: #2563eb !important;
                    font-weight: 700 !important;
                    border-radius: 12px !important;
                    padding: 6px 16px !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                    transition: all 0.2s !important;
                    box-shadow: 0 1px 2px rgba(59, 130, 246, 0.1);
                }
                .btn-claim:hover {
                    background: #dbeafe !important;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
                }

                .badge-ghost-locked {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: #fffbeb;
                    color: #b45309;
                    font-size: 0.75rem;
                    font-weight: 700;
                    padding: 6px 14px;
                    border-radius: 12px;
                    border: 1px solid #fde68a;
                    white-space: nowrap;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
                }

                /* Collaborative Action Sheet Specifics */
                .sheet-history-section {
                    background: #f8fafc;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                    padding: 16px;
                    margin-bottom: 20px;
                }
                .sheet-section-title {
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 12px;
                }
                .sheet-history-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .sheet-history-item {
                    background: #fff;
                    border-radius: 12px;
                    padding: 12px;
                    border: 1px solid #f1f5f9;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
                    display: flex;
                    gap: 12px;
                    align-items: flex-start;
                }
                .bubble-avatar {
                    flex-shrink: 0;
                }
                .history-meta {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    flex: 1;
                }
                .history-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                    margin-bottom: 2px;
                }
                .history-name {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: #1e293b;
                }
                
                .compact-status-badge {
                    font-size: 0.65rem;
                    font-weight: 800;
                    padding: 2px 8px;
                    border-radius: 6px;
                    text-transform: uppercase;
                }
                .compact-status-badge.approved { background: #dcfce7; color: #166534; }
                .compact-status-badge.conditional_approve { background: #fef3c7; color: #92400e; }
                .compact-status-badge.rejected { background: #fee2e2; color: #991b1b; }
                
                .history-remarks {
                    font-size: 0.8rem;
                    color: #475569;
                    margin: 0;
                    line-height: 1.4;
                }

                .bubble-attachments .rfi-attachments-grid.small {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .bubble-attachments .rfi-attachment-thumb {
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                }
                .bubble-attachments .rfi-attachment-thumb img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .sheet-finalize-card {
                    background: #f0f9ff;
                    border: 1px solid #bae6fd;
                    border-radius: 16px;
                    padding: 16px;
                }
                .sheet-finalize-label {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    cursor: pointer;
                }
                .sheet-finalize-label input[type="checkbox"] {
                    margin-top: 4px;
                    width: 18px;
                    height: 18px;
                    accent-color: #0369a1;
                }
                .finalize-text {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .finalize-title {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: #0c4a6e;
                }
                .finalize-desc {
                    font-size: 0.75rem;
                    color: #0369a1;
                    line-height: 1.3;
                    opacity: 0.8;
                }
                `}
            </style>
        </div>
    );
}

