import { useEffect, useState, useRef, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { getToday, formatDateDisplay, getThumbnailUrl } from '../utils/rfiLogic';
import { INSPECTION_TYPES, RFI_STATUS } from '../utils/constants';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import StatusBadge from '../components/StatusBadge';
import RFIDetailModal from '../components/RFIDetailModal';
import EditRFIModal from '../components/EditRFIModal';
import FieldMarkupStudio from '../components/FieldMarkupStudio';
import CreateRevisionModal from '../components/CreateRevisionModal';
import { Plus, Trash2, Send, RefreshCw, X, MessageSquare, FileDown, Table, ClipboardList, Brush, Maximize2, Minimize2, RotateCcw, List } from 'lucide-react';
import { exportToExcel, exportToPDF, generateDailyReport } from '../utils/exportUtils';
import { useProject } from '../context/ProjectContext';
import { exportMappedRfiWorkbook, hasContractorExcelTemplate } from '../utils/contractorExcelTemplate';

export default function DailyRFISheet() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { activeProject, projectFields, orderedTableColumns, getTableColumnStyle, columnWidthMap, assignmentMode, contractorPermissions } = useProject();
    const activeProjectName = activeProject?.name || 'ProWay Project';
    const { createRFI, uploadImages, updateRFI, getRFIsForDate, resubmitRFI, deleteRFI, consultants, rfis, pendingSyncCount, canUserEditRfi, minDate } = useRFI();
    const [currentDate, setCurrentDate] = useState(getToday());
    const [detailTarget, setDetailTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const [newRows, setNewRows] = useState(() => [{
        tempId: Date.now() + Math.random(),
        assignedTo: '',
        images: [],
        parentId: null,
        customFields: {},
    }]);
    const [submitMessage, setSubmitMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedImages, setSelectedImages] = useState(null);
    const [markupTarget, setMarkupTarget] = useState(null);
    const [focusedRfiId, setFocusedRfiId] = useState(null);
    const [showNewRfiEntry, setShowNewRfiEntry] = useState(false);
    const [scrollNonce, setScrollNonce] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const pageRef = useRef(null);

    const [activeTab, setActiveTab] = useState('daily');
    const [revisionTarget, setRevisionTarget] = useState(null);
    const [showAllRejected, setShowAllRejected] = useState(false);
    const [exportingCustomWorkbook, setExportingCustomWorkbook] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(() => (
        typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
    ));

    const { newRfis } = getRFIsForDate(currentDate);

    const activeRejectedRfis = useMemo(() => {
        let items = (rfis || []).filter(r => 
            r.filedBy === user.id && 
            (r.status === RFI_STATUS.REJECTED || r.status === RFI_STATUS.CONDITIONAL_APPROVE) &&
            !rfis.some(child => child.parentId === r.id)
        );

        if (!showAllRejected) {
            // Default: Only show items reviewed/rejected on the selected timeline date
            items = items.filter(r => r.reviewedAt && r.reviewedAt.startsWith(currentDate));
        }

        return items.sort((a, b) => new Date(a.filedDate) - new Date(b.filedDate));
    }, [rfis, user.id, currentDate, showAllRejected]);

    // Current date's new RFIs (exclude superseded/revised ones)
    const dailyRfis = newRfis.filter(r => 
        r.filedBy === user.id && 
        r.status !== RFI_STATUS.CANCELLED &&
        !rfis.some(child => child.parentId === r.id)
    ).sort((a,b) => a.serialNo - b.serialNo);

    // Determine unique previously used locations and descriptions for suggestions dynamically
    const uniqueSuggestions = useMemo(() => {
        const suggs = {};
        const allBaseRfis = [...dailyRfis, ...newRows];
        
        // Extract from top-level properties (legacy) or customFields
        const extract = (key) => Array.from(new Set(
            allBaseRfis.map(r => r[key] || r.customFields?.[key]).filter(Boolean)
        ));

        ['location', 'description', 'inspection_type'].forEach(k => {
            suggs[k] = extract(k);
        });

        // Also extract for any other custom fields
        (projectFields || []).forEach(pf => {
            if (!suggs[pf.field_key]) {
                suggs[pf.field_key] = Array.from(new Set(
                    allBaseRfis.map(r => r.customFields?.[pf.field_key]).filter(Boolean)
                ));
            }
        });

        return suggs;
    }, [dailyRfis, newRows, projectFields]);

    const uniqueCustomFields = uniqueSuggestions;
    const uniqueDescriptions = uniqueSuggestions.description || [];
    const uniqueLocations = uniqueSuggestions.location || [];

    // Determines what to show in the table
    const currentRfis = activeTab === 'daily' ? dailyRfis : activeRejectedRfis;
    const editableRows = contractorPermissions.canFileRfis ? newRows : [];
    const customWorkbookEnabled = hasContractorExcelTemplate(activeProject?.export_template);

    const reportRfis = rfis ? rfis.filter(r =>
        r.filedBy === user.id &&
        (r.status === 'approved' || r.status === 'rejected' || r.status === 'conditional_approve') &&
        ((r.reviewedAt && r.reviewedAt.startsWith(currentDate)) || r.filedDate === currentDate)
    ) : [];

    const markupImage = markupTarget
        ? newRows.find((r) => r.tempId === markupTarget.tempId)?.images?.[markupTarget.imageIndex] || null
        : null;

    function createEmptyRow() {
        return {
            tempId: Date.now() + Math.random(),
            assignedTo: '',
            images: [],
            parentId: null,
            customFields: {},
        };
    }

    function addRow() {
        if (!contractorPermissions.canFileRfis) return;
        setNewRows((prev) => [...prev, createEmptyRow()]);
    }

    function removeRow(tempId) {
        setNewRows((prev) => prev.filter((r) => r.tempId !== tempId));
    }

    function updateRow(tempId, field, value) {
        setNewRows((prev) =>
            prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r))
        );
    }

    function handleCreateRevision(rfi, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setRevisionTarget(rfi);
    }

    function removeImage(tempId, imgIndex) {
        setNewRows((prev) =>
            prev.map((r) => {
                if (r.tempId === tempId) {
                    const newImages = [...r.images];
                    newImages.splice(imgIndex, 1);
                    return { ...r, images: newImages };
                }
                return r;
            })
        );
    }

    function replaceImage(tempId, imgIndex, file) {
        setNewRows((prev) =>
            prev.map((r) => {
                if (r.tempId === tempId) {
                    const nextImages = [...r.images];
                    nextImages[imgIndex] = file;
                    return { ...r, images: nextImages };
                }
                return r;
            })
        );
    }

    function getImagePreviewSrc(image) {
        if (!image) return '';
        return typeof image === 'string' ? image : URL.createObjectURL(image);
    }

    async function handleSubmit() {
        if (!contractorPermissions.canFileRfis) {
            setSubmitMessage('View-only project access. Ask the lead contractor to enable RFI filing.');
            setTimeout(() => setSubmitMessage(''), 3000);
            return;
        }

        const validRows = newRows.filter((r) => {
            const hasCustomData = Object.values(r.customFields).some(val => val && val.toString().trim().length > 0);
            return hasCustomData || r.images.length > 0;
        });

        if (validRows.length === 0) {
            setSubmitMessage('Please fill in at least one RFI column or attach a photo.');
            setTimeout(() => setSubmitMessage(''), 3000);
            return;
        }

        const offline = !navigator.onLine;
        setIsSubmitting(true);
        setSubmitMessage(offline ? 'No signal. Saving RFIs offline...' : 'Uploading files and submitting RFIs...');

        try {
            for (const row of validRows) {
                await createRFI({
                    filedBy: user.id,
                    filedDate: currentDate,
                    images: row.images,
                    assignedTo: assignmentMode === 'direct' ? (row.assignedTo || null) : null,
                    parentId: row.parentId || null,
                    customFields: Object.keys(row.customFields).length > 0 ? row.customFields : null,
                });
            }

            setNewRows([createEmptyRow()]);
            // Clear local storage draft after successful submit
            const draftKey = `rfi_draft_${user.id}_${activeProject?.id || 'default'}`;
            localStorage.removeItem(draftKey);

            setSubmitMessage(
                offline
                    ? `✅ ${validRows.length} RFI(s) saved offline. They will auto-sync when Wi-Fi returns.`
                    : `✅ ${validRows.length} RFI(s) submitted successfully!`
            );
        } catch (error) {
            console.error("Submit error:", error);
            setSubmitMessage('❌ Error submitting RFIs. Please try again.');
        } finally {
            setIsSubmitting(false);
            setTimeout(() => setSubmitMessage(''), 3000);
        }
    }

    function handleResubmit(rfiId) {
        const confirmed = window.confirm('Re-submit this inspection for consultant review?');
        if (!confirmed) return;
        resubmitRFI(rfiId, currentDate);
    }

    async function handleSaveEdit(payload) {
        if (!editTarget) return;
        const uploaded = payload.newFiles.length > 0 ? await uploadImages(payload.newFiles) : [];
        await updateRFI(editTarget.id, {
            remarks: payload.remarks,
            images: [...payload.existingImages, ...uploaded],
            customFields: payload.customFields || {},
        });
    }

    async function handleExportCustomWorkbook(items, fileName) {
        if (!items || items.length === 0) {
            toast.error('No RFIs available for custom export.');
            return;
        }

        setExportingCustomWorkbook(true);
        try {
            await exportMappedRfiWorkbook({
                rfis: items,
                projectTemplate: activeProject?.export_template,
                fileName,
            });
            toast.success('Custom Excel workbook generated.');
        } catch (error) {
            console.error('Custom workbook export failed:', error);
            toast.error(error.message || 'Failed to generate custom workbook.');
        } finally {
            setExportingCustomWorkbook(false);
        }
    }

    async function handleExportPdf(items) {
        if (!items || items.length === 0) {
            toast.error('No RFIs available for PDF export.');
            return;
        }

        setExportingPdf(true);
        try {
            await exportToPDF(items, `ProWay_Contractor_Report_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template);
        } catch (error) {
            console.error('PDF export failed:', error);
            toast.error(error.message || 'Failed to generate PDF export.');
        } finally {
            setExportingPdf(false);
        }
    }

    async function handleExportExcel(items) {
        if (!items || items.length === 0) {
            toast.error('No RFIs available for Excel export.');
            return;
        }

        setExportingExcel(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 0));
            exportToExcel(items, `ProWay_Contractor_Report_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template);
        } catch (error) {
            console.error('Excel export failed:', error);
            toast.error(error.message || 'Failed to generate Excel export.');
        } finally {
            setExportingExcel(false);
        }
    }

    async function handleDownloadSingleCustomReport(rfi) {
        if (!rfi) return;
        const rfiNo = rfi.customFields?.rfi_no || `RFI_${rfi.serialNo || 'Report'}`;
        await handleExportCustomWorkbook([rfi], `${rfiNo}_Custom_Report`);
    }

    // ─── Draft Persistence ───
    useEffect(() => {
        if (!user) return;
        const draftKey = `rfi_draft_${user.id}_${activeProject?.id || 'default'}`;
        const saved = localStorage.getItem(draftKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setNewRows(parsed.map(r => ({ ...r, images: [] }))); // Images cannot be recovered easily from JSON
                    console.log("Restored RFI draft from local storage");
                }
            } catch (e) {
                console.error("Failed to restore draft", e);
            }
        }
    }, [user, activeProject?.id]);

    useEffect(() => {
        if (!user) return;
        const draftKey = `rfi_draft_${user.id}_${activeProject?.id || 'default'}`;
        // Only save if there's actual content to prevent overwriting with empty defaults prematurely
        const hasContent = newRows.some(r => {
            const hasCustomData = Object.values(r.customFields || {}).some(val => val && val.toString().trim().length > 0);
            return hasCustomData || (r.images && r.images.length > 0);
        });
        
        if (hasContent) {
            // Strip images as they are File objects and can't be JSON serialized
            const toSave = newRows.map(r => {
                const { images, ...rest } = r;
                return rest;
            });
            localStorage.setItem(draftKey, JSON.stringify(toSave));
        } else {
            localStorage.removeItem(draftKey);
        }
    }, [newRows, user, activeProject?.id]);

    useEffect(() => {
        // If the timeline date changes, close any previously opened discussion modal.
        setDetailTarget(null);
        setShowAllRejected(false); // Default back to today's view on date change
    }, [currentDate]);

    useEffect(() => {
        const targetRfiId = searchParams.get('rfi');
        if (!targetRfiId || !rfis?.length || !user?.id) return;

        const targetRfi = rfis.find((rfi) => rfi.id === targetRfiId && rfi.filedBy === user.id);
        if (!targetRfi) return;

        const targetDate = targetRfi.carryoverTo || targetRfi.originalFiledDate || targetRfi.filedDate;
        if (targetDate && currentDate !== targetDate) {
            setCurrentDate(targetDate);
            return;
        }

        setFocusedRfiId(targetRfi.id);

        // Always land on the 'daily' tab (Filed RFI) regardless of the status
        setActiveTab('daily');

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('rfi');
        nextParams.delete('source');
        setSearchParams(nextParams, { replace: true });


        const clearTimer = window.setTimeout(() => setFocusedRfiId(null), 5000);

        return () => {
            window.clearTimeout(clearTimer);
        };
    }, [searchParams, setSearchParams, rfis, user, currentDate]);

    // Dedicated Effect for Robust Smooth Scrolling (V61)
    useEffect(() => {
        if (!focusedRfiId) return;

        const timer = setTimeout(() => {
            const el = document.querySelector(`[data-rfi-id="${focusedRfiId}"]`);
            if (el) {
                // Determine the vertical position to scroll to, centering the RFI while accounting for the fixed header
                const headerOffset = 120; // Slate header height + some breathing room
                const elementPosition = el.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - (window.innerHeight / 2) + (el.offsetHeight / 2);

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        }, 450); // Sufficient delay for tab-switching/rendering to stabilize

        return () => clearTimeout(timer);
    }, [focusedRfiId]);

    // Fullscreen / Landscape Logic (V60)
    useEffect(() => {
        const handleFsChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const syncViewport = (event) => setIsMobileViewport(event.matches);
        setIsMobileViewport(mediaQuery.matches);

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', syncViewport);
            return () => mediaQuery.removeEventListener('change', syncViewport);
        }

        mediaQuery.addListener(syncViewport);
        return () => mediaQuery.removeListener(syncViewport);
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

    // Background Scroll Locking
    useEffect(() => {
        const isModalOpen = !!(detailTarget || editTarget || markupTarget || selectedImages);
        if (isModalOpen) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => document.body.classList.remove('no-scroll');
    }, [detailTarget, editTarget, markupTarget, selectedImages]);

    // Scroll logic using a nonce to ensure it fires even if the grid was already open
    useEffect(() => {
        if (scrollNonce > 0) {
            const performScroll = () => {
                const grid = document.getElementById('new-rfi-entry-grid');
                if (grid) {
                    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    window.scrollTo({ 
                        top: document.documentElement.scrollHeight || document.body.scrollHeight, 
                        behavior: 'smooth' 
                    });
                }
            };

            // Short timeout to allow React to render the grid
            const timer = setTimeout(performScroll, 150);
            return () => clearTimeout(timer);
        }
    }, [scrollNonce]);

    function scrollToPageBottom() {
        if (newRows.length === 0) addRow();
        setScrollNonce(n => n + 1);
    }

    // ─── Ordered column rendering helpers ───
    const NEW_ENTRY_SKIP_COLS = ['status', 'remarks'];
    let newEntryColumns = orderedTableColumns.filter(col => !NEW_ENTRY_SKIP_COLS.includes(col.field_key));
    if (assignmentMode !== 'direct') {
        newEntryColumns = newEntryColumns.filter(c => c.field_key !== 'assigned_to');
    }

    const displayTableColumns = (() => {
        let cols = activeTab === 'rejected' ? (() => {
            const list = [...orderedTableColumns];
            const actionsIdx = list.findIndex(c => c.field_key === 'actions');
            if (actionsIdx !== -1) {
                list.splice(actionsIdx, 0,
                    { field_key: 'filed_date', field_name: 'Filed Date' },
                    { field_key: 'review_date', field_name: 'Review Date' }
                );
            } else {
                list.push(
                    { field_key: 'filed_date', field_name: 'Filed Date' },
                    { field_key: 'review_date', field_name: 'Review Date' }
                );
            }
            return list;
        })() : [...orderedTableColumns];

        // Filter out remarks and attachments for both Daily and Rejected as they are in the Discussion modal
        if (activeTab === 'daily' || activeTab === 'rejected') {
            cols = cols.filter(c => c.field_key !== 'remarks' && c.field_key !== 'attachments' && c.field_key !== 'inspection_type');
        }

        // Hide "Assigned To" entirely if mode is not direct, otherwise ensure it is present
        if (assignmentMode !== 'direct') {
            cols = cols.filter(c => c.field_key !== 'assigned_to');
        } else if (!cols.find(c => c.field_key === 'assigned_to')) {
            cols.push({ field_key: 'assigned_to', field_name: 'Assigned To' });
        }
        return cols;
    })();

    function renderDisplayCell(rfi, col, idx, isCarryover) {
        const style = getTableColumnStyle(col.field_key);
        switch (col.field_key) {
            case 'serial':
                return (
                    <td key={col.field_key} style={style} data-label="#">
                        <div style={{ fontWeight: 'bold' }}>{idx + 1}</div>
                    </td>
                );
            case 'rfi_no':
                return (
                    <td key={col.field_key} style={{ color: 'var(--clr-primary)', ...style }} data-label="RFI #">
                        <div style={{ fontWeight: '500' }}>
                            {rfi.customFields?.rfi_no || '—'}
                        </div>
                    </td>
                );
            case 'description':
            case 'location':
            case 'inspection_type':
                // Handled in default via customFields for new projects
                const val = rfi[col.field_key] || rfi.customFields?.[col.field_key] || '—';
                return <td key={col.field_key} style={style} data-label={col.field_name}>{val}</td>;
            case 'status':
                return (
                    <td key={col.field_key} style={style} data-label="Status">
                        <StatusBadge status={rfi.status} />
                        {isCarryover && rfi.carryoverCount > 0 && <span className="carryover-count">×{rfi.carryoverCount}</span>}
                    </td>
                );
            case 'remarks':
                return <td key={col.field_key} className="remarks-text" style={style} data-label="Remarks">{rfi.remarks || '—'}</td>;
            case 'attachments':
                return (
                    <td key={col.field_key} style={style} data-label="Attachments">
                        {rfi.images && rfi.images.length > 0 ? (
                            <div className="image-preview-grid consultant-grid" onClick={() => setSelectedImages(rfi.images)} title="Click to view full size">
                                {rfi.images.slice(0, 3).map((url, i) => (
                                    <img key={i} src={getThumbnailUrl(url, { width: 100, height: 100 })} alt={`Attachment ${i + 1}`} className="thumbnail" />
                                ))}
                                {rfi.images.length > 3 && <div className="thumbnail-more">+{rfi.images.length - 3}</div>}
                            </div>
                        ) : <span className="text-muted">—</span>}
                    </td>
                );
            case 'filed_date':
                return <td key={col.field_key} style={style} data-label="Filed Date">{formatDateDisplay(rfi.originalFiledDate || rfi.filedDate)}</td>;
            case 'review_date':
                return <td key={col.field_key} style={style} data-label="Review Date">{rfi.reviewedAt ? formatDateDisplay(rfi.reviewedAt.split('T')[0]) : '—'}</td>;
            case 'assigned_to':
                const consultantDisplayName = rfi.reviewerName || rfi.assigneeName;
                const modeLabel = assignmentMode === 'open' ? 'Open Queue' 
                    : assignmentMode === 'claim' ? (consultantDisplayName || 'Unclaimed')
                    : (consultantDisplayName || 'Auto');
                const modeBg = assignmentMode === 'open' && !consultantDisplayName ? '#dbeafe'
                    : assignmentMode === 'claim' && !consultantDisplayName ? '#fef3c7'
                    : consultantDisplayName ? 'var(--clr-bg-secondary)' : 'transparent';
                const modeColor = assignmentMode === 'open' && !consultantDisplayName ? '#2563eb'
                    : assignmentMode === 'claim' && !consultantDisplayName ? '#d97706'
                    : 'var(--clr-text-main)';
                return (
                    <td key={col.field_key} style={style} data-label="Assigned To">
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                                background: modeBg,
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                color: modeColor,
                                fontWeight: 500
                            }}>
                                {modeLabel}
                            </span>
                        </div>
                    </td>
                );
            case 'actions':
                const canEditThisRfi = canUserEditRfi(rfi);
                if (isCarryover) {
                    return (
                        <td key={col.field_key} style={style}>
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                <button className="btn btn-sm btn-action btn-resubmit" onClick={() => handleResubmit(rfi.id)} title="Re-submit for inspection">
                                    <RefreshCw size={14} />
                                </button>
                                {rfi.status === RFI_STATUS.REJECTED && (
                                    <button className="btn btn-sm btn-action" onClick={(e) => handleCreateRevision(rfi, e)} title="Create new revision from this rejected RFI" style={{ backgroundColor: 'var(--clr-brand-primary)', color: 'white', borderColor: 'var(--clr-brand-primary)' }}>
                                        <Plus size={14} />
                                    </button>
                                )}
                                <button className="btn btn-sm btn-ghost" onClick={() => { setDetailTarget(rfi); setEditTarget(null); setMarkupTarget(null); scrollToPageBottom(); }} title="View Review & Details">
                                    <ClipboardList size={14} />
                                </button>
                                {customWorkbookEnabled && (
                                    <button
                                        className="btn btn-sm btn-ghost"
                                        onClick={() => handleDownloadSingleCustomReport(rfi)}
                                        title="Download custom contractor report"
                                    >
                                        <FileDown size={14} />
                                    </button>
                                )}
                            </div>
                        </td>
                    );
                }
                // Filed RFIs actions
                return (
                    <td key={col.field_key} style={style}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                            <button className="btn btn-sm btn-ghost" onClick={() => { setDetailTarget(rfi); setEditTarget(null); setMarkupTarget(null); scrollToPageBottom(); }} title="View Review & Details">
                                <ClipboardList size={14} />
                            </button>
                            {customWorkbookEnabled && (
                                <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={() => handleDownloadSingleCustomReport(rfi)}
                                    title="Download custom contractor report"
                                >
                                    <FileDown size={14} />
                                </button>
                            )}
                            {rfi.status === RFI_STATUS.REJECTED && (
                                <button className="btn btn-sm btn-action" onClick={(e) => handleCreateRevision(rfi, e)} title="Create new revision from this rejected RFI" style={{ backgroundColor: 'var(--clr-brand-primary)', color: 'white', borderColor: 'var(--clr-brand-primary)' }}>
                                    <Plus size={14} />
                                </button>
                            )}
                            {(rfi.status === RFI_STATUS.PENDING || rfi.status === RFI_STATUS.INFO_REQUESTED) && canEditThisRfi && (
                                <>
                                    <button className="btn btn-sm btn-ghost" onClick={() => { setEditTarget(rfi); setDetailTarget(null); }} title="Edit RFI">
                                        <Brush size={14} />
                                    </button>
                                    <button className="btn btn-sm btn-action btn-delete" onClick={() => { if (window.confirm('Are you sure you want to delete this RFI?')) { deleteRFI(rfi.id); } }} title="Delete RFI">
                                        <Trash2 size={14} />
                                    </button>
                                </>
                            )}
                        </div>
                    </td>
                );
            default:
                return <td key={col.field_key} style={style} data-label={col.field_name}>{rfi.customFields?.[col.field_key] || '—'}</td>;
        }
    }

    function renderNewEntryCell(row, col, idx) {
        const style = getTableColumnStyle(col.field_key);
        switch (col.field_key) {
            case 'serial':
                return <td key={col.field_key} style={style}>{dailyRfis.length + idx + 1}</td>;
            case 'rfi_no':
                // Predict the RFI #
                let predictedNo = '—';
                if (!row.parentId) {
                    const prefix = activeProject?.code || 'RR007';
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
                    const sequenceStart = Math.max(maxB, (activeProject?.rfi_start_number || 1) - 1);
                    predictedNo = `${prefix}-${sequenceStart + idx + 1}`;
                } else {
                    predictedNo = row.customFields?.rfi_no || '—';
                }
                return <td key={col.field_key} style={{ ...style, whiteSpace: 'nowrap' }}>{predictedNo}</td>;
            case 'attachments':
                return (
                    <td key={col.field_key} style={style}>
                        <div className="file-upload-cell">
                            <label className="file-upload-label">
                                <input type="file" multiple accept="image/*" onChange={(e) => { const files = Array.from(e.target.files); updateRow(row.tempId, 'images', [...row.images, ...files]); }} className="file-input-hidden" style={{ display: 'none' }} />
                                <span className="file-upload-btn btn btn-sm btn-ghost">Attach Photos</span>
                            </label>
                            {row.images.length > 0 && (
                                <div className="image-preview-grid">
                                    {row.images.map((img, i) => (
                                        <div key={i} className="thumbnail-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ position: 'relative', width: '60px', height: '60px' }}>
                                                <img src={getImagePreviewSrc(img)} alt="preview" className="thumbnail" style={{ cursor: 'pointer', width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} onClick={() => setSelectedImages(row.images)} />
                                                <button type="button" className="btn-thumb-markup desktop-hover-only" title="Markup photo" onClick={(e) => { e.stopPropagation(); setMarkupTarget({ tempId: row.tempId, imageIndex: i }); }}>
                                                    <Brush size={10} />
                                                </button>
                                                <button className="btn-remove-thumb desktop-hover-only" onClick={(e) => { e.stopPropagation(); removeImage(row.tempId, i); }}>
                                                    <X size={10} />
                                                </button>
                                            </div>
                                            <div className="mobile-only-flex" style={{ display: 'none', justifyContent: 'center', gap: '8px' }}>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); setMarkupTarget({ tempId: row.tempId, imageIndex: i }); }} style={{ background: 'transparent', border: 'none', padding: '2px', color: 'var(--clr-info)' }}>
                                                    <Brush size={14} />
                                                </button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); removeImage(row.tempId, i); }} style={{ background: 'transparent', border: 'none', padding: '2px', color: 'var(--clr-danger)' }}>
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </td>
                );
            case 'actions':
                return (
                    <td key={col.field_key} style={style}>
                        {newRows.length > 1 && (
                            <button className="btn btn-sm btn-action btn-delete" onClick={() => removeRow(row.tempId)}>
                                <Trash2 size={14} />
                            </button>
                        )}
                    </td>
                );
            default:
                // Custom field input
                if (!col.is_builtin) {
                    const f = col;
                    if (f.field_type === 'select') {
                        return (
                            <td key={col.field_key} style={style}>
                                <select className="cell-select" value={row.customFields?.[f.field_key] || ''} onChange={e => { const updated = { ...row.customFields, [f.field_key]: e.target.value }; updateRow(row.tempId, 'customFields', updated); }}>
                                    <option value="">— Select —</option>
                                    {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </td>
                        );
                    }
                    if (f.field_type === 'textarea') {
                        return (
                            <td key={col.field_key} style={style}>
                                <textarea className="cell-input" rows={2} value={row.customFields?.[f.field_key] || ''} onChange={e => { const updated = { ...row.customFields, [f.field_key]: e.target.value }; updateRow(row.tempId, 'customFields', updated); }} placeholder={f.field_name} />
                            </td>
                        );
                    }
                    return (
                        <td key={col.field_key} style={style}>
                            <input 
                                type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'} 
                                list={`custom-${f.field_key}-suggestions`}
                                className="cell-input" 
                                value={row.customFields?.[f.field_key] || ''} 
                                onChange={e => { const updated = { ...row.customFields, [f.field_key]: e.target.value }; updateRow(row.tempId, 'customFields', updated); }} 
                                placeholder={f.field_name} 
                                disabled={row.isLocked} 
                            />
                            {uniqueSuggestions[f.field_key]?.length > 0 && (
                                <datalist id={`custom-${f.field_key}-suggestions`}>
                                    {uniqueSuggestions[f.field_key].map((s, si) => <option key={si} value={s} />)}
                                </datalist>
                            )}
                        </td>
                    );
                }
                return <td key={col.field_key} style={style}>—</td>;
        }
    }

    return (
        <div className={`page-wrapper ${isFullscreen ? 'is-fullscreen-page' : ''}`} ref={pageRef}>
            <Header />
            <main className="rfi-sheet-page">
                <div className="sheet-header">
                    <div className="sheet-tabs-container">
                        {!(isFullscreen && isMobileViewport) && (
                            <>
                                <div
                                    className={`sheet-tab ${activeTab === 'daily' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('daily')}
                                >
                                    <h2>Daily RFI Sheet</h2>
                                </div>
                                <div
                                    className={`sheet-tab ${activeTab === 'rejected' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('rejected')}
                                >
                                    <h2>Rejected RFI</h2>
                                </div>
                            </>
                        )}
                    </div>
                    
                    <div className="review-header-controls">
                        {pendingSyncCount > 0 && (
                            <span className="ustat-pill ustat-warning" style={{ fontSize: '0.8rem' }}>
                                {pendingSyncCount} offline
                            </span>
                        )}

                        {activeTab === 'rejected' && (
                            <div className="export-actions review-export-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <button
                                    className={`btn btn-sm ${showAllRejected ? 'btn-primary' : ''}`}
                                    style={{ 
                                        borderRadius: '0.6rem', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.45rem', 
                                        fontWeight: '600', 
                                        padding: '0.4rem 0.85rem',
                                        backgroundColor: showAllRejected ? 'var(--clr-brand-primary)' : '#f8fafc',
                                        color: showAllRejected ? 'white' : '#1e293b',
                                        border: '1px solid #e2e8f0'
                                    }}
                                    onClick={() => setShowAllRejected(!showAllRejected)}
                                    title={showAllRejected ? "Showing All History" : "Show All Rejected RFIs"}
                                >
                                    <List size={17} /> {showAllRejected ? 'Showing All' : 'All RFI'}
                                </button>
                            </div>
                        )}

                        {currentRfis.length > 0 && (
                            <div className="export-actions review-export-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                {(() => {
                                    const exportBusy = exportingCustomWorkbook || exportingPdf || exportingExcel;
                                    return (
                                        <>
                                {activeTab === 'daily' && customWorkbookEnabled && (
                                    <button
                                        className="btn btn-sm btn-progress-static"
                                        style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '600', padding: '0.4rem 0.75rem' }}
                                        onClick={() => handleExportCustomWorkbook(currentRfis, `Contractor_RFI_Workbook_${currentDate}`)}
                                        disabled={exportBusy}
                                        title="Export custom contractor workbook"
                                    >
                                        <span className="btn-progress-icon">
                                            {exportingCustomWorkbook ? <RefreshCw size={16} className="spin-slow" /> : <FileDown size={17} />}
                                        </span>
                                        <span className="btn-progress-label">
                                            <span className="btn-progress-visible">{exportingCustomWorkbook ? '...' : 'Custom Excel'}</span>
                                            <span className="btn-progress-measure" aria-hidden="true">Custom Excel</span>
                                        </span>
                                    </button>
                                )}
                                <button
                                    className="btn btn-sm"
                                    style={{ backgroundColor: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                    onClick={() => handleExportPdf(currentRfis)}
                                    disabled={exportingCustomWorkbook}
                                    title="Export to PDF"
                                >
                                    <FileDown size={17} />
                                    PDF
                                </button>
                                <button
                                    className="btn btn-sm"
                                    style={{ backgroundColor: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                    onClick={() => handleExportExcel(currentRfis)}
                                    disabled={exportingCustomWorkbook}
                                    title="Export to Excel"
                                >
                                    <Table size={17} />
                                    Excel
                                </button>
                                <button
                                    className="fullscreen-btn"
                                    onClick={toggleFullscreen}
                                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Landscape View"}
                                >
                                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                                </button>
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                        <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} minDate={minDate} showArrows={true} disabled={activeTab === 'rejected' && showAllRejected} />
                    </div>
                </div>

                {!contractorPermissions.canFileRfis && (
                    <div style={{
                        marginBottom: '1rem',
                        padding: '0.95rem 1rem',
                        borderRadius: '12px',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: '#334155',
                        fontSize: '0.92rem',
                        fontWeight: 500
                    }}>
                        This contractor account is view-only for the active project. You can review RFIs here, but filing is locked until the lead contractor enables it.
                    </div>
                )}

                {/* Filed RFIs for selected date only */}
                <div className="sheet-section filed-section">
                    <h2 className="section-title">
                        {activeTab === 'daily' ? 'Filed RFIs' : 'Rejected RFIs'}
                    </h2>
                    {currentRfis.length === 0 && editableRows.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon" style={{ marginBottom: '0.25rem', opacity: 0.35 }}>
                                <ClipboardList size={28} strokeWidth={1.5} />
                            </div>
                            <h3 style={{ fontSize: '0.95rem', margin: '0' }}>No {activeTab === 'daily' ? 'Filed' : 'Rejected'} RFIs</h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', margin: '0' }}>
                                {activeTab === 'daily' ? 'Sync today\'s items.' : 'No rejected items.'}
                            </p>
                            {activeTab === 'daily' && currentDate === getToday() && (
                                <button className="btn btn-primary" onClick={addRow} style={{ marginTop: '1rem' }} disabled={!contractorPermissions.canFileRfis}>
                                    <Plus size={16} /> File New RFI
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="contractor-sheet-table-shell">
                            <div className="rfi-table-wrapper contractor-sheet-table-scroll">
                                <table className="rfi-table editable">
                                    <thead>
                                        <tr>
                                            {displayTableColumns.map(col => (
                                                <th key={col.field_key} style={getTableColumnStyle(col.field_key)}>{col.field_name}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Filed RFIs */}
                                        {currentRfis.map((rfi, idx) => (
                                            <tr
                                                key={rfi.id}
                                                data-rfi-id={rfi.id}
                                                className={`${activeTab === 'rejected' ? 'rejected-priority-row' : ''} ${focusedRfiId === rfi.id ? 'notification-focus-row' : ''}`}
                                            >
                                                {displayTableColumns.map(col => renderDisplayCell(rfi, col, idx, false))}
                                            </tr>
                                        ))}

                                        {/* New Entry Rows (Inline) */}
                                        {activeTab === 'daily' && currentDate === getToday() && editableRows.map((row, idx) => (
                                            <tr key={row.tempId} className="new-rfi-row-entry">
                                                {displayTableColumns.map(col => renderNewEntryCell(row, col, idx))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Spreadsheet Actions */}
                            {activeTab === 'daily' && currentDate === getToday() && contractorPermissions.canFileRfis && (
                                <div className="integrated-sheet-actions" style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    padding: '1rem',
                                    background: '#f8fafc',
                                    borderTop: '1px solid #e2e8f0',
                                    borderBottomLeftRadius: '12px',
                                    borderBottomRightRadius: '12px'
                                }}>
                                    <button className="btn btn-ghost" onClick={addRow} disabled={isSubmitting || !contractorPermissions.canFileRfis}>
                                        <Plus size={16} /> Add Another Row
                                    </button>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        {submitMessage && (
                                            <span style={{ 
                                                fontSize: '0.85rem', 
                                                color: submitMessage.includes('✅') ? 'var(--clr-success)' : 'var(--clr-danger)',
                                                fontWeight: '500'
                                            }}>
                                                {submitMessage}
                                            </span>
                                        )}
                                        <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting || newRows.length === 0 || !contractorPermissions.canFileRfis}>
                                            {isSubmitting ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                                            {isSubmitting ? 'Submitting...' : `Submit ${newRows.length} RFI${newRows.length > 1 ? 's' : ''}`}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {isFullscreen && (
                        <div className="landscape-hint">
                            <RotateCcw size={16} /> <span>Rotate device for landscape view</span>
                        </div>
                    )}
                </div>


            </main>

            {/* Lightbox for Contractor Uploads - Moved outside main to avoid transform clipping */}
            {selectedImages && (
                <div className="modal-overlay" onClick={() => setSelectedImages(null)}>
                    <div className="modal lightbox" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Previews ({selectedImages.length})</h3>
                            <button className="btn-close modal-close" onClick={() => setSelectedImages(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="lightbox-content">
                            {selectedImages.map((img, idx) => {
                                const objectUrl = typeof img === 'string' ? img : URL.createObjectURL(img);
                                return (
                                    <div key={idx} className="lightbox-image-wrapper">
                                        <img src={objectUrl} alt={`Attachment ${idx + 1}`} className="lightbox-image" />
                                        <a href={objectUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost lightbox-download">
                                            Open Full Size
                                        </a>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {markupTarget && markupImage && (
                <FieldMarkupStudio
                    image={markupImage}
                    onClose={() => setMarkupTarget(null)}
                    onSave={(annotatedFile) => {
                        replaceImage(markupTarget.tempId, markupTarget.imageIndex, annotatedFile);
                        setMarkupTarget(null);
                    }}
                />
            )}

            {/* Detail & Comments Modal */}
            {detailTarget && (
                <RFIDetailModal
                    key={detailTarget.id}
                    rfi={detailTarget}
                    projectFields={projectFields}
                    orderedColumns={orderedTableColumns}
                    onClose={() => setDetailTarget(null)}
                />
            )}

            {editTarget && (
                <EditRFIModal
                    key={editTarget.id}
                    rfi={editTarget}
                    projectFields={projectFields}
                    orderedColumns={orderedTableColumns}
                    onSave={handleSaveEdit}
                    onClose={() => setEditTarget(null)}
                />
            )}

            {revisionTarget && (
                <CreateRevisionModal
                    parentRfi={revisionTarget}
                    onClose={() => setRevisionTarget(null)}
                    onSuccess={() => setActiveTab('daily')}
                />
            )}
        </div>
    );
}
