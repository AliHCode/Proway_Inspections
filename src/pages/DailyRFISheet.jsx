import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { getToday } from '../utils/rfiLogic';
import { INSPECTION_TYPES, RFI_STATUS } from '../utils/constants';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import StatusBadge from '../components/StatusBadge';
import RFIDetailModal from '../components/RFIDetailModal';
import EditRFIModal from '../components/EditRFIModal';
import ImageMarkupModal from '../components/ImageMarkupModal';
import { Plus, Trash2, Send, AlertTriangle, RefreshCw, X, MessageSquare, Pencil, FileDown, Table, ClipboardList, Brush } from 'lucide-react';
import { exportToExcel, exportToPDF, generateDailyReport } from '../utils/exportUtils';
import { useProject } from '../context/ProjectContext';

export default function DailyRFISheet() {
    const { user } = useAuth();
    const { activeProject, projectFields } = useProject();
    const activeProjectName = activeProject?.name || 'ProWay Project';
    const { createRFI, uploadImages, updateRFI, getRFIsForDate, resubmitRFI, deleteRFI, consultants, rfis, pendingSyncCount } = useRFI();
    const [currentDate, setCurrentDate] = useState(getToday());
    const [detailTarget, setDetailTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const [newRows, setNewRows] = useState([createEmptyRow()]);
    const [submitMessage, setSubmitMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedImages, setSelectedImages] = useState(null);
    const [markupTarget, setMarkupTarget] = useState(null);

    const { carriedOver, newRfis } = getRFIsForDate(currentDate);

    // Filter to only show this contractor's RFIs
    const myCarriedOver = carriedOver.filter((r) => r.filedBy === user.id);
    const myNewRfis = newRfis.filter((r) => r.filedBy === user.id);

    const reportRfis = rfis ? rfis.filter(r =>
        r.filedBy === user.id &&
        (r.status === 'approved' || r.status === 'rejected') &&
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

    function handleCreateRevision(rfi) {
        const newRev = {
            tempId: Date.now() + Math.random(),
            description: rfi.description,
            location: rfi.location,
            inspectionType: rfi.inspectionType,
            assignedTo: rfi.assignedTo || '',
            images: [],
            parentId: rfi.id,
        };
        
        // Remove the empty default row if it's untouched
        setNewRows((prev) => {
            const list = prev.filter(r => r.description || r.location || r.images.length > 0);
            return [...list, newRev];
        });
        
        toast.success(`Started revision for RFI #${rfi.serialNo}`);
        scrollToPageBottom();
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
        resubmitRFI(rfiId, currentDate);
    }

    async function handleSaveEdit(payload) {
        if (!editTarget) return;
        const uploaded = payload.newFiles.length > 0 ? await uploadImages(payload.newFiles) : [];
        await updateRFI(editTarget.id, {
            description: payload.description,
            location: payload.location,
            inspectionType: payload.inspectionType,
            images: [...payload.existingImages, ...uploaded],
        });
    }

    useEffect(() => {
        // If the timeline date changes, close any previously opened discussion modal.
        setDetailTarget(null);
    }, [currentDate]);

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

    function scrollToPageBottom() {
        const scrollNow = () => {
            const scroller = document.scrollingElement || document.documentElement || document.body;
            const pageHeight = Math.max(
                document.body?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0,
                document.body?.offsetHeight || 0,
                document.documentElement?.offsetHeight || 0
            );

            scroller.scrollTo({ top: pageHeight, behavior: 'smooth' });
            window.scrollTo({ top: pageHeight, behavior: 'smooth' });
        };

        // Run immediately, then once after render settles so we always hit true bottom.
        scrollNow();
        requestAnimationFrame(() => {
            setTimeout(scrollNow, 120);
        });
    }

    return (
        <div className="page-wrapper">
            <Header />
            <main className="rfi-sheet-page">
                <div className="sheet-header">
                    <div>
                        <h1>📋 Daily RFI Sheet</h1>
                        {pendingSyncCount > 0 && (
                            <p className="subtitle" style={{ marginTop: '0.2rem' }}>
                                {pendingSyncCount} offline RFI{pendingSyncCount > 1 ? 's' : ''} queued for auto-sync.
                            </p>
                        )}
                    </div>
                    <div className="review-header-controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {myNewRfis.length > 0 && (
                            <div className="export-actions review-export-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <button
                                    className="btn btn-sm"
                                    style={{ backgroundColor: 'transparent', color: 'var(--clr-brand-secondary)', border: '1px solid var(--clr-border-dark)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                    onClick={() => exportToPDF(myNewRfis, `ProWay_Contractor_Report_${currentDate}`)}
                                    title="Export to PDF"
                                >
                                    <FileDown size={16} /> PDF
                                </button>
                                <button
                                    className="btn btn-sm"
                                    style={{ backgroundColor: 'transparent', color: 'var(--clr-brand-secondary)', border: '1px solid var(--clr-border-dark)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                    onClick={() => exportToExcel(myNewRfis, `ProWay_Contractor_Report_${currentDate}`)}
                                    title="Export to Excel"
                                >
                                    <Table size={16} /> Excel
                                </button>
                                <button
                                    className="btn btn-sm"
                                    style={{ backgroundColor: 'var(--clr-brand-secondary)', color: 'white', border: '1px solid var(--clr-brand-secondary)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                    onClick={() => generateDailyReport(reportRfis, currentDate, activeProjectName)}
                                    title="Generate branded daily report"
                                >
                                    <ClipboardList size={16} /> Daily Report
                                </button>
                            </div>
                        )}
                        <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                    </div>
                </div>

                {/* Carried Over / Info Requested Section */}
                {myCarriedOver.length > 0 && (
                    <div className="sheet-section carryover-section">
                        <div className="section-banner carryover-banner">
                            <AlertTriangle size={18} />
                            <span>
                                <strong>{myCarriedOver.length} Actionable RFI{myCarriedOver.length > 1 ? 's' : ''}</strong>
                                {' '}carried over — provide requested info or fix rejections and re-submit.
                            </span>
                        </div>
                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        <th className="col-serial">#</th>
                                        <th className="col-desc">Description</th>
                                        <th className="col-loc">Location</th>
                                        <th className="col-type">Type</th>
                                        {projectFields.map(f => (
                                            <th key={f.id}>{f.field_name}</th>
                                        ))}
                                        <th className="col-status">Status</th>
                                        <th className="col-remarks">Remarks</th>
                                        <th className="col-files">Attachments</th>
                                        <th className="col-actions">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myCarriedOver.map((rfi, idx) => (
                                        <tr key={rfi.id} className="carryover-row">
                                            <td className="col-serial" data-label="#">{idx + 1}</td>
                                            <td className="col-desc" data-label="Description">{rfi.description}</td>
                                            <td className="col-loc" data-label="Location">{rfi.location}</td>
                                            <td className="col-type" data-label="Type">{rfi.inspectionType}</td>
                                            {projectFields.map(f => (
                                                <td key={f.id} data-label={f.field_name}>{rfi.customFields?.[f.field_key] || '—'}</td>
                                            ))}
                                            <td className="col-status" data-label="Status">
                                                <StatusBadge status={rfi.status} />
                                                {rfi.carryoverCount > 0 && (
                                                    <span className="carryover-count">×{rfi.carryoverCount}</span>
                                                )}
                                            </td>
                                            <td className="col-remarks remarks-text" data-label="Remarks">{rfi.remarks || '—'}</td>
                                            <td className="col-files" data-label="Attachments">
                                                {rfi.images && rfi.images.length > 0 ? (
                                                    <div
                                                        className="image-preview-grid consultant-grid"
                                                        onClick={() => setSelectedImages(rfi.images)}
                                                        title="Click to view full size"
                                                    >
                                                        {rfi.images.slice(0, 3).map((url, idx) => (
                                                            <img key={idx} src={url} alt={`Attachment ${idx + 1}`} className="thumbnail" />
                                                        ))}
                                                        {rfi.images.length > 3 && (
                                                            <div className="thumbnail-more">
                                                                +{rfi.images.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="col-actions">
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button
                                                        className="btn btn-sm btn-action btn-resubmit"
                                                        onClick={() => handleResubmit(rfi.id)}
                                                        title={rfi.status === RFI_STATUS.INFO_REQUESTED ? "Submit Info & Re-queue" : "Re-submit for inspection"}
                                                        style={{ flex: 1 }}
                                                    >
                                                        <RefreshCw size={14} /> {rfi.status === RFI_STATUS.INFO_REQUESTED ? 'Submit Info' : 'Re-submit'}
                                                    </button>
                                                    {rfi.status === RFI_STATUS.REJECTED && (
                                                        <button
                                                            className="btn btn-sm btn-action"
                                                            onClick={() => handleCreateRevision(rfi)}
                                                            title="Create new revision from this rejected RFI"
                                                            style={{ flex: 1, backgroundColor: 'var(--clr-brand-primary)', color: 'white', borderColor: 'var(--clr-brand-primary)' }}
                                                        >
                                                            <Plus size={14} /> Revision
                                                        </button>
                                                    )}
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={() => {
                                                            setDetailTarget(rfi);
                                                            setEditTarget(null); // Close edit if open
                                                            setMarkupTarget(null); // Close markup if open
                                                            scrollToPageBottom();
                                                        }}
                                                        title="Open Discussion"
                                                    >
                                                        <MessageSquare size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Already Filed RFIs for Today */}
                {myNewRfis.length > 0 && (
                    <div className="sheet-section filed-section">
                        <h2 className="section-title">📝 Filed RFIs for {currentDate}</h2>
                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        <th className="col-serial">#</th>
                                        <th className="col-desc">Description</th>
                                        <th className="col-loc">Location</th>
                                        <th className="col-type">Type</th>
                                        {projectFields.map(f => (
                                            <th key={f.id}>{f.field_name}</th>
                                        ))}
                                        <th className="col-status">Status</th>
                                        <th className="col-remarks">Remarks</th>
                                        <th className="col-files">Attachments</th>
                                        <th className="col-actions">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myNewRfis.map((rfi) => (
                                        <tr key={rfi.id}>
                                            <td className="col-serial" data-label="#">{rfi.serialNo}</td>
                                            <td className="col-desc" data-label="Description">{rfi.description}</td>
                                            <td className="col-loc" data-label="Location">{rfi.location}</td>
                                            <td className="col-type" data-label="Type">{rfi.inspectionType}</td>
                                            {projectFields.map(f => (
                                                <td key={f.id} data-label={f.field_name}>{rfi.customFields?.[f.field_key] || '—'}</td>
                                            ))}
                                            <td className="col-status" data-label="Status"><StatusBadge status={rfi.status} /></td>
                                            <td className="col-remarks remarks-text" data-label="Remarks">{rfi.remarks || '—'}</td>
                                            <td className="col-files" data-label="Attachments">
                                                {rfi.images && rfi.images.length > 0 ? (
                                                    <div
                                                        className="image-preview-grid consultant-grid"
                                                        onClick={() => setSelectedImages(rfi.images)}
                                                        title="Click to view full size"
                                                    >
                                                        {rfi.images.slice(0, 3).map((url, idx) => (
                                                            <img key={idx} src={url} alt={`Attachment ${idx + 1}`} className="thumbnail" />
                                                        ))}
                                                        {rfi.images.length > 3 && (
                                                            <div className="thumbnail-more">
                                                                +{rfi.images.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="col-actions">
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={() => {
                                                            setDetailTarget(rfi);
                                                            setEditTarget(null); // Close edit if open
                                                            setMarkupTarget(null); // Close markup if open
                                                            scrollToPageBottom();
                                                        }}
                                                        title="Open Discussion"
                                                    >
                                                        <MessageSquare size={14} />
                                                    </button>
                                                    {rfi.status === RFI_STATUS.REJECTED && (
                                                        <button
                                                            className="btn btn-sm btn-action"
                                                            onClick={() => handleCreateRevision(rfi)}
                                                            title="Create new revision from this rejected RFI"
                                                            style={{ flex: 1, backgroundColor: 'var(--clr-brand-primary)', color: 'white', borderColor: 'var(--clr-brand-primary)' }}
                                                        >
                                                            <Plus size={14} /> Revision
                                                        </button>
                                                    )}
                                                    {rfi.status === RFI_STATUS.PENDING && (
                                                        <>
                                                            <button
                                                                className="btn btn-sm btn-ghost"
                                                                onClick={() => {
                                                                    setEditTarget(rfi);
                                                                    setDetailTarget(null); // Close discussion if open
                                                                }}
                                                                title="Edit RFI"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-action btn-delete"
                                                                onClick={() => {
                                                                    if (window.confirm('Are you sure you want to delete this RFI?')) {
                                                                        deleteRFI(rfi.id);
                                                                    }
                                                                }}
                                                                title="Delete RFI"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* New RFI Entry (Spreadsheet-like) */}
                <div className="sheet-section new-entry-section">
                    <h2 className="section-title">
                        <Plus size={18} /> Add New RFIs
                    </h2>
                    <div className="rfi-table-wrapper">
                        <table className="rfi-table editable">
                            <thead>
                                <tr>
                                    <th className="col-serial">#</th>
                                    <th className="col-desc">Description *</th>
                                    <th className="col-loc">Location *</th>
                                    <th className="col-type">Inspection Type</th>
                                    {projectFields.map(f => (
                                        <th key={f.id}>{f.field_name}{f.is_required ? ' *' : ''}</th>
                                    ))}
                                    <th className="col-assign">Assign To</th>
                                    <th className="col-files">Attachments</th>
                                    <th className="col-actions"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {newRows.map((row, idx) => (
                                    <tr key={row.tempId}>
                                        <td className="col-serial">{myNewRfis.length + idx + 1}</td>
                                        <td className="col-desc">
                                            <input
                                                type="text"
                                                className="cell-input"
                                                value={row.description}
                                                onChange={(e) => updateRow(row.tempId, 'description', e.target.value)}
                                                placeholder="e.g. Concrete pouring Zone B"
                                            />
                                        </td>
                                        <td className="col-loc">
                                            <input
                                                type="text"
                                                className="cell-input"
                                                value={row.location}
                                                onChange={(e) => updateRow(row.tempId, 'location', e.target.value)}
                                                placeholder="e.g. Floor 3, Zone A"
                                            />
                                        </td>
                                        <td className="col-type">
                                            <select
                                                className="cell-select"
                                                value={row.inspectionType}
                                                onChange={(e) => updateRow(row.tempId, 'inspectionType', e.target.value)}
                                            >
                                                {INSPECTION_TYPES.map((type) => (
                                                    <option key={type} value={type}>{type}</option>
                                                ))}
                                            </select>
                                        </td>
                                        {projectFields.map(f => (
                                            <td key={f.id}>
                                                {f.field_type === 'select' ? (
                                                    <select
                                                        className="cell-select"
                                                        value={row.customFields?.[f.field_key] || ''}
                                                        onChange={e => {
                                                            const updated = { ...row.customFields, [f.field_key]: e.target.value };
                                                            updateRow(row.tempId, 'customFields', updated);
                                                        }}
                                                    >
                                                        <option value="">— Select —</option>
                                                        {(f.options || []).map(o => (
                                                            <option key={o} value={o}>{o}</option>
                                                        ))}
                                                    </select>
                                                ) : f.field_type === 'textarea' ? (
                                                    <textarea
                                                        className="cell-input"
                                                        rows={2}
                                                        value={row.customFields?.[f.field_key] || ''}
                                                        onChange={e => {
                                                            const updated = { ...row.customFields, [f.field_key]: e.target.value };
                                                            updateRow(row.tempId, 'customFields', updated);
                                                        }}
                                                        placeholder={f.field_name}
                                                    />
                                                ) : (
                                                    <input
                                                        type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                                                        className="cell-input"
                                                        value={row.customFields?.[f.field_key] || ''}
                                                        onChange={e => {
                                                            const updated = { ...row.customFields, [f.field_key]: e.target.value };
                                                            updateRow(row.tempId, 'customFields', updated);
                                                        }}
                                                        placeholder={f.field_name}
                                                    />
                                                )}
                                            </td>
                                        ))}
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
                                        <td className="col-files">
                                            <div className="file-upload-cell">
                                                <label className="file-upload-label">
                                                    <input
                                                        type="file"
                                                        multiple
                                                        accept="image/*"
                                                        onChange={(e) => {
                                                            const files = Array.from(e.target.files);
                                                            // Append to existing images rather than replace
                                                            updateRow(row.tempId, 'images', [...row.images, ...files]);
                                                        }}
                                                        className="file-input-hidden"
                                                        style={{ display: 'none' }}
                                                    />
                                                    <span className="file-upload-btn btn btn-sm btn-ghost">
                                                        Attach Photos
                                                    </span>
                                                </label>

                                                {row.images.length > 0 && (
                                                    <div className="image-preview-grid">
                                                        {row.images.map((img, i) => (
                                                            <div key={i} className="thumbnail-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                <div style={{ position: 'relative', width: '60px', height: '60px' }}>
                                                                    <img
                                                                        src={getImagePreviewSrc(img)}
                                                                        alt="preview"
                                                                        className="thumbnail"
                                                                        style={{ cursor: 'pointer', width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }}
                                                                        onClick={() => setSelectedImages(row.images)}
                                                                    />
                                                                    {/* Hidden on mobile, shown on hover for desktop */}
                                                                    <button
                                                                        type="button"
                                                                        className="btn-thumb-markup desktop-hover-only"
                                                                        title="Markup photo"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setMarkupTarget({ tempId: row.tempId, imageIndex: i });
                                                                        }}
                                                                    >
                                                                        <Brush size={10} />
                                                                    </button>
                                                                    <button
                                                                        className="btn-remove-thumb desktop-hover-only"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            removeImage(row.tempId, i);
                                                                        }}
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </div>
                                                                {/* Persistent icons for mobile */}
                                                                <div className="mobile-only-flex" style={{ display: 'none', justifyContent: 'center', gap: '8px' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setMarkupTarget({ tempId: row.tempId, imageIndex: i });
                                                                        }}
                                                                        style={{ background: 'transparent', border: 'none', padding: '2px', color: 'var(--clr-info)' }}
                                                                    >
                                                                        <Brush size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            removeImage(row.tempId, i);
                                                                        }}
                                                                        style={{ background: 'transparent', border: 'none', padding: '2px', color: 'var(--clr-danger)' }}
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="col-actions">
                                            {newRows.length > 1 && (
                                                <button
                                                    className="btn btn-sm btn-action btn-delete"
                                                    onClick={() => removeRow(row.tempId)}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
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
                </div>

                {/* Lightbox for Contractor Uploads */}
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
                    <ImageMarkupModal
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
                        onSave={handleSaveEdit}
                        onClose={() => setEditTarget(null)}
                    />
                )}
            </main>
        </div>
    );
}
