import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { useProject } from '../context/ProjectContext';
import { getToday, formatDateDisplay } from '../utils/rfiLogic';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import StatusBadge from '../components/StatusBadge';
import ApproveModal from '../components/ApproveModal';
import RejectModal from '../components/RejectModal';
import CancelModal from '../components/CancelModal';
import RFIDetailModal from '../components/RFIDetailModal';
import UserAvatar from '../components/UserAvatar';
import { exportToExcel, exportToPDF, generateDailyReport } from '../utils/exportUtils';
import { CheckCircle, XCircle, MessageSquare, Ban, X, FileDown, Table, ClipboardList, Filter } from 'lucide-react';

export default function ReviewQueue() {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const { user } = useAuth();
    const { approveRFI, updateRFI, rejectRFI, cancelRFI, getReviewQueue, rfis, contractors, canUserEditRfi, canUserDiscussRfi } = useRFI();
    const { activeProject, orderedTableColumns, columnWidthMap, getTableColumnStyle, loadingFields, fieldsResolvedProjectId } = useProject();
    const activeProjectName = activeProject?.name || 'ProWay Project';
    const [currentDate, setCurrentDate] = useState(getToday());
    const [approveTarget, setApproveTarget] = useState(null);
    const [approveMode, setApproveMode] = useState('full');
    const [rejectTarget, setRejectTarget] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [detailTarget, setDetailTarget] = useState(null);
    const [filter, setFilter] = useState('to_review'); // to_review, approved, rejected
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
    const [showAllToday, setShowAllToday] = useState(false);

    const queue = getReviewQueue(currentDate);

    // Also get approved/rejected for today for reference
    const todayApproved = rfis.filter(
        (r) => (r.status === 'approved' || r.status === 'conditional_approve') && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );
    const todayRejected = rfis.filter(
        (r) => r.status === 'rejected' && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );

    let baseItems = queue.all;
    if (showAllToday) {
        // Collect everything for today without duplicates
        const allSet = new Map();
        [...queue.all, ...todayApproved, ...todayRejected].forEach(r => allSet.set(r.id, r));
        baseItems = Array.from(allSet.values());
    } else {
        if (filter === 'approved') baseItems = todayApproved;
        if (filter === 'rejected') baseItems = todayRejected;
        if (filter === 'my_assigned') baseItems = queue.all.filter(r => r.assignedTo === user.id);
    }

    const FILTER_EXCLUDED_COLUMNS = new Set(['serial', 'actions', 'attachments']);
    const filterableColumns = useMemo(
        () => orderedTableColumns.filter((col) => !FILTER_EXCLUDED_COLUMNS.has(col.field_key)),
        [orderedTableColumns]
    );

    const getColumnRawValue = (rfi, fieldKey) => {
        if (fieldKey === 'description') return rfi.description;
        if (fieldKey === 'location') return rfi.location;
        if (fieldKey === 'inspection_type') return rfi.inspectionType;
        if (fieldKey === 'status') return rfi.status;
        if (fieldKey === 'remarks') return rfi.remarks;
        return rfi.customFields?.[fieldKey];
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

    const filteredItems = baseItems.filter((rfi) => {
        return activeFilterEntries.every(([fieldKey, selectedValues]) => {
            const rfiValue = normalizeFilterValue(getColumnRawValue(rfi, fieldKey));
            return selectedValues.includes(rfiValue);
        });
    });

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
        if (!filterPopoverOpen) return;

        const closeOnOutsidePointer = (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest('.review-filter-wrap')) return;
            setFilterPopoverOpen(false);
        };

        const closeOnEscape = (event) => {
            if (event.key === 'Escape') {
                setFilterPopoverOpen(false);
            }
        };

        // REMOVED: closeOnResize closes the popover when mobile keyboard opens
        // const closeOnResize = () => {
        //     setFilterPopoverOpen(false);
        // };

        document.addEventListener('pointerdown', closeOnOutsidePointer);
        document.addEventListener('keydown', closeOnEscape);
        // window.addEventListener('resize', closeOnResize);

        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            document.removeEventListener('keydown', closeOnEscape);
            // window.removeEventListener('resize', closeOnResize);
        };
    }, [filterPopoverOpen]);

    useEffect(() => {
        setFilterPopoverOpen(false);
    }, [location.pathname]);

    const shouldShowTable = Boolean(activeProject?.id && readyTableProjectId === activeProject.id);
    async function handleApprove(rfiId, remarks, files = [], status = 'approved') {
        const updatePayload = {
            status,
            reviewedBy: user.id,
            reviewedAt: new Date().toISOString(),
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

    async function handleCancel(rfiId, reason) {
        await cancelRFI(rfiId, user.id, reason);
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
        const targetRfiId = searchParams.get('rfi');
        if (!targetRfiId || !rfis?.length || !user?.id) return;

        const targetRfi = rfis.find((rfi) => rfi.id === targetRfiId);
        if (!targetRfi) return;

        const targetFilter =
            targetRfi.status === 'approved'
                ? 'approved'
                : targetRfi.status === 'rejected'
                    ? 'rejected'
                    : targetRfi.assignedTo === user.id
                        ? 'my_assigned'
                        : 'to_review';

        const targetDate = targetRfi.reviewedAt?.slice(0, 10) || targetRfi.carryoverTo || targetRfi.originalFiledDate || targetRfi.filedDate;

        if (filter !== targetFilter) {
            setFilter(targetFilter);
            return;
        }

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
    }, [searchParams, setSearchParams, rfis, user, currentDate, filter]);

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
        const canEditThisRfi = canUserEditRfi(rfi);
        const canChatThisRfi = canUserDiscussRfi(rfi);
        const showApproveAction = filter !== 'approved';
        const showRejectAction = filter !== 'rejected';

        if (filter === 'to_review' || filter === 'my_assigned' || filter === 'approved' || filter === 'rejected') {
            return (
                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                    {canEditThisRfi && (
                        <>
                            {showApproveAction && (
                                <>
                                    <button
                                        onClick={() => {
                                            setApproveMode('full');
                                            setApproveTarget(rfi);
                                            setRejectTarget(null);
                                            setDetailTarget(null);
                                        }}
                                        title="Full Approve"
                                        style={{
                                            background: 'transparent', border: '1.5px solid #d1d5db',
                                            borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '3px',
                                            color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                                            fontFamily: 'inherit', transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--clr-success)'; e.currentTarget.style.color = 'var(--clr-success)'; e.currentTarget.style.background = '#f0fdf4'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <CheckCircle size={15} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setApproveMode('conditional');
                                            setApproveTarget(rfi);
                                            setRejectTarget(null);
                                            setDetailTarget(null);
                                        }}
                                        title="Conditional Approve"
                                        style={{
                                            background: 'transparent', border: '1.5px solid #d1d5db',
                                            borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '3px',
                                            color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                                            fontFamily: 'inherit', transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--clr-warning)'; e.currentTarget.style.color = 'var(--clr-warning)'; e.currentTarget.style.background = '#fffbeb'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <CheckCircle size={15} />
                                        <span style={{ fontSize: '10px', fontWeight: 700 }}>COND.</span>
                                    </button>
                                </>
                            )}
                            {showRejectAction && (
                                <button
                                    onClick={() => {
                                        setCancelTarget(rfi);
                                        setDetailTarget(null);
                                    }}
                                    title="Cancel RFI (Terminal)"
                                    style={{
                                        background: 'transparent', border: '1.5px solid #d1d5db',
                                        borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '3px',
                                        color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                                        fontFamily: 'inherit', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#4b5563'; e.currentTarget.style.color = '#4b5563'; e.currentTarget.style.background = '#f3f4f6'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <Ban size={15} />
                                </button>
                            )}
                            {showRejectAction && (
                                <button
                                    onClick={() => {
                                        setRejectTarget(rfi);
                                        setDetailTarget(null);
                                    }}
                                    title="Reject"
                                    style={{
                                        background: 'transparent', border: '1.5px solid #d1d5db',
                                        borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '3px',
                                        color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                                        fontFamily: 'inherit', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = '#f9fafb'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <XCircle size={15} />
                                </button>
                            )}
                        </>
                    )}
                    {canChatThisRfi && (
                        <button
                            onClick={() => {
                                setDetailTarget(rfi);
                                setRejectTarget(null);
                                setScrollTrigger(prev => prev + 1);
                                setTimeout(() => scrollToPageBottom(), 80);
                            }}
                            title="Chat"
                            style={{
                                background: 'transparent', border: '1.5px solid #d1d5db',
                                borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '3px',
                                color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                                fontFamily: 'inherit', transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = '#f9fafb'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                        >
                            <MessageSquare size={15} />
                        </button>
                    )}
                </div>
            );
        }

        return (
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                <StatusBadge status={rfi.status} />
                <button
                    onClick={() => {
                        setDetailTarget(rfi);
                        setRejectTarget(null);
                        setScrollTrigger(prev => prev + 1);
                        setTimeout(() => scrollToPageBottom(), 80);
                    }}
                    title="Open Discussion"
                    style={{
                        background: 'transparent', border: '1.5px solid #d1d5db',
                        borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '3px',
                        color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                        fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = '#f9fafb'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                >
                    <MessageSquare size={15} />
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

    function renderReviewOrderedCell(rfi, col, isCarryover) {
        if (col.field_key === 'serial') {
            const escalated = isEscalated(rfi);
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <UserAvatar name={rfi.filerName} size={32} />
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600 }}>#{rfi.serialNo}</span>
                            {escalated && (
                                <span style={{
                                    backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '0.65rem',
                                    fontWeight: 700, padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca'
                                }}>
                                    ESCALATED
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>
                            {rfi.filerName}
                        </div>
                    </div>
                    {isCarryover && (
                        <div className="carryover-count" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                            ×{rfi.carryoverCount} Carryover
                        </div>
                    )}
                </div>
            );
        }

        if (col.field_key === 'description') return rfi.description;
        if (col.field_key === 'location') return rfi.location;
        if (col.field_key === 'inspection_type') return rfi.inspectionType;
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
                            <img key={idx} src={url} alt="attachment" className="thumbnail" />
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

    return (
        <div className="page-wrapper">
            <Header />
            <main className="review-page">
                <div className="sheet-header">
                    <div className="sheet-tabs-container">
                        <div className="sheet-tab active">
                            <h2>Review Queue</h2>
                        </div>
                    </div>
                    <div className="review-header-controls">
                        <div className="export-actions review-export-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <button
                                className="btn btn-sm"
                                style={{ backgroundColor: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                onClick={() => exportToPDF(filteredItems, `ProWay_Inspections_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template)}
                                title="Export to PDF"
                                aria-label="Export to PDF"
                            >
                                <FileDown size={17} /> PDF
                            </button>
                            <button
                                className="btn btn-sm"
                                style={{ backgroundColor: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                onClick={() => exportToExcel(filteredItems, `ProWay_Inspections_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template)}
                                title="Export to Excel"
                                aria-label="Export to Excel"
                            >
                                <Table size={17} /> Excel
                            </button>
                            <div className="review-filter-wrap" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className={`btn btn-sm rq-all-btn ${showAllToday ? 'active' : ''}`}
                                    onClick={() => setShowAllToday(prev => !prev)}
                                    title={showAllToday ? 'Return to category filter' : 'Show all RFIs for today'}
                                >
                                    All RFIs Today
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm review-filter-btn"
                                    style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                                    onClick={() => setFilterPopoverOpen((prev) => !prev)}
                                    title="Filter table"
                                >
                                    <Filter size={15} color="#0f172a" /> Filters
                                    {activeFilterEntries.length > 0 && <span className="review-filter-count">{activeFilterEntries.length}</span>}
                                </button>
                                {filterPopoverOpen && (
                                    <div className="review-filter-popover">
                                        <div className="review-filter-popover-header">
                                            <h4>Filter Table</h4>
                                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFilterPopoverOpen(false)}>
                                                <X size={14} />
                                            </button>
                                        </div>

                                        <label className="review-filter-label">Column</label>
                                        <select
                                            className="review-filter-select"
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

                                        <label className="review-filter-label">Values</label>
                                        <input
                                            type="text"
                                            className="review-filter-search"
                                            placeholder="Search values..."
                                            value={filterValueSearch}
                                            onChange={(e) => setFilterValueSearch(e.target.value)}
                                        />

                                        <div className="review-filter-values">
                                            {availableValuesForSelectedColumn.length === 0 ? (
                                                <div className="review-filter-empty">No values found</div>
                                            ) : availableValuesForSelectedColumn.map((value) => (
                                                <label key={`${selectedFilterColumn}_${value}`} className="review-filter-value-item">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedValuesForColumn.includes(value)}
                                                        onChange={() => toggleColumnFilterValue(selectedFilterColumn, value)}
                                                    />
                                                    <span>{value}</span>
                                                </label>
                                            ))}
                                        </div>

                                        <div className="review-filter-actions">
                                            <button type="button" className="btn btn-sm btn-ghost" onClick={clearSelectedColumnFilters}>Clear Column</button>
                                            <button type="button" className="btn btn-sm btn-ghost" onClick={clearAllColumnFilters}>Clear All</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                    </div>
                </div>

                {/* Mini Stats (Acts as filters) */}
                <div className="review-mini-stats" style={{ opacity: showAllToday ? 0.5 : 1, pointerEvents: showAllToday ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
                    <div className="mini-stat pending" onClick={() => setFilter('to_review')} style={{ cursor: 'pointer', border: filter === 'to_review' && !showAllToday ? '2px solid var(--clr-brand-secondary)' : '' }}>
                        <span className="mini-stat-label">To Review</span>
                        <span className="mini-stat-value">{queue.all.length}</span>
                    </div>
                    <div className="mini-stat approved" onClick={() => setFilter('approved')} style={{ cursor: 'pointer', border: filter === 'approved' && !showAllToday ? '2px solid var(--clr-success)' : '' }}>
                        <span className="mini-stat-label">Approved Today</span>
                        <span className="mini-stat-value">{todayApproved.length}</span>
                    </div>
                    <div className="mini-stat rejected" onClick={() => setFilter('rejected')} style={{ cursor: 'pointer', border: filter === 'rejected' && !showAllToday ? '2px solid var(--clr-danger)' : '' }}>
                        <span className="mini-stat-label">Rejected Today</span>
                        <span className="mini-stat-value">{todayRejected.length}</span>
                    </div>
                    <div className="mini-stat assigned" onClick={() => setFilter('my_assigned')} style={{ cursor: 'pointer', border: filter === 'my_assigned' && !showAllToday ? '2px solid var(--clr-brand-primary)' : '' }}>
                        <span className="mini-stat-label">Assigned to Me</span>
                        <span className="mini-stat-value">{queue.all.filter(r => r.assignedTo === user.id).length}</span>
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
                        <p>{showAllToday ? 'No RFIs found for this date.' : (filter === 'to_review' ? 'All RFIs have been reviewed for this date.' : 'No items match this filter.')}</p>
                    </div>
                ) : (
                    <div className="sheet-section">
                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        <th className="col-serial" style={{ width: '40px' }}>
                                            {(filter === 'to_review' || filter === 'my_assigned') && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRfiIds.length > 0 && selectedRfiIds.length === filteredItems.length}
                                                    onChange={handleSelectAll}
                                                />
                                            )}
                                        </th>
                                        {orderedTableColumns.map((col) => (
                                            <th key={col.id || col.field_key} style={getTableColumnStyle(col.field_key)}>{col.field_name}</th>
                                        ))}
                                        <th className="col-assign">Assigned To</th>
                                        <th className="col-status">Filed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.map((rfi) => {
                                        const isCarryover = rfi.status === 'rejected' && rfi.carryoverTo === currentDate;
                                        return (
                                            <tr
                                                key={rfi.id}
                                                data-rfi-id={rfi.id}
                                                className={`${isCarryover ? 'carryover-row ' : ''}${focusedRfiId === rfi.id ? 'notification-focus-row' : ''}`.trim()}
                                            >
                                                <td className="col-serial">
                                                    {(filter === 'to_review' || filter === 'my_assigned') && (
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRfiIds.includes(rfi.id)}
                                                            onChange={() => toggleSelect(rfi.id)}
                                                        />
                                                    )}
                                                </td>
                                                {orderedTableColumns.map((col) => (
                                                    <td
                                                        key={`${rfi.id}_${col.field_key}`}
                                                        data-label={col.field_name}
                                                        style={getTableColumnStyle(col.field_key)}
                                                    >
                                                        {renderReviewOrderedCell(rfi, col, isCarryover)}
                                                    </td>
                                                ))}
                                                <td className="col-assign" data-label="Assigned To">
                                                    {rfi.assigneeName ? (
                                                        <span className={`assign-badge ${rfi.assignedTo === user.id ? 'is-me' : ''}`}>
                                                            {rfi.assignedTo === user.id ? '📌 You' : rfi.assigneeName}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted">— Auto —</span>
                                                    )}
                                                </td>
                                                <td className="col-status" data-label="Filed Date">{formatDateDisplay(rfi.originalFiledDate)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Detail & Comments Modal */}
                {detailTarget && (
                    <RFIDetailModal
                        key={detailTarget.id}
                        rfi={detailTarget}
                        onClose={() => setDetailTarget(null)}
                        externalScrollTrigger={scrollTrigger}
                    />
                )}

                {/* Inline Widgets */}
                {approveTarget && (
                    <ApproveModal
                        key={approveTarget.id}
                        rfi={approveTarget}
                        mode={approveMode}
                        contractors={contractors}
                        onApprove={handleApprove}
                        onClose={() => setApproveTarget(null)}
                    />
                )}

                {rejectTarget && (
                    <RejectModal
                        key={rejectTarget.id}
                        rfi={rejectTarget}
                        onReject={handleReject}
                        contractors={contractors}
                        onClose={() => setRejectTarget(null)}
                    />
                )}
                {cancelTarget && (
                    <CancelModal
                        key={cancelTarget.id}
                        isOpen={!!cancelTarget}
                        rfi={cancelTarget}
                        onConfirm={(reason) => handleCancel(cancelTarget.id, reason)}
                        onClose={() => setCancelTarget(null)}
                    />
                )}

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

            </main>
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
                    background: #f8fafc;
                    color: #1e293b;
                    border: 1px solid #e2e8f0;
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
                        width: 100%;
                        gap: 0.5rem;
                        justify-content: space-between;
                    }
                    .rq-all-btn {
                        flex: 1;
                        text-align: center;
                    }
                    .review-filter-btn {
                        flex: 1;
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
                `}
            </style>
        </div>
    );
}

