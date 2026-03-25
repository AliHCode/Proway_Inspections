import { useEffect, useState, useRef, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { getToday, formatDateDisplay } from '../utils/rfiLogic';
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

export default function DailyRFISheet() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { activeProject, projectFields, orderedTableColumns, getTableColumnStyle, columnWidthMap } = useProject();
    const activeProjectName = activeProject?.name || 'ProWay Project';
    const { createRFI, uploadImages, updateRFI, getRFIsForDate, resubmitRFI, deleteRFI, consultants, rfis, pendingSyncCount, canUserEditRfi } = useRFI();
    const [currentDate, setCurrentDate] = useState(getToday());
    const [detailTarget, setDetailTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const [newRows, setNewRows] = useState(() => [{
        tempId: Date.now() + Math.random(),
        description: '',
        location: '',
        inspectionType: INSPECTION_TYPES[0],
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

    // Determine unique previously used locations for suggestions
    const uniqueLocations = Array.from(new Set([
        ...dailyRfis.map(r => r.location).filter(Boolean),
        ...newRows.map(r => r.location).filter(Boolean)
    ]));

    // Determine unique descriptions for suggestions
    const uniqueDescriptions = Array.from(new Set([
        ...dailyRfis.map(r => r.description).filter(Boolean),
        ...newRows.map(r => r.description).filter(Boolean)
    ]));

    // Determine unique custom field values for suggestions dynamically
    const uniqueCustomFields = {};
    if (projectFields) {
        projectFields.forEach(pf => {
            if (pf.field_type === 'text' || pf.field_type === 'number') {
                uniqueCustomFields[pf.field_key] = Array.from(new Set([
                    ...dailyRfis.map(r => r.customFields?.[pf.field_key]).filter(Boolean),
                    ...newRows.map(r => r.customFields?.[pf.field_key]).filter(Boolean)
                ]));
            }
        });
    }

    // Determines what to show in the table
    const currentRfis = activeTab === 'daily' ? dailyRfis : activeRejectedRfis;

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
            description: '',
            location: '',
            inspectionType: INSPECTION_TYPES[0],
            assignedTo: '',
            images: [],
            parentId: null,
            customFields: {},
        };
    }

    function addRow() {
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
        const validRows = newRows.filter((r) => r.description.trim() && r.location.trim());
        if (validRows.length === 0) {
            setSubmitMessage('Please fill in at least one RFI with description and location.');
            setTimeout(() => setSubmitMessage(''), 3000);
            return;
        }

        const offline = !navigator.onLine;
        setIsSubmitting(true);
        setSubmitMessage(offline ? 'No signal. Saving RFIs offline...' : 'Uploading files and submitting RFIs...');

        try {
            for (const row of validRows) {
                await createRFI({
                    description: row.description.trim(),
                    location: row.location.trim(),
                    inspectionType: row.inspectionType,
                    filedBy: user.id,
                    filedDate: currentDate,
                    images: row.images,
                    assignedTo: row.assignedTo || null,
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
            description: payload.description,
            location: payload.location,
            inspectionType: payload.inspectionType,
            remarks: payload.remarks,
            images: [...payload.existingImages, ...uploaded],
            customFields: payload.customFields || {},
        });
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
        const hasContent = newRows.some(r => r.description.trim() || r.location.trim());
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
        setShowNewRfiEntry(true);
        setScrollNonce(n => n + 1);
    }

    // ─── Ordered column rendering helpers ───
    const NEW_ENTRY_SKIP_COLS = ['status', 'remarks'];
    const newEntryColumns = orderedTableColumns.filter(col => !NEW_ENTRY_SKIP_COLS.includes(col.field_key));

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
            cols = cols.filter(c => c.field_key !== 'remarks' && c.field_key !== 'attachments');
        }

        // Add "Assigned To" at the very end if not already present
        if (!cols.find(c => c.field_key === 'assigned_to')) {
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
                    <td key={col.field_key} style={style} data-label="RFI #">
                        <div style={{ color: 'var(--clr-primary)', fontWeight: '500' }}>
                            {rfi.customFields?.rfi_no || '—'}
                        </div>
                    </td>
                );
            case 'description':
                return <td key={col.field_key} style={style} data-label="Description">{rfi.description}</td>;
            case 'location':
                return <td key={col.field_key} style={style} data-label="Location">{rfi.location}</td>;
            case 'inspection_type':
                return <td key={col.field_key} style={style} data-label="Type">{rfi.inspectionType}</td>;
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
                                    <img key={i} src={url} alt={`Attachment ${i + 1}`} className="thumbnail" />
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
                return (
                    <td key={col.field_key} style={style} data-label="Assigned To">
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                                background: rfi.assigneeName ? 'var(--clr-bg-secondary)' : 'transparent',
                                padding: rfi.assigneeName ? '4px 8px' : '0',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                color: 'var(--clr-text-main)',
                                fontWeight: 500
                            }}>
                                {rfi.assigneeName || 'Auto'}
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
                            {rfi.status === RFI_STATUS.REJECTED && (
                                <button className="btn btn-sm btn-action" onClick={(e) => handleCreateRevision(rfi, e)} title="Create new revision from this rejected RFI" style={{ backgroundColor: 'var(--clr-brand-primary)', color: 'white', borderColor: 'var(--clr-brand-primary)' }}>
                                    <Plus size={14} />
                                </button>
                            )}
                            {rfi.status === RFI_STATUS.PENDING && canEditThisRfi && (
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
                    predictedNo = `${prefix}-${(maxB + idx + 1).toString().padStart(3, '0')}`;
                } else {
                    predictedNo = row.customFields?.rfi_no || '—';
                }
                return <td key={col.field_key} style={style}>{predictedNo}</td>;
            case 'description':
                return (
                    <td key={col.field_key} style={style}>
                        <input type="text" list="description-suggestions" className="cell-input" value={row.description} onChange={(e) => updateRow(row.tempId, 'description', e.target.value)} placeholder="e.g. Concrete pouring Zone B" disabled={row.isLocked} />
                    </td>
                );
            case 'location':
                return (
                    <td key={col.field_key} style={style}>
                        <input type="text" list="location-suggestions" className="cell-input" value={row.location} onChange={(e) => updateRow(row.tempId, 'location', e.target.value)} placeholder="e.g. Floor 3, Zone A" disabled={row.isLocked} />
                    </td>
                );
            case 'inspection_type':
                return (
                    <td key={col.field_key} style={style}>
                        <select className="cell-select" value={row.inspectionType} onChange={(e) => updateRow(row.tempId, 'inspectionType', e.target.value)} disabled={row.isLocked}>
                            {INSPECTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                    </td>
                );
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
                                list={f.field_type !== 'date' ? `custom-${f.field_key}-suggestions` : undefined}
                                className="cell-input" 
                                value={row.customFields?.[f.field_key] || ''} 
                                onChange={e => { const updated = { ...row.customFields, [f.field_key]: e.target.value }; updateRow(row.tempId, 'customFields', updated); }} 
                                placeholder={f.field_name} 
                                disabled={row.isLocked} 
                            />
                        </td>
                    );
                }
                return <td key={col.field_key} style={style}>—</td>;
        }
    }

    return (
        <div className="page-wrapper">
            <Header />
            <main className={`rfi-sheet-page ${isFullscreen ? 'is-fullscreen-page' : ''}`} ref={pageRef}>
                <div className="sheet-header">
                    <div className="sheet-tabs-container">
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
                                <button
                                    className="btn btn-sm"
                                    style={{ backgroundColor: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                    onClick={() => exportToPDF(currentRfis, `ProWay_Contractor_Report_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template)}
                                    title="Export to PDF"
                                >
                                    <FileDown size={17} /> PDF
                                </button>
                                <button
                                    className="btn btn-sm"
                                    style={{ backgroundColor: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                    onClick={() => exportToExcel(currentRfis, `ProWay_Contractor_Report_${currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template)}
                                    title="Export to Excel"
                                >
                                    <Table size={17} /> Excel
                                </button>
                                <button
                                    className="fullscreen-btn"
                                    onClick={toggleFullscreen}
                                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Landscape View"}
                                >
                                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                                </button>
                            </div>
                        )}
                        <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} showArrows={true} disabled={activeTab === 'rejected' && showAllRejected} />
                    </div>
                </div>

                {/* Filed RFIs for selected date only */}
                <div className="sheet-section filed-section">
                    <h2 className="section-title">
                        {activeTab === 'daily' ? 'Filed RFIs' : 'Rejected RFIs'}
                    </h2>
                    {currentRfis.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon" style={{ marginBottom: '0.25rem', opacity: 0.35 }}>
                                <ClipboardList size={28} strokeWidth={1.5} />
                            </div>
                            <h3 style={{ fontSize: '0.95rem', margin: '0' }}>No {activeTab === 'daily' ? 'Filed' : 'Rejected'} RFIs</h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', margin: '0' }}>
                                {activeTab === 'daily' ? 'Sync today\'s items.' : 'No rejected items.'}
                            </p>
                        </div>
                    ) : (
                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        {displayTableColumns.map(col => (
                                            <th key={col.field_key} style={getTableColumnStyle(col.field_key)}>{col.field_name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentRfis.map((rfi, idx) => (
                                        <tr
                                            key={rfi.id}
                                            data-rfi-id={rfi.id}
                                            className={`${activeTab === 'rejected' ? 'rejected-priority-row' : ''} ${focusedRfiId === rfi.id ? 'notification-focus-row' : ''}`}
                                        >
                                            {displayTableColumns.map(col => renderDisplayCell(rfi, col, idx, false))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {isFullscreen && (
                        <div className="landscape-hint">
                            <RotateCcw size={16} /> <span>Rotate device for landscape view</span>
                        </div>
                    )}
                </div>

                {/* New RFI Entry (Spreadsheet-like) - Only in Daily Tab and Only on Today's Date */}
                {activeTab === 'daily' && currentDate === getToday() && (
                    <div className="sheet-section new-entry-section">
                    <div className="new-entry-launcher">
                        <div className="new-entry-launcher-copy">
                            <span className="new-entry-kicker">RFI Workspace</span>
                            <h2 className="new-entry-title">New RFIs</h2>
                            <p className="new-entry-subtitle">Use grid mode to file requests.</p>
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowNewRfiEntry((prev) => !prev)}
                            type="button"
                        >
                            <Plus size={16} /> {showNewRfiEntry ? 'Close Entry Grid' : 'Open Entry Grid'}
                        </button>
                    </div>

                    {!showNewRfiEntry && (
                        <div className="new-entry-placeholder">
                            Grid hidden. Click <strong>Open Entry Grid</strong>.
                        </div>
                    )}

                    {showNewRfiEntry && (
                        <>
                            <datalist id="location-suggestions">
                                {uniqueLocations.map((loc, idx) => (
                                    <option key={idx} value={loc} />
                                ))}
                            </datalist>

                            <datalist id="description-suggestions">
                                {uniqueDescriptions.map((desc, idx) => (
                                    <option key={idx} value={desc} />
                                ))}
                            </datalist>

                            {Object.entries(uniqueCustomFields).map(([key, values]) => (
                                <datalist key={`custom-${key}`} id={`custom-${key}-suggestions`}>
                                    {values.map((val, idx) => <option key={idx} value={val} />)}
                                </datalist>
                            ))}

                            <div id="new-rfi-entry-grid" className="rfi-table-wrapper" style={{ marginTop: '1rem' }}>
                                <table className="rfi-table editable">
                                    <thead>
                                        <tr>
                                            {newEntryColumns.map(col => {
                                                const style = getTableColumnStyle(col.field_key);
                                                let label = col.field_name;
                                                if (col.field_key === 'description' || col.field_key === 'location') label += ' *';
                                                if (!col.is_builtin && col.is_required) label += ' *';
                                                return <th key={col.field_key} style={style}>{label}</th>;
                                            })}
                                            <th className="col-assign">Assign To</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {newRows.map((row, idx) => (
                                            <tr key={row.tempId}>
                                                {newEntryColumns.map(col => renderNewEntryCell(row, col, idx))}
                                                <td className="col-assign">
                                                    <select
                                                        className="cell-select"
                                                        value={row.assignedTo}
                                                        onChange={(e) => updateRow(row.tempId, 'assignedTo', e.target.value)}
                                                    >
                                                        <option value="">— Auto —</option>
                                                        {consultants.map((c) => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="sheet-actions">
                                <button className="btn btn-ghost" onClick={addRow} disabled={isSubmitting}>
                                    <Plus size={16} /> Add Row
                                </button>
                                <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                                    {isSubmitting ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                                    {isSubmitting ? 'Submitting...' : 'Submit RFIs'}
                                </button>
                            </div>

                            {submitMessage && (
                                <div className={`submit-message ${submitMessage.includes('✅') ? 'success' : 'error'}`}>
                                    {submitMessage}
                                </div>
                            )}
                        </>
                    )}
                </div>
                )}
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
