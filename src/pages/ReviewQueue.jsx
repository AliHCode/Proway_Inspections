import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { useProject } from '../context/ProjectContext';
import { getToday, formatDateDisplay } from '../utils/rfiLogic';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import StatusBadge from '../components/StatusBadge';
import ApproveModal from '../components/ApproveModal';
import RejectModal from '../components/RejectModal';
import RFIDetailModal from '../components/RFIDetailModal';
import UserAvatar from '../components/UserAvatar';
import { exportToExcel, exportToPDF, generateDailyReport } from '../utils/exportUtils';
import { CheckCircle, XCircle, MessageSquare, X, FileDown, Table, ClipboardList, Filter } from 'lucide-react';

export default function ReviewQueue() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const { approveRFI, rejectRFI, getReviewQueue, rfis, contractors, canUserEditRfi, canUserDiscussRfi } = useRFI();
    const { activeProject, orderedTableColumns, columnWidthMap, getTableColumnStyle, loadingFields, fieldsResolvedProjectId } = useProject();
    const activeProjectName = activeProject?.name || 'ProWay Project';
    const [currentDate, setCurrentDate] = useState(getToday());
    const [approveTarget, setApproveTarget] = useState(null);
    const [rejectTarget, setRejectTarget] = useState(null);
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

    const queue = getReviewQueue(currentDate);

    // Also get approved/rejected for today for reference
    const todayApproved = rfis.filter(
        (r) => r.status === 'approved' && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );
    const todayRejected = rfis.filter(
        (r) => r.status === 'rejected' && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );

    let baseItems = queue.all;
    if (filter === 'approved') baseItems = todayApproved;
    if (filter === 'rejected') baseItems = todayRejected;
    if (filter === 'my_assigned') baseItems = queue.all.filter(r => r.assignedTo === user.id);

    const FILTER_EXCLUDED_COLUMNS = new Set(['serial', 'actions', 'attachments']);
    const filterableColumns = orderedTableColumns.filter((col) => !FILTER_EXCLUDED_COLUMNS.has(col.field_key));

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
            return next;
        });

        if (!selectedFilterColumn || !validKeys.has(selectedFilterColumn)) {
            setSelectedFilterColumn(filterableColumns[0]?.field_key || '');
        }
    }, [filterableColumns, selectedFilterColumn]);

    useEffect(() => {
        const visibleIds = new Set(filteredItems.map((rfi) => rfi.id));
        setSelectedRfiIds((prev) => prev.filter((id) => visibleIds.has(id)));
    }, [filteredItems]);

    const shouldShowTable = Boolean(activeProject?.id && readyTableProjectId === activeProject.id);


    async function handleApprove(rfiId, remarks = '', files = []) {
        await approveRFI(rfiId, user.id, remarks, files);
        setActionMessage('✅ Inspection Approved Successfully');
        setTimeout(() => setActionMessage(''), 2000);
    }

    async function handleReject(rfiId, remarks, files = []) {
        await rejectRFI(rfiId, user.id, remarks, files);
        setActionMessage('❌ Inspection Rejected & Returned');
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
        const isModalOpen = !!(detailTarget || approveTarget || rejectTarget || selectedImages);
        if (isModalOpen) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => document.body.classList.remove('no-scroll');
    }, [detailTarget, approveTarget, rejectTarget, selectedImages]);

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
                                <button
                                    onClick={() => {
                                        setApproveTarget(rfi);
                                        setRejectTarget(null);
                                        setDetailTarget(null);
                                    }}
                                    title="Approve"
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
                                    <CheckCircle size={15} />
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

    function renderReviewOrderedCell(rfi, col, isCarryover) {
        if (col.field_key === 'serial') {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <UserAvatar name={rfi.filerName} size={32} />
                    <div>
                        <div style={{ fontWeight: 600 }}>#{rfi.serialNo}</div>
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
                    <div>
                        <h1>🔍 Review Queue</h1>
                        <p className="subtitle" style={{ marginTop: '0.25rem' }}>Manage & export daily inspections</p>
                    </div>
                    <div className="review-header-controls">
                        <div className="export-actions review-export-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <div className="review-filter-wrap">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost review-filter-btn"
                                    onClick={() => setFilterPopoverOpen((prev) => !prev)}
                                    title="Filter table"
                                >
                                    <Filter size={15} /> Filters
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
                            <button
                                className="btn btn-sm"
                                style={{ backgroundColor: 'transparent', color: 'var(--clr-brand-secondary)', border: '1px solid var(--clr-border-dark)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                onClick={() => exportToPDF(filteredItems, `ProWay_Inspections_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template)}
                                title="Export to PDF"
                                aria-label="Export to PDF"
                            >
                                <FileDown size={16} /> PDF
                            </button>
                            <button
                                className="btn btn-sm"
                                style={{ backgroundColor: 'transparent', color: 'var(--clr-brand-secondary)', border: '1px solid var(--clr-border-dark)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                onClick={() => exportToExcel(filteredItems, `ProWay_Inspections_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template)}
                                title="Export to Excel"
                                aria-label="Export to Excel"
                            >
                                <Table size={16} /> Excel
                            </button>
                            <button
                                className="btn btn-sm"
                                style={{ backgroundColor: 'var(--clr-brand-secondary)', color: 'white', border: '1px solid var(--clr-brand-secondary)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                onClick={() => generateDailyReport([...todayApproved, ...todayRejected], currentDate, activeProjectName, orderedTableColumns, columnWidthMap, activeProject?.export_template)}
                                title="Generate branded daily report"
                            >
                                <ClipboardList size={16} /> Daily Report
                            </button>
                        </div>
                        <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                    </div>
                </div>

                {/* Mini Stats (Acts as filters) */}
                <div className="review-mini-stats">
                    <div className="mini-stat pending" onClick={() => setFilter('to_review')} style={{ cursor: 'pointer', border: filter === 'to_review' ? '2px solid var(--clr-brand-secondary)' : '' }}>
                        <span className="mini-stat-label">To Review</span>
                        <span className="mini-stat-value">{queue.all.length}</span>
                    </div>
                    <div className="mini-stat approved" onClick={() => setFilter('approved')} style={{ cursor: 'pointer', border: filter === 'approved' ? '2px solid var(--clr-success)' : '' }}>
                        <span className="mini-stat-label">Approved Today</span>
                        <span className="mini-stat-value">{todayApproved.length}</span>
                    </div>
                    <div className="mini-stat rejected" onClick={() => setFilter('rejected')} style={{ cursor: 'pointer', border: filter === 'rejected' ? '2px solid var(--clr-danger)' : '' }}>
                        <span className="mini-stat-label">Rejected Today</span>
                        <span className="mini-stat-value">{todayRejected.length}</span>
                    </div>
                    <div className="mini-stat assigned" onClick={() => setFilter('my_assigned')} style={{ cursor: 'pointer', border: filter === 'my_assigned' ? '2px solid var(--clr-brand-primary)' : '' }}>
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
                        <p>{filter === 'to_review' ? 'All RFIs have been reviewed for this date.' : 'No items match this filter.'}</p>
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

                {/* Inline Rejection Widget */}
                {approveTarget && (
                    <ApproveModal
                        key={approveTarget.id}
                        rfi={approveTarget}
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
                    from { transform: translate(-50%, 20px); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
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

